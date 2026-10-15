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

  // Backend: POST /notificacao/enviar
  enviarNotificacao(produtorId: string, mensagem: string): Observable<unknown> {
    return this.api
      .post('/notificacao/enviar', { produtorId, mensagem })
      .pipe(catchError(() => of(null)));
  }

  // Backend: POST /notificacao/:produtorId/todos-atrasados
  notificarTodosAtrasados(produtorId: string): Observable<NotificarResult> {
    return this.api
      .post<NotificarResult>(`/notificacao/${produtorId}/todos-atrasados`)
      .pipe(catchError(() => of({ enviados: 0, indisponivel: true })));
  }
}
