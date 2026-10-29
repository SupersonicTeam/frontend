import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, TimeoutError, catchError, of, throwError, timeout } from 'rxjs';
import { environment } from '@env/environment';
import { ApiService } from '@core/services/api.service';
import { IdentidadeService } from '@core/services/identidade.service';
import type { ApiErrorEnvelope } from '@dtos/shared/responses/api-error.response';
import type {
  CeresEvento,
  CeresResposta,
  CeresUso,
  RotaCeres,
} from '@dtos/assistente/ceres.response';

/**
 * Códigos de erro da Ceres (seção 5 do contrato). A decisão na tela é **pelo
 * código**, nunca pelo texto — o texto do backend muda, o código não.
 *
 * `SEM_CONEXAO` e `DESCONHECIDO` são nossos, não do backend: servidor fora do ar
 * (status 0) não é "assistente indisponível", e dizer a coisa certa importa aqui.
 */
export type CodigoCeres =
  | 'VALIDATION_ERROR'
  | 'NAO_AUTENTICADO'
  | 'PAPEL_NAO_AUTORIZADO'
  | 'PAYLOAD_TOO_LARGE'
  | 'ASSISTENTE_OCUPADO'
  | 'ASSISTENTE_TEMPO_ESGOTADO'
  | 'ASSISTENTE_INDISPONIVEL'
  | 'INTERNAL_ERROR'
  | 'SEM_CONEXAO'
  | 'DESCONHECIDO';

/** Falha da Ceres já classificada. `mensagem` do backend é segura para exibir. */
export class CeresError extends Error {
  constructor(
    readonly codigo: CodigoCeres,
    readonly status: number,
    message: string,
    /** Só no 503 `ASSISTENTE_OCUPADO`: segundos a esperar antes de tentar de novo. */
    readonly retryAfterSegundos?: number,
    /** Campo apontado no 400 (`pergunta`). */
    readonly campo?: string,
  ) {
    super(message);
    this.name = 'CeresError';
  }
}

/** A pergunta foi abortada pelo cliente (saiu da tela, ou cancelou). Não é falha. */
export class CeresCancelada extends Error {
  constructor() {
    super('Pergunta cancelada.');
    this.name = 'CeresCancelada';
  }
}

/** Um bloco de evento SSE já separado: nome do evento e o `data` bruto. */
export interface BlocoSse {
  nome: string;
  dados: string;
}

/**
 * Separa os blocos completos de um buffer de SSE e devolve o que sobrou.
 *
 * Fica fora da classe por ser pura — é aqui que mora o risco real do streaming
 * (um evento cortado no meio pela fronteira do chunk), e pura ela é testável sem
 * `ReadableStream`, que o jsdom não tem.
 */
export function extrairEventosSse(buffer: string): { eventos: BlocoSse[]; resto: string } {
  const eventos: BlocoSse[] = [];
  let resto = buffer;

  for (;;) {
    const separador = /\r?\n\r?\n/.exec(resto);
    if (!separador) break;

    const bloco = resto.slice(0, separador.index);
    resto = resto.slice(separador.index + separador[0].length);

    let nome = '';
    const dados: string[] = [];
    for (const linha of bloco.split(/\r?\n/)) {
      if (linha.startsWith('event:')) nome = linha.slice(6).trim();
      else if (linha.startsWith('data:')) dados.push(linha.slice(5));
    }
    if (nome) eventos.push({ nome, dados: dados.join('\n') });
  }

  return { eventos, resto };
}

/** Timeout do cliente no modo síncrono: acima dos 5 min em que o backend desiste. */
const TIMEOUT_SINCRONO_MS = 6 * 60 * 1000;

const ROTAS: readonly RotaCeres[] = ['DADOS', 'LEGISLACAO', 'MISTO', 'FORA_DE_ESCOPO'];

/**
 * A **Ceres**, assistente fiscal do backend (issue #76; contrato versionado em
 * `docs/contrato-frontend-ceres.md` no repo do backend).
 *
 * Dois caminhos para a mesma pergunta:
 *
 * - `perguntarEmStream()` — `POST /api/assistente/chat/stream` (SSE). É o padrão:
 *   o evento `rota` chega em segundos e a tela já pode dizer *o que* a Ceres está
 *   fazendo, enquanto a resposta leva de 4 s a ~1,5 min. Não há token parcial —
 *   número e citação só saem depois de conferidos pelo backend.
 * - `perguntar()` — `POST /api/assistente/chat`, síncrono. Usado onde o streaming
 *   não existe (navegador antigo, jsdom nos testes): mesma resposta, sem o aviso
 *   de progresso.
 *
 * O streaming vai de `fetch` e não de `HttpClient` por dois motivos do contrato:
 * `EventSource` só faz `GET` e não manda header, e o interceptor do `HttpClient`
 * não alcança o `fetch` — então o `X-Usuario-Id` vai à mão aqui, lido do mesmo
 * `IdentidadeService` que o interceptor usa.
 */
