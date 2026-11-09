import {
  ApplicationConfig,
  DestroyRef,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  NavigationEnd,
  NavigationError,
  Router,
  provideRouter,
  withNavigationErrorHandler,
} from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { filter } from 'rxjs';

import { routes } from './app.routes';
import { authInterceptor } from '@core/interceptors/auth.interceptor';
import { apiInterceptor } from '@core/interceptors/api.interceptor';
import { ThemeService } from '@core/services/theme.service';
import { EscritorioDoHostService } from '@core/services/escritorio-do-host.service';
import {
  AMBIENTE_DE_RECARGA,
  navegacaoDeuCerto,
  recarregarSeChunkFaltou,
} from '@core/utils/recarga-apos-deploy';

/** Aba aberta antes de um deploy: a tela pedida não existe mais, então recarrega no destino (#162). */
function aoFalharNavegacao(evento: NavigationError): void {
  const ambiente = inject(AMBIENTE_DE_RECARGA);
  if (ambiente) recarregarSeChunkFaltou(evento, ambiente);
}

/** Navegação que deu certo libera a próxima recarga: a marca vale só para a falha da vez. */
function liberarRecargaAoNavegar(): void {
  const ambiente = inject(AMBIENTE_DE_RECARGA);
  if (!ambiente) return;
  inject(Router)
    .events.pipe(
      filter((evento) => evento instanceof NavigationEnd),
      takeUntilDestroyed(inject(DestroyRef)),
    )
    .subscribe(() => navegacaoDeuCerto(ambiente));
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
    provideAppInitializer(liberarRecargaAoNavegar),
    // O escritório do endereço (#175): no host principal termina na hora, sem requisição; num
    // `{slug}.{base}`, pergunta ao endpoint público antes de o app montar (o login já nasce com a
    // marca, e a landing nunca pisca no subdomínio). Nunca rejeita.
    provideAppInitializer(() => inject(EscritorioDoHostService).resolver()),
    // **A ordem importa.** O `authInterceptor` vem primeiro: ele anexa o `Authorization` e, no 401,
    // renova o token e **repete** a requisição. Como o `apiInterceptor` está depois (mais perto da
    // rede), a repetição passa por ele de novo e ganha a baseURL e o `Accept` como qualquer outra.
    // Invertidos, o 401 seria tratado antes de a URL existir, e a repetição sairia sem baseURL.
    provideHttpClient(withFetch(), withInterceptors([authInterceptor, apiInterceptor])),
    provideAnimationsAsync(),
  ],
};
