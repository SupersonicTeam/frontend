import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { apiInterceptor, mensagemDeEnvelope } from './api.interceptor';
import { skipErrorNotify } from './error-notify.context';
import { ToastService } from '@core/services/toast.service';
import { ApiErrorEnvelope } from '@dtos/shared/responses/api-error.response';

describe('apiInterceptor (toast global de erro)', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let toast: ToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiInterceptor])),
        provideHttpClientTesting(),
        ToastService,
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    toast = TestBed.inject(ToastService);
  });

  afterEach(() => httpMock.verify());

  it('exibe toast amigável (do ApiError) em endpoint não tratado localmente', () => {
    http.get('/produtores/1').subscribe({ next: () => undefined, error: () => undefined });
    httpMock
      .expectOne('/api/produtores/1')
      .flush(
        { message: 'Falha', errors: [{ code: 'X', message: 'Período inválido' }] },
        { status: 500, statusText: 'Server Error' },
      );
    const toasts = toast.toasts();
    expect(toasts.length).toBe(1);
    expect(toasts[0].type).toBe('error');
    expect(toasts[0].message).toBe('Período inválido');
  });

  it('NÃO exibe toast para /api/notas (tratado localmente com painéis próprios)', () => {
    http.get('/notas').subscribe({ next: () => undefined, error: () => undefined });
    httpMock.expectOne('/api/notas').flush({ message: 'x' }, { status: 500, statusText: 'x' });
    expect(toast.toasts().length).toBe(0);
  });

  it('respeita skipErrorNotify() na requisição', () => {
    http
      .get('/produtores/1', { context: skipErrorNotify() })
      .subscribe({ next: () => undefined, error: () => undefined });
    httpMock
      .expectOne('/api/produtores/1')
      .flush({ message: 'x' }, { status: 500, statusText: 'x' });
    expect(toast.toasts().length).toBe(0);
  });

  it('não exibe toast em 404 (endpoint ainda inexistente)', () => {
    http
      .get('/relatorios/conformidade')
      .subscribe({ next: () => undefined, error: () => undefined });
    httpMock
      .expectOne('/api/relatorios/conformidade')
      .flush({}, { status: 404, statusText: 'Not Found' });
    expect(toast.toasts().length).toBe(0);
  });
});

describe('mensagemDeEnvelope (INT-12 — reusável no fluxo de blob)', () => {
  it('prioriza errors[0].message quando presente', () => {
    const env = {
      errors: [{ code: 'DANFE_INDISPONIVEL', message: 'Gere o XML primeiro.' }],
      message: 'Conflito',
    } as ApiErrorEnvelope;
    expect(mensagemDeEnvelope(env, 409)).toBe('Gere o XML primeiro.');
  });

  it('cai para env.message quando não há errors[]', () => {
    const env = { message: 'Período inválido', errors: [] } as unknown as ApiErrorEnvelope;
    expect(mensagemDeEnvelope(env, 400)).toBe('Período inválido');
  });

  it('envelope nulo com status 5xx → mensagem genérica de servidor', () => {
    expect(mensagemDeEnvelope(null, 500)).toBe('Erro no servidor. Tente novamente em instantes.');
  });
});

/**
 * Tela que já mostra o erro no lugar certo não precisa de toast por cima. Medido na tela de
 * Impostos com o servidor fora: três cards com "Não foi possível carregar…" **e** três toasts
 * dizendo a mesma coisa.
 */
describe('apiInterceptor (sem toast onde a tela já trata)', () => {
  it.each(['/apuracao', '/creditos', '/relatorios/conformidade'])(
    'não exibe toast para %s — o card da tela tem o próprio "Tentar novamente"',
    (endpoint) => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(withInterceptors([apiInterceptor])),
          provideHttpClientTesting(),
          ToastService,
        ],
      });
      const http = TestBed.inject(HttpClient);
      const httpMock = TestBed.inject(HttpTestingController);
      const toast = TestBed.inject(ToastService);

      http.get(endpoint).subscribe({ next: () => undefined, error: () => undefined });
      httpMock
        .expectOne(`/api${endpoint}`)
        .flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });

      expect(toast.toasts().length).toBe(0);
      httpMock.verify();
    },
  );
});

/**
 * A identidade saiu daqui (issue #93).
 *
 * O interceptor declarava `X-Usuario-Id`, com o UUID do contador **cravado no código** e enviado
 * só em `/api/contador/**` (o remendo `paraRota`). Aquele header **só o profile `dev` do backend
 * aceita**: em homologação e em produção a requisição sem `Bearer` responde 401 `NAO_AUTENTICADO`.
 * Quem autentica agora é o `authInterceptor`, com o token — e o token vale em todas as rotas, de
 * modo que a identidade por rota deixou de existir.
 */
