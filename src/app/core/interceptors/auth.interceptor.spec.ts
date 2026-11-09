import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { authInterceptor } from './auth.interceptor';
import { SessaoService } from '@core/services/sessao.service';
import { EncerramentoService } from '@core/services/encerramento.service';
import { entrarComo, sessaoDeTeste } from '@core/services/sessao.testing';

/** Um `LoginResponse` de renovação, com o token que o teste quiser. */
function renovacao(accessToken: string) {
  return {
    accessToken,
    tokenType: 'Bearer',
    expiraEm: new Date(Date.now() + 900_000).toISOString(),
    papel: 'PRODUTOR' as const,
    usuarioId: sessaoDeTeste('PRODUTOR').usuarioId,
  };
}

/**
 * O interceptor que faz a #93 funcionar: assina com `Bearer` e renova quando o token vence.
 *
 * Antes ele era inócuo por contrato (o `TokenService` devolvia `null`), e o que autenticava de
 * fato era o `X-Usuario-Id` — header que **só o profile `dev` do backend aceita**. Em homologação
 * e em produção toda chamada sem `Bearer` responde 401 `NAO_AUTENTICADO`, e o app publicado não
 * passava da primeira tela.
 */
describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let sessao: SessaoService;
  let encerrou: string[];

  beforeEach(() => {
    localStorage.clear();
    encerrou = [];
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          // O `EncerramentoService` de verdade navega e limpa os caches das telas; aqui só
          // interessa **se** ele foi chamado, e com que motivo.
          provide: EncerramentoService,
          useValue: { encerrar: (motivo: string) => encerrou.push(motivo) },
        },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    sessao = TestBed.inject(SessaoService);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('sem sessão não manda Authorization', () => {
    http.get('/dashboard').subscribe();

    const req = httpMock.expectOne('/dashboard');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('com sessão manda Authorization: Bearer <token>', () => {
    const atual = entrarComo('PRODUTOR');
    http.get('/dashboard').subscribe();

    const req = httpMock.expectOne('/dashboard');
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${atual.token}`);
    req.flush({});
  });

  /**
   * As rotas que o contrato declara públicas (`security: []` no `/v3/api-docs`).
   *
   * Importa sobretudo para `/auth/refresh`: se o interceptor tratasse o 401 dela, o 401 de uma
   * renovação dispararia outra renovação — um laço.
   */
  it.each(['/auth/login', '/auth/refresh', '/auth/logout'])('%s é pública: sem token', (rota) => {
    entrarComo('PRODUTOR');
    http.post(rota, null).subscribe();

    const req = httpMock.expectOne(rota);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('reconhece a rota pública com a baseURL já prefixada', () => {
    entrarComo('PRODUTOR');
    http.post('/api/auth/login', null).subscribe();

    const req = httpMock.expectOne('/api/auth/login');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  describe('401 com sessão: renova e repete', () => {
    it('a tela recebe a resposta boa, sem ver o 401', () => {
      entrarComo('PRODUTOR');
      let recebido: unknown = null;
      http.get('/dashboard').subscribe((r) => (recebido = r));

      httpMock
        .expectOne('/dashboard')
        .flush(
          { errors: [{ code: 'NAO_AUTENTICADO', message: 'Token expirado.' }] },
          { status: 401, statusText: 'Unauthorized' },
        );

      httpMock.expectOne('/auth/refresh').flush(renovacao('token.novo'));

      // A repetição vai com o token NOVO: ir com o velho receberia 401 outra vez.
      const repetida = httpMock.expectOne('/dashboard');
      expect(repetida.request.headers.get('Authorization')).toBe('Bearer token.novo');
      repetida.flush({ ok: true });

      expect(recebido).toEqual({ ok: true });
      expect(encerrou).toEqual([]);
      expect(sessao.token()).toBe('token.novo');
    });

    /**
     * **A fila não é zelo, é o contrato.** Medido contra a API local em 30/10: reusar um refresh
     * já trocado responde 401 `SESSAO_INVALIDA` **e encerra toda a linhagem** daquele login — o
     * cookie obtido na renovação anterior também passa a responder 401. Como o token vence para
     * todas as chamadas ao mesmo tempo, um painel que dispara três requisições produz três 401
     * juntos; sem fila seriam três renovações, e as duas últimas derrubariam a sessão que a
     * primeira acabou de salvar.
     */
    it('três 401 simultâneos geram UMA renovação', () => {
      entrarComo('PRODUTOR');
      const rotas = ['/dashboard', '/notas', '/apuracao'];
      const respostas: unknown[] = [];
      for (const rota of rotas) http.get(rota).subscribe((r) => respostas.push(r));

      for (const rota of rotas) {
        httpMock.expectOne(rota).flush(null, { status: 401, statusText: 'Unauthorized' });
      }

      // UMA só: `expectOne` reprova se houver duas.
      httpMock.expectOne('/auth/refresh').flush(renovacao('token.novo'));

      for (const rota of rotas) {
        const repetida = httpMock.expectOne(rota);
        expect(repetida.request.headers.get('Authorization')).toBe('Bearer token.novo');
        repetida.flush({ rota });
      }

      expect(respostas).toHaveLength(3);
      expect(encerrou).toEqual([]);
    });

    it('renovação falhou: encerra a sessão e o erro sobe', () => {
      entrarComo('PRODUTOR');
      let falhou = false;
      http.get('/dashboard').subscribe({ error: () => (falhou = true) });

      httpMock.expectOne('/dashboard').flush(null, { status: 401, statusText: 'Unauthorized' });
      httpMock
        .expectOne('/auth/refresh')
        .flush(
          { errors: [{ code: 'SESSAO_INVALIDA' }] },
          { status: 401, statusText: 'Unauthorized' },
        );

      expect(encerrou).toEqual(['expirada']);
      expect(falhou).toBe(true);
    });

    /** Repetiu e tomou 401 de novo: não insiste. Uma repetição, e só. */
    it('o 401 da repetição encerra em vez de renovar outra vez', () => {
      entrarComo('PRODUTOR');
      http.get('/dashboard').subscribe({ error: () => undefined });

      httpMock.expectOne('/dashboard').flush(null, { status: 401, statusText: 'Unauthorized' });
      httpMock.expectOne('/auth/refresh').flush(renovacao('token.novo'));
      httpMock.expectOne('/dashboard').flush(null, { status: 401, statusText: 'Unauthorized' });

      expect(encerrou).toEqual(['expirada']);
    });
  });

  /** O endpoint público do host (#175): pelo início do caminho, nunca por `includes`. */
  it.each(['/publico/escritorios/x', '/api/publico/escritorios/x'])(
    '%s é público: sem token, e o 401 dele não renova',
    (rota) => {
      entrarComo('CONTADOR');
      http.get(rota).subscribe({ error: () => undefined });

      const req = httpMock.expectOne(rota);
      expect(req.request.headers.has('Authorization')).toBe(false);
      req.flush(null, { status: 401, statusText: 'Unauthorized' });

      httpMock.expectNone((r) => r.url.includes('/auth/refresh'));
      expect(encerrou).toEqual([]);
    },
  );

  it('/publico/ no meio do caminho continua levando Authorization', () => {
    const atual = entrarComo('CONTADOR');
    http.get('/contador/publico/x').subscribe();

    const req = httpMock.expectOne('/contador/publico/x');
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${atual.token}`);
    req.flush({});
  });

  it('401 SEM sessão não tenta renovar: não há o que renovar', () => {
    http.get('/dashboard').subscribe({ error: () => undefined });

    httpMock.expectOne('/dashboard').flush(null, { status: 401, statusText: 'Unauthorized' });

    httpMock.verify();
    expect(encerrou).toEqual([]);
  });

  it('403 não renova: papel errado não é token vencido', () => {
    entrarComo('CONTADOR');
    http.get('/dashboard').subscribe({ error: () => undefined });

    httpMock
      .expectOne('/dashboard')
      .flush(
        { errors: [{ code: 'PAPEL_NAO_AUTORIZADO' }] },
        { status: 403, statusText: 'Forbidden' },
      );

    httpMock.verify();
    expect(encerrou).toEqual([]);
  });
});
