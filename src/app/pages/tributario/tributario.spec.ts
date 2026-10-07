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

  /**
   * A tela busca **duas** apurações: a do período escolhido e a do mês anterior, para a
   * comparação. Casar por URL só não basta — os helpers separam pelo parâmetro `periodo`.
   */
  /**
   * Carrega a apuração do período corrente e, junto, o contexto que a tela sempre busca: a
   * apuração do mês anterior (comparação) e as guias. A maioria dos testes não examina esses dois.
   *
   * @param anterior dados do mês anterior, ou `null` para "não há com o que comparar" (404)
   */
  function flushApuracao(o: Partial<Apuracao> = {}, anterior: Partial<Apuracao> | null = null) {
    const { atual, anterior: reqAnterior } = apuracoesAbertas(periodoAtual());
    expect(atual).toBeTruthy();
    atual!.flush(buildApuracao({ periodo: periodoAtual(), ...o }));
    if (anterior === null) {
      reqAnterior?.flush('sem apuracao', { status: 404, statusText: 'Not Found' });
    } else {
      reqAnterior?.flush(buildApuracao({ periodo: periodoAnteriorStr(), ...anterior }));
    }
    flushGuias();
  }
  /**
   * As duas requisições de `/apuracao` que a tela dispara por carga: a do período na tela e a do
   * mês anterior (comparação).
   *
   * **Tem de ser uma chamada só.** `httpMock.match()` esvazia a fila: pegar uma e depois procurar
   * a outra devolve vazio, porque a primeira chamada já levou as duas embora.
   */
  function apuracoesAbertas(periodo: string) {
    const reqs = httpMock.match(r => r.url === '/apuracao');
    return {
      atual: reqs.find(r => r.request.params.get('periodo') === periodo),
      anterior: reqs.find(r => r.request.params.get('periodo') !== periodo),
    };
  }
  function flushGuias(lista: unknown[] = []) {
    httpMock.match(r => r.url === '/contador/guias').forEach(r => r.flush(lista));
  }
  /** `AAAA-MM` do mês corrente e do anterior, como a tela os calcula. */
  function periodoAtual() {
    const h = new Date();
    return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}`;
  }
  function periodoAnteriorStr() {
    const h = new Date();
    const d = new Date(h.getFullYear(), h.getMonth() - 1, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  function flushCreditos(o: Partial<CreditoSaldo> = {}) {
    httpMock.expectOne(r => r.url === '/creditos').flush(buildCreditos(o));
  }
  function flushRelatorio(o: Partial<RelatorioConformidade> = {}) {
    httpMock.expectOne(r => r.url === '/relatorios/conformidade').flush(buildRelatorio(o));
  }
  /** Consome os cinco fetches disparados por carregar()/ngOnInit. */
  function flushTodos() {
    flushApuracao();
    flushCreditos();
    flushRelatorio();
  }

  it('TRIB-01/02: ngOnInit busca apuração, créditos e relatório do período corrente', () => {
    const f = TestBed.createComponent(TributarioPage);
    const cmp = f.componentInstance;
    f.detectChanges();

    const { atual, anterior } = apuracoesAbertas(cmp.periodo());
    expect(atual!.request.params.get('periodo')).toBe(cmp.periodo());
    atual!.flush(buildApuracao());
    anterior!.flush('sem apuracao', { status: 404, statusText: 'Not Found' });
    flushGuias();
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
    const { atual, anterior } = apuracoesAbertas(`${cmp.ano()}-03`);
    expect(atual!.request.params.get('periodo')).toBe(`${cmp.ano()}-03`);
    atual!.flush(buildApuracao({ periodo: `${cmp.ano()}-03` }));
    // Fevereiro é o mês anterior a março: a comparação vem junto.
    expect(anterior!.request.params.get('periodo')).toBe(`${cmp.ano()}-02`);
    anterior!.flush('sem apuracao', { status: 404, statusText: 'Not Found' });
    flushCreditos();
    flushGuias();
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
    flushApuracao({ status: 'ABERTO', dataFechamento: null });
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
    const { atual, anterior } = apuracoesAbertas(cmp.periodo());
    atual!.flush('erro', { status: 500, statusText: 'Server Error' });
    anterior!.flush('sem apuracao', { status: 404, statusText: 'Not Found' });
    flushGuias();
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

  // ── O mês com saída: comparação e guias ───────────────────────────────────────────────

  it('compara com o mês anterior em dinheiro e em porcentagem', () => {
    const f = TestBed.createComponent(TributarioPage);
    f.detectChanges();
    // Atual 1.200 (120+1080); anterior 600 (60+540) -> 600 a mais, +100%.
    flushApuracao({}, { saldoIbs: 60, saldoCbs: 540 });
    flushCreditos();
    flushRelatorio();
    f.detectChanges();

    const texto = (f.nativeElement as HTMLElement).textContent?.replace(/\u00a0/g, ' ') ?? '';
    expect(texto).toContain('R$ 600,00 a mais');
    expect(texto).toContain('+100%');
  });

  it('sem apuração no mês anterior, não inventa comparação', () => {
    const f = TestBed.createComponent(TributarioPage);
    const cmp = f.componentInstance;
    f.detectChanges();
    flushApuracao(); // anterior responde 404
    flushCreditos();
    flushRelatorio();
    f.detectChanges();

    expect(cmp.variacao()).toBeNull();
    const texto = (f.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).not.toContain('a mais');
    expect(texto).not.toContain('a menos');
  });

  it('saindo de zero, mostra o valor mas não a porcentagem', () => {
    // De R$ 0,00 para R$ 1.200 não é "infinito por cento" — o percentual fica de fora.
    const f = TestBed.createComponent(TributarioPage);
    const cmp = f.componentInstance;
    f.detectChanges();
    flushApuracao({}, { saldoIbs: 0, saldoCbs: 0 });
    flushCreditos();
    flushRelatorio();

    expect(cmp.variacao()?.percentual).toBeNull();
    expect(cmp.variacao()?.diferenca).toBe(1200);
  });

  it('mostra só as guias do período escolhido, ordenadas por vencimento', () => {
    const f = TestBed.createComponent(TributarioPage);
    const cmp = f.componentInstance;
    const periodo = cmp.periodo();
    f.detectChanges();

    const { atual, anterior } = apuracoesAbertas(periodo);
    atual!.flush(buildApuracao({ periodo }));
    anterior!.flush('sem apuracao', { status: 404, statusText: 'Not Found' });
    flushGuias([
      { id: 'g1', produtorId: 'p1', tipoGuia: 'ICMS', dataVencimento: `${periodo}-20`, valor: 300, status: 'PENDENTE', createdAt: '2026-09-01T00:00:00Z' },
      { id: 'g2', produtorId: 'p1', tipoGuia: 'GPS', dataVencimento: `${periodo}-05`, valor: 100, status: 'PAGA', createdAt: '2026-09-01T00:00:00Z' },
      { id: 'fora', produtorId: 'p1', tipoGuia: 'DARF', dataVencimento: '2020-01-10', valor: 999, status: 'PENDENTE', createdAt: '2020-01-01T00:00:00Z' },
    ]);
    flushCreditos();
    flushRelatorio();

    // A de outro mês fica de fora; as do mês saem da mais próxima para a mais distante.
    expect(cmp.guiasDoPeriodo().map((g) => g.id)).toEqual(['g2', 'g1']);
  });

  it('sem guia no período, diz que a apuração ainda não virou cobrança', () => {
    const f = TestBed.createComponent(TributarioPage);
    f.detectChanges();
    flushApuracao();
    flushCreditos();
    flushRelatorio();
    f.detectChanges();

    expect((f.nativeElement as HTMLElement).textContent).toContain(
      'Nenhuma guia lançada para este período',
    );
  });

  it('data só com dia não anda um dia para trás por causa do fuso', () => {
    // `new Date('2026-09-10')` é meia-noite em UTC; em Brasília (UTC−3) vira 09/09. A guia
    // aparecia vencendo um dia antes do que o backend informou.
    const f = TestBed.createComponent(TributarioPage);
    const cmp = f.componentInstance;
    f.detectChanges();
    flushTodos();

    expect(cmp.formatDate('2026-09-10')).toBe('10/09/2026');
    expect(cmp.formatDate('2026-01-01')).toBe('01/01/2026');
    // Instante completo continua formatado como antes.
    expect(cmp.formatDate('2026-08-01T03:00:00-03:00')).toBe('01/08/2026');
  });
});
