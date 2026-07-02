import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DashboardApi, mockNotas } from './dashboard.service';

describe('mockNotas', () => {
  it('devolve notas alinhadas ao NotaFiscalResponse (status/destinatario/totais)', () => {
    const notas = mockNotas();
    expect(notas.length).toBeGreaterThan(0);
    const n = notas[0];
    expect(n.status).toBe('AUTORIZADA');
    expect(n.destinatarioNome).toBeTruthy();
    expect(typeof n.numero).toBe('number');
    expect(n.itens[0].ncm).toMatch(/^\d{8}$/);
  });

  it('inclui uma nota COM_INCONSISTENCIAS para exercitar o badge de desvio', () => {
    expect(mockNotas().some(n => n.status === 'COM_INCONSISTENCIAS')).toBe(true);
  });
});

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

  it('getDistribuicaoImpostos cai no mock (CBS/IBS) quando o backend responde vazio', () => {
    let dist: { nome: string }[] | undefined;
    service.getDistribuicaoImpostos('p1').subscribe(d => (dist = d));
    httpMock.expectOne('/dashboard/p1/distribuicao-impostos').flush([]);
    expect(dist?.map(d => d.nome)).toEqual(['CBS', 'IBS']);
  });
});
