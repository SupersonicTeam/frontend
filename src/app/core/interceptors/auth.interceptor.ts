import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { SessaoService } from '@core/services/sessao.service';
import { EncerramentoService } from '@core/services/encerramento.service';
import { AuthApi } from '@services/auth/data-access/auth.service';

/**
 * As rotas que o contrato declara **públicas** (`security: []` no `/v3/api-docs`).
 *
 * Elas não levam `Authorization` e não entram no tratamento de 401 — o que importa sobretudo para
 * `/auth/refresh` e `/auth/login`: tentar renovar o token por causa do 401 *de uma renovação* é um
 * laço, e o 401 de uma senha errada não é sessão expirada, é credencial inválida.
 */
const ROTAS_PUBLICAS = [
  '/auth/login',
  '/auth/refresh',
  '/auth/logout',
  '/auth/cadastro',
  '/auth/senha/esqueci',
  '/auth/senha/redefinir',
];

/**
 * Os endpoints públicos por **prefixo** (#175): `GET /publico/escritorios/{slug}`, que o
 * inicializador do host chama antes de haver sessão. Comparado pelo **início** do caminho, nunca
 * com `includes`: uma rota futura com `/publico/` no meio sairia sem `Authorization` e sem renovação.
 */
const PREFIXOS_PUBLICOS = ['/publico/', '/api/publico/'];

/** A URL chega relativa (`/auth/login`) ou já com a baseURL (`/api/auth/login`). */
function ehPublica(url: string): boolean {
  const caminho = url.split('?')[0] ?? '';
  return (
    ROTAS_PUBLICAS.some((r) => caminho === r || caminho.endsWith(r)) ||
    PREFIXOS_PUBLICOS.some((p) => caminho.startsWith(p))
  );
}

/**
 * Assina as chamadas com `Authorization: Bearer` e renova o token quando ele vence (issue #93).
 *
 * Era um esqueleto inócuo: o `TokenService` devolvia `null` por contrato e nenhum header saía. A
 * identidade de fato ia no `X-Usuario-Id`, que **só o profile `dev` do backend aceita** — em
 * homologação e em produção toda requisição sem `Bearer` responde 401 `NAO_AUTENTICADO`, e o app
 * publicado não passava da primeira tela. Era este o bloqueio da integração.
 *
 * ## O 401 tem dois significados, e só um deles é "saia"
 *
 * Com token vencido (15 min de validade) o backend responde 401 `NAO_AUTENTICADO` — mas o cookie
 * de refresh vale 7 dias, então a sessão **não** acabou: é só o token que precisa ser trocado.
 * Aqui o 401 vira uma renovação e a requisição original é **repetida** com o token novo, de modo
 * que a tela nem percebe. Só quando a renovação também falha a sessão acabou de verdade, e aí o
 * `EncerramentoService` limpa tudo e leva ao `/login`.
 *
 * A repetição acontece **uma** vez: o `catchError` interno pega tanto a falha da renovação quanto
 * um segundo 401 na repetição, e nos dois casos encerra em vez de tentar de novo. A fila que evita
 * N renovações simultâneas é do `AuthApi.renovar()` — e o motivo de ela ser obrigatória está lá.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (ehPublica(req.url)) return next(req);

  const sessao = inject(SessaoService);
  const auth = inject(AuthApi);
  const encerramento = inject(EncerramentoService);

  const assinar = (requisicao: HttpRequest<unknown>, token: string | null) =>
    token ? requisicao.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : requisicao;

  return next(assinar(req, sessao.token())).pipe(
    catchError((erro: unknown) => {
      const falha = erro as HttpErrorResponse;
      // Sem sessão não há o que renovar: o 401 sobe e a tela (ou o guard) decide.
      if (falha.status !== 401 || !sessao.logado()) return throwError(() => erro);

      return auth.renovar().pipe(
        switchMap((token) => next(assinar(req, token))),
        catchError(() => {
          encerramento.encerrar('expirada');
          return throwError(() => erro);
        }),
      );
    }),
  );
};
