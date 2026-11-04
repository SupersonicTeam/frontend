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

  /**
   * As etapas do contrato (#111): **rascunho → em revisão → aprovada → emitida**.
   *
   * Eram "Rascunho · XML gerado · Enviada · Autorizada", e a revisão do contador não tinha etapa
   * nenhuma — ela aparecia espremida como estado da primeira bolinha. Com o fluxo da #178 valendo
   * para todo produtor que tem escritório, a revisão é uma etapa de verdade; e o "XML gerado",
   * que é detalhe técnico da emissão, sai do caminho que o produtor acompanha.
   */
  readonly STEPPER_STEPS = ['Rascunho', 'Em revisão', 'Aprovada', 'Emitida'];

  /**
   * Estado visual de cada etapa para o status atual.
   *
   * Quem **não tem contador** pula a revisão: `XML_GERADO` fecha o rascunho e acende a emissão,
   * deixando as duas etapas do meio sem marca — é verdade, elas não aconteceram.
   */
  stepperEstado(
    status: StatusNotaFiscal | undefined,
    idx: number,
  ): 'done' | 'current' | 'todo' | 'error' | 'warn' {
    switch (status) {
      case 'RASCUNHO':
        return idx === 0 ? 'current' : 'todo';
      case 'COM_INCONSISTENCIAS':
        return idx === 0 ? 'error' : 'todo';
      // A nota está na mesa do contador: o rascunho ficou pronto, a revisão está em andamento.
      case 'AGUARDANDO_APROVACAO':
        return idx === 0 ? 'done' : idx === 1 ? 'current' : 'todo';
      case 'APROVADA':
        return idx < 2 ? 'done' : idx === 2 ? 'current' : 'todo';
      // Devolvida volta para a mão do produtor, e a revisão fica marcada como o que deu errado.
      case 'DEVOLVIDA':
        return idx === 0 ? 'current' : idx === 1 ? 'error' : 'todo';
      case 'XML_GERADO':
        return idx === 0 ? 'done' : idx === 3 ? 'current' : 'todo';
      case 'ENVIANDO':
        return idx === 3 ? 'current' : idx === 0 ? 'done' : 'todo';
      case 'AUTORIZADA':
        return 'done';
      case 'REJEITADA':
        return idx === 3 ? 'error' : idx === 0 ? 'done' : 'todo';
      case 'PENDENTE_SEFAZ':
        return idx === 3 ? 'warn' : idx === 0 ? 'done' : 'todo';
      case 'CANCELANDO':
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

  /**
   * A redução de alíquota que o cálculo aplicou ao item.
   *
   * Nula em nota anterior ao campo: aí a tela diz que não sabe (`—`), em vez de "sem redução".
   * 100 é alíquota zero, e é dito assim, porque "100%" lido solto parece um tributo cheio.
   */
  formatReducao(v?: number | null): string {
    if (v == null) return '—';
    if (v >= 100) return 'alíquota zero';
    if (v <= 0) return 'sem redução';
    return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
  }

  formatCurrency(v?: number | null): string {
    return (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  formatDate(iso?: string | null): string {
    if (!iso) return '—';
    return new Date(iso.split('T')[0] + 'T12:00:00').toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  /** Máscara de CPF (11) / CNPJ (14) para exibição no documento. */
  formatCpfCnpj(doc?: string | null): string {
    const n = (doc ?? '').replace(/\D/g, '');
    if (n.length === 11) return n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    if (n.length === 14) return n.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    return doc || '—';
  }

  /** Endereço do destinatário em uma linha (vazio se não informado). */
  enderecoLinha(): string {
    const e = this.nota().destinatarioEndereco;
    if (!e) return '';
    const rua = [e.logradouro, e.numero].filter(Boolean).join(', ');
    const cidade = [e.municipio, e.uf].filter(Boolean).join(' / ');
    const cep = e.cep ? `CEP ${e.cep}` : '';
    return [rua, cidade, cep].filter(Boolean).join(' · ');
  }
}
