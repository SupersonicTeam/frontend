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