@Injectable({ providedIn: 'root' })
export class CeresApi {
  private readonly api = inject(ApiService);
  private readonly identidade = inject(IdentidadeService);

  /** O navegador sabe ler um corpo de resposta como stream de texto? */
  suportaStream(): boolean {
    return (
      typeof fetch === 'function' &&
      typeof TextDecoderStream !== 'undefined' &&
      typeof ReadableStream !== 'undefined'
    );
  }

  /**
   * Pergunta síncrona. O timeout fica **acima** dos 5 min do backend para o 503
   * `ASSISTENTE_TEMPO_ESGOTADO` dele chegar antes de o cliente desistir — assim a
   * tela mostra o motivo real em vez de um silêncio genérico.
   */
  perguntar(pergunta: string): Observable<CeresResposta> {
    return this.api.post<CeresResposta>('/assistente/chat', { pergunta }).pipe(
      timeout(TIMEOUT_SINCRONO_MS),
      catchError((erro: unknown) => throwError(() => this.classificar(erro))),
    );
  }

  /**
   * A cota da semana.
   *
   * Falha em silencio de proposito (`of(null)`): ficar sem saber quantos creditos restam nao
   * pode impedir de perguntar, e um erro vermelho no cabecalho do chat por causa de um numero
   * acessorio assusta mais do que informa.
   */
  uso(): Observable<CeresUso | null> {
    return this.api.get<CeresUso>('/assistente/uso').pipe(catchError(() => of(null)));
  }

  /**
   * Pergunta em streaming. Chama `aoEvento` para cada evento do SSE (`rota`,
   * `resposta`, `fim`) e **lança** `CeresError` no evento `erro` — e também nos
   * erros que acontecem antes de o stream abrir (400/401/403/413 e o 503
   * `ASSISTENTE_OCUPADO`), que vêm como resposta HTTP comum em JSON.
   *
   * Abortar o `sinal` fecha a conexão: o backend percebe na próxima escrita,
   * interrompe a pergunta e libera a vaga.
   */
  async perguntarEmStream(
    pergunta: string,
    aoEvento: (evento: CeresEvento) => void,
    sinal?: AbortSignal,
  ): Promise<void> {
    const cabecalhos: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    };
    const usuarioId = this.identidade.usuarioId();
    if (usuarioId) cabecalhos['X-Usuario-Id'] = usuarioId;

    let resposta: Response;
    try {
      resposta = await fetch(`${environment.apiUrl}/assistente/chat/stream`, {
        method: 'POST',
        headers: cabecalhos,
        body: JSON.stringify({ pergunta }),
        signal: sinal,
      });
    } catch (erro) {
      // Rede fora, ou o `AbortController` disparou antes de a resposta chegar.
      throw this.classificar(erro);
    }

    if (!resposta.ok) {
      throw await this.erroDaResposta(resposta);
    }

    const corpo = resposta.body;
    if (!corpo) {
      throw new CeresError('DESCONHECIDO', resposta.status, 'A resposta da Ceres veio vazia.');
    }

