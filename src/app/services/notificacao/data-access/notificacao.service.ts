import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '@env/environment';
import { ApiService } from '@core/services/api.service';
import type { ApiErrorEnvelope } from '@dtos/shared/responses/api-error.response';

/** O que um disparo registrou — medido contra a API local em 31/10. */
export interface DisparoNotificacao {
  /** Quantos itens entraram no aviso. **Zero é resposta legítima**: nada a avisar. */
  enviados: number;
  /** Destes, quantos vencem hoje ou amanhã. */
  urgentes: number;
  /**
   * O registro criado, ou **`null`** quando não houve o que avisar.
   *
   * Medido em 01/11: com `enviados: 0` o servidor responde `notificacaoId: null` e **não cria
   * registro** — o histórico não ganha linha nenhuma. Faz sentido: avisar ninguém de nada não é
   * um aviso. Quem for usar este id para abrir o detalhe precisa contar com o nulo.
   */
  notificacaoId: string | null;
}

/** Uma linha do histórico (`GET /api/notificacao`). */
export interface NotificacaoRegistrada {
  id: string;
  /** `PROXIMAS_OBRIGACOES`, `TODOS_ATRASADOS`, `MENSAGEM_LIVRE`… */
  tipo: string;
  /** `WHATSAPP` é o único canal por enquanto. */
  canal: string;
  /** `REGISTRADA` enquanto não há provedor real de envio. */
  status: string;
  /** O texto que foi (ou seria) enviado, já montado pelo servidor. */
  texto: string;
  quantidadeItens: number;
  urgentes: number;
  /** `PRODUTOR`, `CONTADOR` ou o job diário. */
  disparadoPor: string;
  criadoEm: string;
}

/** Histórico mais o total que veio em `X-Total-Count`. */
export interface HistoricoNotificacoes {
  itens: NotificacaoRegistrada[];
  total: number;
}

/** Os códigos que a tela precisa separar. */
export type CodigoNotificacao = 'CONTATO_AUSENTE' | 'LIMITE_NOTIFICACOES' | 'DESCONHECIDO';

/** Falha de notificação já classificada, para a tela não ler `status` nem texto de erro. */
export class NotificacaoError extends Error {
  constructor(
    readonly codigo: CodigoNotificacao,
    readonly status: number,
    mensagem: string,
    /** Segundos até poder tentar de novo — só no `LIMITE_NOTIFICACOES`. */
    readonly retryAfterSegundos?: number,
  ) {
    super(mensagem);
    this.name = 'NotificacaoError';
  }
}

/**
 * Avisos ao produtor pelo WhatsApp (`/api/notificacao`, backend#182) — issue #94.
 *
 * ## O que mudou do cliente antigo
 *
 * **O `produtorId` saiu do caminho.** As rotas do produtor eram
 * `POST /notificacao/{produtorId}/proximas-obrigacoes`; agora o produtor vem do token e o caminho é
 * só `POST /notificacao/proximas-obrigacoes`. Mandar id de gente no path é pedir para o cliente
 * declarar quem ele é, que é exatamente o que a #93 tirou do app.
 *
 * **O escritório também cobra**, pelo cliente escolhido na carteira, em
 * `/contador/produtores/{produtorId}/notificacao/...`. Aí o id no caminho é de **outra pessoa** —
 * o cliente —, e é legítimo: produtor fora da carteira responde 404.
 *
 * **E a falha deixou de virar `{ enviados: 0 }`.** O cliente antigo engolia tudo num
 * `catchError(() => of({ enviados: 0, indisponivel: true }))` porque a família não existia no
 * backend e respondia 404. Existe desde 31/10, então agora cada motivo tem o seu nome: produtor sem
 * WhatsApp cadastrado é `CONTATO_AUSENTE`, e a tela deve pedir o número em vez de dizer que não há
 * pendência; passar de 10 disparos por hora é `LIMITE_NOTIFICACOES`, com `Retry-After`.
 *
 * **`enviados: 0` continua sendo sucesso** — quer dizer "não havia nada a avisar". Confundir isso
 * com erro é o defeito que o `indisponivel` existia para evitar; agora a distinção é o próprio tipo.
 */
@Injectable({ providedIn: 'root' })
export class NotificacaoApi {
  private readonly api = inject(ApiService);
  private readonly http = inject(HttpClient);

  // ── Produtor: o id vem do token, nunca do caminho ──────────────────────────

