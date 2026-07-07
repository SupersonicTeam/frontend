import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CalendarioApi } from './calendario.service';
import { VencimentoFiscal } from '@models/vencimento-fiscal.model';

describe('CalendarioApi', () => {
  let service: CalendarioApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CalendarioApi, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CalendarioApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('AC-8: getVencimentos mapeia a resposta real do backend (sem dado mockado)', () => {
    let resultado: VencimentoFiscal[] | undefined;
    service.getVencimentos('produtor-1').subscribe(res => (resultado = res));

    const req = httpMock.expectOne(r => r.url === '/calendario-fiscal/produtor-1/vencimentos');
    req.flush([
      {
        id: 'v1',
        evento: 'ITR',
        dataVencimento: '2026-09-30T00:00:00',
        status: 'normal',
        valor: 500,
      },
    ]);

    expect(resultado).toEqual([
      {
        id: 'v1',
        titulo: 'ITR',
        descricao: undefined,
        dataVencimento: '2026-09-30',
        tipo: 'imposto',
        status: 'pendente',
        valor: 500,
      },
    ]);
  });

  it('AC-8: em falha do backend, o erro propaga ao chamador — sem fallback com dado falso', () => {
    let erro: unknown;
    let resultado: VencimentoFiscal[] | undefined;
    service.getVencimentos('produtor-1').subscribe({
      next: res => (resultado = res),
      error: e => (erro = e),
    });

    httpMock
      .expectOne(r => r.url === '/calendario-fiscal/produtor-1/vencimentos')
      .flush('erro', { status: 500, statusText: 'Server Error' });

    expect(erro).toBeTruthy();
    expect(resultado).toBeUndefined();
  });
});