    const leitor = corpo.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    try {
      for (;;) {
        const { value, done } = await leitor.read();
        if (done) return;

        buffer += value;
        const { eventos, resto } = extrairEventosSse(buffer);
        buffer = resto;

        for (const bloco of eventos) {
          const evento = this.interpretar(bloco);
          if (evento) aoEvento(evento);
          if (bloco.nome === 'fim') return;
        }
      }
    } catch (erro) {
      throw this.classificar(erro);
    } finally {
      // Libera o lock do reader quando saímos por `fim` (ou por erro) com o
      // stream ainda aberto; sem isto a conexão fica pendurada.
      leitor.cancel().catch(() => undefined);
    }
  }

  /**
   * Converte um bloco do SSE em evento do contrato. O evento `erro` traz o
   * envelope `ApiError` e é lançado — a falha é do fluxo, não um evento a tratar.
   */
  private interpretar(bloco: BlocoSse): CeresEvento | null {
    const dado: unknown = this.jsonOuNulo(bloco.dados);

    if (bloco.nome === 'erro') {
      throw this.erroDeEnvelope(dado as ApiErrorEnvelope | null, 503);
    }
    if (bloco.nome === 'rota') {
      const rota = (dado as { rota?: string } | null)?.rota;
      // Rota que não conhecemos não vira estado inválido na tela: segue "pensando".
      return rota && (ROTAS as readonly string[]).includes(rota)
        ? { evento: 'rota', dado: { rota: rota as RotaCeres } }
        : null;
    }
    if (bloco.nome === 'resposta') {
      return { evento: 'resposta', dado: this.normalizar(dado as Partial<CeresResposta> | null) };
    }
    if (bloco.nome === 'fim') {
      return { evento: 'fim', dado: {} };
    }
    // Evento desconhecido (ex.: heartbeat que o Spring venha a mandar): ignora.
    return null;
  }

  /**
   * Garante as listas do contrato. Um `citacoes: null` de uma versão mais velha
   * do backend não pode virar erro de template no meio da conversa.
   */
  private normalizar(bruto: Partial<CeresResposta> | null): CeresResposta {
    return {
      resposta: bruto?.resposta ?? '',
      rota: bruto?.rota ?? 'FORA_DE_ESCOPO',
      citacoes: bruto?.citacoes ?? [],
      fontesDados: bruto?.fontesDados ?? [],
      modoFallback: bruto?.modoFallback ?? false,
      atalhos: bruto?.atalhos ?? [],
    };
  }

  private jsonOuNulo(texto: string): unknown {
    try {
      return JSON.parse(texto || 'null');
    } catch {
      return null;
    }
  }

  /** Erro antes de o stream abrir: envelope em JSON, mesmo com `Accept: text/event-stream`. */
  private async erroDaResposta(resposta: Response): Promise<CeresError> {
    let envelope: ApiErrorEnvelope | null;
    try {
      envelope = (await resposta.json()) as ApiErrorEnvelope;
    } catch {
      // Erro sem corpo JSON (ex.: 502 de um proxy no caminho): sobra o status.
      envelope = null;
    }
    return this.erroDeEnvelope(envelope, resposta.status, resposta.headers.get('Retry-After'));
  }

  /** Classifica o que o `HttpClient`, o `fetch` ou o rxjs devolveram. */
  private classificar(erro: unknown): CeresError | CeresCancelada {
    if (erro instanceof CeresError || erro instanceof CeresCancelada) return erro;

    if (erro instanceof DOMException && erro.name === 'AbortError') {
      return new CeresCancelada();
    }

    if (erro instanceof TimeoutError) {
      return new CeresError(
        'ASSISTENTE_TEMPO_ESGOTADO',
        0,
        'A Ceres demorou demais para responder.',
      );
    }

    if (erro instanceof HttpErrorResponse) {
      if (erro.status === 0) {
        return new CeresError('SEM_CONEXAO', 0, 'Sem conexão com o servidor.');
      }
      return this.erroDeEnvelope(
        erro.error as ApiErrorEnvelope | null,
        erro.status,
        erro.headers?.get('Retry-After'),
      );
    }

    // `fetch` recusado (servidor fora, CORS): `TypeError: Failed to fetch`.
    if (erro instanceof TypeError) {
      return new CeresError('SEM_CONEXAO', 0, 'Sem conexão com o servidor.');
    }

    return new CeresError(
      'DESCONHECIDO',
      0,
      erro instanceof Error ? erro.message : 'Falha inesperada ao falar com a Ceres.',
    );
  }

  private erroDeEnvelope(
    envelope: ApiErrorEnvelope | null,
    status: number,
    retryAfter?: string | null,
  ): CeresError {
    const detalhe = envelope?.errors?.[0];
    const codigo = this.codigoConhecido(detalhe?.code, status);
    const mensagem =
      detalhe?.message ?? envelope?.message ?? 'Falha inesperada ao falar com a Ceres.';
    const segundos = Number(retryAfter);

    return new CeresError(
      codigo,
      status,
      mensagem,
      Number.isFinite(segundos) && segundos > 0 ? segundos : undefined,
      detalhe?.field,
    );
  }

  /**
   * Só códigos do contrato viram `CodigoCeres`. Um código novo do backend cai em
   * `DESCONHECIDO` e a tela usa a mensagem que veio — em vez de tratar como
   * "indisponível" algo que pode ser outra coisa.
   */
  private codigoConhecido(code: string | undefined, status: number): CodigoCeres {
    const conhecidos: readonly CodigoCeres[] = [
      'VALIDATION_ERROR',
      'NAO_AUTENTICADO',
      'PAPEL_NAO_AUTORIZADO',
      'PAYLOAD_TOO_LARGE',
      'ASSISTENTE_OCUPADO',
      'ASSISTENTE_TEMPO_ESGOTADO',
      'ASSISTENTE_INDISPONIVEL',
      'INTERNAL_ERROR',
    ];
    if (code && (conhecidos as readonly string[]).includes(code)) return code as CodigoCeres;
    if (status === 404) {
      // O endpoint não existe nesta instância do backend (versão anterior à Sprint 6).
      return 'ASSISTENTE_INDISPONIVEL';
    }
    return 'DESCONHECIDO';
  }
}
