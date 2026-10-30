import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { SessaoService } from '@core/services/sessao.service';
import { entrarComo } from '@core/services/sessao.testing';
import { contadorGuard } from './contador.guard';

/**
 * O par do `produtorGuard`. Sem ele o produtor chegaria na tela de Acompanhamento pelo endereço
 * — uma tela escrita para quem atende *outra pessoa*.
 */
describe('contadorGuard', () => {
  beforeEach(() => {
    // A sessao e persistida no localStorage: sem limpar, um teste herda a do anterior.
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([]), SessaoService] });
  });

  afterEach(() => localStorage.clear());

  function rodar(): boolean | UrlTree {
    return TestBed.runInInjectionContext(
      () => contadorGuard(null as never, null as never) as boolean | UrlTree,
    );
  }

  it('deixa o contador entrar', () => {
    entrarComo('CONTADOR');
    expect(rodar()).toBe(true);
  });

  it('manda o produtor para a home do perfil dele', () => {
    entrarComo('PRODUTOR');
    const destino = rodar();

    expect(destino).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(destino as UrlTree)).toBe('/dashboard');
  });
});
