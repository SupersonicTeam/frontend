import { Component, computed, input, output, signal } from '@angular/core';
import { LucideCircleHelp } from '@lucide/angular';
import type { TermoFiscal } from '@core/utils/glossario';
import { UiButton } from './ui-button';

/**
 * Um verbete do glossário fiscal (issue #105).
 *
 * O termo vira um alvo clicável; abrindo, mostra **uma linha** sobre o que aquele número é nesta
 * tela, e oferece a pergunta pronta para a Ceres. É a parte "glossário e atalhos alinhados" da
 * issue: o glossário não tenta substituir a assistente — ele entrega a pergunta já formulada.
 *
 * **Não conhece a Ceres.** Emite `perguntar` com o texto e quem usa decide o que fazer (no painel,
 * `AssistenteStore.abrirPerguntando`). Assim `shared/ui` continua sem depender de feature, igual
 * ao `ui-insight`, e o componente serve ao contador no dia em que ele tiver glossário próprio —
 * hoje a Ceres não atende escritório.
 *
 * O acento violeta aparece **só** no botão que chama a assistente. O verbete em si é texto fixo,
 * não interpretação: vestir o violeta nele seria dizer que a IA escreveu, e ela não escreveu.
 */
@Component({
  selector: 'ui-termo',
  standalone: true,
  imports: [LucideCircleHelp, UiButton],
  template: `
    <div class="inline-block">
      <button
        type="button"
        class="tap-target inline-flex items-center gap-1.5 rounded-controle px-2 text-apoio font-medium text-foreground underline decoration-dotted underline-offset-4 transition-colors hover:bg-muted"
        [attr.aria-expanded]="aberto()"
        [attr.aria-controls]="idDoPainel()"
        (click)="aberto.set(!aberto())"
      >
        {{ termo().termo }}
        <svg lucideCircleHelp [size]="14" class="text-muted-foreground" aria-hidden="true" />
      </button>

      @if (aberto()) {
        <div
          [id]="idDoPainel()"
          class="mt-2 max-w-prose rounded-card border border-border bg-surface-2 p-3"
        >
          <p class="text-apoio leading-relaxed text-foreground">{{ termo().resumo }}</p>

          @if (podePerguntar()) {
            <ui-button
              variant="assistente"
              class="mt-2 inline-block"
              (click)="perguntar.emit(termo().pergunta)"
            >
              Perguntar à Ceres
            </ui-button>
          }
        </div>
      }
    </div>
  `,
})
export class UiTermo {
  readonly termo = input.required<TermoFiscal>();
  /** Falso esconde o botão da assistente — ela não atende contador. */
  readonly podePerguntar = input(true);

  readonly perguntar = output<string>();

  protected readonly aberto = signal(false);

  protected readonly idDoPainel = computed(() => `termo-${this.termo().chave}`);
}
