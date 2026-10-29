/**
 * Um item do sino.
 *
 * O `id` virou **texto** na #113: ele deixou de ser um contador local e passou a vir da fonte —
 * o UUID do alerta, ou `"<produtorId>:<chave>"` no agregado da carteira. É o que torna o "lido"
 * estável entre recargas, já que o backend não guarda isso.
 */
export interface Notificacao {
  id: string;
  titulo: string;
  tipo: 'Solicitação' | 'Documento' | 'Pagamento';
  /** Para onde o item leva — o lugar onde aquilo se resolve. */
  rota: string;
  /** Pronto para ler: "em 3 dias · 02/11/2026". */
  dataHora: string;
  lida: boolean;
}
