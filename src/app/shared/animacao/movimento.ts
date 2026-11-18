/**
 * Durações e curvas das animações em JS da landing (#174, N2.8), num arquivo só.
 *
 * São **os mesmos valores** dos tokens de movimento do `styles.css` (`--duracao-*`, `--ease-*`),
 * escritos de novo porque o Motion não lê custom property: ele quer segundos e a curva como quatro
 * números. Mexeu num lado, mexa no outro — uma cena em JS ao lado de uma transição em CSS com
 * curvas diferentes é exatamente o que faz a página parecer montada por duas pessoas.
 */

/** Em **segundos**, como o Motion pede. */
export const DURACAO = {
  /** Resposta a toque e hover. `--duracao-toque`. */
  toque: 0.12,
  /** Conteúdo chegando. `--duracao-entrada`. */
  entrada: 0.24,
  /** Sempre mais curta que a entrada: o que vai embora não merece espera. `--duracao-saida`. */
  saida: 0.16,
  /** Entrada narrativa das cenas da landing (item 4.1 da especificação). */
  narrativa: 0.48,
  /** Intervalo entre os passos de uma sequência (linhas da nota, chips de citação). */
  passo: 0.3,
} as const;

/** `--ease-entrada`: desacelera forte no fim, o elemento "assenta". */
export const EASE_ENTRADA = [0.16, 1, 0.3, 1] as const;
/** `--ease-saida`: acelera e some. */
export const EASE_SAIDA = [0.4, 0, 1, 1] as const;
/** `--ease-padrao`. */
export const EASE_PADRAO = [0.4, 0, 0.2, 1] as const;

/**
 * O teto de uma cena que toca sozinha (WCAG 2.2.2, e a decisão de 09/11 de não ter botão de
 * pausa): **até 5 segundos**, uma vez, parando no quadro final. Cena ligada à rolagem do visitante
 * não entra nesta conta — quem a move é ele.
 */
export const LIMITE_DA_CENA_AUTOMATICA_S = 5;
