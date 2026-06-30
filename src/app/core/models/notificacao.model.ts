export interface Notificacao {
  id: number;
  titulo: string;
  tipo: 'Solicitação' | 'Documento' | 'Pagamento';
  rota: string;
  dataHora: string;
  lida: boolean;
}
