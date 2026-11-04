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
  | 'DEVOLVIDA'
  | 'ENVIANDO'
  | 'CANCELANDO';

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
 * Metadados de apresentação por status.
 *
 * **Uma família de cor só** (issue #115). Metade destes selos usava a paleta crua do Tailwind
 * (`amber-100`, `emerald-100`, `zinc-200`…) e a outra metade os tokens semânticos, então na mesma
 * lista de notas apareciam **três cinzas diferentes, dois azuis, dois âmbares mais um amarelo e
 * dois verdes** — "Autorizada" em `emerald` encostada em "Aprovada" em `sucesso`.
 *
 * Agora a cor diz **gravidade** (`sucesso`, `aviso`, `info`, `perigo`, neutro) e o **rótulo** diz
 * qual estado é. Isso junta estados que antes tinham matiz próprio: "Autorizada" e "Aprovada" são
 * as duas verdes, e "Com inconsistências", "Aguardando confirmação da SEFAZ" e "Devolvida" as
 * três âmbares. É troca consciente — matiz é um canal ruim para distinguir doze coisas, e era justamente o que
 * fazia dois estados vizinhos parecerem o mesmo com verdes quase iguais. Quem precisa do estado
 * exato lê o rótulo, que está sempre ao lado.
 */
export const STATUS_NOTA_META: Record<StatusNotaFiscal, StatusNotaMeta> = {
  RASCUNHO: {
    label: 'Rascunho',
    badge: 'bg-surface-2 text-muted-foreground border border-border',
    desvio: false,
  },
  COM_INCONSISTENCIAS: {
    label: 'Com inconsistências',
    badge: 'bg-aviso-soft text-aviso-ink border border-aviso-borda',
    desvio: true,
  },
  XML_GERADO: {
    label: 'XML gerado',
    badge: 'bg-info-soft text-info-ink border border-info-borda',
    desvio: false,
  },
  AUTORIZADA: {
    label: 'Autorizada',
    badge: 'bg-sucesso-soft text-sucesso-ink border border-sucesso-borda',
    desvio: false,
  },
  REJEITADA: {
    label: 'Rejeitada',
    badge: 'bg-perigo-soft text-perigo-ink border border-perigo-borda',
    desvio: true,
  },
  /**
   * "Aguardando confirmação da SEFAZ" (#117), não "Pendente na SEFAZ": a SEFAZ ainda não deu a
   * palavra final. Na importação, um job do backend confirma depois e, até lá, a nota **não entra
   * no crédito**. Na emissão o estado é o mesmo, e a tela oferece "Consultar status" para quem não
   * quiser esperar.
   *
   * A cor continua âmbar, e `desvio` continua `true`: a nota saiu do caminho principal e pode
   * acabar `REJEITADA`. O rótulo diz o que falta; a cor diz que vale olhar.
   */
  PENDENTE_SEFAZ: {
    label: 'Aguardando confirmação da SEFAZ',
    badge: 'bg-aviso-soft text-aviso-ink border border-aviso-borda',
    desvio: true,
  },
  AGUARDANDO_APROVACAO: {
    label: 'Aguardando aprovação',
    badge: 'bg-info-soft text-info-ink border border-info-borda',
    desvio: false,
  },
  APROVADA: {
    label: 'Aprovada',
    badge: 'bg-sucesso-soft text-sucesso-ink border border-sucesso-borda',
    desvio: false,
  },
  DEVOLVIDA: {
    label: 'Devolvida',
    badge: 'bg-aviso-soft text-aviso-ink border border-aviso-borda',
    desvio: true,
  },
  // Transitorios: a nota esta no meio de uma ida a SEFAZ. Nenhuma acao vale enquanto isso --
  // ver `aceitaAcao`.
  ENVIANDO: {
    label: 'Enviando',
    badge: 'bg-info-soft text-info-ink border border-info-borda',
    desvio: false,
  },
  CANCELANDO: {
    label: 'Cancelando',
    badge: 'bg-surface-2 text-muted-foreground border border-border',
    desvio: false,
  },
  CANCELADA: {
    label: 'Cancelada',
    badge: 'bg-surface-2 text-muted-foreground border border-border line-through',
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

/**
 * Status em que a nota está **em trânsito**: o resultado ainda não existe.
 *
 * Nestes a tela não oferece ação nenhuma. Foi o que a #96 fixou para os transitórios e a #111
 * estendeu ao desconhecido: se o app não sabe o que aquele estado é, também não sabe o que é
 * seguro oferecer nele — e um botão que dispara 409 é pior do que botão nenhum.
 */
const EM_TRANSITO: readonly string[] = ['ENVIANDO', 'CANCELANDO', 'PENDENTE_SEFAZ'];

/** A nota aceita ação: o status é conhecido e não está em trânsito. */
export function aceitaAcao(status?: string): boolean {
  if (!status || !(status in STATUS_NOTA_META)) return false;
  return !EM_TRANSITO.includes(status);
}

/**
 * Os status em que o XML **existe** no servidor — e so neles o DANFE pode ser servido.
 *
 * Medido contra a API local em 29/10, numa nota `COM_INCONSISTENCIAS`: `/notas/{id}/pdf` e
 * `/notas/{id}/xml` respondem **409**, com a mensagem do proprio backend -- "DANFE indisponivel
 * para a nota ... no status 'COM_INCONSISTENCIAS'. Gere o XML".
 *
 * `APROVADA` fica de fora de proposito: o escritorio liberou, mas o XML so nasce no passo
 * seguinte. Aprovacao e permissao, nao arquivo.
 */
const COM_ARQUIVOS_FISCAIS: readonly string[] = [
  'XML_GERADO',
  'ENVIANDO',
  'PENDENTE_SEFAZ',
  'AUTORIZADA',
  'REJEITADA',
  'CANCELANDO',
  'CANCELADA',
];

/**
 * O XML e o DANFE ja existem para baixar?
 *
 * **E pergunta de estado, nao de permissao** (issue #101). A tela decidia isto negando
 * `podeGerarXml`, que carrega a regra de aprovacao do contador: para todo produtor com escritorio
 * a negacao dava `true` num rascunho, e a nota oferecia "XML" e "DANFE" de arquivos que nao
 * existiam -- dois botoes que so sabiam dar 409.
 */
export function temArquivosFiscais(status?: string): boolean {
  return !!status && COM_ARQUIVOS_FISCAIS.includes(status);
}

/** A nota está na mesa do escritório, esperando aprovação. */
export function esperaOEscritorio(status?: string): boolean {
  return status === 'AGUARDANDO_APROVACAO';
}

export function statusNotaBadge(status?: string): string {
  return STATUS_NOTA_META[status as StatusNotaFiscal]?.badge ?? BADGE_DESCONHECIDO;
}
