import { mensagemDeEnvelope } from '@core/interceptors/api.interceptor';
import { ApiErrorEnvelope } from '@dtos/shared/responses/api-error.response';

/**
 * Extrai o nome do arquivo do header `Content-Disposition` (exposto via CORS pelo backend), ou
 * devolve o `fallback` quando o header está ausente/ilegível.
 *
 * Lê apenas o `filename="..."` (ASCII). Não decodifica `filename*=UTF-8''...` (RFC 5987) — nesse
 * caso cai no `fallback` (comportamento aceito pela spec).
 */
export function filenameDeContentDisposition(
  header: string | null | undefined,
  fallback: string,
): string {
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

/**
 * A mensagem de erro de um download que falhou.
 *
 * Download é o caminho em que o corpo do erro chega em **três formatos diferentes**, dependendo do
 * `responseType` que o chamador pediu: `Blob` (DANFE, prévia), `string` (XML) ou objeto já
 * desserializado. Era por isso que cada tela repetia a mesma escada de `instanceof` — a `documentos`
 * tinha a sua cópia privada, e a `dashboard` não tinha nenhuma, o que é parte do motivo de o botão
 * "Baixar" dela nunca ter saído do lugar (#103).
 *
 * O `fallback` é o que se diz quando o servidor não mandou envelope nenhum, e deve ser específico
 * da ação ("gere o XML primeiro"), não genérico.
 */
export async function mensagemDeErroDeDownload(
  erro: { error?: unknown; status?: number } | null | undefined,
  fallback: string,
): Promise<string> {
  const corpo: unknown = erro?.error;
  let envelope: ApiErrorEnvelope | null = null;

  if (corpo instanceof Blob) {
    envelope = await apiErrorDeBlob(corpo);
  } else if (typeof corpo === 'string') {
    try {
      envelope = JSON.parse(corpo) as ApiErrorEnvelope;
    } catch {
      envelope = null;
    }
  } else if (corpo && typeof corpo === 'object') {
    envelope = corpo as ApiErrorEnvelope;
  }

  return envelope ? mensagemDeEnvelope(envelope, erro?.status ?? 0) : fallback;
}
