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

  const usuarioId = identidade.usuarioId();

  const cabecalhos: Record<string, string> = {};
  if (usuarioId) cabecalhos['X-Usuario-Id'] = usuarioId;

  // `Accept` so onde ele e verdade (issue #99).
  //
  // O interceptor cravava `application/json` em TODA requisicao, inclusive nos downloads de DANFE
  // e de XML, que pedem `responseType: 'blob'`/`'text'`. Medido contra o backend em 28/10, com uma
  // nota autorizada: `/notas/{id}/pdf` e `/notas/{id}/xml` respondem **500** com
  // `Accept: application/json`, e **200** sem Accept nenhum. Ou seja, o header que nos mesmos
  // mandavamos derrubava o download.
  //
  // E nao basta trocar pelo tipo binario: pedindo a DANFE de uma nota COM_INCONSISTENCIAS, que o
  // backend recusa, `Accept: application/pdf` devolve **500 de corpo vazio**, enquanto sem Accept
  // vem o **409** com o envelope JSON e a mensagem util ("Gere o XML da nota antes"). O caminho
  // feliz devolve binario e o caminho de erro devolve JSON; so aceitar qualquer tipo serve para os
  // dois -- e e por isso que o `download.ts` desserializa o ApiErrorEnvelope de dentro do blob.
  //
  // Entao: um Accept declarado pelo chamador manda, e o padrao `application/json` so entra quando a
  // resposta esperada e JSON.
  //
  // Que o backend responda 500 em vez de 406 quando o Accept nao casa e defeito dele, registrado em
  // SupersonicTeam/backend#250 -- mas mandar o Accept errado era nosso.
  if (!req.headers.has('Accept') && req.responseType === 'json') {
    cabecalhos['Accept'] = 'application/json';
  }

  const apiReq = req.clone({
    url: precisaBase ? `${base}${req.url}` : req.url,
    setHeaders: cabecalhos,
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
