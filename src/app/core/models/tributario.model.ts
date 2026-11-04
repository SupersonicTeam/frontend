import { StatusApuracao } from '@core/enums/status-apuracao.enum';

/**
 * Apuração mensal consolidada de IBS/CBS de um produtor — espelha
 * `br.com.agrocontabil.dto.ApuracaoResponse` (RN004). Response == model: sem DTO
 * intermediário (o record do backend já usa nomes de domínio em PT).
 */
export interface Apuracao {
  /**
   * Período consolidado. `YYYY-MM` no mês; com `agrupamento` vira `2026-T1`, `2026-S1` ou `2026`.
   */
  periodo: string;
  /** Primeiro e último mês que o item cobre (`YYYY-MM`). Iguais ao `periodo` no mês (#116). */
  inicio: string;
  fim: string;
  /**
   * `true` no mês corrente ou futuro: a conta ainda muda a cada nota autorizada.
   *
   * Não é o mesmo que `status: 'ABERTO'`. Um mês já terminado pode seguir aberto até o fechamento
   * automático, e a conta dele não muda mais.
   */
  parcial: boolean;
  status: StatusApuracao;
  debitoIbs: number;
  debitoCbs: number;
  creditoIbs: number;
  creditoCbs: number;
  saldoIbs: number;
  saldoCbs: number;
  totalNotas: number;
  /** Instante do fechamento automático (ISO); nulo enquanto ABERTO. */
  dataFechamento: string | null;
}

/**
 * Saldo acumulado de crédito tributário de IBS/CBS em um período — espelha
 * `br.com.agrocontabil.dto.CreditoSaldoResponse` (RN003).
 */
export interface CreditoSaldo {
  periodo: string;
  creditoIbs: number;
  creditoCbs: number;
  creditoTotal: number;
  quantidadeNotas: number;
}

/**
 * Relatório de conformidade tributária (débitos x créditos) de um período — espelha
 * `br.com.agrocontabil.dto.RelatorioConformidadeResponse` (UC004).
 */
export interface RelatorioConformidade {
  periodo: string;
  debitoIbs: number;
  debitoCbs: number;
  debitoTotal: number;
  quantidadeSaidas: number;
  creditoIbs: number;
  creditoCbs: number;
  creditoTotal: number;
  quantidadeEntradas: number;
  saldoIbs: number;
  saldoCbs: number;
  /** Saldo total a pagar (débitoTotal - créditoTotal); negativo = saldo credor. */
  saldoAPagar: number;
}
