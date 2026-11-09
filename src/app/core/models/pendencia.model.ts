/**
 * Pedido de documento do escritório ao produtor — backend#180, com o antivírus da #227.
 *
 * Substitui o `SolicitacaoContador`, que foi escrito contra um contrato **imaginado**: lá o status
 * era minúsculo (`pendente`, `enviado`), havia `categoria` e `prioridade`, e a rota
 * (`/contador/pendencias?produtorId=`) nunca existiu — respondia 404 desde sempre. Aqui é o
 * contrato real.
 */

/**
 * O ciclo: `PENDENTE` → `ENVIADA` → `CONCLUIDA` ou `CANCELADA`.
 *
 * **A passagem para `ENVIADA` não é o upload**, é o antivírus terminar e liberar o anexo. Com o
 * antivírus fora do ar o arquivo sobe (201), fica `EM_VERIFICACAO` e a pendência **continua
 * `PENDENTE`** — medido em 28/10. A tela precisa dizer isso, senão o produtor anexa, vê "pendente"
 * e anexa de novo.
 */
export type StatusPendencia = 'PENDENTE' | 'ENVIADA' | 'CONCLUIDA' | 'CANCELADA';

/** Tipos de documento que o escritório pode pedir. */
export type TipoDocumentoPendencia =
  'NOTA_FISCAL' | 'COMPROVANTE_PAGAMENTO' | 'EXTRATO' | 'CONTRATO' | 'OUTRO';

/**
 * Antivírus (#227). `LIMPO` pode ser baixado; `EM_VERIFICACAO` ainda não — o download responde
 * 409 `ANEXO_EM_VERIFICACAO`.
 */
export type SituacaoAnexo = 'LIMPO' | 'EM_VERIFICACAO';

/** Metadados de um arquivo enviado. O conteúdo nunca vem no JSON. */
export interface AnexoPendencia {
  id: string;
  /** Nome já sanitizado pelo servidor. */
  nomeArquivo: string;
  /** MIME conferido **pelos bytes**, não pela extensão. */
  mime: string;
  tamanho: number;
  sha256: string;
  situacao: SituacaoAnexo;
  enviadoEm: string;
}

/** Um pedido de documento. */
export interface Pendencia {
  id: string;
  produtorId: string;
  escritorioId: string;
  titulo: string;
  descricao: string | null;
  /** Observações do escritório ao produtor. */
  observacoes: string | null;
  /** `AAAA-MM-DD`; nulo quando o escritório não pôs prazo. */
  dataLimite: string | null;
  tiposDocumento: TipoDocumentoPendencia[];
  status: StatusPendencia;
  /** Motivo da última rejeição ou do cancelamento — é o que o produtor precisa ler para refazer. */
  motivo: string | null;
  quantidadeAnexos: number;
  /**
   * **Vazio nas listas**, preenchido no detalhe e na resposta de anexar. Quem precisa dos arquivos
   * tem de buscar o detalhe; `quantidadeAnexos` é o que a lista tem.
   */
  anexos: AnexoPendencia[];
  createdAt: string;
  updatedAt: string;
}

/** Os cinco tipos, na ordem em que o escritório costuma pedir. */
export const TIPOS_DOCUMENTO: readonly TipoDocumentoPendencia[] = [
  'NOTA_FISCAL',
  'COMPROVANTE_PAGAMENTO',
  'EXTRATO',
  'CONTRATO',
  'OUTRO',
];

/** Rótulos em português, na voz de quem lê. */
export const STATUS_PENDENCIA_LABEL: Record<StatusPendencia, string> = {
  PENDENTE: 'Esperando você',
  ENVIADA: 'Com o escritório',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada',
};

/** Rótulo do tipo de documento pedido. */
export const TIPO_DOCUMENTO_LABEL: Record<TipoDocumentoPendencia, string> = {
  NOTA_FISCAL: 'nota fiscal',
  COMPROVANTE_PAGAMENTO: 'comprovante de pagamento',
  EXTRATO: 'extrato',
  CONTRATO: 'contrato',
  OUTRO: 'outro documento',
};

/** Formatos que o servidor aceita, conferidos pelos bytes. */
export const FORMATOS_ACEITOS = '.pdf,.jpg,.jpeg,.png,.xml';

/** Teto por arquivo, em bytes (5 MB). Acima disso o servidor devolve 400 `ANEXO_INVALIDO`. */
export const TAMANHO_MAXIMO_ANEXO = 5 * 1024 * 1024;

/** Quantos arquivos cabem numa pendência; o 11º devolve 409 `LIMITE_ANEXOS`. */
export const MAXIMO_ANEXOS = 10;

/** O produtor ainda tem trabalho nesta pendência. */
export function esperaOProdutor(pendencia: Pendencia): boolean {
  return pendencia.status === 'PENDENTE';
}

/**
 * Há arquivo preso no antivírus.
 *
 * Importa para a tela porque é o caso em que o produtor **já fez a parte dele** e mesmo assim a
 * pendência continua `PENDENTE`. Sem dizer isso, a tela parece ter engolido o arquivo.
 */
export function temAnexoEmVerificacao(pendencia: Pendencia): boolean {
  return pendencia.anexos.some((a) => a.situacao === 'EM_VERIFICACAO');
}
