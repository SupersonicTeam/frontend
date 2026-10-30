import { TestBed } from '@angular/core/testing';
import { Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom, isObservable, of } from 'rxjs';
import { SessaoService } from '@core/services/sessao.service';
import { entrarComo, sessaoDeTeste, sessaoVencida } from '@core/services/sessao.testing';
import { sessaoGuard } from './sessao.guard';

/**
 * Nenhuma tela sem sessão (issue #93).
 *
 * O `perfilGuard` que ele substitui só perguntava se havia um papel escolhido num `localStorage`
 * editável — "não é segurança real", como o próprio comentário dizia.
 */
describe('sessaoGuard', () => {
  let httpMock: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        SessaoService,
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  /** Executa o guard no contexto de injeção, como o Router faria. */
  function rodar(url = '/documentos') {
    const estado = { url } as RouterStateSnapshot;
    return TestBed.runInInjectionContext(() => sessaoGuard(null as never, estado));
  }

  /** O destino, seja ele síncrono ou vindo da renovação. */
  async function destino(url?: string): Promise<boolean | UrlTree> {
    const saida = rodar(url);
    const resolvido = await firstValueFrom(isObservable(saida) ? saida : of(saida));
    // O guard só devolve `boolean | UrlTree`; o `GuardResult` do Angular inclui
    // `RedirectCommand`, que não usamos.
    return resolvido as boolean | UrlTree;
  }

  it('com sessão no prazo, deixa passar', async () => {
    entrarComo('PRODUTOR');

    expect(await destino()).toBe(true);
  });

  /**
   * O `returnUrl` é o que impede todo endereço compartilhado — uma nota, um cliente da carteira —
   * de perder o destino no caminho do login.
   */
  it('sem sessão manda ao /login preservando a rota pretendida', async () => {
    const saida = await destino('/contador/abc-123?aba=notas');

    expect(saida).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(saida as UrlTree)).toBe(
      '/login?returnUrl=%2Fcontador%2Fabc-123%3Faba%3Dnotas',
    );
  });

  /**
   * **Token vencido não é sessão encerrada.** O token vive 15 minutos e o cookie de refresh 7
   * dias: voltar ao app depois do almoço é o caso normal, e pedir a senha de novo ali seria
   * defeito, não rigor.
   */
  describe('token vencido', () => {
    it('renova e deixa passar', async () => {
      const sessao = TestBed.inject(SessaoService);
      sessao.abrir(sessaoVencida('PRODUTOR'));

      const prometido = destino();
      httpMock.expectOne('/auth/refresh').flush({
        accessToken: 'token.novo',
        tokenType: 'Bearer',
        expiraEm: new Date(Date.now() + 900_000).toISOString(),
        papel: 'PRODUTOR',
        usuarioId: sessaoDeTeste('PRODUTOR').usuarioId,
      });

      expect(await prometido).toBe(true);
      expect(sessao.token()).toBe('token.novo');
    });

    it('renovação falhou: aí sim vai ao /login, com o returnUrl', async () => {
      TestBed.inject(SessaoService).abrir(sessaoVencida('PRODUTOR'));

      const prometido = destino('/documentos');
      httpMock
        .expectOne('/auth/refresh')
        .flush(
          { errors: [{ code: 'SESSAO_INVALIDA' }] },
          { status: 401, statusText: 'Unauthorized' },
        );

      const saida = await prometido;
      expect(saida).toBeInstanceOf(UrlTree);
      expect(router.serializeUrl(saida as UrlTree)).toBe('/login?returnUrl=%2Fdocumentos');
    });
  });

  it('sem sessão não tenta renovar: não há o que renovar', async () => {
    await destino();

    httpMock.verify();
  });
});