  /** Avisa os vencimentos dos próximos 7 dias, urgentes primeiro. */
  notificarProximasObrigacoes(): Observable<DisparoNotificacao> {
    return this.disparar('/notificacao/proximas-obrigacoes');
  }

  /** Avisa as guias vencidas e os pedidos de documento com prazo passado. */
  notificarTodosAtrasados(): Observable<DisparoNotificacao> {
    return this.disparar('/notificacao/todos-atrasados');
  }

  /** Registra uma mensagem livre (1 a 500 caracteres — o backend recusa fora disso). */
  enviarMensagem(mensagem: string): Observable<DisparoNotificacao> {
    return this.disparar('/notificacao/enviar', { mensagem });
  }

  /** O que já foi avisado e quando, mais recentes primeiro. */
  historico(): Observable<HistoricoNotificacoes> {
    return this.listar('/notificacao');
  }

  // ── Contador: o id no caminho é o do CLIENTE, e fora da carteira dá 404 ────

  cobrarProximasObrigacoes(produtorId: string): Observable<DisparoNotificacao> {
    return this.disparar(`/contador/produtores/${produtorId}/notificacao/proximas-obrigacoes`);
  }

  cobrarTodosAtrasados(produtorId: string): Observable<DisparoNotificacao> {
    return this.disparar(`/contador/produtores/${produtorId}/notificacao/todos-atrasados`);
  }

  cobrarComMensagem(produtorId: string, mensagem: string): Observable<DisparoNotificacao> {
    return this.disparar(`/contador/produtores/${produtorId}/notificacao/enviar`, { mensagem });
  }

  /** O que o escritório já disparou a este cliente. */
  historicoDoCliente(produtorId: string): Observable<HistoricoNotificacoes> {
    return this.listar(`/contador/produtores/${produtorId}/notificacao`);
  }

  // ── Interno ───────────────────────────────────────────────────────────────

  private disparar(rota: string, corpo?: unknown): Observable<DisparoNotificacao> {
    return this.api
      .post<DisparoNotificacao>(rota, corpo)
      .pipe(NotificacaoApi.traduzirFalha<DisparoNotificacao>());
  }

  /**
   * Lista com `X-Total-Count`, como a carteira — **não** `Page<T>`.
   *
   * Vai de `HttpClient` direto porque o `ApiService` devolve só o corpo, e o total mora no header;
   * sem ele a tela não sabe se está vendo tudo.
   */
  private listar(rota: string): Observable<HistoricoNotificacoes> {
    return this.http
      .get<NotificacaoRegistrada[]>(`${environment.apiUrl}${rota}`, { observe: 'response' })
      .pipe(
        map((resp) => ({
          itens: resp.body ?? [],
          total: Number(resp.headers.get('X-Total-Count') ?? resp.body?.length ?? 0),
        })),
        NotificacaoApi.traduzirFalha<HistoricoNotificacoes>(),
      );
  }

  /** Transforma o `HttpErrorResponse` em `NotificacaoError`, com o código do envelope. */
  private static traduzirFalha<T>() {
    return (fonte: Observable<T>): Observable<T> =>
      new Observable<T>((inscrito) =>
        fonte.subscribe({
          next: (v) => inscrito.next(v),
          complete: () => inscrito.complete(),
          error: (erro: unknown) => inscrito.error(NotificacaoApi.classificar(erro)),
        }),
      );
  }

  private static classificar(erro: unknown): NotificacaoError {
    const falha = erro as HttpErrorResponse;
    const envelope = falha?.error as ApiErrorEnvelope | undefined;
    const code = envelope?.errors?.[0]?.code;
    const mensagem = envelope?.errors?.[0]?.message ?? envelope?.message ?? 'Falha ao avisar.';

    if (code === 'CONTATO_AUSENTE' || falha?.status === 422) {
      return new NotificacaoError('CONTATO_AUSENTE', falha?.status ?? 422, mensagem);
    }
    if (code === 'LIMITE_NOTIFICACOES' || falha?.status === 429) {
      // `Retry-After` vem em segundos; o backend o expõe no `Access-Control-Expose-Headers`.
      const bruto = falha?.headers?.get?.('Retry-After');
      const segundos = bruto ? Number(bruto) : undefined;
      return new NotificacaoError(
        'LIMITE_NOTIFICACOES',
        falha?.status ?? 429,
        mensagem,
        Number.isFinite(segundos) ? segundos : undefined,
      );
    }
    return new NotificacaoError('DESCONHECIDO', falha?.status ?? 0, mensagem);
  }
}
