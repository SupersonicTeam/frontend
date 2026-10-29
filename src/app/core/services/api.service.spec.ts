import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApiService } from './api.service';

/**
 * Query string do cliente HTTP genérico.
 *
 * O caso que motivou o teste: `GET /api/notas` aceita `status` **repetido**, e várias ocorrências
 * valem como **OU** (`?status=RASCUNHO&status=DEVOLVIDA`) — contrato da #116. Com `set`, um array
 * viraria a string `"RASCUNHO,DEVOLVIDA"`: o servidor leria **um** status com esse nome, não daria
 * erro nenhum e devolveria zero resultado. Falha silenciosa, que é a família de bug que mais
 * apareceu neste projeto.
 */
describe('ApiService — parâmetros', () => {
  let api: ApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ApiService, provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(ApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('um array vira o parametro REPETIDO, nao uma lista com virgula', () => {
    api.get('/notas', { status: ['RASCUNHO', 'DEVOLVIDA'] }).subscribe();

    const req = httpMock.expectOne((r) => r.url === '/notas');
    expect(req.request.params.getAll('status')).toEqual(['RASCUNHO', 'DEVOLVIDA']);
    // O que aconteceria com `set`: um valor só, com o nome errado.
    expect(req.request.params.get('status')).not.toBe('RASCUNHO,DEVOLVIDA');
    req.flush({});
  });

  it('array de um elemento tambem vai como parametro, nao some', () => {
    api.get('/notas', { status: ['RASCUNHO'] }).subscribe();

    const req = httpMock.expectOne((r) => r.url === '/notas');
    expect(req.request.params.getAll('status')).toEqual(['RASCUNHO']);
    req.flush({});
  });

  it('valor simples continua indo como antes', () => {
    api.get('/notas', { page: 0, size: 12, busca: 'café' }).subscribe();

    const req = httpMock.expectOne((r) => r.url === '/notas');
    expect(req.request.params.get('page')).toBe('0');
    expect(req.request.params.get('size')).toBe('12');
    expect(req.request.params.get('busca')).toBe('café');
    req.flush({});
  });

  it('undefined e null nao viram parametro vazio — ausente e diferente de "qualquer"', () => {
    api
      .get('/notas', {
        busca: undefined as unknown as string,
        status: null as unknown as string,
        page: 0,
      })
      .subscribe();

    const req = httpMock.expectOne((r) => r.url === '/notas');
    expect(req.request.params.has('busca')).toBe(false);
    expect(req.request.params.has('status')).toBe(false);
    expect(req.request.params.get('page')).toBe('0');
    req.flush({});
  });

  it('array vazio nao suja a query', () => {
    api.get('/notas', { status: [], page: 0 }).subscribe();

    const req = httpMock.expectOne((r) => r.url === '/notas');
    expect(req.request.params.has('status')).toBe(false);
    req.flush({});
  });
});
