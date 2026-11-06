import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { appConfig } from './app.config';
import {
  AMBIENTE_DE_RECARGA,
  AmbienteDeRecarga,
  CHAVE_RECARGA_CHUNK,
} from '@core/utils/recarga-apos-deploy';

/** `sessionStorage` em memória e navegação espionada (a regra está em `recarga-apos-deploy.spec`). */
function ambienteFalso(guardado: Record<string, string> = {}) {
  const dados: Record<string, string> = { ...guardado };
  const ir = vi.fn();
  const ambiente: AmbienteDeRecarga = {
    armazenamento: {
      getItem: (k) => dados[k] ?? null,
      setItem: (k, v) => {
        dados[k] = v;
      },
      removeItem: (k) => {
        delete dados[k];
      },
    },
    online: () => true,
    ir,
  };
  return { ambiente, ir, dados };
}

@Component({ template: '' })
class TelaVazia {}

/** O que o `appConfig` liga além das rotas (#162). */
describe('appConfig', () => {
  beforeEach(() => {
    localStorage.removeItem('agro-tema');
    document.documentElement.classList.remove('dark');
  });

  afterEach(() => {
    localStorage.removeItem('agro-tema');
    document.documentElement.classList.remove('dark');
  });

  /** O app com o ambiente da recarga trocado por um falso: nada de `location.assign` no jsdom. */
  function montar(guardado: Record<string, string> = {}) {
    const falso = ambienteFalso(guardado);
    TestBed.configureTestingModule({
      providers: [
        ...appConfig.providers,
        { provide: AMBIENTE_DE_RECARGA, useValue: falso.ambiente },
      ],
    });
    const router = TestBed.inject(Router);
    return { ...falso, router };
  }

  it('aplica o tema salvo desde a abertura, sem esperar uma tela que use o ThemeService', () => {
    localStorage.setItem('agro-tema', 'escuro');
    montar();

    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('arquivo de tela ausente ao navegar: recarrega no destino', async () => {
    const { router, ir } = montar();
    router.resetConfig([
      {
        path: 'cadastro',
        loadComponent: () =>
          Promise.reject(new TypeError('Failed to fetch dynamically imported module: /chunk-X.js')),
      },
    ]);

    await router.navigateByUrl('/cadastro?origem=login').catch(() => undefined);

    expect(ir).toHaveBeenCalledWith('/cadastro?origem=login');
  });

  it('outro erro de navegação não recarrega', async () => {
    const { router, ir } = montar();
    router.resetConfig([
      { path: 'quebrada', loadComponent: () => Promise.reject(new Error('guarda quebrou')) },
    ]);

    await router.navigateByUrl('/quebrada').catch(() => undefined);

    expect(ir).not.toHaveBeenCalled();
  });

  it('navegação que deu certo tira a marca, liberando a recarga do próximo deploy', async () => {
    const { router, dados } = montar({ [CHAVE_RECARGA_CHUNK]: '/cadastro' });
    router.resetConfig([{ path: 'cadastro', component: TelaVazia }]);

    await router.navigateByUrl('/cadastro');

    expect(dados[CHAVE_RECARGA_CHUNK]).toBeUndefined();
  });
});
