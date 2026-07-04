import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { PerfilService } from '@core/services/perfil.service';

/**
 * Protege as rotas do app: sem perfil selecionado (login de sabor da #23),
 * redireciona para `/login`. Não é segurança real — só separa as experiências.
 */
export const perfilGuard: CanActivateFn = () => {
  const perfil = inject(PerfilService);
  const router = inject(Router);
  return perfil.logado() ? true : router.createUrlTree(['/login']);
};
