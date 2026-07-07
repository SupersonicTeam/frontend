import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TributarioPage } from './tributario';
import { Apuracao, CreditoSaldo } from '@models/tributario.model';
import { ToastService } from '@core/services/toast.service';

function buildApuracao(o: Partial<Apuracao> = {}): Apuracao {
  return {
    periodo: '2026-07',
    status: 'FECHADO',
    debitoIbs: 150,
    debitoCbs: 1350,
    creditoIbs: 30,
    creditoCbs: 270,
    saldoIbs: 120,
    saldoCbs: 1080,
    totalNotas: 8,
    dataFechamento: '2026-08-01T03:00:00-03:00',
    ...o,
  };
}

function buildCreditos(o: Partial<CreditoSaldo> = {}): CreditoSaldo {
  return { periodo: '2026-07', creditoIbs: 12.5, creditoCbs: 112.5, creditoTotal: 125, quantidadeNotas: 3, ...o };
}

describe('TributarioPage', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TributarioPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function flushApuracao(o: Partial<Apuracao> = {}) {
    httpMock.expectOne(r => r.url === '/apuracao').flush(buildApuracao(o));
  }
  function flushCreditos(o: Partial<CreditoSaldo> = {}) {
    httpMock.expectOne(r => r.url === '/creditos').flush(buildCreditos(o));
  }

  it('TRIB-01/02: ngOnInit busca apuração e créditos do período corrente e popula os signals', () => {
    const f = TestBed.createComponent(TributarioPage);
    const cmp = f.componentInstance;
    f.detectChanges();

    const reqA = httpMock.expectOne(r => r.url === '/apuracao');
    expect(reqA.request.params.get('periodo')).toBe(cmp.periodo());
    reqA.flush(buildApuracao());
    const reqC = httpMock.expectOne(r => r.url === '/creditos');
    expect(reqC.request.params.get('periodo')).toBe(cmp.periodo());
    reqC.flush(buildCreditos());

    expect(cmp.apuracao()?.saldoIbs).toBe(120);
    expect(cmp.creditos()?.creditoTotal).toBe(125);
  });

  it('TRIB-03: trocar o mês refaz os fetches com o novo periodo YYYY-MM', () => {
    const f = TestBed.createComponent(TributarioPage);
    const cmp = f.componentInstance;
    f.detectChanges();
    flushApuracao();
    flushCreditos();

    cmp.mudarMes(3);
    const reqA = httpMock.expectOne(r => r.url === '/apuracao');
    expect(reqA.request.params.get('periodo')).toBe(`${cmp.ano()}-03`);
    reqA.flush(buildApuracao({ periodo: `${cmp.ano()}-03` }));
    httpMock.expectOne(r => r.url === '/creditos').flush(buildCreditos());
  });

  it('TRIB-06: créditos zerados (sem notas de entrada) → estado zerado, não erro', () => {
    const f = TestBed.createComponent(TributarioPage);
    const cmp = f.componentInstance;
    f.detectChanges();
    flushApuracao();
    flushCreditos({ creditoIbs: 0, creditoCbs: 0, creditoTotal: 0, quantidadeNotas: 0 });

    expect(cmp.erroCreditos()).toBe(false);
    expect(cmp.creditos()?.creditoTotal).toBe(0);
    expect(cmp.creditos()?.quantidadeNotas).toBe(0);
  });

  it('edge: apuração ABERTO com dataFechamento null (projeção ao vivo) não é tratada como erro', () => {
    const f = TestBed.createComponent(TributarioPage);
    const cmp = f.componentInstance;
    f.detectChanges();
    httpMock.expectOne(r => r.url === '/apuracao').flush(buildApuracao({ status: 'ABERTO', dataFechamento: null }));
    flushCreditos();

    expect(cmp.erroApuracao()).toBe(false);
    expect(cmp.apuracao()?.status).toBe('ABERTO');
    expect(cmp.statusApuracao()?.label).toBe('Aberto');
  });

  it('TRIB-09: falha da apuração não esconde os créditos (fetches independentes)', () => {
    const f = TestBed.createComponent(TributarioPage);
    const cmp = f.componentInstance;
    f.detectChanges();
    httpMock.expectOne(r => r.url === '/apuracao').flush('erro', { status: 500, statusText: 'Server Error' });
    httpMock.expectOne(r => r.url === '/creditos').flush(buildCreditos());

    expect(cmp.erroApuracao()).toBe(true);
    expect(cmp.apuracao()).toBeNull();
    expect(cmp.erroCreditos()).toBe(false);
    expect(cmp.creditos()?.creditoTotal).toBe(125);
  });

  it('TRIB-04: podeReabrir só quando status FECHADO', () => {
    const f = TestBed.createComponent(TributarioPage);
    const cmp = f.componentInstance;
    f.detectChanges();
    flushApuracao({ status: 'ABERTO', dataFechamento: null });
    flushCreditos();
    expect(cmp.podeReabrir()).toBe(false);

    cmp.apuracao.set(buildApuracao({ status: 'FECHADO' }));
    expect(cmp.podeReabrir()).toBe(true);
  });

  it('TRIB-05: reabrir ramifica 409 APURACAO_NAO_REABRIVEL vs 422 REABERTURA_FORA_PRAZO por code', () => {
    const f = TestBed.createComponent(TributarioPage);
    const cmp = f.componentInstance;
    const toast = TestBed.inject(ToastService);
    f.detectChanges();
    flushApuracao();
    flushCreditos();

    // 409 → mensagem "não está fechada"
    cmp.reabrir('ap-1');
    httpMock.expectOne(r => r.url === '/apuracao/ap-1/reabrir').flush(
      { errors: [{ code: 'APURACAO_NAO_REABRIVEL', message: 'x' }] },
      { status: 409, statusText: 'Conflict' },
    );
    expect(toast.toasts().at(-1)?.message).toBe('A apuração não está fechada.');

    // 422 → mensagem "fora do prazo"
    cmp.reabrir('ap-1');
    httpMock.expectOne(r => r.url === '/apuracao/ap-1/reabrir').flush(
      { errors: [{ code: 'REABERTURA_FORA_PRAZO', message: 'x' }] },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    expect(toast.toasts().at(-1)?.message).toBe('Reabertura fora do prazo de 3 meses (RN005).');
  });
});
