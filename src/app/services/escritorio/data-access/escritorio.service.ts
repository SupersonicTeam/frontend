import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, shareReplay, tap } from 'rxjs';
import { skipErrorNotify } from '@core/interceptors/error-notify.context';

/** Função de um membro no escritório (backend#228). */
export type FuncaoEscritorio = 'ADMINISTRADOR' | 'CONTADOR' | 'ASSISTENTE';

/** Rótulo de cada função, na ordem em que aparecem nos seletores. */
export const FUNCOES_ESCRITORIO: readonly { valor: FuncaoEscritorio; rotulo: string }[] = [
  { valor: 'ADMINISTRADOR', rotulo: 'Administrador' },
  { valor: 'CONTADOR', rotulo: 'Contador' },
  { valor: 'ASSISTENTE', rotulo: 'Assistente' },
];

/** `GET /api/escritorio` — o escritório de quem pergunta, com a função dele. */
export interface Escritorio {
  id: string;
  nome: string;
  cnpj: string | null;
  minhaFuncao: FuncaoEscritorio;
  membros: number;
}

/** Um membro da equipe (`GET /api/escritorio/membros`). */
export interface MembroEscritorio {
  id: string;
  nomeCompleto: string;
  crc: string | null;
  funcao: FuncaoEscritorio;
}

/** Um convite de equipe que ainda espera resposta (`GET /api/escritorio/membros/convites`). */
export interface ConviteDeEquipe {
  id: string;
  email: string;
  funcao: FuncaoEscritorio;
  criadoEm?: string;
  expiraEm?: string;
}

/**
 * O escritório do contador autenticado e a equipe dele (backend#228, issue #148).
 *
 * O token só diz `CONTADOR`; a **função** dentro do escritório (administrador, contador ou
 * assistente) vem daqui, em `minhaFuncao`. É ela que decide os botões: reabrir apuração
 * (administrador e contador), convidar cliente, mexer no vínculo e gerenciar a equipe (só
 * administrador). O servidor responde 403 a quem não pode; a tela não oferece o botão.
 *
 * **O escritório fica em cache** durante a sessão: a ficha, o Fechamento e o Acompanhamento
 * perguntavam a função cada um por si. O cache é limpo no Sair (`EncerramentoService`), ao editar
 * o escritório e ao entrar noutra equipe — e uma falha **não** fica guardada.
 */
@Injectable({ providedIn: 'root' })
export class EscritorioApi {
  private readonly http = inject(HttpClient);
  private escritorio$: Observable<Escritorio> | null = null;

  /** Sem toast global: quem chama decide o que uma falha significa (ver `podeReabrirApuracao`). */
  meuEscritorio(): Observable<Escritorio> {
    if (!this.escritorio$) {
      this.escritorio$ = this.http
        .get<Escritorio>('/escritorio', { context: skipErrorNotify() })
        .pipe(
          catchError((erro: unknown) => {
            this.escritorio$ = null;
            throw erro;
          }),
          shareReplay({ bufferSize: 1, refCount: false }),
        );
    }
    return this.escritorio$;
  }

  /** Esquece o escritório guardado (Sair, troca de equipe). */
  limpar(): void {
    this.escritorio$ = null;
  }

  /**
   * Quem convida cliente, mexe no vínculo e gerencia a equipe: só o administrador. As outras
   * funções recebem 403; na dúvida, `false`, pela mesma razão do reabrir.
   */
  ehAdministrador(): Observable<boolean> {
    return this.meuEscritorio().pipe(
      map((e) => e.minhaFuncao === 'ADMINISTRADOR'),
      catchError(() => of(false)),
    );
  }

  /**
   * Quem pode reabrir apuração: administrador e contador.
   *
   * Na dúvida (a rota falhou), **não**: esconder um botão que funcionaria custa um clique em outra
   * tela; mostrar um que dá 403 ensina a desconfiar do sistema. O servidor continua sendo quem
   * decide de verdade.
   */
  podeReabrirApuracao(): Observable<boolean> {
    return this.meuEscritorio().pipe(
      map((e) => e.minhaFuncao === 'ADMINISTRADOR' || e.minhaFuncao === 'CONTADOR'),
      catchError(() => of(false)),
    );
  }

  /** `PATCH /api/escritorio` — nome (até 255) e CNPJ (14 dígitos; vazio apaga). Só administrador. */
  atualizar(dados: { nome: string; cnpj: string }): Observable<Escritorio> {
    return this.http
      .patch<Escritorio>('/escritorio', dados)
      .pipe(tap((novo) => (this.escritorio$ = of(novo))));
  }

  /** `GET /api/escritorio/membros` — a equipe. */
  membros(): Observable<MembroEscritorio[]> {
    return this.http.get<MembroEscritorio[]>('/escritorio/membros');
  }

  /**
   * `PATCH /api/escritorio/membros/{id}` — troca a função. Rebaixar o último administrador →
   * 409 `ULTIMO_ADMINISTRADOR`.
   */
  alterarFuncao(membroId: string, funcao: FuncaoEscritorio): Observable<MembroEscritorio> {
    return this.http.patch<MembroEscritorio>(`/escritorio/membros/${membroId}`, { funcao });
  }

  /** `DELETE /api/escritorio/membros/{id}` — remove da equipe; o último administrador não sai (409). */
  removerMembro(membroId: string): Observable<void> {
    return this.http.delete<void>(`/escritorio/membros/${membroId}`);
  }

  /**
   * `POST /api/escritorio/membros/convites` — convida alguém para a equipe. Responde **202 sempre**,
   * para não revelar quem tem conta; o e-mail leva um link com o token no fragmento.
   */
  convidarMembro(email: string, funcao: FuncaoEscritorio): Observable<void> {
    return this.http.post<void>('/escritorio/membros/convites', { email: email.trim(), funcao });
  }

  /** `GET /api/escritorio/membros/convites` — os convites de equipe pendentes. */
  convitesDeEquipe(): Observable<ConviteDeEquipe[]> {
    return this.http.get<ConviteDeEquipe[]>('/escritorio/membros/convites');
  }

  /**
   * `POST /api/escritorio/membros/convites/aceitar` — entra na equipe com a conta logada (o e-mail
   * tem de ser o do convite). Token inválido, usado ou vencido → 400 `CONVITE_EQUIPE_INVALIDO`;
   * escritório atual com clientes ou equipe → 409 `ESCRITORIO_ATUAL_EM_USO`.
   */
  aceitarConvite(token: string): Observable<MembroEscritorio> {
    return this.http
      .post<MembroEscritorio>('/escritorio/membros/convites/aceitar', { token })
      .pipe(tap(() => this.limpar()));
  }
}
