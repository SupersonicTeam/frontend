/**
 * O mês em que a área do contador abre.
 *
 * **Não é o mês corrente.** Contador fecha o mês que *acabou*: no dia 13 de outubro ele está
 * conferindo setembro, e a apuração de outubro ainda muda a cada nota que o produtor autoriza —
 * a própria tela de Fechamento diz isso ("ainda aberta; o job diário consolida o período").
 *
 * Abrindo no mês corrente, as telas do contador caíam todas em estado vazio no começo de
 * qualquer mês: nenhum impedimento, nenhum número, nenhuma nota. Era a maior parte da impressão
 * de que a área dele "está fraca" — não faltava conteúdo, faltava estar no mês certo.
 *
 * O produtor continua abrindo no mês corrente: a pergunta dele é "quanto estou devendo agora",
 * não "o que fechou".
 */
export function mesDeFechamento(hoje: Date = new Date()): { mes: number; ano: number } {
  const anterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  return { mes: anterior.getMonth() + 1, ano: anterior.getFullYear() };
}
