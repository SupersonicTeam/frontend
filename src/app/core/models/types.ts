export interface Produtor {
  id: string;
  nome: string;
  cpfCnpj: string;
  email?: string;
  telefone?: string;
  estado?: string;
  cidade?: string;
  regime: string;
  culturas: string;
  createdAt: string;
  updatedAt: string;
}

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

export interface FluxoCaixa {
  totalEntradas: number;
  totalSaidas: number;
  saldo: number;
  totalImpostos: number;
  lucroEstimado: number;
  qtdNotasEntrada: number;
  qtdNotasSaida: number;
}

export type StatusRascunho =
  | 'rascunho'
  | 'enviado'
  | 'revisao'
  | 'aprovado'
  | 'reprovado'
  | 'finalizado';

export interface ItemRascunhoNota {
  id?: string;
  numeroItem: number;
  descricao: string;
  ncm?: string;
  unidade?: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
}

export interface RascunhoNota {
  id: string;
  produtorId: string;
  titulo?: string;
  tipo: 'entrada' | 'saida';
  naturezaOperacao?: string;
  cfop?: string;
  destinatarioNome?: string;
  destinatarioCpfCnpj?: string;
  uf?: string;
  municipio?: string;
  valorTotal: number;
  observacoes?: string;
  status: StatusRascunho;
  feedbackContador?: string;
  dataEnvio?: string;
  dataFeedback?: string;
  createdAt: string;
  updatedAt: string;
  itens: ItemRascunhoNota[];
}

export interface SolicitacaoContador {
  id: string;
  produtorId: string;
  titulo: string;
  descricao: string;
  categoria: string;
  mesReferencia?: string;
  prioridade: 'baixa' | 'media' | 'alta' | 'urgente';
  status: 'pendente' | 'enviado' | 'concluido' | 'cancelado' | 'rejeitado';
  prazo?: string;
  observacoes?: string;
  motivoRejeicao?: string;
  motivoCancelamento?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentoContador {
  id: string;
  solicitacaoId: string;
  nomeArquivo: string;
  arquivoUrl: string;
  tipo: string;
  createdAt: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export interface VencimentoFiscal {
  id: string;
  titulo: string;
  descricao?: string;
  dataVencimento: string;
  tipo: 'imposto' | 'obrigacao' | 'declaracao' | 'solicitacao';
  status: 'pendente' | 'pago' | 'vencido';
  valor?: number;
  prioridade?: 'baixa' | 'media' | 'alta' | 'urgente';
}

export interface Notificacao {
  id: number;
  titulo: string;
  tipo: 'Solicitação' | 'Documento' | 'Pagamento';
  rota: string;
  dataHora: string;
  lida: boolean;
}

export interface ContatoProdutor {
  nome: string;
  funcao: string;
  telefone: string;
  whatsapp: string;
  email: string;
}

export interface ProdutorContador {
  id: string;
  nome: string;
  cidade?: string;
  uf?: string;
  propriedade?: string;
  contatos: ContatoProdutor[];
}
