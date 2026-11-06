import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { DOCUMENT, Location } from '@angular/common';
import { NavigationError, provideRouter, withNavigationErrorHandler } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';

import { routes } from './app.routes';
import { authInterceptor } from '@core/interceptors/auth.interceptor';
import { apiInterceptor } from '@core/interceptors/api.interceptor';
import { ThemeService } from '@core/services/theme.service';
import { ambienteDoNavegador, recarregarSeChunkFaltou } from '@core/utils/recarga-apos-deploy';

/** Aba aberta antes de um deploy: a tela pedida não existe mais, então recarrega no destino (#162). */
function aoFalharNavegacao(evento: NavigationError): void {
  const janela = inject(DOCUMENT).defaultView;
  if (!janela) return;
  const location = inject(Location);
  recarregarSeChunkFaltou(
    evento,
    ambienteDoNavegador(janela, (url) => location.prepareExternalUrl(url)),
  );
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withNavigationErrorHandler(aoFalharNavegacao)),
    // O tema salvo vale desde a abertura (#162). Antes o `ThemeService` só nascia no dashboard e
    // em Configurações: o login recarregado abria claro mesmo para quem escolheu escuro, e quem
    // saía do app no escuro levava a classe `.dark` sobrando para o login da mesma aba.
    provideAppInitializer(() => {
      inject(ThemeService);
    }),
    // **A ordem importa.** O `authInterceptor` vem primeiro: ele anexa o `Authorization` e, no 401,
    // renova o token e **repete** a requisição. Como o `apiInterceptor` está depois (mais perto da
    // rede), a repetição passa por ele de novo e ganha a baseURL e o `Accept` como qualquer outra.
    // Invertidos, o 401 seria tratado antes de a URL existir, e a repetição sairia sem baseURL.
    provideHttpClient(withFetch(), withInterceptors([authInterceptor, apiInterceptor])),
    provideAnimationsAsync(),
  ],
};
