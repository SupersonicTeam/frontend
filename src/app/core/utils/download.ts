import { ApiErrorEnvelope } from '@dtos/shared/responses/api-error.response';

/**
 * Extrai o nome do arquivo do header `Content-Disposition` (exposto via CORS pelo backend), ou
 * devolve o `fallback` quando o header está ausente/ilegível.
 *
 * Lê apenas o `filename="..."` (ASCII). Não decodifica `filename*=UTF-8''...` (RFC 5987) — nesse
 * caso cai no `fallback` (comportamento aceito pela spec).
 */
export function filenameDeContentDisposition(header: string | null | undefined, fallback: string): string {
  if (!header) return fallback;
  const match = /filename="?([^"\n;]+)"?/i.exec(header);
  const nome = match?.[1]?.trim();
  return nome ? nome : fallback;
}

/** Dispara o download de um `Blob` no browser (cria um `<a>` temporário e revoga o objectURL). */
export function salvarBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Desserializa um `Blob` de resposta de erro (corpo `ApiError` JSON devolvido por um endpoint de
 * download com `responseType: 'blob'`) em `ApiErrorEnvelope`. Devolve `null` se o blob não for um
 * JSON de envelope parseável.
 */
export async function apiErrorDeBlob(blob: Blob): Promise<ApiErrorEnvelope | null> {
  try {
    const texto = await lerBlobComoTexto(blob);
    const parsed = JSON.parse(texto) as ApiErrorEnvelope;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/** Lê o conteúdo de um `Blob` como texto (via `FileReader` — suportado no browser e no jsdom). */
function lerBlobComoTexto(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}
