import { Injectable, inject } from '@angular/core';
import { Observable, of, catchError } from 'rxjs';
import { ApiService } from '@core/services/api.service';

export interface NotificarResult {
  enviados: number;
  mensagem?: string;
}

@Injectable({ providedIn: 'root' })
export class NotificacaoApi {
  private readonly api = inject(ApiService);

  // Backend: POST /notificacao/:produtorId/proximas-obrigacoes
  notificarProximasObrigacoes(produtorId: string): Observable<NotificarResult> {
    return this.api
      .post<NotificarResult>(`/notificacao/${produtorId}/proximas-obrigacoes`)
      .pipe(catchError(() => of({ enviados: 0, mensagem: 'Erro ao enviar notificações' })));
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
      .pipe(catchError(() => of({ enviados: 0 })));
  }
}
