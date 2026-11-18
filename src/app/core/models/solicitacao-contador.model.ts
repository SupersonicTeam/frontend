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
  /** Quando a guia foi marcada como paga (ISO com fuso); nula enquanto não paga (#116). */
  dataPagamento?: string | null;
  createdAt: string;
}

/**
 * Corpo do `POST` de guia nas rotas novas (#198, backend#273): **sem `produtorId`**. Na rota do
 * produtor ele vem da identidade; na do contador, do caminho.
 */
export interface NovaGuiaDto {
  tipoGuia: TipoGuia;
  dataVencimento: string;
  valor: number;
  observacoes?: string;
}
