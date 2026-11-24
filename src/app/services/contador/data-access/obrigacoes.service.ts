import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { ApiService } from '@core/services/api.service';

/**
 * De onde a obrigação veio.
 *
 * - `MODELO` — vem do sistema e o escritório não mexeu nela;
 * - `PERSONALIZADA` — a versão do escritório para um modelo do sistema;
 * - `PROPRIA` — o escritório criou do zero.
 */
export type OrigemCatalogo = 'MODELO' | 'PERSONALIZADA' | 'PROPRIA';

/** Uma obrigação do catálogo do escritório (backend#181). */
export interface ObrigacaoCatalogo {
  id: string;
  /** O modelo do sistema de que ela descende; nulo nas próprias. */
  modeloId: string | null;
  origemCatalogo: OrigemCatalogo;
  titulo: string;
  descricao: string | null;
  /** `MENSAL`, `ANUAL`… */
  periodicidade: string;
  /** Dia do vencimento. */
  dia: number;
  /** Mês — **só na anual**; mensal com mês devolve 400 `OBRIGACAO_INVALIDA`. */
  mes: number | null;
  ajusteFimDeSemana: string;
  /** A quem ela se aplica; nulo = a todos. */
  tipoProdutor: string | null;
  regimes: string[];
  /** A norma de onde ela vem, por extenso. */
  origem: string | null;
  /** Está no calendário dos clientes. */
  ativa: boolean;
}

/** Corpo de criação/edição. */
export interface ObrigacaoRequest {
  titulo: string;
  periodicidade: string;
  dia: number;
  /** Obrigatório na anual, proibido na mensal — fora disso o servidor devolve 400. */
  mes?: number;
  descricao?: string;
  origem?: string;
  tipoProdutor?: string;
  regimes?: string[];
  /**
   * `NENHUM`, `ANTECIPA` ou `POSTERGA`. A tela não o edita (#185), mas o `PUT` substitui a
   * obrigação inteira: na edição ele volta **como veio**, senão um modelo que antecipa o
   * vencimento do fim de semana viraria "sem ajuste" só por ter o título corrigido.
   */
  ajusteFimDeSemana?: string;
}

/** As periodicidades que o backend aceita (`Periodicidade.java`). */
export const PERIODICIDADES = ['MENSAL', 'ANUAL'] as const;

/** Os regimes a que uma obrigação pode valer (`RegimeTributario.java`). Vazio = todos. */
export const REGIMES_DA_OBRIGACAO = ['MEI', 'SIMPLES', 'PRESUMIDO', 'REAL'] as const;

/** De onde a obrigação veio, na voz de quem lê o catálogo. */
export const ORIGEM_CATALOGO_LABEL: Record<OrigemCatalogo, string> = {
  MODELO: 'Padrão do sistema',
  PERSONALIZADA: 'Padrão ajustado pelo escritório',
  PROPRIA: 'Criada pelo escritório',
};

/**
 * O catálogo de obrigações do escritório (backend#181).
 *
 * É ele que alimenta as obrigações no calendário dos clientes: o que estiver aqui como `ativa`
 * aparece lá como `tipo: "obrigacao"`.
 *
 * **Qualquer membro lê; só o administrador altera** — as rotas de escrita respondem 403 para as
 * outras funções, então a tela esconde os botões conforme o `minhaFuncao` do escritório.
 */
@Injectable({ providedIn: 'root' })
export class ObrigacoesApi {
  private readonly api = inject(ApiService);

  /**
   * `GET /api/contador/obrigacoes` — o catálogo **efetivo**.
   *
   * Vem numa lista só: as próprias do escritório, as versões dele e os modelos do sistema em que
   * ele não mexeu. Inclui as desativadas, que é o que permite reativá-las.
   */
  catalogo(): Observable<ObrigacaoCatalogo[]> {
    return this.api.get<ObrigacaoCatalogo[]>('/contador/obrigacoes');
  }

  /** `POST` — cria uma obrigação própria do escritório. */
  criar(request: ObrigacaoRequest): Observable<ObrigacaoCatalogo> {
    return this.api.post<ObrigacaoCatalogo>('/contador/obrigacoes', request);
  }

  /**
   * `PUT` — edita.
   *
   * **Num modelo do sistema isto não altera o modelo**: o servidor cria (ou atualiza) a versão do
   * escritório. É por isso que existe o `restaurarPadrao`.
   */
  atualizar(id: string, request: ObrigacaoRequest): Observable<ObrigacaoCatalogo> {
    return this.api.put<ObrigacaoCatalogo>(`/contador/obrigacoes/${id}`, request);
  }

  /**
   * `DELETE` — **tira do calendário, não apaga**.
   *
   * Medido em 28/10: a obrigação volta com `ativa: false` e pode ser reativada. Num modelo do
   * sistema ela nem some da lista — o escritório passa a ter a versão dele daquele modelo,
   * desativada, com id novo. Por isso a tela fala em "tirar do calendário", nunca em excluir.
   */
  desativar(id: string): Observable<ObrigacaoCatalogo> {
    return this.api.delete<ObrigacaoCatalogo>(`/contador/obrigacoes/${id}`);
  }

  /** `POST .../reativar` — devolve a obrigação ao calendário dos clientes. */
  reativar(id: string): Observable<ObrigacaoCatalogo> {
    return this.api.post<ObrigacaoCatalogo>(`/contador/obrigacoes/${id}/reativar`);
  }

  /** `POST .../restaurar-padrao` — joga fora a versão do escritório e volta ao modelo. */
  restaurarPadrao(id: string): Observable<ObrigacaoCatalogo> {
    return this.api.post<ObrigacaoCatalogo>(`/contador/obrigacoes/${id}/restaurar-padrao`);
  }
}
