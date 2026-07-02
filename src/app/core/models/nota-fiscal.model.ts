import { StatusNotaFiscal } from '@core/enums/status-nota-fiscal.enum';

/** Tipo do documento fiscal — NFE (padrão) ou NFA (Nota Fiscal Avulsa do produtor rural PF). */
export type TipoDocumento = 'NFE' | 'NFA';

/** Endereço do destinatário (espelha `EnderecoDestinatarioResponse` do backend). */
export interface EnderecoDestinatario {
  logradouro?: string | null;
  numero?: string | null;
  municipio?: string | null;
  codigoMunicipioIbge?: string | null;
  uf?: string | null;
  cep?: string | null;
}

/**
 * Item de nota fiscal — espelha `NotaFiscalItemResponse` do backend Spring.
 * Campos IBS/CBS e `valorTotal` são calculados pelo servidor (nunca enviados pelo cliente).
 */
export interface ItemNotaFiscal {
  id?: string;
  numeroItem: number;
  codigoProduto?: string | null;
  descricao: string;
  ncm: string;
  cfop: string;
  unidade: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal?: number;
  cstIbsCbs?: string | null;
  cClassTrib?: string | null;
  percentualReducao?: number | null;
  baseCalculoIbsCbs?: number | null;
  aliquotaIbs?: number | null;
  valorIbs?: number | null;
  aliquotaCbs?: number | null;
  valorCbs?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Nota fiscal — espelha `NotaFiscalResponse` do backend Spring
 * (`br.com.agrocontabil.dto.NotaFiscalResponse`). Fonte de verdade dos contratos.
 *
 * Totais (`valorTotalProdutos/Nota/Ibs/Cbs`) e `chaveAcesso` são calculados/preenchidos
 * pelo backend. Datas são ISO-8601 com offset (OffsetDateTime).
 */
export interface NotaFiscal {
  id: string;
  chaveAcesso?: string | null;
  numero: number;
  serie?: number;
  modelo?: string;
  naturezaOperacao: string;
  status: StatusNotaFiscal;
  tipoDocumento?: TipoDocumento;
  dataEmissao: string;
  dataSaida?: string | null;
  produtorId?: string;
  destinatarioNome: string;
  destinatarioCpfCnpj: string;
  destinatarioIe?: string | null;
  destinatarioEndereco?: EnderecoDestinatario | null;
  valorTotalProdutos?: number;
  valorTotalNota?: number;
  valorTotalIbs?: number | null;
  valorTotalCbs?: number | null;
  itens: ItemNotaFiscal[];
  createdAt?: string;
  updatedAt?: string;
}
