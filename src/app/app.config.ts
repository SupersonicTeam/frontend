import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';

import { routes } from './app.routes';
import { authInterceptor } from '@core/interceptors/auth.interceptor';
import { apiInterceptor } from '@core/interceptors/api.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // **A ordem importa.** O `authInterceptor` vem primeiro: ele anexa o `Authorization` e, no 401,
    // renova o token e **repete** a requisição. Como o `apiInterceptor` está depois (mais perto da
    // rede), a repetição passa por ele de novo e ganha a baseURL e o `Accept` como qualquer outra.
    // Invertidos, o 401 seria tratado antes de a URL existir, e a repetição sairia sem baseURL.
    provideHttpClient(withFetch(), withInterceptors([authInterceptor, apiInterceptor])),
    provideAnimationsAsync(),
  ],
};
