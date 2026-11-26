import { ligarInteracoes, limitarParallax } from './landing-interacoes';

/**
 * A entrada do hero (#215) e a aba que não desenha.
 *
 * A primeira versão punha a classe `anima` na hora. Numa aba em segundo plano a linha do tempo do
 * documento fica parada: a animação nasce `running` com `currentTime` 0, nunca anda, e o
 * `animation-fill-mode: both` segura o primeiro quadro dela — `opacity: 0`. Em 26/11, em
 * produção, os cinco blocos do hero estavam invisíveis com `timeline.currentTime` em 0.
 */
describe('a entrada do hero só toca se houver quadro', () => {
  let pedidos: FrameRequestCallback[];
  let raiz: HTMLElement;

  beforeEach(() => {
    pedidos = [];
    // Uma aba que não desenha: o pedido é registrado e nunca chamado.
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
      pedidos.push(fn);
      return pedidos.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);

    raiz = document.createElement('div');
    raiz.innerHTML =
      '<section class="hero"><div class="hero-texto"></div><figure class="hero-prova"></figure></section>';
    document.body.append(raiz);
  });

  afterEach(() => {
    raiz.remove();
    vi.unstubAllGlobals();
  });

  const classes = () =>
    [...raiz.querySelectorAll('.hero-texto, .hero-prova')].map((e) =>
      e.classList.contains('anima'),
    );

  it('sem quadro, ninguém recebe a classe — e o estado final é o padrão', () => {
    const desligar = ligarInteracoes(raiz, () => false);
    expect(classes()).toEqual([false, false]);
    desligar();
  });

  it('com o primeiro quadro, a entrada toca', () => {
    const desligar = ligarInteracoes(raiz, () => false);
    pedidos.forEach((fn) => fn(0));
    expect(classes()).toEqual([true, true]);
    desligar();
  });

  it('com movimento reduzido, nem quadro é pedido', () => {
    const desligar = ligarInteracoes(raiz, () => true);
    expect(pedidos).toHaveLength(0);
    expect(classes()).toEqual([false, false]);
    desligar();
  });
});

/**
 * O limite do parallax do hero (#215). O ponteiro capturado fora do hero — um arrasto que começou
 * dentro — manda valores sem teto, e sem isto os cartões saem voando.
 */
describe('limitarParallax', () => {
  it('deixa passar o que está dentro da tela', () => {
    expect(limitarParallax(0)).toBe(0);
    expect(limitarParallax(0.5)).toBe(0.5);
    expect(limitarParallax(-0.5)).toBe(-0.5);
    expect(limitarParallax(1)).toBe(1);
    expect(limitarParallax(-1)).toBe(-1);
  });

  it('corta o que passa de uma tela de distância do centro', () => {
    expect(limitarParallax(3.7)).toBe(1);
    expect(limitarParallax(-12)).toBe(-1);
  });

  it('número que não é número vira o centro, não NaN no estilo', () => {
    // Um hero de largura zero (escondido) faz a divisão dar NaN; `translate3d(NaNpx)` é inválido
    // e o navegador descarta a transformação inteira.
    expect(limitarParallax(Number.NaN)).toBe(0);
    expect(limitarParallax(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
