import { Component, booleanAttribute, computed, input } from '@angular/core';

type Variante = 'padrao' | 'destaque' | 'assistente' | 'plano';

/**
 * Card atômico do design system (#45).
 *
 * A variante `padrao` mantém a aparência que o card já tinha — só troca os valores
 * crus por tokens (`rounded-card`, `shadow-suave`), para mudar o raio ou a sombra
 * do sistema inteiro num lugar só.
 *
 * `assistente` é a exceção com dono: veste o acento violeta e existe para blocos em
 * que o sistema interpreta algo. Para insight de verdade, prefira o `<ui-insight>`,
 * que já traz título, selo e área de ações.
 */
@Component({
  selector: 'ui-card',
  standalone: true,
  template: `
    <div [class]="classes()">
      <ng-content />
    </div>
  `,
})
export class UiCard {
  readonly variant = input<Variante>('padrao');
  /** Densidade reduzida, para grades densas na visão do contador. */
  readonly compacto = input(false, { transform: booleanAttribute });

  protected readonly classes = computed(() => {
    const variantes: Record<Variante, string> = {
      padrao: 'bg-card border border-border shadow-suave',
      destaque: 'bg-card border border-primary/30 shadow-media',
      assistente: 'bg-assistente-soft border border-assistente-borda shadow-assistente',
      plano: 'bg-surface border border-border',
    };
    return [
      'rounded-card',
      this.compacto() ? 'p-3 sm:p-4' : 'p-5',
      variantes[this.variant()],
    ].join(' ');
  });
}
