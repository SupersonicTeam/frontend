import { TipoDocumento } from '@models/nota-fiscal.model';

/**
 * DTO de entrada para criação/atualização de nota fiscal — espelha `NotaFiscalRequest`
 * do backend Spring. Campos calculados (`valorTotal*`, IBS/CBS) e `modelo` NÃO são
 * enviados (anti mass-assignment / fixados no servidor).
 */
export interface EnderecoDestinatarioRequest {
  logradouro?: string;
  numero?: string;
  municipio?: string;
  /** 7 dígitos. */
  codigoMunicipioIbge?: string;
  /** 2 letras maiúsculas. */
  uf?: string;
  /** 8 dígitos. */
  cep?: string;
}

export interface NotaFiscalItemRequest {
  numeroItem: number;
  codigoProduto?: string;
  descricao: string;
  /** 8 dígitos. */
  ncm: string;
  /** 4 dígitos. */
  cfop: string;
  unidade: string;
  quantidade: number;
  valorUnitario: number;
  /** Opcionais classificatórios de IBS/CBS. */
  cstIbsCbs?: string;
  cClassTrib?: string;
  percentualReducao?: number;
}

export interface NotaFiscalRequest {
  numero: number;
  serie?: number;
  naturezaOperacao: string;
  /** ISO-8601 com offset (OffsetDateTime), ex.: 2026-06-10T10:00:00-03:00. */
  dataEmissao: string;
  dataSaida?: string;
  tipoDocumento?: TipoDocumento;
  destinatarioNome: string;
  /** Exatamente 11 (CPF) ou 14 (CNPJ) dígitos, só números. */
  destinatarioCpfCnpj: string;
  destinatarioIe?: string;
  destinatarioEndereco?: EnderecoDestinatarioRequest;
  itens: NotaFiscalItemRequest[];
}
