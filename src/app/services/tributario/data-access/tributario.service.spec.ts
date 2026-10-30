import { TestBed } from '@angular/core/testing';
import { HttpResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TributarioApi } from './tributario.service';
import { Apuracao, CreditoSaldo, RelatorioConformidade } from '@models/tributario.model';

function buildApuracao(overrides: Partial<Apuracao> = {}): Apuracao {
  return {
    periodo: '2026-07',
    status: 'ABERTO',
    debitoIbs: 150,
    debitoCbs: 1350,
    creditoIbs: 30,
    creditoCbs: 270,
    saldoIbs: 120,
    saldoCbs: 1080,
    totalNotas: 8,
    dataFechamento: null,
    ...overrides,
  };
}

function buildCreditoSaldo(): CreditoSaldo {
  return {
    periodo: '2026-07',
    creditoIbs: 12.5,
    creditoCbs: 112.5,
    creditoTotal: 125,
    quantidadeNotas: 3,
  };
}

function buildRelatorio(): RelatorioConformidade {
  return {
    periodo: '2026-07',
    debitoIbs: 10,
    debitoCbs: 90,
    debitoTotal: 100,
    quantidadeSaidas: 5,
    creditoIbs: 4,
    creditoCbs: 36,
    creditoTotal: 40,
    quantidadeEntradas: 2,
    saldoIbs: 6,
    saldoCbs: 54,
    saldoAPagar: 60,
  };
}

describe('TributarioApi', () => {
  let service: TributarioApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [TributarioApi, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TributarioApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('AC-1: apuracao(periodo) faz GET /apuracao?periodo= e retorna a Apuracao mapeada', () => {
    let resultado: Apuracao | undefined;
    service.apuracao('2026-07').subscribe(res => (resultado = res));

    const req = httpMock.expectOne(r => r.url === '/apuracao');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('periodo')).toBe('2026-07');

    req.flush(buildApuracao());

    expect(resultado).toEqual(buildApuracao());
  });

  // AC-5 saiu: `POST /apuracao/{id}/reabrir` esta deprecated e responde 403 a todos (#117).
  // A reabertura virou do contador, e o teste dela mora em `carteira.service.spec`.


  it('AC-2: saldoCredito(periodo) faz GET /creditos?periodo= e retorna o CreditoSaldo mapeado', () => {
    let resultado: CreditoSaldo | undefined;
    service.saldoCredito('2026-07').subscribe(res => (resultado = res));

    const req = httpMock.expectOne(r => r.url === '/creditos');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('periodo')).toBe('2026-07');

    req.flush(buildCreditoSaldo());

    expect(resultado?.creditoTotal).toBe(125);
    expect(resultado?.quantidadeNotas).toBe(3);
  });

  it('AC-3: relatorioConformidade(periodo) faz GET /relatorios/conformidade?periodo= e mapeia saldoAPagar (inclusive negativo)', () => {
    let resultado: RelatorioConformidade | undefined;
    service.relatorioConformidade('2026-07').subscribe(res => (resultado = res));

    const req = httpMock.expectOne(r => r.url === '/relatorios/conformidade');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('periodo')).toBe('2026-07');

    const relatorioCredor = buildRelatorio(); // relatório positivo
    req.flush(relatorioCredor);
    expect(resultado?.saldoAPagar).toBe(60);
  });

  it('AC-3b: relatorioConformidade mapeia saldoAPagar negativo (saldo credor) sem alterar o valor', () => {
    let resultado: RelatorioConformidade | undefined;
    service.relatorioConformidade('2026-08').subscribe(res => (resultado = res));

    const req = httpMock.expectOne(r => r.url === '/relatorios/conformidade');
    req.flush({ ...buildRelatorio(), periodo: '2026-08', saldoAPagar: -60 });

    expect(resultado?.saldoAPagar).toBe(-60);
  });

  it('INT-13: relatorioConformidadePdf usa responseType blob + observe:response e expõe o Content-Disposition', () => {
    let resp: HttpResponse<Blob> | undefined;
    service.relatorioConformidadePdf('2026-07').subscribe(res => (resp = res));

    const req = httpMock.expectOne(r => r.url === '/relatorios/conformidade/pdf');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('periodo')).toBe('2026-07');
    expect(req.request.responseType).toBe('blob');

    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' });
    req.flush(blob, { headers: { 'Content-Disposition': 'attachment; filename="conformidade-2026-07.pdf"' } });

    expect(resp?.body).toBeInstanceOf(Blob);
    expect(resp?.headers.get('Content-Disposition')).toBe('attachment; filename="conformidade-2026-07.pdf"');
  });
});
