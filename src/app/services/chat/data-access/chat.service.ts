import { Injectable, inject } from '@angular/core';
import { Observable, map, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { HttpErrorResponse } from '@angular/common/http';
import { ApiService } from '@core/services/api.service';

/**
 * Contexto que acompanha a pergunta. Sai do produtor real — nada fixo no código.
 * É o que o RAG vai usar para responder sobre a fazenda de quem está perguntando,
 * e é também o isolamento por produtor exigido pela RN007 do TCC.
 */
export interface ChatContexto {
  produtorId: string;
  nome?: string;
  uf?: string;
  periodo?: string;
  /** Saldo de IBS + CBS do período, para o assistente falar de número real. */
  saldoAPagar?: number;
  /** Quantas notas estão com inconsistência agora. */
  notasPendentes?: number;
}

export interface ChatRequest {
  mensagem: string;
  contexto: ChatContexto;
  history?: { role: string; content: string }[];
}

export interface ChatResponse {
  resposta: string;
  /** Trechos da legislação citados pelo RAG. Vazio até o backend existir. */
  fontes: string[];
}

/** O assistente ainda não foi ligado no backend — erro reconhecível pela tela. */
export class AssistenteIndisponivelError extends Error {
  constructor() {
    super('O assistente ainda não está ligado.');
    this.name = 'AssistenteIndisponivelError';
  }
}

@Injectable({ providedIn: 'root' })
export class ChatApi {
  private readonly api = inject(ApiService);

  /**
   * `POST /chat` — **o endpoint ainda não existe** (responde 404; não há LLM nem RAG
   * no backend). O contrato aqui é o alvo para quando ele existir: mensagem, contexto
   * do produtor e histórico entram; resposta e **fontes citadas** voltam.
   *
   * Antes, o `catchError` devolvia uma mensagem genérica de assistente
   * ("não consegui processar sua mensagem") como se fosse resposta dele. Isso faz a
   * tela parecer que o assistente pensou e falhou, quando na verdade ele nem existe.
   * Agora o 404 vira `AssistenteIndisponivelError` e a tela diz a verdade.
   */
  enviarMensagem(request: ChatRequest): Observable<ChatResponse> {
    const body = {
      message: request.mensagem,
      context: { ...request.contexto, history: request.history },
    };
    return this.api
      .post<{ response: string; sources?: string[] }>('/chat', body)
      .pipe(
        map((res) => ({ resposta: res.response, fontes: res.sources ?? [] })),
        catchError((erro: HttpErrorResponse) =>
          throwError(() =>
            erro?.status === 404 || erro?.status === 0 ? new AssistenteIndisponivelError() : erro,
          ),
        ),
      );
  }
}
