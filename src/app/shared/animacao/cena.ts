/** O mínimo que uma animação do Motion oferece para ser levada ao fim. */
export interface ControleDeAnimacao {
  /** Pula para o estado final. */
  complete(): void;
}

/**
 * O que uma cena criou, para desfazer de uma vez (#174, N2.4).
 *
 * O GSAP tinha o `context().revert()`: numa chamada ele matava os tweens e os listeners de rolagem
 * de uma cena. O Motion não tem equivalente — cada `animate()` devolve um controle, cada
 * `scroll()`/`inView()` devolve uma função de limpeza, e "o conjunto fica à mão". Esta classe é
 * esse conjunto, para o "à mão" não virar uma lista esquecida em cada cena.
 *
 * `concluir()` serve aos dois momentos em que uma cena precisa parar:
 *
 * - **"Reduzir animações" ligado no meio da cena** — tudo vai ao estado final na hora. O estado
 *   final está no DOM desde o início; a animação só adia a chegada a ele;
 * - **o componente saiu da tela** (`DestroyRef`) — nenhum listener de rolagem sobrevive à
 *   navegação para `/login`.
 *
 * Tudo o que a cena criar **depois** de montada (a resposta a um clique, um `scroll()` armado
 * mais tarde) também entra por aqui, senão o `concluir()` não o alcança.
 */
export class Cena {
  private controles: ControleDeAnimacao[] = [];
  private limpezas: (() => void)[] = [];

  /** Registra uma animação (`animate`). Devolve o próprio controle, para encadear. */
  animacao<T extends ControleDeAnimacao>(controle: T): T {
    this.controles.push(controle);
    return controle;
  }

  /** Registra o que `scroll()` ou `inView()` devolveram: a função que solta o listener. */
  aoEncerrar(limpeza: () => void): void {
    this.limpezas.push(limpeza);
  }

  /**
   * Leva as animações ao estado final e solta os listeners. Pode ser chamado mais de uma vez: a
   * segunda não encontra nada. Um controle que lançar não impede os outros de concluir.
   */
  concluir(): void {
    const controles = this.controles;
    const limpezas = this.limpezas;
    this.controles = [];
    this.limpezas = [];
    for (const controle of controles) {
      try {
        controle.complete();
      } catch {
        /* animação já encerrada pelo navegador: não há o que concluir */
      }
    }
    for (const limpeza of limpezas) {
      try {
        limpeza();
      } catch {
        /* listener já solto */
      }
    }
  }
}
