import { StatusNotaFiscal } from '@core/enums/status-nota-fiscal.enum';

/** Origem da nota — própria (emitida pelo produtor) ou importada (de terceiros). */
export type OrigemNota = 'PROPRIA' | 'IMPORTADA';

export interface DashboardProdutorResumo {
  nome: string;
  tipoProdutor: string;
  uf: string;
}

export interface DashboardKpis {
  debitoIbs: number;
  debitoCbs: number;
  creditoIbs: number;
  creditoCbs: number;
  saldoIbs: number;
  saldoCbs: number;
  totalNotas: number;
}

/** Contagem de notas por mês (não valores em R$) — últimos meses do período. */
export interface DashboardNotasPorMes {
  periodo: string;
  entradas: number;
  saidas: number;
}

/** Débito de impostos do período — só IBS/CBS (LC 214/2025). */
export interface DashboardDistribuicaoImpostos {
  ibs: number;
  cbs: number;
}

/**
 * Fluxo de caixa em R$ do período (backend#71 — bloco `financeiro`). **Atenção à semântica
 * invertida** em relação a `notasPorMes`: `totalEntradas` = notas PROPRIA (vendas → dinheiro entra),
 * `totalSaidas` = notas IMPORTADA (compras → dinheiro sai). O backend já aplica essa inversão — o
 * frontend só exibe os campos, **sem re-inverter**. Valores em R$ (BigDecimal → number).
 */
export interface DashboardFinanceiro {
  totalEntradas: number;
  totalSaidas: number;
  /** Fluxo de caixa bruto: totalEntradas − totalSaidas. */
  saldo: number;
  /** saldo − (saldoIbs + saldoCbs); pode ser negativo. */
  lucroEstimado: number;
}

export interface DashboardUltimaNota {
  id: string;
  numero: number;
  origem: OrigemNota;
  contraparte: string;
  dataEmissao: string;
  valorTotalNota: number;
  status: StatusNotaFiscal;
}

/**
 * Payload de `GET /api/dashboard?periodo=YYYY-MM` (período opcional → mês corrente).
 * Espelha o contrato consolidado do backend (frontend#20 / backend#65).
 */
export interface DashboardResponse {
  produtor: DashboardProdutorResumo;
  periodo: string;
  kpis: DashboardKpis;
  /**
   * Fluxo de caixa em R$ do período (backend#71). Opcional por robustez: uma instância antiga/mock
   * do backend pode omitir. O backend atual (v1.1) sempre envia.
   */
  financeiro?: DashboardFinanceiro;
  notasPorMes: DashboardNotasPorMes[];
  distribuicaoImpostos: DashboardDistribuicaoImpostos;
  ultimasNotas: DashboardUltimaNota[];
}
