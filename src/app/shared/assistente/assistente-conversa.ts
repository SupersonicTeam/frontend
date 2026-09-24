import {
  Component,
  ElementRef,
  booleanAttribute,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import {
  LucideBookOpen,
  LucideSend,
  LucideSparkles,
  LucideTriangleAlert,
  LucideUser,
} from '@lucide/angular';
import { UiButton } from '@shared/ui/ui-button';
import { AssistenteStore } from './assistente.store';

/**
 * A conversa em si — lista de mensagens, sugestões e campo de escrita.
 *
 * É o **mesmo componente** usado na página `/chat` e na gaveta flutuante, lendo
 * o mesmo `AssistenteStore`. Duas telas mostrando a mesma conversa, não duas
 * conversas parecidas.
 */
@Component({
  selector: 'app-assistente-conversa',
  standalone: true,
  imports: [LucideBookOpen, LucideSend, LucideSparkles, LucideTriangleAlert, LucideUser, UiButton],
  host: { class: 'flex min-h-0 flex-1 flex-col gap-3' },
  templateUrl: './assistente-conversa.html',
})
export class AssistenteConversa {
  protected readonly store = inject(AssistenteStore);

  /** Na gaveta o espaço é curto: a saudação some e as sugestões ficam em uma linha. */
  readonly compacto = input(false, { transform: booleanAttribute });

  private readonly fim = viewChild<ElementRef<HTMLDivElement>>('fimDaConversa');

  constructor() {
    // Rola ao fim a cada mensagem nova, inclusive quando ela chega enquanto a
    // gaveta estava fechada.
    effect(() => {
      const total = this.store.mensagens().length;
      const aguardando = this.store.enviando();
      if (total === 0 && !aguardando) return;
      setTimeout(() => {
        try {
          this.fim()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'end' });
        } catch {
          /* rolagem é conveniência, não pode quebrar a tela */
        }
      }, 0);
    });
  }

  aoTeclar(evento: KeyboardEvent): void {
    if (evento.key === 'Enter' && !evento.shiftKey) {
      evento.preventDefault();
      this.store.enviar();
    }
  }
}
