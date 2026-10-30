import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessaoService } from '@core/services/sessao.service';

/**
 * Rotas que só existem para o produtor.
 *
 * Hoje protege `/chat`: a Ceres responde sobre os dados de um produtor e devolve
 * `403 PAPEL_NAO_AUTORIZADO` para contador (contrato da issue #76). Esconder o
 * link da navegação não basta — a URL é digitável, e o contador cairia numa tela
 * cujo único conteúdo possível é um erro. Ele volta para a home do seu perfil.
 */
export const produtorGuard: CanActivateFn = () => {
  const sessao = inject(SessaoService);
  const router = inject(Router);

  return sessao.ehProdutor() ? true : router.createUrlTree([sessao.homeDoPerfil()]);
};
