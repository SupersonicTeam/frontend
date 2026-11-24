import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { Observable } from 'rxjs';
import { skipErrorNotify } from '@core/interceptors/error-notify.context';

/**
 * Um serviço de fora do Brasil que trata dados em nome da GWNext (backend#586, LGPD art. 33).
 *
 * Hoje são dois: a **Resend** (envio de e-mail) e a **Anthropic** (o modelo da Ceres). O texto é
 * todo do backend — a tela não reescreve nada, nem resume: o que o titular lê aqui é o que o
 * controlador afirma.
 */
export interface OperadorExterno {
  nome: string;
  /** Para que ele é usado, em uma frase. */
  servico: string;
  /** Onde os dados ficam, com a ressalva que o provedor publica. */
  localizacao: string;
  finalidade: string;
  /** O que sai daqui para ele. */
  dadosEnviados: string[];
  /** O que **não** sai. Tão importante quanto o que sai, e é o que o titular procura. */
  dadosNaoEnviados: string[];
  /** A hipótese do art. 33 em que a GWNext se apoia, e o que o contrato dele cobre. */
  baseTransferencia: string;
  retencao: string;
  /** Como exercer os direitos naquele operador — nem sempre dá, e a política diz quando não dá. */
  comoExercerDireitos: string;
}

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
  /**
   * **Opcional de propósito** (#206): o campo nasceu na política `2026-11-17` e um backend mais
   * antigo — o local, enquanto não for atualizado — não o manda. Ausente, a página fica inteira: os
   * mesmos fatos já estão nas listas acima.
   */
  operadoresExternos?: OperadorExterno[];
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
