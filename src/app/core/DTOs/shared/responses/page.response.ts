/**
 * Envelope de paginação do Spring Data (`Page<T>`), retornado por endpoints como
 * `GET /api/notas`. Só os campos consumidos pelo frontend são tipados; o Spring
 * envia mais metadados (`pageable`, `sort`), ignorados aqui.
 */
export interface Page<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  /** Índice da página atual (0-based). */
  number: number;
  /** Tamanho da página. */
  size: number;
  first: boolean;
  last: boolean;
  numberOfElements: number;
  empty: boolean;
}

/** Página vazia — usada como fallback quando o backend está offline. */
export function emptyPage<T>(size = 20): Page<T> {
  return {
    content: [],
    totalElements: 0,
    totalPages: 0,
    number: 0,
    size,
    first: true,
    last: true,
    numberOfElements: 0,
    empty: true,
  };
}
