import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { Observable } from 'rxjs';
import { skipErrorNotify } from '@core/interceptors/error-notify.context';

/** `GET /api/politica-dados` — a política de tratamento de dados (LGPD art. 9º). */
export interface PoliticaDados {
  versao: string;
  controlador: string;
  contatoEncarregado: string;
  dadosColetados: string[];
  finalidades: string[];
  basesLegais: string[];
  compartilhamento: string[];
  retencao: string[];
  direitos: string[];
  comoExercer: string;
}

/**
 * A política de dados (#137). Rota **pública**: quem ainda não tem conta precisa poder lê-la antes
 * de se cadastrar. A exclusão da conta, que é do titular logado, mora no `AuthApi`.
 */
@Injectable({ providedIn: 'root' })
export class PrivacidadeApi {
  private readonly http = inject(HttpClient);

  /** Sem toast global: a página mostra a falha no lugar do texto. */
  politica(): Observable<PoliticaDados> {
    return this.http.get<PoliticaDados>('/politica-dados', { context: skipErrorNotify() });
  }
}
