import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

/**
 * Quanto tempo o aviso fica na tela (#196). Sucesso e informação somem em 4 s; erro e alerta
 * ficam até a pessoa fechar (WCAG 2.2.1): quem usa leitor de tela, ou lê devagar, perderia o
 * motivo da falha num aviso que some sozinho.
 */
export const DURACAO_AVISO_MS: Record<Toast['type'], number | null> = {
  success: 4000,
  info: 4000,
  error: null,
  warning: null,
};

@Injectable({ providedIn: 'root' })
export class ToastService {
  private counter = 0;
  readonly toasts = signal<Toast[]>([]);

  success(message: string): void {
    this.add(message, 'success');
  }

  error(message: string): void {
    this.add(message, 'error');
  }

  info(message: string): void {
    this.add(message, 'info');
  }

  warning(message: string): void {
    this.add(message, 'warning');
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  private add(message: string, type: Toast['type']): void {
    const id = ++this.counter;
    // O mesmo aviso de novo (a mesma falha numa nova tentativa) troca o anterior em vez de
    // empilhar: como erro não some sozinho, repetições encheriam a tela. Ele entra como nó
    // novo, então o leitor de tela anuncia de novo -- a pessoa fica sabendo que falhou outra vez.
    this.toasts.update((list) => [
      ...list.filter((t) => t.message !== message || t.type !== type),
      { id, message, type },
    ]);
    const duracao = DURACAO_AVISO_MS[type];
    if (duracao !== null) setTimeout(() => this.dismiss(id), duracao);
  }
}
