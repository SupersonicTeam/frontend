/**
 * As classes do botão do design system, numa função (#174, item 4.4).
 *
 * Existem três formas de botão no projeto, e todas precisam do **mesmo** visual:
 *
 * - `<ui-button>` — ação que executa algo na página ("Ver de novo", "Copiar e-mail");
 * - `<a uiLinkBotao>` — **CTA de navegação**, que é sempre `<a>` (`routerLink` ou `mailto`).
 *   Botão dentro de link é HTML inválido e o leitor de tela anuncia duas coisas;
 * - `<button>` nativo com `classesBotao(...)` no `[class]` — controle que tem `role`,
 *   `aria-pressed`, `aria-checked` ou `aria-selected` próprios (abas, radiogroup). O
 *   `UiButton` **não** repassa esses atributos ao `<button>` interno, então quem precisa
 *   deles usa o elemento nativo e só pega as classes aqui.
 *
 * Antes isto era uma `Record` dentro do `UiButton`: um CTA de navegação copiava a lista à
 * mão e saía com padding e raio diferentes.
 */

export type VarianteBotao = 'primary' | 'ghost' | 'perigo' | 'assistente' | 'sutil' | 'lima';
export type TamanhoBotao = 'md' | 'lg';

export interface OpcoesBotao {
  /** Ocupa toda a largura — o padrão em formulário no celular. */
  blocoCompleto?: boolean;
}

/**
 * A `lima` é a única variante nova (#174, item 4.1) e serve **só** à faixa profunda da
 * landing: é o verde-lima da logo com o texto escuro do par `marca-lima-ink` — 6,80:1 no
 * claro e 10,84:1 no escuro, medidos. O `primary` sobre `marca-profunda` seria verde
 * sobre verde quase preto.
 */
const VARIANTES: Record<VarianteBotao, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
  ghost: 'border border-border text-foreground hover:bg-muted',
  perigo: 'bg-perigo text-white hover:bg-perigo/90',
  assistente: 'bg-assistente text-assistente-foreground hover:bg-assistente/90',
  sutil: 'text-muted-foreground hover:bg-muted hover:text-foreground',
  lima: 'bg-marca-lima text-marca-lima-ink hover:bg-marca-lima/90',
};

export function classesBotao(
  variante: VarianteBotao = 'primary',
  tamanho: TamanhoBotao = 'md',
  opcoes: OpcoesBotao = {},
): string {
  return [
    'tap-target inline-flex items-center justify-center gap-2 rounded-controle',
    // O `active:scale` e o unico retorno de toque que existe no celular, onde nao ha
    // hover nenhum: sem ele o produtor aperta e nao sabe se pegou (#90).
    'text-apoio font-medium transition-[color,background-color,border-color,transform]',
    '[transition-duration:var(--duracao-toque)] active:scale-[0.98]',
    'disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
    tamanho === 'lg' ? 'px-6 py-3' : 'px-4 py-2',
    opcoes.blocoCompleto ? 'w-full' : '',
    VARIANTES[variante],
  ]
    .filter(Boolean)
    .join(' ');
}
