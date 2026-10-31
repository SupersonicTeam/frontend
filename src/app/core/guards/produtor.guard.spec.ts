import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { provideRouter } from '@angular/router';
import { SessaoService } from '@core/services/sessao.service';
import { entrarComo } from '@core/services/sessao.testing';
import { produtorGuard } from './produtor.guard';

/**
 * Esconder o link do menu não protege a rota: `/chat` é digitável. Sem o guard o
 * contador chegaria numa tela cujo único conteúdo possível é o
 * `403 PAPEL_NAO_AUTORIZADO` da Ceres.
 */
describe('produtorGuard', () => {
  beforeEach(() => {
    // A sessao e persistida no localStorage: sem limpar, um teste herda a do anterior.
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([]), SessaoService] });
  });

  afterEach(() => localStorage.clear());

  /** Executa o guard no contexto de injeção, como o Router faria. */
  function rodar(): boolean | UrlTree {
    return TestBed.runInInjectionContext(
      () => produtorGuard(null as never, null as never) as boolean | UrlTree,
    );
  }

  it('deixa o produtor entrar', () => {
    entrarComo('PRODUTOR');
    expect(rodar()).toBe(true);
  });

  it('manda o contador para a home do perfil dele', () => {
    entrarComo('CONTADOR');
    const destino = rodar();

    expect(destino).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(destino as UrlTree)).toBe('/contador');
  });
});
