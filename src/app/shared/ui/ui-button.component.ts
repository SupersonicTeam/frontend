import { Component, computed, input } from '@angular/core';

type Variante = 'primary' | 'ghost';

/** Botão atômico reutilizável (variantes primary/ghost). O clique borbulha do <button> nativo. */
@Component({
  selector: 'ui-button',
  standalone: true,
  template: `
    <button [type]="type()" [disabled]="disabled()" [class]="classes()">
      <ng-content />
    </button>
  `,
})
export class UiButtonComponent {
  readonly variant = input<Variante>('primary');
  readonly type = input<'button' | 'submit'>('button');
  readonly disabled = input(false);

  readonly classes = computed(() => {
    const base =
      'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50';
    const variantes: Record<Variante, string> = {
      primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
      ghost: 'border border-border text-foreground hover:bg-muted',
    };
    return `${base} ${variantes[this.variant()]}`;
  });
}
