import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ContadorPage } from './contador';
import type { GuiaFiscal } from '@models/solicitacao-contador.model';

/**
 * Cobertura da tela do contador **depois** da #50.
 *
 * O spec anterior exercitava solicitações, anexos e checklist — funcionalidades que
 * saíram da tela porque o backend não as tem (`/contador/pendencias` responde 404) e
 * só existiam à custa de dados de exemplo. Estes testes cobrem o que sobrou, que é
 * real: guias fiscais e as notas que exigem correção.
 */
describe('ContadorPage (#50)', () => {
  let httpMock: HttpTestingController;

  const guia = (over: Partial<GuiaFiscal> = {}): GuiaFiscal => ({
    id: 'g1',
    produtorId: 'p1',
    tipoGuia: 'ICMS',
    dataVencimento: '2026-09-20',
    valor: 1250.5,
    status: 'pendente',
    createdAt: '2026-09-01T10:00:00Z',
    ...over,
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ContadorPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  /** `AAAA-MM` do mês corrente, que é o período com que a tela abre. */
  function periodoAtual() {
    const h = new Date();
    return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}`;
  }

  const apuracaoVazia = (periodo = periodoAtual()) => ({
    periodo,
    status: 'ABERTO',
    debitoIbs: 0,
    debitoCbs: 0,
    creditoIbs: 0,
    creditoCbs: 0,
    saldoIbs: 0,
    saldoCbs: 0,
    totalNotas: 0,
    dataFechamento: null,
  });

  const relatorio = (over: Record<string, unknown> = {}) => ({
    periodo: periodoAtual(),
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
    ...over,
  });

  /** Drena as leituras do ngOnInit: guias, dashboard, notas, apuração e relatório. */
  function flushInit(
    guias: GuiaFiscal[] = [],
    notas: unknown[] = [],
    numeros: { apuracao?: unknown; relatorio?: unknown } = {},
  ) {
    httpMock.match((r) => r.url === '/contador/guias').forEach((r) => r.flush(guias));
    httpMock
      .match((r) => r.url === '/dashboard')
      .forEach((r) => r.flush({}, { status: 500, statusText: 'x' }));
    httpMock
      .match((r) => r.url === '/notas')
      .forEach((r) => r.flush({ content: notas, totalElements: notas.length }));
    httpMock
      .match((r) => r.url === '/apuracao')
      .forEach((r) => r.flush(numeros.apuracao ?? apuracaoVazia()));
    httpMock
      .match((r) => r.url === '/relatorios/conformidade')
      .forEach((r) => r.flush(numeros.relatorio ?? relatorio()));
  }

  /** `AAAA-MM-DD` dentro do período que está na tela. */
  function diaDoPeriodo(dia = '10') {
    return `${periodoAtual()}-${dia}`;
  }

  it('abre perguntando se dá para fechar o mês, e diz que sim quando nada impede', () => {
    const fixture = TestBed.createComponent(ContadorPage);
    fixture.detectChanges();
    flushInit();
    fixture.detectChanges();

    const cmp = fixture.componentInstance;
    expect(cmp.podeFechar()).toBe(true);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Nada impede fechar');
  });

  it('nota com inconsistência de outro mês não impede fechar este', () => {
    // Ela nunca foi autorizada, então nunca entrou na apuração de mês nenhum: o impedimento é
    // do mês dela. Antes a tela listava todas juntas, sem período.
    const fixture = TestBed.createComponent(ContadorPage);
    fixture.detectChanges();
    flushInit(
      [],
      [
        { id: 'n-deste', numero: 7, status: 'COM_INCONSISTENCIAS', dataEmissao: diaDoPeriodo() },
        { id: 'n-de-outro', numero: 2, status: 'COM_INCONSISTENCIAS', dataEmissao: '2020-06-10' },
      ],
    );
    fixture.detectChanges();

    const cmp = fixture.componentInstance;
    expect(cmp.notasComProblema().map((n) => n.id)).toEqual(['n-deste', 'n-de-outro']);
    expect(cmp.notasDoPeriodo().map((n) => n.id)).toEqual(['n-deste']);
    expect(cmp.podeFechar()).toBe(false);
  });

  it('guia vencida de outro mês continua impedindo — ela não entra no filtro de período', () => {
    // Decisão de produto: atraso de agosto não some da tela porque o contador está olhando
    // outubro. Guia atrasada é problema dele hoje, não do mês em que venceu.
    const fixture = TestBed.createComponent(ContadorPage);
    fixture.detectChanges();
    flushInit([guia({ id: 'velha', status: 'vencido', dataVencimento: '2020-08-10', valor: 890 })]);
    fixture.detectChanges();

    const cmp = fixture.componentInstance;
    expect(cmp.guiasVencidas().map((g) => g.id)).toEqual(['velha']);
    expect(cmp.podeFechar()).toBe(false);
    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('1 guia vencida');
    expect(texto).toContain('de qualquer mês');
  });

  it('expandir a nota busca o que o fisco apontou, sem repetir a mesma checagem', () => {
    const fixture = TestBed.createComponent(ContadorPage);
    fixture.detectChanges();
    flushInit(
      [],
      [{ id: 'n7', numero: 7, status: 'COM_INCONSISTENCIAS', dataEmissao: diaDoPeriodo() }],
    );
    fixture.detectChanges();

    const cmp = fixture.componentInstance;
    cmp.alternarNota(cmp.notasDoPeriodo()[0]);

    // O endpoint devolve o histórico inteiro; só a última checagem vai para a tela.
    httpMock
      .expectOne((r) => r.url === '/notas/n7/validacoes')
      .flush([
        {
          loteValidacao: 'antigo',
          code: 'DEST_ENDERECO',
          field: 'destinatarioEndereco',
          message: 'versão velha',
          validadoEm: '2026-01-01T10:00:00Z',
        },
        {
          loteValidacao: 'novo',
          code: 'DEST_ENDERECO',
          field: 'destinatarioEndereco',
          message: 'Endereço do destinatário é obrigatório',
          validadoEm: '2026-02-01T10:00:00Z',
        },
      ]);
    fixture.detectChanges();

    expect(cmp.validacoes().map((v) => v.message)).toEqual([
      'Endereço do destinatário é obrigatório',
    ]);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Endereço do destinatário é obrigatório',
    );

    // Clicar de novo fecha, sem nova requisição.
    cmp.alternarNota(cmp.notasDoPeriodo()[0]);
    expect(cmp.notaExpandida()).toBeNull();
  });

  it('o relatório de conformidade aparece na tela, não só no PDF', () => {
    const fixture = TestBed.createComponent(ContadorPage);
    fixture.detectChanges();
    flushInit();
    fixture.detectChanges();

    const cmp = fixture.componentInstance;
    expect(cmp.conta()?.saldoAPagar).toBe(60);
    expect(cmp.saldoCredor()).toBe(false);

    const texto = ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');
    expect(texto).toContain('Débito das saídas');
    expect(texto).toContain('5 nota(s) autorizada(s)');
    expect(texto).toContain('Crédito das entradas');
    expect(texto).toContain('Saldo a pagar');
  });

  it('trocar de período refaz os números e não mistura um mês com o outro', () => {
    const fixture = TestBed.createComponent(ContadorPage);
    fixture.detectChanges();
    flushInit();
    const cmp = fixture.componentInstance;
    expect(cmp.conta()?.saldoAPagar).toBe(60);

    cmp.mudarMes(3);
    const alvo = `${cmp.ano()}-03`;
    expect(cmp.periodo()).toBe(alvo);
    // Enquanto as respostas não chegam, a tela não mostra o saldo do mês anterior.
    expect(cmp.conta()).toBeNull();

    const reqA = httpMock.expectOne((r) => r.url === '/apuracao');
    expect(reqA.request.params.get('periodo')).toBe(alvo);
    reqA.flush(apuracaoVazia(alvo));
    const reqR = httpMock.expectOne((r) => r.url === '/relatorios/conformidade');
    expect(reqR.request.params.get('periodo')).toBe(alvo);
    reqR.flush(relatorio({ periodo: alvo, saldoAPagar: 999 }));

    expect(cmp.conta()?.saldoAPagar).toBe(999);
  });

  it('resposta de outro período é descartada', () => {
    const fixture = TestBed.createComponent(ContadorPage);
    fixture.detectChanges();
    flushInit();

    const cmp = fixture.componentInstance;
    cmp.mudarMes(3);
    httpMock.expectOne((r) => r.url === '/apuracao').flush(apuracaoVazia(`${cmp.ano()}-03`));
    // Chega atrasada a resposta de fevereiro.
    httpMock
      .expectOne((r) => r.url === '/relatorios/conformidade')
      .flush(relatorio({ periodo: `${cmp.ano()}-02`, saldoAPagar: 999 }));

    expect(cmp.conta()).toBeNull();
  });

  it('o PDF segue o período escolhido, não o mês corrente', () => {
    const fixture = TestBed.createComponent(ContadorPage);
    fixture.detectChanges();
    flushInit();

    const cmp = fixture.componentInstance;
    cmp.mudarMes(3);
    const alvo = `${cmp.ano()}-03`;
    httpMock.expectOne((r) => r.url === '/apuracao').flush(apuracaoVazia(alvo));
    httpMock
      .expectOne((r) => r.url === '/relatorios/conformidade')
      .flush(relatorio({ periodo: alvo }));

    cmp.baixarRelatorio();
    const req = httpMock.expectOne((r) => r.url === '/relatorios/conformidade/pdf');
    expect(req.request.params.get('periodo')).toBe(alvo);
    req.flush(new Blob(['%PDF'], { type: 'application/pdf' }));
  });

  it('não busca mais /contador/pendencias — o endpoint não existe no backend', () => {
    const fixture = TestBed.createComponent(ContadorPage);
    fixture.detectChanges();
    flushInit();

    expect(httpMock.match((r) => r.url === '/contador/pendencias').length).toBe(0);
  });

  it('soma o total a pagar apenas das guias em aberto, ignorando as pagas', () => {
    const fixture = TestBed.createComponent(ContadorPage);
    fixture.detectChanges();
    flushInit([
      guia({ id: 'a', valor: 1000, status: 'pendente' }),
      guia({ id: 'b', valor: 500, status: 'vencido' }),
      guia({ id: 'c', valor: 9999, status: 'pago' }),
    ]);

    const cmp = fixture.componentInstance;
    expect(cmp.totalAPagar()).toBe(1500);
    expect(cmp.guiasPendentes().length).toBe(2);
    expect(cmp.guiasVencidas().length).toBe(1);
  });

  it('em erro ao listar guias, mostra lista vazia — nunca dados de exemplo', () => {
    const fixture = TestBed.createComponent(ContadorPage);
    fixture.detectChanges();
    httpMock
      .expectOne((r) => r.url === '/contador/guias')
      .flush('erro', { status: 500, statusText: 'Server Error' });
    flushInit();

    expect(fixture.componentInstance.guias()).toEqual([]);
    expect(fixture.componentInstance.carregandoGuias()).toBe(false);
  });

  it('separa as notas que exigem correção das demais', () => {
    const fixture = TestBed.createComponent(ContadorPage);
    fixture.detectChanges();
    flushInit(
      [],
      [
        { id: 'n1', numero: 1, status: 'AUTORIZADA', destinatarioNome: 'A' },
        { id: 'n2', numero: 2, status: 'COM_INCONSISTENCIAS', destinatarioNome: 'B' },
        { id: 'n3', numero: 3, status: 'REJEITADA', destinatarioNome: 'C' },
      ],
    );

    expect(fixture.componentInstance.notasComProblema().map((n) => n.numero)).toEqual([2, 3]);
  });

  it('as guias saíram daqui e viraram um caminho para Prazos', () => {
    // A tabela inteira morava nesta tela e na de Prazos. A triagem aponta para a cobrança em vez
    // de repeti-la; o que fica aqui é o alerta de guia vencida, que é impedimento de fechamento.
    const fixture = TestBed.createComponent(ContadorPage);
    fixture.detectChanges();
    flushInit([guia({ id: 'g1', status: 'pendente' })]);
    fixture.detectChanges();

    const raiz = fixture.nativeElement as HTMLElement;
    expect(raiz.querySelector('ui-table')).toBeNull();
    expect(raiz.querySelector('ui-modal')).toBeNull();
    expect(raiz.querySelector('a[href="/calendario"]')).not.toBeNull();
  });
});
