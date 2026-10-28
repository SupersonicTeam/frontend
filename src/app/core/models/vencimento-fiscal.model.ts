/**
 * Um prazo no calendário fiscal do produtor.
 *
 * São **três coisas diferentes** desde a backend#181, e confundi-las já produziu erro na tela:
 *
 * - `imposto` — uma guia: tem `valor` e `status` de pagamento;
 * - `solicitacao` — um pedido de documento do escritório (#180): tem `status`, não tem valor;
 * - `obrigacao` — algo a **fazer**, não a pagar (entregar declaração, o fechamento da apuração):
 *   **não tem `valor` nem `status`**, e traz `periodicidade` e `origem`.
 */
export interface VencimentoFiscal {
  /**
   * **Texto, não UUID nem número.** Numa obrigação o formato é `<obrigacaoId>:<data>`, porque a
   * mesma obrigação se repete em várias datas.
   */
  id: string;
  titulo: string;
  descricao?: string;
  dataVencimento: string;
  tipo: 'imposto' | 'obrigacao' | 'declaracao' | 'solicitacao';
  /**
   * Situação de pagamento — **`null` na obrigação**, que não se paga.
   *
   * O `null` é informação, não ausência de dado: o cliente supunha `pendente` nesse caso, e a
   * data no passado transformava o fechamento da apuração numa "guia atrasada", com conselho de
   * multa e juros.
   */
  status: 'pendente' | 'pago' | 'vencido' | null;
  valor?: number;
  prioridade?: 'baixa' | 'media' | 'alta' | 'urgente';
  /** Só em obrigação: `MENSAL`, `ANUAL`… */
  periodicidade?: string;
  /** Só em obrigação: de onde ela vem, por extenso — ex.: `Lei 8.212/1991, art. 30`. */
  origem?: string;
}
