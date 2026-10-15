import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  TestRequest,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ImpostosProdutor } from './impostos-produtor';
import { Apuracao, RelatorioConformidade } from '@models/tributario.model';
import { ToastService } from '@core/services/toast.service';
import { AssistenteStore } from '@shared/assistente/assistente.store';

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

function buildRelatorio(o: Partial<RelatorioConformidade> = {}): RelatorioConformidade {
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
    ...o,
  };
}

describe('ImpostosProdutor', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ImpostosProdutor],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
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
    const { atual, anterior: reqAnterior, resto } = apuracoesAbertas(periodoAtual());
    expect(atual).toBeTruthy();
    atual!.flush(buildApuracao({ periodo: periodoAtual(), ...o }));
    if (anterior === null) {
      reqAnterior?.flush('sem apuracao', { status: 404, statusText: 'Not Found' });
    } else {
      reqAnterior?.flush(buildApuracao({ periodo: periodoAnteriorStr(), ...anterior }));
    }
    // Os outros quatro meses da faixa não interessam a quem chamou.
    semDado(resto);
    flushGuias();
  }
  /**
   * As requisições de `/apuracao` que a tela dispara por carga: a do período na tela e as cinco
   * anteriores (faixa dos seis meses, de onde sai também a comparação com o mês passado).
   *
   * **Tem de ser uma chamada só.** `httpMock.match()` esvazia a fila: pegar uma e depois procurar
   * as outras devolve vazio, porque a primeira chamada já levou todas embora. Por isso `resto`
   * vem junto — quem não se importa com o histórico fecha essas com 404.
   */
  function apuracoesAbertas(periodo: string) {
    const reqs = httpMock.match((r) => r.url === '/apuracao');
    const de = (p: string) => reqs.find((r) => r.request.params.get('periodo') === p);
    const anteriorA = mesAtras(periodo, 1);
    return {
      atual: de(periodo),
      anterior: de(anteriorA),
      de,
      resto: reqs.filter((r) => {
        const p = r.request.params.get('periodo');
        return p !== periodo && p !== anteriorA;
      }),
    };
  }
  /** `AAAA-MM` de `n` meses antes de `periodo`. */
  function mesAtras(periodo: string, n: number) {
    const [ano, mes] = periodo.split('-').map(Number);
    const d = new Date(ano, mes - 1 - n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  /** Fecha sem dado os meses da faixa que o teste não examina. */
  function semDado(reqs: TestRequest[]) {
    reqs.forEach((r) => r.flush('sem apuracao', { status: 404, statusText: 'Not Found' }));
  }
  function flushGuias(lista: unknown[] = []) {
    httpMock.match((r) => r.url === '/contador/guias').forEach((r) => r.flush(lista));
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
  /**
   * O relatório sai **com o período que foi pedido**, como o backend faz. A tela descarta
   * resposta de outro mês (ver `doPeriodo`), então um fixture com período fixo sumiria da conta.
   */
  function flushRelatorio(o: Partial<RelatorioConformidade> = {}) {
    httpMock
      .expectOne((r) => r.url === '/relatorios/conformidade')
      .flush(buildRelatorio({ periodo: periodoAtual(), ...o }));
  }
  /** Consome os quatro fetches disparados por carregar()/ngOnInit. */
  function flushTodos() {
    flushApuracao();
    flushRelatorio();
  }

  it('TRIB-01/02: ngOnInit busca a apuração e o relatório do período corrente', () => {
    const f = TestBed.createComponent(ImpostosProdutor);
    const cmp = f.componentInstance;
    f.detectChanges();

    const { atual, anterior, resto } = apuracoesAbertas(cmp.periodo());
    expect(atual!.request.params.get('periodo')).toBe(cmp.periodo());
    atual!.flush(buildApuracao());
    anterior!.flush('sem apuracao', { status: 404, statusText: 'Not Found' });
    semDado(resto);
    flushGuias();
    const reqR = httpMock.expectOne((r) => r.url === '/relatorios/conformidade');
    expect(reqR.request.params.get('periodo')).toBe(cmp.periodo());
    reqR.flush(buildRelatorio({ periodo: cmp.periodo() }));

    expect(cmp.apuracao()?.saldoIbs).toBe(120);
    expect(cmp.relatorio()?.debitoTotal).toBe(100);
  });

  it('TRIB-03: trocar o mês refaz os fetches com o novo periodo YYYY-MM', () => {
    const f = TestBed.createComponent(ImpostosProdutor);
    const cmp = f.componentInstance;
    f.detectChanges();
    flushTodos();

    cmp.mudarMes(3);
    const { atual, anterior, resto } = apuracoesAbertas(`${cmp.ano()}-03`);
    expect(atual!.request.params.get('periodo')).toBe(`${cmp.ano()}-03`);
    atual!.flush(buildApuracao({ periodo: `${cmp.ano()}-03` }));
    // Fevereiro é o mês anterior a março: a comparação vem junto.
    expect(anterior!.request.params.get('periodo')).toBe(`${cmp.ano()}-02`);
    anterior!.flush('sem apuracao', { status: 404, statusText: 'Not Found' });
    semDado(resto);
    flushGuias();
    const reqR = httpMock.expectOne((r) => r.url === '/relatorios/conformidade');
    expect(reqR.request.params.get('periodo')).toBe(`${cmp.ano()}-03`);
    reqR.flush(buildRelatorio({ periodo: `${cmp.ano()}-03` }));
  });

  it('TRIB-06: sem notas de entrada, a conta mostra crédito zero — não some nem vira erro', () => {
    const f = TestBed.createComponent(ImpostosProdutor);
    const cmp = f.componentInstance;
    f.detectChanges();
    flushApuracao();
    flushRelatorio({ creditoIbs: 0, creditoCbs: 0, creditoTotal: 0, quantidadeEntradas: 0 });

    expect(cmp.erroRelatorio()).toBe(false);
    expect(cmp.conta()?.credito.total).toBe(0);
    expect(cmp.conta()?.entradas).toBe(0);
  });

  it('a tela não busca mais /creditos: é a mesma soma que já vem no relatório', () => {
    const f = TestBed.createComponent(ImpostosProdutor);
    f.detectChanges();
    flushApuracao();
    flushRelatorio();

    // `httpMock.verify()` no afterEach reprova qualquer requisição a mais; esta é explícita
    // para que a remoção do card de créditos não volte sem querer junto com a chamada.
    expect(httpMock.match((r) => r.url === '/creditos').length).toBe(0);
  });

  it('edge: apuração ABERTO com dataFechamento null (projeção ao vivo) não é tratada como erro', () => {
    const f = TestBed.createComponent(ImpostosProdutor);
    const cmp = f.componentInstance;
    f.detectChanges();
    flushApuracao({ status: 'ABERTO', dataFechamento: null });
    flushRelatorio();

    expect(cmp.erroApuracao()).toBe(false);
    expect(cmp.apuracao()?.status).toBe('ABERTO');
    expect(cmp.statusApuracao()?.label).toBe('Aberto');
  });

  it('TRIB-09: falha da apuração não esconde o relatório (fetches independentes)', () => {
    const f = TestBed.createComponent(ImpostosProdutor);
    const cmp = f.componentInstance;
    f.detectChanges();
    const { atual, anterior, resto } = apuracoesAbertas(cmp.periodo());
    atual!.flush('erro', { status: 500, statusText: 'Server Error' });
    anterior!.flush('sem apuracao', { status: 404, statusText: 'Not Found' });
    semDado(resto);
    flushGuias();
    flushRelatorio();

    expect(cmp.erroApuracao()).toBe(true);
    expect(cmp.apuracao()).toBeNull();
    expect(cmp.erroRelatorio()).toBe(false);
    expect(cmp.relatorio()?.debitoTotal).toBe(100);
    // E a conta continua de pé: ela se monta a partir do relatório.
    expect(cmp.conta()?.saldo).toBe(60);
  });

  it('TRIB-04: podeReabrir só quando status FECHADO', () => {
    const f = TestBed.createComponent(ImpostosProdutor);
    const cmp = f.componentInstance;
    f.detectChanges();
    flushApuracao({ status: 'ABERTO', dataFechamento: null });
    flushRelatorio();
    expect(cmp.podeReabrir()).toBe(false);

    cmp.apuracao.set(buildApuracao({ status: 'FECHADO' }));
    expect(cmp.podeReabrir()).toBe(true);
  });

  it('TRIB-05: reabrir ramifica 409 APURACAO_NAO_REABRIVEL vs 422 REABERTURA_FORA_PRAZO por code', () => {
    const f = TestBed.createComponent(ImpostosProdutor);
    const cmp = f.componentInstance;
    const toast = TestBed.inject(ToastService);
    f.detectChanges();
    flushTodos();

    cmp.reabrir('ap-1');
    httpMock
      .expectOne((r) => r.url === '/apuracao/ap-1/reabrir')
      .flush(
        { errors: [{ code: 'APURACAO_NAO_REABRIVEL', message: 'x' }] },
        { status: 409, statusText: 'Conflict' },
      );
    expect(toast.toasts().at(-1)?.message).toBe('A apuração não está fechada.');

    cmp.reabrir('ap-1');
    httpMock
      .expectOne((r) => r.url === '/apuracao/ap-1/reabrir')
      .flush(
        { errors: [{ code: 'REABERTURA_FORA_PRAZO', message: 'x' }] },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
    expect(toast.toasts().at(-1)?.message).toBe('Reabertura fora do prazo de 3 meses (RN005).');
  });

  it('TRIB-07: saldoAPagar negativo → saldoCredor true (valor não é alterado)', () => {
    const f = TestBed.createComponent(ImpostosProdutor);
    const cmp = f.componentInstance;
    f.detectChanges();
    flushApuracao();
    flushRelatorio({ saldoAPagar: -60 });

    expect(cmp.saldoCredor()).toBe(true);
    expect(cmp.relatorio()?.saldoAPagar).toBe(-60);
  });

  it('TRIB-08: baixarPdf lê o filename do Content-Disposition e salva o blob', () => {
    const f = TestBed.createComponent(ImpostosProdutor);
    const cmp = f.componentInstance;
    f.detectChanges();
    flushTodos();

    const salvos: string[] = [];
    const criarUrl = URL.createObjectURL;
    const revogar = URL.revokeObjectURL;
    URL.createObjectURL = () => 'blob:x';
    URL.revokeObjectURL = () => undefined;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      salvos.push(this.download);
    });

    cmp.baixarPdf();
    httpMock
      .expectOne((r) => r.url === '/relatorios/conformidade/pdf')
      .flush(new Blob(['%PDF-1.4'], { type: 'application/pdf' }), {
        headers: { 'Content-Disposition': 'attachment; filename="conformidade-2026-05.pdf"' },
      });

    expect(salvos).toContain('conformidade-2026-05.pdf');
    clickSpy.mockRestore();
    URL.createObjectURL = criarUrl;
    URL.revokeObjectURL = revogar;
  });

  it('TRIB-08: baixarPdf em erro-como-blob mostra a mensagem derivada do ApiError', async () => {
    const f = TestBed.createComponent(ImpostosProdutor);
    const cmp = f.componentInstance;
    const toast = TestBed.inject(ToastService);
    f.detectChanges();
    flushTodos();

    cmp.baixarPdf();
    const envelope = {
      status: 400,
      message: 'Período inválido',
      errors: [{ code: 'VALIDATION_ERROR', message: 'Período inválido' }],
    };
    httpMock
      .expectOne((r) => r.url === '/relatorios/conformidade/pdf')
      .flush(new Blob([JSON.stringify(envelope)], { type: 'application/json' }), {
        status: 400,
        statusText: 'Bad Request',
      });

    // apiErrorDeBlob é assíncrono (FileReader) — aguarda o toast aparecer (polling).
    await vi.waitFor(() => expect(toast.toasts().at(-1)?.message).toBe('Período inválido'));
    expect(cmp.baixandoPdf()).toBe(false);
  });

  it('mostra a data de fechamento em português, não o instante ISO da API', () => {
    const f = TestBed.createComponent(ImpostosProdutor);
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
    const f = TestBed.createComponent(ImpostosProdutor);
    f.detectChanges();
    flushTodos();
    f.detectChanges();

    const botoes = Array.from((f.nativeElement as HTMLElement).querySelectorAll('button'));
    expect(botoes.length).toBeGreaterThan(0);
    for (const b of botoes) {
      expect(b.className).toContain('tap-target');
    }
  });

  // ── O mês com saída: comparação e guias ───────────────────────────────────────────────

  it('compara com o mês anterior em dinheiro e em porcentagem', () => {
    const f = TestBed.createComponent(ImpostosProdutor);
    f.detectChanges();
    // Atual 1.200 (120+1080); anterior 600 (60+540) -> 600 a mais, +100%.
    flushApuracao({}, { saldoIbs: 60, saldoCbs: 540 });
    flushRelatorio();
    f.detectChanges();

    const texto = (f.nativeElement as HTMLElement).textContent?.replace(/\u00a0/g, ' ') ?? '';
    expect(texto).toContain('R$ 600,00 a mais');
    expect(texto).toContain('+100%');
  });

  it('sem apuração no mês anterior, não inventa comparação', () => {
    const f = TestBed.createComponent(ImpostosProdutor);
    const cmp = f.componentInstance;
    f.detectChanges();
    flushApuracao(); // anterior responde 404
    flushRelatorio();
    f.detectChanges();

    expect(cmp.variacao()).toBeNull();
    const texto = (f.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).not.toContain('a mais');
    expect(texto).not.toContain('a menos');
  });

  it('saindo de zero, mostra o valor mas não a porcentagem', () => {
    // De R$ 0,00 para R$ 1.200 não é "infinito por cento" — o percentual fica de fora.
    const f = TestBed.createComponent(ImpostosProdutor);
    const cmp = f.componentInstance;
    f.detectChanges();
    flushApuracao({}, { saldoIbs: 0, saldoCbs: 0 });
    flushRelatorio();

    expect(cmp.variacao()?.percentual).toBeNull();
    expect(cmp.variacao()?.diferenca).toBe(1200);
  });

  it('mostra só as guias do período escolhido, ordenadas por vencimento', () => {
    const f = TestBed.createComponent(ImpostosProdutor);
    const cmp = f.componentInstance;
    const periodo = cmp.periodo();
    f.detectChanges();

    const { atual, anterior } = apuracoesAbertas(periodo);
    atual!.flush(buildApuracao({ periodo }));
    anterior!.flush('sem apuracao', { status: 404, statusText: 'Not Found' });
    flushGuias([
      {
        id: 'g1',
        produtorId: 'p1',
        tipoGuia: 'ICMS',
        dataVencimento: `${periodo}-20`,
        valor: 300,
        status: 'PENDENTE',
        createdAt: '2026-09-01T00:00:00Z',
      },
      {
        id: 'g2',
        produtorId: 'p1',
        tipoGuia: 'GPS',
        dataVencimento: `${periodo}-05`,
        valor: 100,
        status: 'PAGA',
        createdAt: '2026-09-01T00:00:00Z',
      },
      {
        id: 'fora',
        produtorId: 'p1',
        tipoGuia: 'DARF',
        dataVencimento: '2020-01-10',
        valor: 999,
        status: 'PENDENTE',
        createdAt: '2020-01-01T00:00:00Z',
      },
    ]);
    flushRelatorio();

    // A de outro mês fica de fora; as do mês saem da mais próxima para a mais distante.
    expect(cmp.guiasDoPeriodo().map((g) => g.id)).toEqual(['g2', 'g1']);
  });

  it('sem guia no período, diz que a apuração ainda não virou cobrança', () => {
    const f = TestBed.createComponent(ImpostosProdutor);
    f.detectChanges();
    flushApuracao();
    flushRelatorio();
    f.detectChanges();

    expect((f.nativeElement as HTMLElement).textContent).toContain(
      'Nenhuma guia lançada para este período',
    );
  });

  it('a conta mostra as duas parcelas com quantas notas cada uma tem', () => {
    const f = TestBed.createComponent(ImpostosProdutor);
    const cmp = f.componentInstance;
    f.detectChanges();
    flushApuracao();
    flushRelatorio();
    f.detectChanges();

    const c = cmp.conta()!;
    expect(c.debito.total).toBe(100);
    expect(c.saidas).toBe(5);
    expect(c.credito.total).toBe(40);
    expect(c.entradas).toBe(2);
    expect(c.saldo).toBe(60);

    const texto = (f.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Saídas autorizadas');
    expect(texto).toContain('5 notas');
    expect(texto).toContain('Entradas com crédito');
    expect(texto).toContain('2 notas');
  });

  it('sem o relatório, a conta se monta pela apuração — perde a contagem, não a conta', () => {
    const f = TestBed.createComponent(ImpostosProdutor);
    const cmp = f.componentInstance;
    f.detectChanges();
    flushApuracao();
    httpMock
      .expectOne((r) => r.url === '/relatorios/conformidade')
      .flush('erro', { status: 500, statusText: 'Server Error' });
    f.detectChanges();

    const c = cmp.conta()!;
    expect(c.debito.total).toBe(1500);
    expect(c.credito.total).toBe(300);
    expect(c.saldo).toBe(1200);
    // Quantas notas de cada lado só o relatório sabe: sem ele, a tela não chuta um número.
    expect(c.saidas).toBeNull();
    expect(c.entradas).toBeNull();
    const texto = ((f.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');
    expect(texto).toContain('Saídas autorizadas');
    expect(texto).not.toMatch(/Saídas autorizadas ·/);
    expect(texto).not.toMatch(/Entradas com crédito ·/);
  });

  it('apuração fechada que não bate com a conta de hoje avisa, em vez de escolher um número', () => {
    const f = TestBed.createComponent(ImpostosProdutor);
    const cmp = f.componentInstance;
    f.detectChanges();
    // Fechada em 1200; o relatório soma as notas de agora e dá 60: alguma nota mudou depois.
    flushApuracao({ status: 'FECHADO' });
    flushRelatorio();
    f.detectChanges();

    expect(cmp.contaDivergeDaApuracao()).toBe(true);
    expect((f.nativeElement as HTMLElement).textContent).toContain('alguma nota do mês mudou');
  });

  it('ao trocar de mês, a conta não mistura o débito de um com o saldo do outro', () => {
    const f = TestBed.createComponent(ImpostosProdutor);
    const cmp = f.componentInstance;
    f.detectChanges();
    flushTodos();
    expect(cmp.conta()?.saldo).toBe(60);

    cmp.mudarMes(3);
    const alvo = `${cmp.ano()}-03`;
    const { atual, anterior, resto } = apuracoesAbertas(alvo);
    atual!.flush(buildApuracao({ periodo: alvo }));
    anterior!.flush('sem apuracao', { status: 404, statusText: 'Not Found' });
    semDado(resto);
    flushGuias();

    // O relatório de março ainda está no ar: a conta cai para a apuração de março em vez de
    // repetir o saldo do mês anterior — e não acusa divergência por causa disso.
    expect(cmp.conta()?.saldo).toBe(1200);
    expect(cmp.contaDivergeDaApuracao()).toBe(false);

    httpMock
      .expectOne((r) => r.url === '/relatorios/conformidade')
      .flush(buildRelatorio({ periodo: alvo }));
  });

  it('relatório que chega de outro mês (resposta fora de ordem) é descartado', () => {
    const f = TestBed.createComponent(ImpostosProdutor);
    const cmp = f.componentInstance;
    f.detectChanges();
    flushTodos();

    cmp.mudarMes(3);
    const alvo = `${cmp.ano()}-03`;
    const { atual, anterior, resto } = apuracoesAbertas(alvo);
    atual!.flush(buildApuracao({ periodo: alvo }));
    anterior!.flush('sem apuracao', { status: 404, statusText: 'Not Found' });
    semDado(resto);
    flushGuias();
    // Chega atrasada a resposta de fevereiro, com outro saldo.
    httpMock
      .expectOne((r) => r.url === '/relatorios/conformidade')
      .flush(buildRelatorio({ periodo: `${cmp.ano()}-02`, saldoAPagar: 999 }));

    expect(cmp.conta()?.saldo).toBe(1200);
  });

  it('quando os dois batem, não há aviso de divergência', () => {
    const f = TestBed.createComponent(ImpostosProdutor);
    const cmp = f.componentInstance;
    f.detectChanges();
    flushApuracao({ saldoIbs: 6, saldoCbs: 54 });
    flushRelatorio();
    f.detectChanges();

    expect(cmp.contaDivergeDaApuracao()).toBe(false);
    expect((f.nativeElement as HTMLElement).textContent).not.toContain('alguma nota do mês mudou');
  });

  it('o botão da Ceres manda a pergunta já com o período da tela, por extenso', () => {
    const f = TestBed.createComponent(ImpostosProdutor);
    const cmp = f.componentInstance;
    f.detectChanges();
    flushTodos();

    const store = TestBed.inject(AssistenteStore);
    const perguntas: string[] = [];
    vi.spyOn(store, 'abrirPerguntando').mockImplementation((p) => void perguntas.push(p));

    cmp.perguntarACeres();

    expect(perguntas).toHaveLength(1);
    expect(perguntas[0]).toContain('Como foi calculada a minha apuração de');
    // Nada de "2026-07" na cara do produtor.
    expect(perguntas[0]).not.toMatch(/\d{4}-\d{2}/);
  });

  it('a faixa cobre seis meses, do mais antigo ao da tela, e marca qual é o da tela', () => {
    const f = TestBed.createComponent(ImpostosProdutor);
    const cmp = f.componentInstance;
    const periodo = cmp.periodo();
    f.detectChanges();

    const { atual, de, resto } = apuracoesAbertas(periodo);
    atual!.flush(buildApuracao({ periodo, saldoIbs: 10, saldoCbs: 90 }));
    de(mesAtras(periodo, 1))!.flush(
      buildApuracao({ periodo: mesAtras(periodo, 1), saldoIbs: 20, saldoCbs: 180 }),
    );
    semDado(resto.filter((r) => r.request.params.get('periodo') !== mesAtras(periodo, 1)));
    flushGuias();
    flushRelatorio();
    f.detectChanges();

    const faixa = cmp.historico();
    expect(faixa).toHaveLength(6);
    expect(faixa.map((m) => m.periodo)).toEqual([
      mesAtras(periodo, 5),
      mesAtras(periodo, 4),
      mesAtras(periodo, 3),
      mesAtras(periodo, 2),
      mesAtras(periodo, 1),
      periodo,
    ]);
    expect(faixa.at(-1)).toMatchObject({ periodo, valor: 100, atual: true });
    expect(faixa.at(-2)).toMatchObject({ periodo: mesAtras(periodo, 1), valor: 200 });
    // A barra mais comprida é a do maior valor; a outra sai proporcional.
    expect(cmp.maiorDoHistorico()).toBe(200);
    expect(cmp.larguraDaBarra(100)).toBe(50);
  });

  it('mês sem resposta é lacuna na faixa, não um mês de imposto zero', () => {
    const f = TestBed.createComponent(ImpostosProdutor);
    const cmp = f.componentInstance;
    const periodo = cmp.periodo();
    f.detectChanges();
    flushApuracao({}, { saldoIbs: 20, saldoCbs: 180 });
    flushRelatorio();
    f.detectChanges();

    const semResposta = cmp.historico().filter((m) => m.valor === null);
    expect(semResposta).toHaveLength(4);
    expect(semResposta.map((m) => m.periodo)).toEqual([
      mesAtras(periodo, 5),
      mesAtras(periodo, 4),
      mesAtras(periodo, 3),
      mesAtras(periodo, 2),
    ]);
    // Zero teria virado barra; lacuna vira texto.
    expect((f.nativeElement as HTMLElement).textContent).toContain('sem resposta do servidor');
    expect(cmp.larguraDaBarra(null)).toBe(0);
  });

  it('clicar num mês da faixa leva a tela para aquele mês', () => {
    const f = TestBed.createComponent(ImpostosProdutor);
    const cmp = f.componentInstance;
    f.detectChanges();
    flushTodos();

    cmp.mudarParaPeriodo('2025-02');

    expect(cmp.ano()).toBe(2025);
    expect(cmp.mes()).toBe(2);
    expect(cmp.periodo()).toBe('2025-02');

    const { atual, anterior, resto } = apuracoesAbertas('2025-02');
    expect(atual).toBeTruthy();
    expect(anterior!.request.params.get('periodo')).toBe('2025-01');
    atual!.flush(buildApuracao({ periodo: '2025-02' }));
    anterior!.flush('sem apuracao', { status: 404, statusText: 'Not Found' });
    semDado(resto);
    flushGuias();
    httpMock
      .expectOne((r) => r.url === '/relatorios/conformidade')
      .flush(buildRelatorio({ periodo: '2025-02' }));
  });

  it('com um mês só respondendo, a faixa não aparece — não há o que comparar', () => {
    const f = TestBed.createComponent(ImpostosProdutor);
    const cmp = f.componentInstance;
    const periodo = cmp.periodo();
    f.detectChanges();

    const { atual, resto } = apuracoesAbertas(periodo);
    atual!.flush(buildApuracao({ periodo }));
    semDado(resto);
    flushGuias();
    flushRelatorio();
    f.detectChanges();

    expect(cmp.temHistorico()).toBe(false);
    expect((f.nativeElement as HTMLElement).textContent).not.toContain('Como vem sendo');
  });

  it('data só com dia não anda um dia para trás por causa do fuso', () => {
    // `new Date('2026-09-10')` é meia-noite em UTC; em Brasília (UTC−3) vira 09/09. A guia
    // aparecia vencendo um dia antes do que o backend informou.
    const f = TestBed.createComponent(ImpostosProdutor);
    const cmp = f.componentInstance;
    f.detectChanges();
    flushTodos();

    expect(cmp.formatDate('2026-09-10')).toBe('10/09/2026');
    expect(cmp.formatDate('2026-01-01')).toBe('01/01/2026');
    // Instante completo continua formatado como antes.
    expect(cmp.formatDate('2026-08-01T03:00:00-03:00')).toBe('01/08/2026');
  });
});
