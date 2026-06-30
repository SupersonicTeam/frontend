import { StatusRascunho } from '@core/enums/status-rascunho.enum';

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
