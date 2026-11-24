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
   * CST do ICMS do item (40, 41, 50, 51 ou 90), combinado com o contador. O sistema não calcula
   * ICMS: o CST é declarado. Nulo = não informado, e aí a emissão decide (51 na venda interna de
   * produção própria a destinatário com IE; 422 `ICMS_A_DEFINIR` nos outros casos).
   */
  cstIcms?: string | null;
  /** Origem da mercadoria (tabela Torig, 0 a 8). Nulo = não informado, e vale 0 (nacional). */
  origemIcms?: string | null;
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
  /**
   * `PROPRIA` (o produtor emitiu) ou `IMPORTADA` (compra: XML de um fornecedor), backend#409. Na
   * importada o produtor é o **destinatário**, e quem emitiu vem em `emitenteNome`/`emitenteCpfCnpj`.
   */
  origem?: OrigemNota | null;
  /** Só na `IMPORTADA`; `null` na própria, cujo emitente é o produtor logado. */
  emitenteNome?: string | null;
  /** Só dígitos; só na `IMPORTADA`. */
  emitenteCpfCnpj?: string | null;
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
  /**
   * Avisos de quem salvou (backend#389): só `POST` e `PUT /api/notas` os preenchem, e a nota **foi
   * salva** mesmo com eles. Nas demais respostas a lista vem vazia (ou não vem).
   */
  avisos?: AvisoNota[];
  createdAt?: string;
  updatedAt?: string;
}

/** De onde a nota veio (backend#409): os mesmos valores do dashboard. */
export type OrigemNota = 'PROPRIA' | 'IMPORTADA';

/** A nota é uma compra importada (o produtor é o destinatário, não o emitente)? */
export function ehCompraImportada(nota?: Pick<NotaFiscal, 'origem'> | null): boolean {
  return nota?.origem === 'IMPORTADA';
}

/**
 * Com quem a nota foi feita, do ponto de vista do produtor: na compra importada, o fornecedor que
 * emitiu; na própria, o destinatário. A lista mostrava o destinatário sempre, e a compra aparecia
 * com o nome do próprio produtor (roteiro da demo, 06/11).
 */
export function contraparteDaNota(nota: {
  origem?: OrigemNota | null;
  emitenteNome?: string | null;
  destinatarioNome?: string | null;
}): string {
  return ehCompraImportada(nota)
    ? nota.emitenteNome || 'Fornecedor'
    : (nota.destinatarioNome ?? '');
}

/**
 * Um aviso ao salvar a nota (backend#389). Não é erro: a nota foi gravada. O único `codigo` hoje é
 * `CCLASSTRIB_NAO_ADMITIDO` (o cClassTrib do item não é admitido para aquele NCM).
 */
export interface AvisoNota {
  codigo: string;
  numeroItem?: number | null;
  campo?: string | null;
  mensagem: string;
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
