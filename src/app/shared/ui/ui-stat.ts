import { Component, booleanAttribute, computed, input } from '@angular/core';

type Tom = 'neutro' | 'positivo' | 'negativo' | 'assistente';

/**
 * Indicador numérico (KPI) — o bloco mais repetido do sistema (#45).
 *
 * A hierarquia é deliberada e responde à crítica da banca: **o rótulo em linguagem
 * de produtor vem primeiro e grande**; o termo fiscal vai embaixo, como apoio.
 * Ou seja, "Você tem a pagar" no topo e "saldo IBS + CBS" como legenda — nunca o
 * contrário, que é como está hoje no dashboard.
 *
 * O valor usa `text-valor` (mínimo 16px) e `tabular-nums`, para os números não
 * dançarem ao atualizar.
 *
 * ```html
 * <ui-stat rotulo="Você tem a pagar" [valor]="saldo() | currency: 'BRL'"
 *          apoio="saldo IBS + CBS" tom="negativo" />
 * ```
 */
@Component({
  selector: 'ui-stat',
  standalone: true,
  template: `
    <div [class]="classesCaixa()">
      <div class="flex items-start justify-between gap-2">
        <p class="text-apoio font-medium text-muted-foreground">{{ rotulo() }}</p>
        <ng-content select="[icone]" />
      </div>

      <p [class]="classesValor()">{{ valor() }}</p>

      @if (apoio()) {
        <p class="text-apoio text-muted-foreground">{{ apoio() }}</p>
      }

      <ng-content />
    </div>
  `,
})
export class UiStat {
  readonly rotulo = input.required<string>();
  readonly valor = input.required<string | number>();
  /** Legenda secundária — o lugar do termo técnico (ex.: "saldo IBS + CBS"). */
  readonly apoio = input<string>();
  readonly tom = input<Tom>('neutro');
  /** Densidade reduzida para grades com muitos indicadores (visão do contador). */
  readonly compacto = input(false, { transform: booleanAttribute });

  protected readonly classesCaixa = computed(() => {
    const fundos: Record<Tom, string> = {
      neutro: 'bg-card border-border',
      positivo: 'bg-sucesso-soft border-sucesso/25',
      negativo: 'bg-perigo-soft border-perigo/25',
      assistente: 'bg-assistente-soft border-assistente-borda',
    };
    return [
      'flex flex-col gap-1 rounded-card border shadow-suave',
      this.compacto() ? 'p-3' : 'p-4 sm:p-5',
      fundos[this.tom()],
    ].join(' ');
  });

  protected readonly classesValor = computed(() => {
    const cores: Record<Tom, string> = {
      neutro: 'text-foreground',
      positivo: 'text-sucesso-ink',
      negativo: 'text-perigo-ink',
      assistente: 'text-assistente-ink',
    };
    return [
      'font-heading font-semibold tabular-nums tracking-tight',
      this.compacto() ? 'text-valor' : 'text-2xl sm:text-3xl',
      cores[this.tom()],
    ].join(' ');
  });
}
