import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { provideRouter } from '@angular/router';
import { PerfilService } from '@core/services/perfil.service';
import { produtorGuard } from './produtor.guard';

/**
 * Esconder o link do menu não protege a rota: `/chat` é digitável. Sem o guard o
 * contador chegaria numa tela cujo único conteúdo possível é o
 * `403 PAPEL_NAO_AUTORIZADO` da Ceres.
 */
describe('produtorGuard', () => {
  let perfil: PerfilService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    perfil = TestBed.inject(PerfilService);
  });

  /** Executa o guard no contexto de injeção, como o Router faria. */
  function rodar(): boolean | UrlTree {
    return TestBed.runInInjectionContext(
      () => produtorGuard(null as never, null as never) as boolean | UrlTree,
    );
  }

  it('deixa o produtor entrar', () => {
    perfil.entrar('produtor');
    expect(rodar()).toBe(true);
  });

  it('manda o contador para a home do perfil dele', () => {
    perfil.entrar('contador');
    const destino = rodar();

    expect(destino).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(destino as UrlTree)).toBe('/contador');
  });
});
