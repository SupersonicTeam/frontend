import { HttpContext, HttpContextToken } from '@angular/common/http';

/**
 * Quando `true`, o `apiInterceptor` NÃO exibe o toast global de erro para esta
 * requisição (a chamada trata o erro por conta própria). Uso: passar o contexto
 * em chamadas que já dão feedback específico ao usuário.
 */
export const SKIP_ERROR_NOTIFY = new HttpContextToken<boolean>(() => false);

/** Atalho para desligar o toast global de erro numa chamada. */
export function skipErrorNotify(): HttpContext {
  return new HttpContext().set(SKIP_ERROR_NOTIFY, true);
}
