import { limitarParallax } from './landing-interacoes';

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
