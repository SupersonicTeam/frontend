import { Component, computed, input } from '@angular/core';

/**
 * Esqueleto de carregamento (#45) — substitui o spinner genérico.
 *
 * O spinner não diz nada; o esqueleto mostra a forma do que está chegando, então a
 * página não "pula" quando o dado entra. Onde a conexão é ruim — que é o caso do
 * produtor no campo — essa diferença é o que separa "travou" de "está vindo".
 *
 * A animação é `animate-pulse`, já coberta pelo `prefers-reduced-motion` global
 * instalado na #36: com movimento reduzido, fica estático.
 *
 * `aria-hidden` porque quem usa leitor de tela é avisado pelo `aria-busy` da
 * região que está carregando, não por uma pilha de retângulos.
 */
@Component({
  selector: 'ui-skeleton',
  standalone: true,
  template: `
    <div class="flex flex-col gap-2" aria-hidden="true">
      @for (linha of repeticoes(); track $index) {
        <div
          [class]="classesLinha()"
          [style.width]="larguraDa($index)"
          [style.height]="altura() || null"
        ></div>
      }
    </div>
  `,
})
export class UiSkeleton {
  readonly linhas = input(3);
  /** `texto` para parágrafos, `bloco` para cards e gráficos. */
  readonly formato = input<'texto' | 'bloco'>('texto');
  /** Altura de cada linha (CSS). Padrão: 1rem no texto, 6rem no bloco. */
  readonly altura = input<string>();

  protected readonly repeticoes = computed(() => Array.from({ length: this.linhas() }));

  protected readonly classesLinha = computed(() => {
    const alturaPadrao = this.formato() === 'bloco' ? 'h-24' : 'h-4';
    const raio = this.formato() === 'bloco' ? 'rounded-card' : 'rounded-controle';
    return `animate-pulse bg-surface-2 ${this.altura() ? '' : alturaPadrao} ${raio}`;
  });

  /** A última linha de texto sai mais curta, como um parágrafo de verdade. */
  protected larguraDa(indice: number): string | null {
    if (this.formato() === 'bloco') return null;
    return indice === this.linhas() - 1 ? '60%' : '100%';
  }
}
