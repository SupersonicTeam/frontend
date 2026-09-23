import { Component, input } from '@angular/core';

/**
 * Estado vazio (#45). Substitui os "Nenhum documento encontrado" soltos no meio
 * da tela, que hoje parecem erro.
 *
 * Um estado vazio bom diz três coisas: o que deveria estar aqui, por que não está,
 * e o que fazer a respeito. O terceiro é o slot `[acao]` — sem ele o usuário fica
 * olhando para um beco sem saída.
 */
@Component({
  selector: 'ui-empty-state',
  standalone: true,
  template: `
    <div class="flex flex-col items-center gap-3 rounded-card border border-dashed border-border bg-surface px-6 py-10 text-center">
      <span class="flex size-12 items-center justify-center rounded-full bg-surface-2 text-muted-foreground">
        <ng-content select="[icone]" />
      </span>

      <div class="max-w-prose">
        <p class="font-heading font-semibold text-foreground">{{ titulo() }}</p>
        @if (descricao()) {
          <p class="mt-1 text-apoio text-muted-foreground">{{ descricao() }}</p>
        }
      </div>

      <div class="flex flex-wrap justify-center gap-2 empty:hidden">
        <ng-content select="[acao]" />
      </div>
    </div>
  `,
})
export class UiEmptyState {
  readonly titulo = input.required<string>();
  readonly descricao = input<string>();
}
