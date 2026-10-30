/**
 * Resultado da importação de um XML (`POST /api/notas/importar`, issue #117).
 *
 * A resposta é **uma lista, um item por arquivo** — o formato não mudou com o lote de segurança
 * do backend. O que mudou foi o que cada item pode dizer: a importação agora confere o
 * destinatário, a assinatura e o que a SEFAZ autorizou, e **recusa** com um motivo escrito.
 *
 * A tela ignorava isto por completo e dizia "Importação processada" em qualquer caso — inclusive
 * quando o arquivo tinha sido recusado. Mensagem de sucesso para uma recusa é pior do que erro:
 * a pessoa vai embora achando que a nota entrou.
 */
export interface ImportacaoNotaResultado {
  /** Nome do arquivo enviado — é o que permite dizer **qual** dos arquivos falhou. */
  arquivo: string;
  /** `true` só quando a nota foi importada e persistida. */
  sucesso: boolean;
  status: 'IMPORTADA' | 'DUPLICADA' | 'INVALIDA';
  /** Id da nota criada quando `sucesso`; `null` caso contrário. */
  notaId: string | null;
  chaveAcesso: string | null;
  /**
   * Descrição amigável do resultado — e, na recusa, **o motivo**.
   *
   * São quatro: o destinatário não é o produtor autenticado; a assinatura não confere; a SEFAZ não
   * conhece a chave (ou a nota está rejeitada/cancelada); o conteúdo diverge do que a SEFAZ
   * autorizou. O texto vem pronto do servidor — a tela mostra, não reescreve.
   */
  motivo: string | null;
}
