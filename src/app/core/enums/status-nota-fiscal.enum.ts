/**
 * Status do ciclo de vida de uma NF-e — espelha `StatusNotaFiscal` do backend Spring
 * (`br.com.agrocontabil.model.StatusNotaFiscal`).
 *
 * Fluxo principal: RASCUNHO → XML_GERADO → AUTORIZADA.
 * Desvios: COM_INCONSISTENCIAS (validação falhou, editável), REJEITADA (fisco recusou),
 * PENDENTE_SEFAZ (situação indefinida). CANCELADA é terminal.
 *
 * **Com contador vinculado entra a revisão** (backend#178): RASCUNHO → AGUARDANDO_APROVACAO →
 * APROVADA → XML_GERADO, e o contador pode desviar para DEVOLVIDA, que volta a ser editável.
 * Medido em 28/10: `gerar-xml` num rascunho de produtor com escritório responde
 * **409 `APROVACAO_EXIGIDA`** — ou seja, sem passar pela revisão a nota não sai.
 */
export type StatusNotaFiscal =
  | 'RASCUNHO'
  | 'COM_INCONSISTENCIAS'
  | 'XML_GERADO'
  | 'AUTORIZADA'
  | 'REJEITADA'
  | 'PENDENTE_SEFAZ'
  | 'CANCELADA'
  | 'AGUARDANDO_APROVACAO'
  | 'APROVADA'
  | 'DEVOLVIDA';

/** Ordem canônica dos status ao longo do fluxo — base do stepper (#14). */
export const STATUS_NOTA_ORDEM: readonly StatusNotaFiscal[] = [
  'RASCUNHO',
  'AGUARDANDO_APROVACAO',
  'APROVADA',
  'XML_GERADO',
  'AUTORIZADA',
] as const;

export interface StatusNotaMeta {
  /** Rótulo curto para exibição (badges, listagem). */
  label: string;
  /** Classe(s) Tailwind do badge, com variante dark (a11y/dark mode — #15). */
  badge: string;
  /** É um estado de desvio (erro/atenção) fora do fluxo feliz? */
  desvio: boolean;
}

/**
 * Metadados de apresentação por status. Cores usam a paleta Tailwind com variante
 * `dark:` para legibilidade nos dois temas (issue #15).
 */
export const STATUS_NOTA_META: Record<StatusNotaFiscal, StatusNotaMeta> = {
  RASCUNHO: {
    label: 'Rascunho',
    badge: 'bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    desvio: false,
  },
  COM_INCONSISTENCIAS: {
    label: 'Com inconsistências',
    badge: 'bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
    desvio: true,
  },
  XML_GERADO: {
    label: 'XML gerado',
    badge: 'bg-blue-100 text-blue-800 border border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
    desvio: false,
  },
  AUTORIZADA: {
    label: 'Autorizada',
    badge: 'bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800',
    desvio: false,
  },
  REJEITADA: {
    label: 'Rejeitada',
    badge: 'bg-red-100 text-red-800 border border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800',
    desvio: true,
  },
  PENDENTE_SEFAZ: {
    label: 'Pendente SEFAZ',
    badge: 'bg-yellow-100 text-yellow-800 border border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800',
    desvio: true,
  },
  AGUARDANDO_APROVACAO: {
    label: 'Esperando o contador',
    badge:
      'bg-info-soft text-info-ink border border-info-borda',
    desvio: false,
  },
  APROVADA: {
    label: 'Aprovada, pronta para emitir',
    badge:
      'bg-sucesso-soft text-sucesso-ink border border-sucesso-borda',
    desvio: false,
  },
  DEVOLVIDA: {
    label: 'Devolvida para corrigir',
    badge:
      'bg-aviso-soft text-aviso-ink border border-aviso-borda',
    desvio: true,
  },
  CANCELADA: {
    label: 'Cancelada',
    badge: 'bg-zinc-200 text-zinc-600 border border-zinc-300 line-through dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700',
    desvio: true,
  },
};

/** Rótulo de quem não conhecemos. Ver `statusNotaLabel`. */
const LABEL_DESCONHECIDO = 'Em processamento';

/** Badge neutro, igual ao do rascunho, para status que o app não conhece. */
const BADGE_DESCONHECIDO = STATUS_NOTA_META.RASCUNHO.badge;

/**
 * Rótulo do status.
 *
 * **Status desconhecido vira "Em processamento", nunca o código cru.** Antes esta função
 * devolvia `status` quando não o conhecia, e bastou a #178 entrar no backend para a tela passar a
 * escrever `AGUARDANDO_APROVACAO` em caixa alta no meio de rótulos em português. O produtor não
 * tem por que ler o vocabulário do banco, e o app dizer "em processamento" é honesto: ele
 * realmente não sabe o que é aquilo.
 */
export function statusNotaLabel(status?: string): string {
  return STATUS_NOTA_META[status as StatusNotaFiscal]?.label ?? LABEL_DESCONHECIDO;
}

/**
 * A nota pode ser editada.
 *
 * É regra do servidor e a tela precisa concordar: `AGUARDANDO_APROVACAO` e `APROVADA` **não** são
 * editáveis — a nota está na mão do contador ou já foi aprovada, e mudá-la invalidaria a
 * aprovação. `DEVOLVIDA` é editável como rascunho, porque corrigir é exatamente o que se espera
 * dela.
 */
export function editavel(status?: string): boolean {
  return status === 'RASCUNHO' || status === 'COM_INCONSISTENCIAS' || status === 'DEVOLVIDA';
}

/** A nota está na mesa do escritório, esperando aprovação. */
export function esperaOEscritorio(status?: string): boolean {
  return status === 'AGUARDANDO_APROVACAO';
}

export function statusNotaBadge(status?: string): string {
  return STATUS_NOTA_META[status as StatusNotaFiscal]?.badge ?? BADGE_DESCONHECIDO;
}
