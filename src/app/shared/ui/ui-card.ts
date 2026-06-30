import { Component } from '@angular/core';

/** Card atômico reutilizável com o estilo padrão do design system. */
@Component({
  selector: 'ui-card',
  standalone: true,
  template: `
    <div class="bg-card rounded-2xl shadow-sm border border-border p-5">
      <ng-content />
    </div>
  `,
})
export class UiCard {}
