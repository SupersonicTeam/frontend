import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessaoService } from '@core/services/sessao.service';

/**
 * Rotas que só existem para o contador.
 *
 * Espelha o `produtorGuard`. Esconder o link da navegação não basta — a URL é digitável, e quem
 * cai numa tela do outro papel vê um texto escrito para outra pessoa. Volta para a home do seu
 * perfil.
 */
export const contadorGuard: CanActivateFn = () => {
  const sessao = inject(SessaoService);
  const router = inject(Router);

  return sessao.ehContador() ? true : router.createUrlTree([sessao.homeDoPerfil()]);
};
