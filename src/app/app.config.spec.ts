import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { appConfig } from './app.config';
import { CHAVE_RECARGA_CHUNK } from '@core/utils/recarga-apos-deploy';

/** O que o `appConfig` liga além das rotas (#162). */
describe('appConfig', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('aplica o tema salvo desde a abertura, sem esperar uma tela que use o ThemeService', () => {
    localStorage.setItem('agro-tema', 'escuro');
    TestBed.configureTestingModule({ providers: [...appConfig.providers] });
    TestBed.inject(Router);

    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  /**
   * O jsdom não deixa trocar o `location.assign` ("Cannot redefine property"), então a prova é a
   * marca que a recarga grava antes de navegar. A regra em si está em `recarga-apos-deploy.spec.ts`.
   */
  it('arquivo de tela ausente ao navegar: o Router aciona a recarga', async () => {
    TestBed.configureTestingModule({ providers: [...appConfig.providers] });
    const router = TestBed.inject(Router);
    router.resetConfig([
      {
        path: 'cadastro',
        loadComponent: () =>
          Promise.reject(new TypeError('Failed to fetch dynamically imported module: /chunk-X.js')),
      },
    ]);

    await router.navigateByUrl('/cadastro').catch(() => undefined);

    expect(sessionStorage.getItem(CHAVE_RECARGA_CHUNK)).not.toBeNull();
  });

  it('outro erro de navegação não aciona a recarga', async () => {
    TestBed.configureTestingModule({ providers: [...appConfig.providers] });
    const router = TestBed.inject(Router);
    router.resetConfig([
      { path: 'quebrada', loadComponent: () => Promise.reject(new Error('guarda quebrou')) },
    ]);

    await router.navigateByUrl('/quebrada').catch(() => undefined);

    expect(sessionStorage.getItem(CHAVE_RECARGA_CHUNK)).toBeNull();
  });
});
