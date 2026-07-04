import { Component, input } from '@angular/core';
import { NotaFiscal } from '@models/nota-fiscal.model';
import {
  StatusNotaFiscal,
  statusNotaLabel,
  statusNotaBadge,
} from '@core/enums/status-nota-fiscal.enum';

/**
 * Preview visual reutilizável de uma NF-e (issue #22): stepper de ciclo de vida,
 * dados do destinatário, itens e impostos IBS/CBS. Somente apresentação — as
 * ações contextuais (gerar XML, SEFAZ, etc.) ficam na página hospedeira.
 * Usado em Documentos e Dashboard para uma visão única e consistente da nota.
 */
@Component({
  selector: 'app-nota-preview',
  standalone: true,
  templateUrl: './nota-preview.html',
})
export class NotaPreview {
  readonly nota = input.required<NotaFiscal>();

  readonly STEPPER_STEPS = ['Rascunho', 'XML gerado', 'Enviada', 'Autorizada'];

  /** Estado visual de cada etapa do stepper para o status atual da nota. */
  stepperEstado(
    status: StatusNotaFiscal | undefined,
    idx: number,
  ): 'done' | 'current' | 'todo' | 'error' | 'warn' {
    switch (status) {
      case 'RASCUNHO':
        return idx === 0 ? 'current' : 'todo';
      case 'COM_INCONSISTENCIAS':
        return idx === 0 ? 'error' : 'todo';
      case 'XML_GERADO':
        return idx < 1 ? 'done' : idx === 1 ? 'current' : 'todo';
      case 'AUTORIZADA':
        return 'done';
      case 'REJEITADA':
        return idx < 2 ? 'done' : idx === 2 ? 'error' : 'todo';
      case 'PENDENTE_SEFAZ':
        return idx < 2 ? 'done' : idx === 2 ? 'warn' : 'todo';
      case 'CANCELADA':
        return 'done';
      default:
        return 'todo';
    }
  }

  stepperClasse(estado: string): string {
    switch (estado) {
      case 'done':
        return 'bg-primary text-primary-foreground border-primary';
      case 'current':
        return 'bg-blue-100 text-blue-700 border-blue-400 dark:bg-blue-950 dark:text-blue-300';
      case 'error':
        return 'bg-red-100 text-red-700 border-red-400 dark:bg-red-950 dark:text-red-300';
      case 'warn':
        return 'bg-yellow-100 text-yellow-700 border-yellow-400 dark:bg-yellow-950 dark:text-yellow-300';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  }

  statusLabel(status?: string): string {
    return statusNotaLabel(status);
  }
  statusBadge(status?: string): string {
    return statusNotaBadge(status);
  }

  formatCurrency(v?: number | null): string {
    return (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  formatDate(iso?: string): string {
    if (!iso) return '—';
    return new Date(iso.split('T')[0] + 'T12:00:00').toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }
}
