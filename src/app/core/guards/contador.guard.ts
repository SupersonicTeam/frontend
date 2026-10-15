import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { PerfilService } from '@core/services/perfil.service';

/**
 * Rotas que só existem para o contador.
 *
 * Espelha o `produtorGuard`. Esconder o link da navegação não basta — a URL é digitável, e quem
 * cai numa tela do outro papel vê um texto escrito para outra pessoa. Volta para a home do seu
 * perfil.
 */
export const contadorGuard: CanActivateFn = () => {
  const perfil = inject(PerfilService);
  const router = inject(Router);

  return perfil.ehContador() ? true : router.createUrlTree([perfil.homeDoPerfil()]);
};
