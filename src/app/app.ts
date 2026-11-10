import { DOCUMENT } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { EscritorioDoHostService } from '@core/services/escritorio-do-host.service';
import { EnderecoDoHost } from '@shared/layout/endereco-do-host';

/**
 * A raiz. Num endereço de escritório que não abriu (#175), a tela do endereço ocupa o lugar do app
 * inteiro; nos outros casos (host principal, escritório resolvido), as rotas de sempre.
 */
@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, EnderecoDoHost],
  template: `
    @if (host.modo() === 'nao-encontrado' || host.modo() === 'indisponivel') {
      <!-- Só num endereço de escritório que não abriu: fora do bundle inicial (orçamento de 500 kB). -->
      @defer (on immediate) {
        <app-endereco-do-host
          [variante]="host.modo() === 'nao-encontrado' ? 'nao-encontrado' : 'indisponivel'"
        />
      } @error {
        <!-- O chunk acima não baixou: quase sempre a mesma rede que derrubou o endereço. -->
        <main class="flex min-h-screen items-center justify-center p-4 text-center">
          <p role="alert">
            Não foi possível abrir este endereço.
            <button type="button" class="underline" (click)="recarregar()">Recarregar</button>
          </p>
        </main>
      }
    } @else {
      <router-outlet />
    }
  `,
  styles: [],
})
export class App {
  protected readonly host = inject(EscritorioDoHostService);
  private readonly documento = inject(DOCUMENT);

  protected recarregar(): void {
    this.documento.defaultView?.location.reload();
  }
}
