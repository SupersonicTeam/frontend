import { Component, computed, inject, input, output } from '@angular/core';
import {
  LucideX,
  LucideCircleCheck,
  LucideCircleAlert,
  LucideInfo,
  LucideTriangleAlert,
} from '@lucide/angular';
import { Toast, ToastService } from '@core/services/toast.service';

const CLASSE_DO_TIPO: Record<Toast['type'], string> = {
  success: 'bg-green-600 text-white',
  error: 'bg-destructive text-destructive-foreground',
  info: 'bg-foreground text-background',
  warning: 'bg-accent text-accent-foreground',
};

/**
 * Um aviso. Componente à parte, e não `ng-template` + `NgTemplateOutlet`, para as duas regiões
 * dividirem o mesmo markup sem pôr o `NgTemplateOutlet` no bundle inicial (o container mora no
 * shell). `aria-atomic` faz o leitor de tela ler o aviso inteiro, não só o pedaço que mudou.
 */
@Component({
  selector: 'app-aviso',
  standalone: true,
  imports: [LucideX, LucideCircleCheck, LucideCircleAlert, LucideInfo, LucideTriangleAlert],
  host: {
    'aria-atomic': 'true',
    '[class]': 'classe()',
  },
  template: `
    @switch (toast().type) {
      @case ('success') {
        <svg lucideCircleCheck [size]="18" aria-hidden="true" />
      }
      @case ('error') {
        <svg lucideCircleAlert [size]="18" aria-hidden="true" />
      }
      @case ('warning') {
        <svg lucideTriangleAlert [size]="18" aria-hidden="true" />
      }
      @default {
        <svg lucideInfo [size]="18" aria-hidden="true" />
      }
    }
    <span class="flex-1">{{ toast().message }}</span>
    <button
      type="button"
      aria-label="Fechar aviso"
      (click)="fechar.emit()"
      class="opacity-70 hover:opacity-100 transition-opacity"
    >
      <svg lucideX [size]="16" aria-hidden="true" />
    </button>
  `,
})
export class Aviso {
  readonly toast = input.required<Toast>();
  readonly fechar = output<void>();

  protected readonly classe = computed(
    () =>
      'animate-entra-lateral flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium max-w-sm pointer-events-auto transition-all ' +
      CLASSE_DO_TIPO[this.toast().type],
  );
}

/**
 * Os avisos de resultado das ações (#196). As duas regiões vivas existem **antes** do primeiro
 * aviso e nunca saem do DOM: se a região nasce junto com o aviso, o leitor de tela não anuncia.
 * Sucesso e informação vão para `role="status"` (educado, espera a fala atual); erro e alerta
 * para `role="alert"` (interrompe). O ícone é decorativo -- o tipo já está na região.
 */
@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [Aviso],
  template: `
    <div
      class="fixed bottom-20 md:bottom-6 right-4 z-[100] flex flex-col gap-2 pointer-events-none"
    >
      <div role="alert" class="flex flex-col gap-2" data-regiao="alert">
        @for (toast of urgentes(); track toast.id) {
          <app-aviso
            [toast]="toast"
            (fechar)="toastService.dismiss(toast.id)"
            animate.leave="animate-sai"
          />
        }
      </div>
      <div role="status" class="flex flex-col gap-2" data-regiao="status">
        @for (toast of informativos(); track toast.id) {
          <app-aviso
            [toast]="toast"
            (fechar)="toastService.dismiss(toast.id)"
            animate.leave="animate-sai"
          />
        }
      </div>
    </div>
  `,
})
export class ToastContainer {
  readonly toastService = inject(ToastService);

  readonly urgentes = computed(() => this.toastService.toasts().filter(ehUrgente));
  readonly informativos = computed(() => this.toastService.toasts().filter((t) => !ehUrgente(t)));
}

function ehUrgente(toast: Toast): boolean {
  return toast.type === 'error' || toast.type === 'warning';
}
