/**
 * Glossário dos termos fiscais que o app mostra (issue #105).
 *
 * ## Por que isto existe
 *
 * O `dashboard.ts` tinha um `termoExplicado` e um `explicar()` com o comentário "Abre o glossário
 * de um termo fiscal (IBS, CBS, crédito)". Nenhum dos dois era referenciado em lugar nenhum — nem
 * template, nem teste. **O glossário não existia**; existia um andaime que parecia um.
 *
 * O conteúdo, esse existia: um parágrafo corrido dentro do painel recolhido de tributos,
 * explicando os cinco termos de uma vez. As frases aqui são **as mesmas**, só que cada uma presa
 * ao termo que explica — não inventei definição fiscal nova, realoquei a redação que já estava no
 * ar.
 *
 * ## A regra de onde para
 *
 * Cada verbete diz **o que aquele número é nesta tela**, não o que a lei diz. Para o resto existe
 * a Ceres, que cita o dispositivo: é para isso que cada termo carrega uma `pergunta` pronta. Essa
 * é a parte "glossário e atalhos alinhados" da issue — o glossário não concorre com a assistente,
 * ele entrega a pergunta a ela já formulada.
 *
 * As perguntas são escritas na mesma voz das sugestões do chat (`AssistenteStore.perguntasSugeridas`):
 * primeira pessoa, linguagem de produtor, sobre o que *me* acontece.
 */

export interface TermoFiscal {
  /** Chave estável, usada em `track` e em teste. */
  chave: string;
  /** Como aparece na tela. */
  termo: string;
  /** Uma linha: o que é esse número aqui. */
  resumo: string;
  /** O que perguntar à Ceres quando uma linha não basta. */
  pergunta: string;
}

export const TERMOS_FISCAIS: readonly TermoFiscal[] = [
  {
    chave: 'ibs',
    termo: 'IBS',
    resumo:
      'Imposto sobre Bens e Serviços. Com a CBS, substitui ICMS, ISS, PIS e Cofins na reforma tributária de 2026.',
    pergunta: 'O que muda para mim com o IBS?',
  },
  {
    chave: 'cbs',
    termo: 'CBS',
    resumo:
      'Contribuição sobre Bens e Serviços. Com o IBS, substitui ICMS, ISS, PIS e Cofins na reforma tributária de 2026.',
    pergunta: 'O que muda para mim com a CBS?',
  },
  {
    chave: 'debito',
    termo: 'Débito',
    resumo: 'O que você deve pelas suas vendas do período.',
    pergunta: 'Como é calculado o débito das minhas vendas?',
  },
  {
    chave: 'credito',
    termo: 'Crédito',
    resumo: 'O que abate pelas suas compras do período.',
    pergunta: 'Como funciona o crédito que abate do meu pagamento?',
  },
  {
    chave: 'saldo',
    termo: 'Saldo',
    resumo: 'A diferença entre o débito e o crédito — o que sobra para pagar.',
    pergunta: 'Como chega o valor que eu tenho a pagar este mês?',
  },
];

/** Um termo pela chave, ou `null` — chave desconhecida não vira verbete inventado. */
export function termoFiscal(chave: string): TermoFiscal | null {
  return TERMOS_FISCAIS.find((t) => t.chave === chave) ?? null;
}
