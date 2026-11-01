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
 * Paleta de **entradas e saídas**, na ordem em que os datasets aparecem: `accent` (laranja) para
 * entradas, `primary` (verde-agro) para saídas. Os dois já clareiam no tema escuro pelos tokens.
 *
 * **Não serve para IBS/CBS** — para imposto, use `paletaDeImpostos()`. Esta função dizia atender
 * "entradas/CBS" e "saídas/IBS", e foi essa frase que produziu o defeito da #115: a pizza de
 * impostos usava esta paleta, então o IBS aparecia **verde** nela e **azul** em Impostos. Entrada e
 * imposto são eixos diferentes; compartilhar cor entre eles faz a cor deixar de significar algo.
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

/**
 * Paleta de **imposto**, na ordem `[CBS, IBS]` — a mesma dos rótulos da pizza.
 *
 * Sai dos tokens `serie-cbs` (laranja) e `serie-ibs` (azul), que são os mesmos que a tela de
 * Impostos já usava na barra de divisão e na legenda. **Cada imposto tem uma cor só no app
 * inteiro** (#115): é o que deixa a pessoa olhar a pizza, olhar a legenda em Impostos e saber que
 * fala do mesmo tributo sem reler o rótulo.
 */
export function paletaDeImpostos(): [string, string] {
  return [
    corDoTema('--color-serie-cbs', 'hsl(33 62% 44%)'),
    corDoTema('--color-serie-ibs', 'hsl(210 66% 45%)'),
  ];
}
