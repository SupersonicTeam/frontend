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
