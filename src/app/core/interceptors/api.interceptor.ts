import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { environment } from '@env/environment';
import { IdentidadeService } from '@core/services/identidade.service';
import { ToastService } from '@core/services/toast.service';
import { ApiErrorEnvelope } from '@dtos/shared/responses/api-error.response';
import { SKIP_ERROR_NOTIFY } from './error-notify.context';

/**
 * Prefixos cujas falhas NÃO viram toast global: endpoints tratados localmente
 * (`/api/notas`, com painéis de erro/validação próprios) e módulos ainda sem
 * backend real (banner "dados de exemplo / em breve"). Evita toast duplicado
 * e ruído em endpoints que se sabe que ainda vão 500/404.
 */
const PREFIXOS_SEM_TOAST = [
  '/api/notas',
  '/api/dashboard',
  '/api/calendario-fiscal',
  '/api/contador',
  '/api/notificacao',
  // A Ceres mostra a falha dentro da conversa, com mensagem por código
  // (ocupada, indisponível, tempo esgotado). Toast global seria eco.
  '/api/assistente',
  // Tributário: cada card da tela tem o próprio estado de erro com "Tentar novamente".
  // Sem isto, uma queda do servidor empilhava **três** toasts por cima de três avisos que já
  // diziam a mesma coisa — medido na tela, com o backend fora do ar.
  '/api/apuracao',
  '/api/creditos',
  '/api/relatorios',
];

/**
 * Deriva uma mensagem amigável de um envelope `ApiError` (ou fallback por status). Independente de
 * `HttpErrorResponse` — reusável no fluxo de download por blob, onde o erro chega como `Blob` de
 * JSON e é desserializado por `apiErrorDeBlob` antes de passar por aqui. Ramifica por `errors[]`.
 */
export function mensagemDeEnvelope(env: ApiErrorEnvelope | null | undefined, status: number): string {
  if (env?.errors?.length && env.errors[0]?.message) return env.errors[0].message;
  if (env?.message) return env.message;
  if (status >= 500) return 'Erro no servidor. Tente novamente em instantes.';
  return `Não foi possível completar a operação (${status}).`;
}

/** Extrai uma mensagem amigável do envelope `ApiError` de um `HttpErrorResponse`. */
export function mensagemAmigavel(err: HttpErrorResponse): string {
  if (err.status === 0) return 'Sem conexão com o servidor. Verifique sua rede.';
  return mensagemDeEnvelope(err.error as ApiErrorEnvelope | undefined, err.status);
}

/**
 * Interceptor da API: ponto único que
 *  - prefixa a baseURL (`environment.apiUrl`) nas chamadas relativas;
 *  - adiciona o header `Accept: application/json`;
 *  - declara a identidade (`X-Usuario-Id`) quando existe uma — ver
 *    `IdentidadeService` para o porquê de normalmente **não** existir;
 *  - exibe um toast global amigável (derivado de `ApiError.errors[]`) para erros
 *    HTTP não tratados localmente (issue #21). Suprime 404, chamadas que optam por
 *    `skipErrorNotify()` e os prefixos tratados/mock em `PREFIXOS_SEM_TOAST`.
 */
export const apiInterceptor: HttpInterceptorFn = (req, next) => {
  const toast = inject(ToastService);
  const identidade = inject(IdentidadeService);
  const base = environment.apiUrl;

  // Prefixa a baseURL apenas em paths relativos que ainda não a tenham.
  const precisaBase =
    req.url.startsWith('/') &&
    !req.url.startsWith('//') &&
    req.url !== base &&
    !req.url.startsWith(`${base}/`);

  // Por rota, nao global: ver `IdentidadeService.paraRota` para o porque.
  const usuarioId = identidade.paraRota(req.url);

  const apiReq = req.clone({
    url: precisaBase ? `${base}${req.url}` : req.url,
    setHeaders: usuarioId
      ? { Accept: 'application/json', 'X-Usuario-Id': usuarioId }
      : { Accept: 'application/json' },
  });

  return next(apiReq).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status !== 404) {
        console.error('API Error:', err);
      }

      const suprimido =
        apiReq.context.get(SKIP_ERROR_NOTIFY) ||
        err.status === 404 ||
        PREFIXOS_SEM_TOAST.some(p => apiReq.url.includes(p));

      if (!suprimido) {
        toast.error(mensagemAmigavel(err));
      }

      return throwError(() => err);
    }),
  );
};
