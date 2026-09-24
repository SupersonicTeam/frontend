import { booleanAttribute,
  Component, computed, input } from '@angular/core';
import {
  STATUS_NOTA_META,
  type StatusNotaFiscal,
} from '@core/enums/status-nota-fiscal.enum';

/** Aparência por status, agora sobre os tokens semânticos do design system (#45). */
const TOM_POR_STATUS: Record<StatusNotaFiscal, string> = {
  RASCUNHO: 'bg-surface-2 text-muted-foreground border-border',
  COM_INCONSISTENCIAS: 'bg-aviso-soft text-aviso-ink border-aviso/30',
  XML_GERADO: 'bg-info-soft text-info-ink border-info/30',
  AUTORIZADA: 'bg-sucesso-soft text-sucesso-ink border-sucesso/30',
  REJEITADA: 'bg-perigo-soft text-perigo-ink border-perigo/30',
  PENDENTE_SEFAZ: 'bg-aviso-soft text-aviso-ink border-aviso/30',
  CANCELADA: 'bg-surface-2 text-muted-foreground border-border line-through',
};

/**
 * Selo de status da NF-e (#45).
 *
 * Os sete status já tinham tratamento claro/escuro desde a #15, via classes da
 * paleta Tailwind (`bg-amber-100 dark:bg-amber-950`...). A migração aqui **não é
 * correção de bug** — é consistência: passam a usar os mesmos tokens semânticos do
 * resto da interface, então mudar a cor de "atenção" no `@theme` muda junto no
 * badge, no insight e no alerta, em vez de exigir três edições.
 *
 * O rótulo continua vindo de `STATUS_NOTA_META`, que é a fonte única.
 */
@Component({
  selector: 'ui-badge-status',
  standalone: true,
  template: `
    <span [class]="classes()">
      @if (marcador()) {
        <span [class]="classesMarcador()" aria-hidden="true"></span>
      }
      {{ rotulo() }}
    </span>
  `,
})
export class UiBadgeStatus {
  readonly status = input.required<StatusNotaFiscal | string | undefined>();
  /** Ponto colorido antes do texto — ajuda quem não distingue bem as cores. */
  readonly marcador = input(true, { transform: booleanAttribute });

  private readonly chave = computed<StatusNotaFiscal | null>(() => {
    const s = this.status();
    return s && s in STATUS_NOTA_META ? (s as StatusNotaFiscal) : null;
  });

  protected readonly rotulo = computed(() => {
    const k = this.chave();
    return k ? STATUS_NOTA_META[k].label : (this.status() ?? '—');
  });

  protected readonly classes = computed(() => {
    const k = this.chave();
    const tom = k ? TOM_POR_STATUS[k] : 'bg-surface-2 text-muted-foreground border-border';
    return `inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-apoio font-medium ${tom}`;
  });

  protected readonly classesMarcador = computed(() => {
    const k = this.chave();
    const cores: Record<StatusNotaFiscal, string> = {
      RASCUNHO: 'bg-muted-foreground',
      COM_INCONSISTENCIAS: 'bg-aviso',
      XML_GERADO: 'bg-info',
      AUTORIZADA: 'bg-sucesso',
      REJEITADA: 'bg-perigo',
      PENDENTE_SEFAZ: 'bg-aviso',
      CANCELADA: 'bg-muted-foreground',
    };
    return `size-1.5 rounded-full ${k ? cores[k] : 'bg-muted-foreground'}`;
  });
}
