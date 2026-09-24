/**
 * Lê as cores do design system para usar dentro do Chart.js.
 *
 * O Chart.js desenha em `<canvas>`, então não enxerga classe do Tailwind nem
 * herda `currentColor` — ele precisa da cor resolvida em string. Antes, os
 * gráficos do dashboard traziam as cores cravadas no TypeScript
 * (`hsl(142, 44%, 32%)`, `hsl(142, 15%, 88%)`, `hsl(0, 0%, 100%)`), o que fazia
 * a linha de grade e a borda das fatias ficarem **claras sobre fundo escuro** no
 * tema escuro, e usava o verde da marca numa versão que reprova no contraste.
 *
 * Aqui a cor sai do mesmo `:root`/`.dark` que o resto da interface usa, então o
 * gráfico acompanha o tema sem duplicar a paleta.
 */

/** Cache por tema: `getComputedStyle` no `<html>` é caro para chamar por dataset. */
const cache = new Map<string, string>();

/**
 * Devolve o valor de uma custom property do tema (ex.: `--color-primary`).
 *
 * @param nome nome da variável CSS, com os dois hífens
 * @param reserva cor usada quando a variável não existe ou não há DOM (SSR/teste)
 */
export function corDoTema(nome: string, reserva: string): string {
  if (typeof document === 'undefined') return reserva;

  const escuro = document.documentElement.classList.contains('dark');
  const chave = `${escuro ? 'd' : 'c'}:${nome}`;
  const emCache = cache.get(chave);
  if (emCache) return emCache;

  let valor = '';
  try {
    valor = getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
  } catch {
    /* jsdom sem layout, ou custom property ausente */
  }

  const cor = valor || reserva;
  cache.set(chave, cor);
  return cor;
}

/** Limpa o cache — chamar ao alternar o tema, senão a cor antiga persiste. */
export function limparCacheDeCores(): void {
  cache.clear();
}

/**
 * Paleta das séries dos gráficos, na ordem em que os datasets aparecem.
 * `accent` (laranja) para entradas/CBS e `primary` (verde-agro) para saídas/IBS —
 * os dois já clareiam no tema escuro pelos tokens.
 */
export function paletaDeSeries(): [string, string] {
  return [
    corDoTema('--color-accent', 'hsl(33 55% 52%)'),
    corDoTema('--color-primary', 'hsl(142 44% 32%)'),
  ];
}

/** Cor da linha de grade e dos rótulos dos eixos. */
export function coresDeEixo(): { grade: string; texto: string } {
  return {
    grade: corDoTema('--color-border', 'hsl(142 15% 88%)'),
    texto: corDoTema('--color-muted-foreground', 'hsl(150 8% 42%)'),
  };
}

/** Cor de fundo do card — usada como borda entre as fatias da pizza. */
export function corDeSuperficie(): string {
  return corDoTema('--color-card', 'hsl(0 0% 100%)');
}
