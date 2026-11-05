import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of } from 'rxjs';
import { skipErrorNotify } from '@core/interceptors/error-notify.context';

/** Função de um membro no escritório (backend#228). */
export type FuncaoEscritorio = 'ADMINISTRADOR' | 'CONTADOR' | 'ASSISTENTE';

/** `GET /api/escritorio` — o escritório de quem pergunta, com a função dele. */
export interface Escritorio {
  id: string;
  nome: string;
  cnpj: string | null;
  minhaFuncao: FuncaoEscritorio;
  membros: number;
}

/**
 * O escritório do contador autenticado (backend#228).
 *
 * O token só diz `CONTADOR`; a **função** dentro do escritório (administrador, contador ou
 * assistente) vem daqui, em `minhaFuncao`. É ela que decide quem reabre apuração (#138): o
 * servidor responde 403 ao assistente, e a tela não deve oferecer o botão a quem vai recebê-lo.
 */
@Injectable({ providedIn: 'root' })
export class EscritorioApi {
  private readonly http = inject(HttpClient);

  /** Sem toast global: quem chama decide o que uma falha significa (ver `podeReabrirApuracao`). */
  meuEscritorio(): Observable<Escritorio> {
    return this.http.get<Escritorio>('/escritorio', { context: skipErrorNotify() });
  }

  /**
   * Quem pode reabrir apuração: administrador e contador.
   *
   * Na dúvida (a rota falhou), **não**: esconder um botão que funcionaria custa um clique em outra
   * tela; mostrar um que dá 403 ensina a desconfiar do sistema. O servidor continua sendo quem
   * decide de verdade.
   */
  /**
   * Quem convida cliente e mexe no vínculo (suspender, reativar, encerrar): só o administrador
   * (#147). As outras funções recebem 403; na dúvida, `false`, pela mesma razão do reabrir.
   */
  ehAdministrador(): Observable<boolean> {
    return this.meuEscritorio().pipe(
      map((e) => e.minhaFuncao === 'ADMINISTRADOR'),
      catchError(() => of(false)),
    );
  }

  podeReabrirApuracao(): Observable<boolean> {
    return this.meuEscritorio().pipe(
      map((e) => e.minhaFuncao === 'ADMINISTRADOR' || e.minhaFuncao === 'CONTADOR'),
      catchError(() => of(false)),
    );
  }
}
