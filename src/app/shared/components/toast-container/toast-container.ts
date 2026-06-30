import { Component, inject } from '@angular/core';
import {
  LucideX,
  LucideCircleCheck,
  LucideCircleAlert,
  LucideInfo,
  LucideTriangleAlert,
} from '@lucide/angular';
import { ToastService } from '@core/services/toast.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [LucideX, LucideCircleCheck, LucideCircleAlert, LucideInfo, LucideTriangleAlert],
  template: `
    <div class="fixed bottom-20 md:bottom-6 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      @for (toast of toastService.toasts(); track toast.id) {
        <div
          class="flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium max-w-sm pointer-events-auto transition-all {{ toastClass(toast.type) }}"
        >
          @if (toast.type === 'success') { <svg lucideCircleCheck [size]="18" /> }
          @else if (toast.type === 'error') { <svg lucideCircleAlert [size]="18" /> }
          @else if (toast.type === 'warning') { <svg lucideTriangleAlert [size]="18" /> }
          @else { <svg lucideInfo [size]="18" /> }
          <span class="flex-1">{{ toast.message }}</span>
          <button (click)="toastService.dismiss(toast.id)" class="opacity-70 hover:opacity-100 transition-opacity">
            <svg lucideX [size]="16" />
          </button>
        </div>
      }
    </div>
  `,
})
export class ToastContainer {
  readonly toastService = inject(ToastService);

  toastClass(type: string): string {
    return {
      success: 'bg-green-600 text-white',
      error: 'bg-destructive text-destructive-foreground',
      info: 'bg-foreground text-background',
      warning: 'bg-accent text-accent-foreground',
    }[type] ?? 'bg-foreground text-background';
  }
}
