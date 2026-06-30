export interface ItemNotaFiscal {
  id: string;
  numeroItem: number;
  codigoProduto?: string;
  descricao: string;
  ncm?: string;
  cfop?: string;
  unidade?: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
  valorDesconto?: number;
  valorFrete?: number;
  valorCbs?: number;
  valorIbs?: number;
  valorFunrural?: number;
  valorIcms?: number;
}

export interface NotaFiscal {
  id: string;
  produtorId: string;
  chaveAcesso: string;
  tipo: 'entrada' | 'saida';
  numero?: string;
  serie?: string;
  cfop?: string;
  naturezaOperacao?: string;
  nomeEmitente?: string;
  cpfCnpjEmitente?: string;
  destino?: string;
  exportacao?: boolean;
  valorTotal: number;
  valorProdutos?: number;
  valorFrete?: number;
  valorSeguro?: number;
  valorDesconto?: number;
  arquivoUrl?: string;
  arquivoTipo?: string;
  status?: string;
  valorCbs?: number;
  valorIbs?: number;
  valorFunrural?: number;
  valorIcms?: number;
  valorIpi?: number;
  observacoes?: string;
  dataEmissao?: string;
  createdAt?: string;
  itens: ItemNotaFiscal[];
}
