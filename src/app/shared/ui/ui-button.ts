import { Component, booleanAttribute, computed, input } from '@angular/core';

type Variante = 'primary' | 'ghost' | 'perigo' | 'assistente' | 'sutil';
type Tamanho = 'md' | 'lg';

/**
 * Botão do design system (#45). O clique borbulha do `<button>` nativo.
 *
 * Duas garantias que o projeto não tinha e que vieram da crítica da banca:
 *
 * - **Alvo mínimo de 44×44** em qualquer tamanho, via `.tap-target` — a 375px hoje
 *   11 de 16 alvos da tela ficam abaixo disso.
 * - **Rótulo nunca abaixo de 14px**, via `text-apoio`.
 *
 * A variante `assistente` veste o acento violeta e é para ações sugeridas pelo
 * sistema ("Corrigir agora", "Explicar este imposto"), não para ação comum — o
 * acento perde o sentido se virar enfeite.
 */
@Component({
  selector: 'ui-button',
  standalone: true,
  template: `
    <button
      [type]="type()"
      [disabled]="disabled() || carregando()"
      [attr.aria-busy]="carregando() ? 'true' : null"
      [class]="classes()"
    >
      @if (carregando()) {
        <span
          class="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        ></span>
      }
      <ng-content />
    </button>
  `,
})
export class UiButton {
  readonly variant = input<Variante>('primary');
  readonly type = input<'button' | 'submit'>('button');
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly tamanho = input<Tamanho>('md');
  /** Mostra giro e bloqueia o clique enquanto a ação está em andamento. */
  readonly carregando = input(false, { transform: booleanAttribute });
  /** Ocupa toda a largura — o padrão em formulário no celular. */
  readonly blocoCompleto = input(false, { transform: booleanAttribute });

  protected readonly classes = computed(() => {
    const variantes: Record<Variante, string> = {
      primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
      ghost: 'border border-border text-foreground hover:bg-muted',
      perigo: 'bg-perigo text-white hover:bg-perigo/90',
      assistente: 'bg-assistente text-assistente-foreground hover:bg-assistente/90',
      sutil: 'text-muted-foreground hover:bg-muted hover:text-foreground',
    };
    return [
      'tap-target inline-flex items-center justify-center gap-2 rounded-controle',
      'text-apoio font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
      this.tamanho() === 'lg' ? 'px-6 py-3' : 'px-4 py-2',
      this.blocoCompleto() ? 'w-full' : '',
      variantes[this.variant()],
    ]
      .filter(Boolean)
      .join(' ');
  });
}
