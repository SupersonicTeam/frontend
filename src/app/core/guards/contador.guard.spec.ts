import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { PerfilService } from '@core/services/perfil.service';
import { contadorGuard } from './contador.guard';

/**
 * O par do `produtorGuard`. Sem ele o produtor chegaria na tela de Acompanhamento pelo endereço
 * — uma tela escrita para quem atende *outra pessoa*.
 */
describe('contadorGuard', () => {
  let perfil: PerfilService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    perfil = TestBed.inject(PerfilService);
  });

  function rodar(): boolean | UrlTree {
    return TestBed.runInInjectionContext(
      () => contadorGuard(null as never, null as never) as boolean | UrlTree,
    );
  }

  it('deixa o contador entrar', () => {
    perfil.entrar('contador');
    expect(rodar()).toBe(true);
  });

  it('manda o produtor para a home do perfil dele', () => {
    perfil.entrar('produtor');
    const destino = rodar();

    expect(destino).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(destino as UrlTree)).toBe('/dashboard');
  });
});
