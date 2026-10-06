import { Component, inject } from '@angular/core';
import { AssistenteStore } from './assistente.store';
import { CeresAvatar } from './ceres-avatar';

/**
 * Botão flutuante do assistente — a presença permanente da IA no shell.
 *
 * Era a crítica central da banca: o design não passava a sensação de haver
 * inteligência por trás. Um botão sempre à mão, no violeta do assistente, é o
 * que torna isso visível em **toda** tela, não só na página do chat.
 *
 * Sobe acima da barra inferior do celular (`bottom-20`) para não cobrir a
 * navegação, e volta ao canto no desktop.
 *
 * Não aparece para o contador: a Ceres atende produtor e responderia
 * `403 PAPEL_NAO_AUTORIZADO` (ver `AssistenteStore.disponivel`).
 */
@Component({
  selector: 'app-assistente-launcher',
  standalone: true,
  imports: [CeresAvatar],
  template: `
    @if (!store.aberto() && store.disponivel()) {
      <button
        type="button"
        class="tap-target fixed right-4 bottom-20 z-50 flex items-center gap-2 rounded-full bg-assistente py-1.5 pl-1.5 pr-4 text-apoio font-semibold text-assistente-foreground shadow-assistente transition-transform hover:scale-105 lg:bottom-6"
        (click)="store.abrir()"
      >
        <app-ceres-avatar tamanho="sm" />
        <span class="hidden sm:inline">Perguntar à Ceres</span>
        <span class="sr-only sm:hidden">Perguntar à Ceres</span>
      </button>
    }
  `,
})
export class AssistenteLauncher {
  protected readonly store = inject(AssistenteStore);
}
