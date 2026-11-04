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
  /** cClassTrib **informado na entrada**. Nulo quando o item não informa. */
  cClassTrib?: string | null;
  /**
   * Redução **informada na entrada** (0-100). Nula quando o item não informa, e aí vale a da tabela.
   * Não é para a tela: o que o cálculo usou está em `percentualReducaoAplicado`.
   */
  percentualReducao?: number | null;
  /**
   * Redução de alíquota IBS/CBS **que o cálculo aplicou** (0-100; 100 = alíquota zero): a informada
   * ou a da tabela oficial pelo NCM (IT 2025.002; LC 214/2025). É este que a tela mostra (#116,
   * backend#272). Nulo em nota anterior à mudança.
   */
  percentualReducaoAplicado?: number | null;
  /** cClassTrib usado no cálculo e no XML: o informado ou o da regra pelo NCM (backend#272). */
  cClassTribAplicado?: string | null;
  /**
   * Base de cálculo IBS/CBS = **valor cheio do item**. A LC 214 reduz a alíquota, não a base
   * (backend#278): o tributo é base × alíquota × (1 − redução aplicada).
   */
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

/** Resposta de `POST /api/notas/{id}/cancelar` — espelha `CancelamentoResponse` do backend. */
export interface CancelamentoNota {
  chaveAcesso: string | null;
  status: StatusNotaFiscal;
  /** Instante do cancelamento (ISO com fuso). */
  dataCancelamento: string | null;
  /** Protocolo do evento de cancelamento devolvido pela SEFAZ. */
  protocoloCancelamento: string | null;
  motivoCancelamento: string | null;
  sefazCstat: string | null;
  sefazMotivo: string | null;
}
