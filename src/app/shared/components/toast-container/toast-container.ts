import { Component, computed, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import {
  LucideX,
  LucideCircleCheck,
  LucideCircleAlert,
  LucideInfo,
  LucideTriangleAlert,
} from '@lucide/angular';
import { Toast, ToastService } from '@core/services/toast.service';

/**
 * Os avisos de resultado das ações (#196). As duas regiões vivas existem **antes** do primeiro
 * aviso e nunca saem do DOM: se a região nasce junto com o aviso, o leitor de tela não anuncia.
 * Sucesso e informação vão para `role="status"` (educado, espera a fala atual); erro e alerta
 * para `role="alert"` (interrompe). O ícone é decorativo -- o tipo já está na região.
 */
@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [
    NgTemplateOutlet,
    LucideX,
    LucideCircleCheck,
    LucideCircleAlert,
    LucideInfo,
    LucideTriangleAlert,
  ],
  template: `
    <div
      class="fixed bottom-20 md:bottom-6 right-4 z-[100] flex flex-col gap-2 pointer-events-none"
    >
      <div role="alert" class="flex flex-col gap-2" data-regiao="alert">
        @for (toast of urgentes(); track toast.id) {
          <ng-container *ngTemplateOutlet="aviso; context: { $implicit: toast }" />
        }
      </div>
      <div role="status" class="flex flex-col gap-2" data-regiao="status">
        @for (toast of informativos(); track toast.id) {
          <ng-container *ngTemplateOutlet="aviso; context: { $implicit: toast }" />
        }
      </div>
    </div>

    <ng-template #aviso let-toast>
      <div
        aria-atomic="true"
        class="animate-entra-lateral flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium max-w-sm pointer-events-auto transition-all {{
          toastClass(toast.type)
        }}"
        animate.leave="animate-sai"
      >
        @if (toast.type === 'success') {
          <svg lucideCircleCheck [size]="18" aria-hidden="true" />
        } @else if (toast.type === 'error') {
          <svg lucideCircleAlert [size]="18" aria-hidden="true" />
        } @else if (toast.type === 'warning') {
          <svg lucideTriangleAlert [size]="18" aria-hidden="true" />
        } @else {
          <svg lucideInfo [size]="18" aria-hidden="true" />
        }
        <span class="flex-1">{{ toast.message }}</span>
        <button
          type="button"
          aria-label="Fechar aviso"
          (click)="toastService.dismiss(toast.id)"
          class="opacity-70 hover:opacity-100 transition-opacity"
        >
          <svg lucideX [size]="16" aria-hidden="true" />
        </button>
      </div>
    </ng-template>
  `,
})
export class ToastContainer {
  readonly toastService = inject(ToastService);

  readonly urgentes = computed(() => this.toastService.toasts().filter(ehUrgente));
  readonly informativos = computed(() => this.toastService.toasts().filter((t) => !ehUrgente(t)));

  toastClass(type: string): string {
    return (
      {
        success: 'bg-green-600 text-white',
        error: 'bg-destructive text-destructive-foreground',
        info: 'bg-foreground text-background',
        warning: 'bg-accent text-accent-foreground',
      }[type] ?? 'bg-foreground text-background'
    );
  }
}

function ehUrgente(toast: Toast): boolean {
  return toast.type === 'error' || toast.type === 'warning';
}
