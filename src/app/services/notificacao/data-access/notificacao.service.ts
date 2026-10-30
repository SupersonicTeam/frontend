import { Injectable, inject } from '@angular/core';
import { Observable, of, catchError } from 'rxjs';
import { ApiService } from '@core/services/api.service';

export interface NotificarResult {
  enviados: number;
  mensagem?: string;
  /**
   * O servidor nao atendeu a chamada.
   *
   * Existe porque o `catchError` aqui devolvia `{ enviados: 0 }` -- indistinguivel de "nao havia
   * nada a notificar". A tela entao dizia ao produtor "Nenhuma obrigacao pendente para
   * notificar" com uma guia vencida ha 33 dias na mesma pagina. A familia `/notificacao` nao
   * existe no backend e responde 404 (SupersonicTeam/backend#182); ate existir, a tela precisa
   * saber a diferenca entre "nada a fazer" e "nao deu para fazer".
   */
  indisponivel?: boolean;
}

@Injectable({ providedIn: 'root' })
export class NotificacaoApi {
  private readonly api = inject(ApiService);

  // Backend: POST /notificacao/:produtorId/proximas-obrigacoes
  notificarProximasObrigacoes(produtorId: string): Observable<NotificarResult> {
    return this.api
      .post<NotificarResult>(`/notificacao/${produtorId}/proximas-obrigacoes`)
      .pipe(catchError(() => of({ enviados: 0, indisponivel: true })));
  }

  // `enviarNotificacao` saiu daqui: **sem chamador** e engolindo a falha com
  // `catchError(() => of(null))` -- quem chamasse nao saberia distinguir "enviado" de "falhou".
  // E o padrao que a #107 apagou em 17 metodos; este escapou, e a auditoria das issues fechadas
  // (30/10) o encontrou. Os dois que ficam tratam a falha com honestidade: devolvem
  // `indisponivel: true`, e a tela diz que o envio ainda nao existe no servidor em vez de mentir
  // "0 enviados".

  // Backend: POST /notificacao/:produtorId/todos-atrasados
  notificarTodosAtrasados(produtorId: string): Observable<NotificarResult> {
    return this.api
      .post<NotificarResult>(`/notificacao/${produtorId}/todos-atrasados`)
      .pipe(catchError(() => of({ enviados: 0, indisponivel: true })));
  }
}
