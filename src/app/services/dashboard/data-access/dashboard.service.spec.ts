import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DashboardApi } from './dashboard.service';
import { DashboardResponse } from '@dtos/dashboard/dashboard.response';

function buildResponse(overrides: Partial<DashboardResponse> = {}): DashboardResponse {
  return {
    produtor: { nome: 'João Silva', tipoProdutor: 'PF', uf: 'PR' },
    periodo: '2026-07',
    kpis: {
      debitoIbs: 860,
      debitoCbs: 420,
      creditoIbs: 100,
      creditoCbs: 50,
      saldoIbs: 760,
      saldoCbs: 370,
      totalNotas: 2,
    },
    notasPorMes: [{ periodo: '2026-07', entradas: 3, saidas: 5 }],
    distribuicaoImpostos: { ibs: 860, cbs: 420 },
    ultimasNotas: [
      {
        id: 'n1',
        numero: 1023,
        origem: 'PROPRIA',
        contraparte: 'Cerealista Boa Safra LTDA',
        dataEmissao: '2026-07-01T10:00:00-03:00',
        valorTotalNota: 12000,
        status: 'AUTORIZADA',
      },
    ],
    ...overrides,
  };
}

describe('DashboardApi', () => {
  let service: DashboardApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [DashboardApi, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(DashboardApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('carregar() faz uma única requisição GET /dashboard sem periodo', () => {
    let resultado: DashboardResponse | undefined;
    service.carregar().subscribe(res => (resultado = res));
    const req = httpMock.expectOne('/dashboard');
    expect(req.request.method).toBe('GET');
    req.flush(buildResponse());
    expect(resultado?.produtor.nome).toBe('João Silva');
  });

  it('não chama nenhum dos endpoints antigos (fluxo-caixa, notas-por-mes, distribuicao-impostos, produtores)', () => {
    service.carregar().subscribe();
    httpMock.expectOne('/dashboard').flush(buildResponse());
    httpMock.expectNone('/dashboard/fluxo-caixa');
    httpMock.expectNone('/dashboard/produtores');
    httpMock.expectNone(req => req.url.includes('notas-por-mes'));
    httpMock.expectNone(req => req.url.includes('distribuicao-impostos'));
  });

  it('cacheia o resultado em sucesso — o signal dashboard() retém o DashboardResponse', () => {
    expect(service.dashboard()).toBeNull();
    service.carregar().subscribe();
    httpMock.expectOne('/dashboard').flush(buildResponse());
    expect(service.dashboard()?.periodo).toBe('2026-07');
    expect(service.dashboard()?.kpis.saldoIbs).toBe(760);
  });

  it('propaga o erro HTTP ao chamador sem cair em fallback mock', () => {
    let erro: unknown;
    service.carregar().subscribe({ error: e => (erro = e) });
    httpMock.expectOne('/dashboard').flush('erro', { status: 500, statusText: 'Server Error' });
    expect(erro).toBeTruthy();
    expect(service.dashboard()).toBeNull();
  });

  it('DASH-12: ao revisitar, o signal exibe o cache da 1ª carga e depois atualiza com a 2ª (revalidação em background)', () => {
    service.carregar().subscribe();
    httpMock.expectOne('/dashboard').flush(buildResponse({ periodo: '2026-06' }));
    expect(service.dashboard()?.periodo).toBe('2026-06');

    service.carregar().subscribe();
    expect(service.dashboard()?.periodo).toBe('2026-06');
    httpMock.expectOne('/dashboard').flush(buildResponse({ periodo: '2026-07' }));
    expect(service.dashboard()?.periodo).toBe('2026-07');
  });
});
