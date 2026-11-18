import { Component, booleanAttribute, computed, input } from '@angular/core';
import { classesBotao, type TamanhoBotao, type VarianteBotao } from './classes-botao';

type Variante = VarianteBotao;
type Tamanho = TamanhoBotao;

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

  // As classes moram em `classesBotao` (#174, item 4.4), compartilhadas com o
  // `a[uiLinkBotao]` e com os controles que precisam de `<button>` nativo.
  protected readonly classes = computed(() =>
    classesBotao(this.variant(), this.tamanho(), { blocoCompleto: this.blocoCompleto() }),
  );
}
