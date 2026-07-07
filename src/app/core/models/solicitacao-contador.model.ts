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

export type TipoGuia = 'ICMS' | 'FUNRURAL' | 'DARF' | 'GPS' | 'OUTRO';

export interface GuiaFiscal {
  id: string;
  produtorId: string;
  tipoGuia: TipoGuia;
  dataVencimento: string;
  valor: number;
  status: 'pendente' | 'pago' | 'vencido';
  observacoes?: string;
  createdAt: string;
}

export interface CreateGuiaDto {
  produtorId: string;
  tipoGuia: TipoGuia;
  dataVencimento: string;
  valor: number;
  observacoes?: string;
}