describe('apiInterceptor (a identidade saiu — issue #93)', () => {
  function cliente() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiInterceptor])),
        provideHttpClientTesting(),
        ToastService,
      ],
    });
    return {
      http: TestBed.inject(HttpClient),
      httpMock: TestBed.inject(HttpTestingController),
      toast: TestBed.inject(ToastService),
    };
  }

  it.each(['/dashboard', '/contador/produtores', '/assistente/chat'])(
    'não manda X-Usuario-Id em %s',
    (endpoint) => {
      const { http, httpMock } = cliente();
      http.get(endpoint).subscribe({ next: () => undefined, error: () => undefined });

      const req = httpMock.expectOne(`/api${endpoint}`);
      expect(req.request.headers.has('X-Usuario-Id')).toBe(false);
      req.flush({});
      httpMock.verify();
    },
  );

  /**
   * **401 não vira toast.** O `authInterceptor` o trata antes de a tela saber que houve erro: ele
   * renova o token e repete a requisição, que então dá certo. Um toast "token inválido" apareceria
   * no meio de uma recuperação bem-sucedida, dizendo que falhou justamente o que funcionou. Quem
   * avisa quando a sessão acaba de verdade é o `EncerramentoService`.
   */
  it('401 não vira toast: a renovação é silenciosa', () => {
    const { http, httpMock, toast } = cliente();
    http.get('/apuracao').subscribe({ next: () => undefined, error: () => undefined });

    httpMock
      .expectOne('/api/apuracao')
      .flush(
        { errors: [{ code: 'NAO_AUTENTICADO', message: 'Token expirado.' }] },
        { status: 401, statusText: 'Unauthorized' },
      );

    expect(toast.toasts().length).toBe(0);
    httpMock.verify();
  });
});

/**
 * O `Accept` deixou de ser cravado em toda requisição (issue #99).
 *
 * O interceptor punha `Accept: application/json` em **tudo**, inclusive nos downloads de DANFE e
 * de XML, que pedem `responseType: 'blob'`/`'text'`. Medido contra o backend em 28/10 com uma
 * nota autorizada:
 *
 * | Accept             | `/notas/{id}/pdf` | `/notas/{id}/xml` |
 * |--------------------|-------------------|-------------------|
 * | `application/json` | **500**           | **500**           |
 * | `application/pdf` / `application/xml` | 200 | 200 |
 * | nenhum (o navegador manda qualquer tipo) | 200 | 200 |
 *
 * Ou seja: o header que o próprio cliente mandava derrubava o download. (Que a resposta seja 500
 * e não 406 é defeito do backend, registrado em SupersonicTeam/backend#250 — mas mandar o Accept
 * errado é nosso.)
 */
describe('apiInterceptor (Accept — issue #99)', () => {
  function cliente() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiInterceptor])),
        provideHttpClientTesting(),
        ToastService,
      ],
    });
    return {
      http: TestBed.inject(HttpClient),
      httpMock: TestBed.inject(HttpTestingController),
    };
  }

  it('requisição JSON continua pedindo application/json', () => {
    const { http, httpMock } = cliente();
    http.get('/notas').subscribe({ next: () => undefined, error: () => undefined });

    const req = httpMock.expectOne('/api/notas');
    expect(req.request.headers.get('Accept')).toBe('application/json');
    req.flush({});
    httpMock.verify();
  });

  /**
   * Download **não leva Accept nenhum**, e isso é deliberado — não é "esquecemos de pôr o certo".
   *
   * Medido em 28/10 pedindo a DANFE de uma nota `COM_INCONSISTENCIAS`, que o backend recusa:
   *
   * - com `Accept: application/pdf` → **500 de corpo vazio**. A recusa real se perde;
   * - sem Accept nenhum (o navegador manda qualquer tipo) → **409** com o envelope JSON e a mensagem que serve ao usuário:
   *   "DANFE indisponivel para a nota … Gere o XML da nota antes".
   *
   * O caminho feliz devolve PDF e o caminho de erro devolve JSON; só aceitar qualquer tipo serve para os dois. O
   * `download.ts` já desserializa o `ApiErrorEnvelope` de dentro do blob justamente por isso.
   * Declarar o tipo binário no Accept trocaria um defeito por outro pior: um 500 mudo no lugar de
   * "gere o XML da nota antes".
   */
  it('download em blob não manda Accept: o erro vem em JSON e só */* aceita os dois', () => {
    const { http, httpMock } = cliente();
    http
      .get('/notas/n1/pdf', { responseType: 'blob' })
      .subscribe({ next: () => undefined, error: () => undefined });

    const req = httpMock.expectOne('/api/notas/n1/pdf');
    expect(req.request.headers.has('Accept')).toBe(false);
    req.flush(new Blob());
    httpMock.verify();
  });

  it('resposta em texto também não manda Accept', () => {
    const { http, httpMock } = cliente();
    http
      .get('/notas/n1/xml', { responseType: 'text' })
      .subscribe({ next: () => undefined, error: () => undefined });

    const req = httpMock.expectOne('/api/notas/n1/xml');
    expect(req.request.headers.has('Accept')).toBe(false);
    req.flush('<xml/>');
    httpMock.verify();
  });

  it('o Accept que o chamador declarou é preservado, não sobrescrito', () => {
    const { http, httpMock } = cliente();
    http
      .get('/notas/n1/pdf', {
        responseType: 'blob',
        headers: { Accept: 'application/pdf' },
      })
      .subscribe({ next: () => undefined, error: () => undefined });

    const req = httpMock.expectOne('/api/notas/n1/pdf');
    expect(req.request.headers.get('Accept')).toBe('application/pdf');
    req.flush(new Blob());
    httpMock.verify();
  });

  it('um Accept declarado numa requisição JSON também é respeitado', () => {
    const { http, httpMock } = cliente();
    http
      .get('/assistente/chat', { headers: { Accept: 'text/event-stream' } })
      .subscribe({ next: () => undefined, error: () => undefined });

    const req = httpMock.expectOne('/api/assistente/chat');
    expect(req.request.headers.get('Accept')).toBe('text/event-stream');
    req.flush({});
    httpMock.verify();
  });
});
