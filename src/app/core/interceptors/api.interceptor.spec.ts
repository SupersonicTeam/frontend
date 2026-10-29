import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { apiInterceptor, mensagemDeEnvelope } from './api.interceptor';
import { skipErrorNotify } from './error-notify.context';
import { IdentidadeService } from '@core/services/identidade.service';
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
    httpMock.expectOne('/api/produtores/1').flush(
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
    http.get('/produtores/1', { context: skipErrorNotify() }).subscribe({ next: () => undefined, error: () => undefined });
    httpMock.expectOne('/api/produtores/1').flush({ message: 'x' }, { status: 500, statusText: 'x' });
    expect(toast.toasts().length).toBe(0);
  });

  it('não exibe toast em 404 (endpoint ainda inexistente)', () => {
    http.get('/relatorios/conformidade').subscribe({ next: () => undefined, error: () => undefined });
    httpMock.expectOne('/api/relatorios/conformidade').flush({}, { status: 404, statusText: 'Not Found' });
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
 * O header de identidade sai daqui para **todas** as chamadas do `HttpClient` — e
 * o `fetch` do streaming da Ceres lê a mesma fonte à mão, porque o interceptor
 * não o alcança (contrato #76).
 *
 * O caso de ausência não é detalhe: com um UUID que não existe no banco o backend
 * responde 401 em toda chamada, enquanto **sem** o header ele resolve o produtor
 * semente. Mandar header errado é pior que não mandar.
 */
describe('apiInterceptor (identidade X-Usuario-Id)', () => {
  function comIdentidade(usuarioId: string | null) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiInterceptor])),
        provideHttpClientTesting(),
        ToastService,
        {
          // O interceptor **pergunta** a identidade da rota; qual rota merece header é decisão do
          // `IdentidadeService`, coberta no spec dele. Aqui só provamos que o que ele responde vai
          // (ou não vai) no header.
          provide: IdentidadeService,
          useValue: { usuarioId: signal(usuarioId), paraRota: () => usuarioId },
        },
      ],
    });
    return {
      http: TestBed.inject(HttpClient),
      httpMock: TestBed.inject(HttpTestingController),
    };
  }

  it('declara a identidade quando existe uma', () => {
    const { http, httpMock } = comIdentidade('aaee3cd4-9e47-41f9-bf0b-26ae5531c8a8');
    http.get('/assistente/chat').subscribe({ next: () => undefined, error: () => undefined });

    const req = httpMock.expectOne('/api/assistente/chat');
    expect(req.request.headers.get('X-Usuario-Id')).toBe('aaee3cd4-9e47-41f9-bf0b-26ae5531c8a8');
    req.flush({});
    httpMock.verify();
  });

  it('não manda o header quando não há identidade — o backend usa o produtor semente', () => {
    const { http, httpMock } = comIdentidade(null);
    http.get('/dashboard').subscribe({ next: () => undefined, error: () => undefined });

    const req = httpMock.expectOne('/api/dashboard');
    expect(req.request.headers.has('X-Usuario-Id')).toBe(false);
    req.flush({});
    httpMock.verify();
  });
});
