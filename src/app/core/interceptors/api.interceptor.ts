import { HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { environment } from '@env/environment';

/**
 * Interceptor da API: ponto único que
 *  - prefixa a baseURL (`environment.apiUrl`) nas chamadas relativas do backend;
 *  - adiciona o header `Accept: application/json`;
 *  - centraliza o tratamento/log de erros HTTP (auth, rede, etc. no futuro).
 *
 * Com isso o `ApiService` só lida com endpoints relativos (ex.: `/dashboard/notas`).
 */
export const apiInterceptor: HttpInterceptorFn = (req, next) => {
  const base = environment.apiUrl;

  // Prefixa a baseURL apenas em paths relativos que ainda não a tenham.
  const precisaBase =
    req.url.startsWith('/') &&
    !req.url.startsWith('//') &&
    req.url !== base &&
    !req.url.startsWith(`${base}/`);

  const apiReq = req.clone({
    url: precisaBase ? `${base}${req.url}` : req.url,
    setHeaders: { Accept: 'application/json' },
  });

  return next(apiReq).pipe(
    catchError(err => {
      // 404 é esperado enquanto endpoints do backend não existem — não polui o log.
      if (err.status !== 404) {
        console.error('API Error:', err);
      }
      return throwError(() => err);
    })
  );
};
