import { Injectable, inject } from '@angular/core';
import { Observable, of, catchError, map } from 'rxjs';
import { ApiService } from '@core/services/api.service';

export interface ChatRequest {
  produtorId: string;
  mensagem: string;
  estado?: string;
  culturas?: string[];
  regimeTributario?: string;
  history?: { role: string; content: string }[];
}

export interface ChatResponse {
  resposta: string;
}

@Injectable({ providedIn: 'root' })
export class ChatApi {
  private readonly api = inject(ApiService);

  // Backend: POST /chat  — body: { message, context? }
  // Response: { response, sources, timestamp }
  enviarMensagem(request: ChatRequest): Observable<ChatResponse> {
    const body = {
      message: request.mensagem,
      context: {
        produtorId: request.produtorId,
        regimeTributario: request.regimeTributario,
        culturas: request.culturas,
        estado: request.estado,
        history: request.history,
      },
    };
    return this.api
      .post<{ response: string; sources: string[]; timestamp: string }>('/chat', body)
      .pipe(
        map((res) => ({ resposta: res.response })),
        catchError(() =>
          of({
            resposta:
              'Desculpe, não consegui processar sua mensagem no momento. Tente novamente.',
          }),
        ),
      );
  }
}
