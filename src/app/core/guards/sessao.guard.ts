import { inject } from '@angular/core';
import { CanActivateFn, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { type Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs';
import { SessaoService } from '@core/services/sessao.service';
import { AuthApi } from '@services/auth/data-access/auth.service';

/**
 * Nenhuma tela do app sem sessão (issue #93).
 *
 * Substitui o `perfilGuard`, que só perguntava se havia um papel escolhido num `localStorage`
 * editável — "não é segurança real", como ele mesmo dizia. Agora exige token.
 *
 * ## O que ele faz com um token vencido
 *
 * Não manda para o `/login`. Token vive 15 minutos, o cookie de refresh vive 7 dias: voltar ao app
 * depois do almoço é o caso **normal**, e exigir a senha de novo ali seria um defeito, não rigor.
 * Então o guard renova antes de decidir, e só devolve ao `/login` quando a renovação falha — aí a
 * sessão acabou de fato.
 *
 * ## `returnUrl`
 *
 * Quem clicou num link para `/documentos` e caiu no login volta para `/documentos`, não para o
 * painel. Sem isto, todo endereço compartilhado (uma nota, um cliente da carteira) perde o destino
 * no caminho e a pessoa tem de navegar de novo até lá.
 */
export const sessaoGuard: CanActivateFn = (
  _rota,
  estado: RouterStateSnapshot,
): boolean | UrlTree | Observable<boolean | UrlTree> => {
  const sessao = inject(SessaoService);
  const auth = inject(AuthApi);
  const router = inject(Router);

  const paraLogin = (): UrlTree =>
    router.createUrlTree(['/login'], { queryParams: { returnUrl: estado.url } });

  if (!sessao.logado()) return paraLogin();
  if (!sessao.expirado()) return true;

  return auth.renovar().pipe(
    map(() => true as const),
    catchError(() => of(paraLogin())),
  );
};
