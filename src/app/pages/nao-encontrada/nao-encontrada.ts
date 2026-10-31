import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideCompass } from '@lucide/angular';
import { SessaoService } from '@core/services/sessao.service';
import { UiButton } from '@shared/ui/ui-button';

/**
 * Página não encontrada (issue #112).
 *
 * A rota `**` fazia `redirectTo: ''`, e um endereço errado jogava a pessoa no painel **sem
 * dizer nada**. Quem clicou num link quebrado — como o "Ver as minhas notas", que apontava para
 * `/notas` — achava que o link não tinha funcionado, ou pior, que o app tinha voltado sozinho.
 *
 * A saída daqui respeita o papel: mandar o contador para `/dashboard` seria mandá-lo para uma
 * rota que o `produtorGuard` devolve, trocando um beco sem saída por outro.
 */
@Component({
  selector: 'app-nao-encontrada',
  standalone: true,
  imports: [LucideCompass, RouterLink, UiButton],
  template: `
    <div class="page-container flex flex-col items-center gap-4 py-16 text-center">
      <span
        class="flex size-14 items-center justify-center rounded-full bg-surface-2 text-muted-foreground"
      >
        <svg lucideCompass [size]="28" aria-hidden="true" />
      </span>

      <div class="max-w-prose">
        <h1 class="font-heading text-2xl font-semibold text-foreground">Página não encontrada</h1>
        <p class="mt-2 text-apoio text-muted-foreground">
          O endereço que você abriu não existe aqui. Pode ter sido um link antigo ou um erro de
          digitação.
        </p>
      </div>

      <ui-button [routerLink]="inicio()">Voltar para o início</ui-button>
    </div>
  `,
})
export class NaoEncontradaPage {
  private readonly sessao = inject(SessaoService);

  /** O início de cada papel: o contador não tem o que fazer em `/dashboard`. */
  inicio(): string {
    return this.sessao.homeDoPerfil();
  }
}
