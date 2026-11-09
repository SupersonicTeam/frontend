/** Até quantos caracteres o motivo do encerramento vai (backend#402). */
export const MOTIVO_ENCERRAMENTO_MAXIMO = 500;

/**
 * O corpo de `POST .../encerrar` (backend#402): `{ motivo }` só com texto. Motivo em branco não vai,
 * e o encerramento funciona como antes.
 */
export function corpoDoEncerramento(motivo?: string | null): { motivo: string } | null {
  const texto = (motivo ?? '').trim();
  return texto ? { motivo: texto } : null;
}
