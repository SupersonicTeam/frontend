import { InjectionToken } from '@angular/core';

/**
 * O que a landing usa do Motion (#174, N2 com a decisão de 09/11: Motion no lugar do GSAP).
 *
 * Só as três funções que as cenas precisam — `animate` (as sequências), `scroll` (o que anda com
 * a rolagem, inclusive a jornada 3D) e `inView` (disparar quando a cena entra na tela). Tipado a
 * partir do pacote, para uma troca de versão que mude a assinatura não passar calada.
 */
export type ApiDeAnimacao = Pick<typeof import('motion'), 'animate' | 'scroll' | 'inView'>;

/**
 * Como a biblioteca de animação chega à página (#174, N2.4).
 *
 * É um token, e não um `import` no topo de cada cena, por três razões:
 *
 * - **o `import()` é dinâmico**, então o Motion vira um chunk próprio, pedido só pela landing e só
 *   depois do `load` — nunca no bundle inicial, que já encosta no aviso de 500 kB;
 * - **os specs trocam o token por um falso**: nenhum teste de cena baixa nem executa a
 *   biblioteca, e dá para simular o carregador que falha ou que demora;
 * - **é o último corte da N5.2**: trocar a fábrica por `async () => null` deixa a landing inteira
 *   estática, com o mesmo conteúdo, numa linha. Toda cena tem versão estática equivalente.
 *
 * Ninguém chama este token direto: quem decide **se** e **quando** carregar é o
 * `AnimacaoLandingService`.
 */
export const CARREGAR_ANIMACAO = new InjectionToken<() => Promise<ApiDeAnimacao | null>>(
  'CARREGAR_ANIMACAO',
  {
    providedIn: 'root',
    factory: () => async () => {
      // Pelo `motion.lazy.ts`, e não direto do pacote: é o que deixa o empacotador descartar o
      // que as cenas não usam (ver o comentário daquele arquivo).
      const { animate, scroll, inView } = await import('./motion.lazy');
      return { animate, scroll, inView };
    },
  },
);
