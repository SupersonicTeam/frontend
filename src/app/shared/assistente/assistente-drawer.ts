import { Component, ElementRef, HostListener, effect, inject, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  LucideExternalLink,
  LucideFileText,
  LucideSparkles,
  LucideTriangleAlert,
  LucideX,
} from '@lucide/angular';
import { UiBadgeStatus } from '@shared/ui/ui-badge-status';
import { AssistenteConversa } from './assistente-conversa';
import { AssistenteStore } from './assistente.store';

/**
 * Gaveta flutuante do assistente (a visão descrita pelo dono do projeto: "a
 * conversa no meio, as abas de outras conversas na lateral esquerda e a nota
 * no lado direito").
 *
 * Duas diferenças importantes em relação a um chat genérico:
 *
 * 1. **Ela abre com a nota do lado.** Quando a pergunta parte de uma nota
 *    ("Perguntar sobre esta nota"), a nota fica à direita com os dados reais e,
 *    se houver pendência, o que o fisco apontou — vindo de
 *    `/notas/{id}/validacoes`, não de texto escrito à mão.
 * 2. **Ela é a mesma conversa da página `/chat`.** O estado vive no
 *    `AssistenteStore`, então abrir a página depois não recomeça nada.
 *
 * Acessibilidade: foco preso enquanto aberta, Esc fecha, foco volta ao gatilho
 * e a rolagem do fundo trava — mesmo contrato do `UiModal`.
 */
@Component({
  selector: 'app-assistente-drawer',
  standalone: true,
  imports: [
    AssistenteConversa,
    LucideExternalLink,
    LucideFileText,
    LucideSparkles,
    LucideTriangleAlert,
    LucideX,
    RouterLink,
    UiBadgeStatus,
  ],
  templateUrl: './assistente-drawer.html',
})
export class AssistenteDrawer {
  protected readonly store = inject(AssistenteStore);

  private readonly painel = viewChild<ElementRef<HTMLElement>>('painel');
  private gatilho: HTMLElement | null = null;

  private static readonly FOCAVEIS =
    'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

  constructor() {
    effect((onCleanup) => {
      if (!this.store.aberto()) return;

      const doc = this.painel()?.nativeElement.ownerDocument ?? document;
      this.gatilho = doc.activeElement as HTMLElement | null;
      const overflowAnterior = doc.body.style.overflow;
      doc.body.style.overflow = 'hidden';

      const t = setTimeout(() => this.focarPrimeiro(), 0);

      onCleanup(() => {
        clearTimeout(t);
        doc.body.style.overflow = overflowAnterior;
        this.gatilho?.focus?.();
      });
    });
  }

  @HostListener('document:keydown.escape')
  protected aoPressionarEsc(): void {
    if (this.store.aberto()) this.store.fechar();
  }

  @HostListener('document:keydown.tab', ['$event'])
  @HostListener('document:keydown.shift.tab', ['$event'])
  protected aoPressionarTab(bruto: Event): void {
    if (!this.store.aberto()) return;
    const evento = bruto as KeyboardEvent;
    const focaveis = this.focaveis();
    if (focaveis.length === 0) return;

    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];
    const ativo = this.painel()?.nativeElement.ownerDocument.activeElement;

    if (evento.shiftKey && ativo === primeiro) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && ativo === ultimo) {
      evento.preventDefault();
      primeiro.focus();
    }
  }

  private focaveis(): HTMLElement[] {
    const raiz = this.painel()?.nativeElement;
    if (!raiz) return [];
    return Array.from(raiz.querySelectorAll<HTMLElement>(AssistenteDrawer.FOCAVEIS)).filter(
      (el) => el.offsetParent !== null,
    );
  }

  private focarPrimeiro(): void {
    this.focaveis()[0]?.focus();
  }

  formatCurrency(valor?: number | null): string {
    return (valor ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  formatDate(iso?: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
  }
}
