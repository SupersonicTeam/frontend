import { StatusNotaFiscal } from '@core/enums/status-nota-fiscal.enum';

/** Resultado do envio/consulta de uma NF-e à SEFAZ (espelha SefazEnvio/StatusResponse). */
export interface SefazRetorno {
  chaveAcesso: string;
  status: StatusNotaFiscal;
  /** Código de status da SEFAZ (ex.: "100"). */
  cStat: string;
  /** Descrição textual do status (ex.: "Autorizado o uso da NF-e"). */
  xMotivo: string;
  /** Protocolo de autorização (nulo se não autorizada). */
  protocolo?: string | null;
  /** Instante da autorização (nulo se não autorizada). */
  dataAutorizacao?: string | null;
}

/** Uma inconsistência registrada ao validar/gerar o XML (espelha NotaFiscalValidacaoResponse). */
export interface NotaValidacaoResponse {
  loteValidacao: string;
  code: string;
  field?: string;
  message: string;
  suggestion?: string;
  validadoEm: string;
}
