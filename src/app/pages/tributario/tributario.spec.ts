import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TributarioPage } from './tributario';
import { Apuracao, CreditoSaldo, RelatorioConformidade } from '@models/tributario.model';
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

function buildRelatorio(o: Partial<RelatorioConformidade> = {}): RelatorioConformidade {
  return {
    periodo: '2026-07',
    debitoIbs: 10, debitoCbs: 90, debitoTotal: 100, quantidadeSaidas: 5,
    creditoIbs: 4, creditoCbs: 36, creditoTotal: 40, quantidadeEntradas: 2,
    saldoIbs: 6, saldoCbs: 54, saldoAPagar: 60,
    ...o,
  };
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
  function flushRelatorio(o: Partial<RelatorioConformidade> = {}) {
    httpMock.expectOne(r => r.url === '/relatorios/conformidade').flush(buildRelatorio(o));
  }
  /** Consome os 3 fetches disparados por carregar()/ngOnInit. */
  function flushTodos() {
    flushApuracao();
    flushCreditos();
    flushRelatorio();
  }

  it('TRIB-01/02: ngOnInit busca apuração, créditos e relatório do período corrente', () => {
    const f = TestBed.createComponent(TributarioPage);
    const cmp = f.componentInstance;
    f.detectChanges();

    const reqA = httpMock.expectOne(r => r.url === '/apuracao');
    expect(reqA.request.params.get('periodo')).toBe(cmp.periodo());
    reqA.flush(buildApuracao());
    flushCreditos();
    const reqR = httpMock.expectOne(r => r.url === '/relatorios/conformidade');
    expect(reqR.request.params.get('periodo')).toBe(cmp.periodo());
    reqR.flush(buildRelatorio());

    expect(cmp.apuracao()?.saldoIbs).toBe(120);
    expect(cmp.creditos()?.creditoTotal).toBe(125);
    expect(cmp.relatorio()?.debitoTotal).toBe(100);
  });

  it('TRIB-03: trocar o mês refaz os 3 fetches com o novo periodo YYYY-MM', () => {
    const f = TestBed.createComponent(TributarioPage);
    const cmp = f.componentInstance;
    f.detectChanges();
    flushTodos();

    cmp.mudarMes(3);
    const reqA = httpMock.expectOne(r => r.url === '/apuracao');
    expect(reqA.request.params.get('periodo')).toBe(`${cmp.ano()}-03`);
    reqA.flush(buildApuracao({ periodo: `${cmp.ano()}-03` }));
    flushCreditos();
    const reqR = httpMock.expectOne(r => r.url === '/relatorios/conformidade');
    expect(reqR.request.params.get('periodo')).toBe(`${cmp.ano()}-03`);
    reqR.flush(buildRelatorio());
  });

  it('TRIB-06: créditos zerados (sem notas de entrada) → estado zerado, não erro', () => {
    const f = TestBed.createComponent(TributarioPage);
    const cmp = f.componentInstance;
    f.detectChanges();
    flushApuracao();
    flushCreditos({ creditoIbs: 0, creditoCbs: 0, creditoTotal: 0, quantidadeNotas: 0 });
    flushRelatorio();

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
    flushRelatorio();

    expect(cmp.erroApuracao()).toBe(false);
    expect(cmp.apuracao()?.status).toBe('ABERTO');
    expect(cmp.statusApuracao()?.label).toBe('Aberto');
  });

  it('TRIB-09: falha da apuração não esconde créditos nem relatório (fetches independentes)', () => {
    const f = TestBed.createComponent(TributarioPage);
    const cmp = f.componentInstance;
    f.detectChanges();
    httpMock.expectOne(r => r.url === '/apuracao').flush('erro', { status: 500, statusText: 'Server Error' });
    flushCreditos();
    flushRelatorio();

    expect(cmp.erroApuracao()).toBe(true);
    expect(cmp.apuracao()).toBeNull();
    expect(cmp.erroCreditos()).toBe(false);
    expect(cmp.creditos()?.creditoTotal).toBe(125);
    expect(cmp.erroRelatorio()).toBe(false);
    expect(cmp.relatorio()?.debitoTotal).toBe(100);
  });

  it('TRIB-04: podeReabrir só quando status FECHADO', () => {
    const f = TestBed.createComponent(TributarioPage);
    const cmp = f.componentInstance;
    f.detectChanges();
    flushApuracao({ status: 'ABERTO', dataFechamento: null });
    flushCreditos();
    flushRelatorio();
    expect(cmp.podeReabrir()).toBe(false);

    cmp.apuracao.set(buildApuracao({ status: 'FECHADO' }));
    expect(cmp.podeReabrir()).toBe(true);
  });

  it('TRIB-05: reabrir ramifica 409 APURACAO_NAO_REABRIVEL vs 422 REABERTURA_FORA_PRAZO por code', () => {
    const f = TestBed.createComponent(TributarioPage);
    const cmp = f.componentInstance;
    const toast = TestBed.inject(ToastService);
    f.detectChanges();
    flushTodos();

    cmp.reabrir('ap-1');
    httpMock.expectOne(r => r.url === '/apuracao/ap-1/reabrir').flush(
      { errors: [{ code: 'APURACAO_NAO_REABRIVEL', message: 'x' }] },
      { status: 409, statusText: 'Conflict' },
    );
    expect(toast.toasts().at(-1)?.message).toBe('A apuração não está fechada.');

    cmp.reabrir('ap-1');
    httpMock.expectOne(r => r.url === '/apuracao/ap-1/reabrir').flush(
      { errors: [{ code: 'REABERTURA_FORA_PRAZO', message: 'x' }] },
      { status: 422, statusText: 'Unprocessable Entity' },
    );
    expect(toast.toasts().at(-1)?.message).toBe('Reabertura fora do prazo de 3 meses (RN005).');
  });

  it('TRIB-07: saldoAPagar negativo → saldoCredor true (valor não é alterado)', () => {
    const f = TestBed.createComponent(TributarioPage);
    const cmp = f.componentInstance;
    f.detectChanges();
    flushApuracao();
    flushCreditos();
    flushRelatorio({ saldoAPagar: -60 });

    expect(cmp.saldoCredor()).toBe(true);
    expect(cmp.relatorio()?.saldoAPagar).toBe(-60);
  });

  it('TRIB-08: baixarPdf lê o filename do Content-Disposition e salva o blob', () => {
    const f = TestBed.createComponent(TributarioPage);
    const cmp = f.componentInstance;
    f.detectChanges();
    flushTodos();

    const salvos: string[] = [];
    const criarUrl = URL.createObjectURL;
    const revogar = URL.revokeObjectURL;
    URL.createObjectURL = () => 'blob:x';
    URL.revokeObjectURL = () => undefined;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      salvos.push(this.download);
    });

    cmp.baixarPdf();
    httpMock.expectOne(r => r.url === '/relatorios/conformidade/pdf').flush(
      new Blob(['%PDF-1.4'], { type: 'application/pdf' }),
      { headers: { 'Content-Disposition': 'attachment; filename="conformidade-2026-05.pdf"' } },
    );

    expect(salvos).toContain('conformidade-2026-05.pdf');
    clickSpy.mockRestore();
    URL.createObjectURL = criarUrl;
    URL.revokeObjectURL = revogar;
  });

  it('TRIB-08: baixarPdf em erro-como-blob mostra a mensagem derivada do ApiError', async () => {
    const f = TestBed.createComponent(TributarioPage);
    const cmp = f.componentInstance;
    const toast = TestBed.inject(ToastService);
    f.detectChanges();
    flushTodos();

    cmp.baixarPdf();
    const envelope = { status: 400, message: 'Período inválido', errors: [{ code: 'VALIDATION_ERROR', message: 'Período inválido' }] };
    httpMock.expectOne(r => r.url === '/relatorios/conformidade/pdf').flush(
      new Blob([JSON.stringify(envelope)], { type: 'application/json' }),
      { status: 400, statusText: 'Bad Request' },
    );

    // apiErrorDeBlob é assíncrono (FileReader) — aguarda o toast aparecer (polling).
    await vi.waitFor(() => expect(toast.toasts().at(-1)?.message).toBe('Período inválido'));
    expect(cmp.baixandoPdf()).toBe(false);
  });

  it('mostra a data de fechamento em português, não o instante ISO da API', () => {
    const f = TestBed.createComponent(TributarioPage);
    f.detectChanges();
    flushTodos();
    f.detectChanges();

    const texto = (f.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('01/08/2026');
    expect(texto).not.toContain('2026-08-01T03:00:00');
  });

  it('todo botão da tela respeita o alvo mínimo de 44×44 (WCAG 2.5.5)', () => {
    // Os botões eram `py-1.5` (~30px de altura). O `ui-button` é quem garante o piso de 44px e
    // o rótulo de 14px — por isso a tela usa ele em vez de `<button>` com classe à mão.
    const f = TestBed.createComponent(TributarioPage);
    f.detectChanges();
    flushTodos();
    f.detectChanges();

    const botoes = Array.from(
      (f.nativeElement as HTMLElement).querySelectorAll('button'),
    );
    expect(botoes.length).toBeGreaterThan(0);
    for (const b of botoes) {
      expect(b.className).toContain('tap-target');
    }
  });
});
