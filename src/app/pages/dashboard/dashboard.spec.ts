import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DashboardPage } from './dashboard';
import { DashboardResponse } from '@dtos/dashboard/dashboard.response';
import { NotaFiscal } from '@models/nota-fiscal.model';

function buildResponse(overrides: Partial<DashboardResponse> = {}): DashboardResponse {
  return {
    produtor: { nome: 'Maria Souza', tipoProdutor: 'PF', uf: 'PR' },
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
    notasPorMes: [
      { periodo: '2026-02', entradas: 4, saidas: 6 },
      { periodo: '2026-07', entradas: 3, saidas: 5 },
    ],
    distribuicaoImpostos: { ibs: 860, cbs: 420 },
    financeiro: { totalEntradas: 12500, totalSaidas: 3200, saldo: 9300, lucroEstimado: 8100 },
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
      {
        id: 'n2',
        numero: 1024,
        origem: 'IMPORTADA',
        contraparte: 'José Comprador',
        dataEmissao: '2026-06-20T10:00:00-03:00',
        valorTotalNota: 8000,
        status: 'AUTORIZADA',
      },
    ],
    ...overrides,
  };
}

describe('DashboardPage', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function flushDashboard(overrides: Partial<DashboardResponse> = {}) {
    const req = httpMock.expectOne(r => r.url === '/dashboard');
    req.flush(buildResponse(overrides));
    // Na volta do dashboard o componente busca as notas com pendencia, para o
    // bloco do assistente (#47). Drenar aqui mantem os testes existentes validos
    // sem que cada um precise saber desta chamada.
    flushNotasComPendencia();
  }

  /** Responde a busca por notas com pendencia; por padrao, nenhuma. */
  function flushNotasComPendencia(notas: Partial<NotaFiscal>[] = []) {
    httpMock
      .match(r => r.url === '/notas')
      .forEach(r => r.flush({ content: notas, totalElements: notas.length }));
  }

  function flushVencimentos() {
    httpMock.match(r => r.url.includes('/calendario-fiscal')).forEach(r => r.flush([]));
  }

  it('#47: o assistente aponta pendência antiga, mesmo fora das 3 últimas notas', () => {
    const fixture = TestBed.createComponent(DashboardPage);
    fixture.detectChanges();

    // O payload do dashboard traz só notas AUTORIZADAS (as 3 mais recentes)...
    httpMock.expectOne(r => r.url === '/dashboard').flush(buildResponse());
    // ...mas existe uma nota antiga com inconsistência na base.
    flushNotasComPendencia([
      {
        id: 'antiga-1',
        numero: 7,
        status: 'COM_INCONSISTENCIAS',
        destinatarioNome: 'Cooperativa Cafeeira XYZ Ltda',
      } as NotaFiscal,
    ]);
    httpMock
      .match(r => r.url.includes('/validacoes'))
      .forEach(r => r.flush([{ code: 'NOTA_INVALIDA_EMISSAO', message: 'Endereço obrigatório' }]));
    flushVencimentos();

    expect(fixture.componentInstance.notasComProblema().length).toBe(1);
    expect(fixture.componentInstance.temInsight()).toBe(true);
    expect(fixture.componentInstance.motivoPendencia()).toBe('Endereço obrigatório');
  });

  it('DASH-01/02: ngOnInit chama GET /api/dashboard uma vez e expõe o nome do produtor', () => {
    const fixture = TestBed.createComponent(DashboardPage);
    fixture.detectChanges();
    flushDashboard();
    flushVencimentos();
    expect(fixture.componentInstance.nomeUsuario()).toBe('Maria Souza');
  });

  it('DASH-07: loading fica true durante a requisição e false ao concluir', () => {
    const fixture = TestBed.createComponent(DashboardPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();
    expect(cmp.loading()).toBe(true);
    flushDashboard();
    flushVencimentos();
    expect(cmp.loading()).toBe(false);
  });

  it('DASH-08: em erro HTTP, erro() vira true; tentarNovamente() refaz a chamada', () => {
    const fixture = TestBed.createComponent(DashboardPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();
    httpMock.expectOne(r => r.url === '/dashboard').flush('erro', { status: 500, statusText: 'Server Error' });
    flushVencimentos();
    expect(cmp.erro()).toBe(true);
    expect(cmp.dashboard()).toBeNull();

    cmp.tentarNovamente();
    expect(cmp.erro()).toBe(false);
    flushDashboard();
    expect(cmp.erro()).toBe(false);
    expect(cmp.dashboard()?.produtor.nome).toBe('Maria Souza');
  });

  it('DASH-03/09: KPIs de IBS/CBS derivam de kpis, incluindo valores zero (não vazio)', () => {
    const fixture = TestBed.createComponent(DashboardPage);
    fixture.detectChanges();
    flushDashboard({
      kpis: { debitoIbs: 0, debitoCbs: 0, creditoIbs: 0, creditoCbs: 0, saldoIbs: 0, saldoCbs: 0, totalNotas: 0 },
    });
    flushVencimentos();
    expect(fixture.componentInstance.dashboard()?.kpis.saldoIbs).toBe(0);
    expect(fixture.componentInstance.formatCurrency(0)).toContain('0,00');
  });

  it('DASH-04: barChartData/lineChartData plotam contagens de notasPorMes com rótulo de mês derivado de periodo', () => {
    const fixture = TestBed.createComponent(DashboardPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();
    flushDashboard();
    flushVencimentos();
    expect(cmp.barChartData().labels).toEqual(['Fev/26', 'Jul/26']);
    expect(cmp.barChartData().datasets[0].data).toEqual([4, 3]);
    expect(cmp.barChartData().datasets[1].data).toEqual([6, 5]);
    expect(cmp.lineChartData().labels).toEqual(['Fev/26', 'Jul/26']);
  });

  it('DASH-05: pieChartData plota [cbs, ibs] com legenda CBS × IBS (sem FUNRURAL)', () => {
    const fixture = TestBed.createComponent(DashboardPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();
    flushDashboard();
    flushVencimentos();
    expect(cmp.pieChartData().labels).toEqual(['CBS', 'IBS']);
    expect(cmp.pieChartData().datasets[0].data).toEqual([420, 860]);
  });

  it('DASH-09: notasPorMes vazio produz estado vazio (sem dados falsos no computed)', () => {
    const fixture = TestBed.createComponent(DashboardPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();
    flushDashboard({ notasPorMes: [] });
    flushVencimentos();
    expect(cmp.barChartData().labels).toEqual([]);
    expect(cmp.dashboard()?.notasPorMes).toEqual([]);
  });

  it('DASH-06: documentos() deriva de ultimasNotas ordenadas por dataEmissao desc', () => {
    const fixture = TestBed.createComponent(DashboardPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();
    flushDashboard();
    flushVencimentos();
    const docs = cmp.documentos();
    expect(docs.length).toBe(2);
    expect(docs[0].nome).toBe('Cerealista Boa Safra LTDA');
    expect(docs[0].valor).toBe(12000);
    expect(docs[0].notaId).toBe('n1');
    expect(docs[1].nome).toBe('José Comprador');
  });

  it('DASH-06: ultimasNotas vazio mostra "Nenhum documento encontrado" (documentos() vazio)', () => {
    const fixture = TestBed.createComponent(DashboardPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();
    flushDashboard({ ultimasNotas: [] });
    flushVencimentos();
    expect(cmp.documentos()).toEqual([]);
  });

  it('DASH-06: abrirPreview busca a nota completa via NotasApi.obter e popula notaDetalhada', () => {
    const fixture = TestBed.createComponent(DashboardPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();
    flushDashboard();
    flushVencimentos();

    cmp.abrirPreview(cmp.documentos()[0]);
    expect(cmp.loadingDetalhes()).toBe(true);
    const notaCompleta: NotaFiscal = {
      id: 'n1',
      numero: 1023,
      naturezaOperacao: 'Venda de soja',
      status: 'AUTORIZADA',
      dataEmissao: '2026-07-01T10:00:00-03:00',
      destinatarioNome: 'Cerealista Boa Safra LTDA',
      destinatarioCpfCnpj: '12345678000190',
      itens: [],
    };
    httpMock.expectOne(r => r.url === '/notas/n1').flush(notaCompleta);
    expect(cmp.loadingDetalhes()).toBe(false);
    expect(cmp.notaDetalhada()?.id).toBe('n1');
  });

  it('DASH-06: abrirPreview em falha do NotasApi.obter não quebra — mostra erro e mantém modal', () => {
    const fixture = TestBed.createComponent(DashboardPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();
    flushDashboard();
    flushVencimentos();

    cmp.abrirPreview(cmp.documentos()[0]);
    httpMock.expectOne(r => r.url === '/notas/n1').flush('erro', { status: 500, statusText: 'Server Error' });
    expect(cmp.loadingDetalhes()).toBe(false);
    expect(cmp.notaDetalhada()).toBeNull();
    expect(cmp.previewDoc()).not.toBeNull();
  });

  it('DASH-06: impostoBreakdown/totalImpostoCalculado derivam de kpis (não soma notas)', () => {
    const fixture = TestBed.createComponent(DashboardPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();
    flushDashboard();
    flushVencimentos();
    const breakdown = cmp.impostoBreakdown();
    expect(breakdown.find(b => b.nome === 'CBS')?.valor).toBe(420);
    expect(breakdown.find(b => b.nome === 'IBS Estadual')?.valor).toBeCloseTo(860 * 0.72);
    expect(cmp.totalImpostoCalculado()).toBeCloseTo(420 + 860 * 0.72 + 860 * 0.28);
  });

  it('INT-02/03: financeiro() expõe o bloco sem re-inverter entradas/saídas', () => {
    const fixture = TestBed.createComponent(DashboardPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();
    flushDashboard(); // financeiro: entradas 12500, saidas 3200 (distintos, pegam troca)
    flushVencimentos();
    expect(cmp.temFinanceiro()).toBe(true);
    expect(cmp.financeiro()?.totalEntradas).toBe(12500);
    expect(cmp.financeiro()?.totalSaidas).toBe(3200);
    expect(cmp.financeiro()?.saldo).toBe(9300);
  });

  it('INT-04: lucroEstimado negativo é preservado (não zerado nem suprimido)', () => {
    const fixture = TestBed.createComponent(DashboardPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();
    flushDashboard({
      financeiro: { totalEntradas: 1000, totalSaidas: 3000, saldo: -2000, lucroEstimado: -2500 },
    });
    flushVencimentos();
    expect(cmp.financeiro()?.lucroEstimado).toBe(-2500);
    expect(cmp.financeiro()?.saldo).toBe(-2000);
  });

  it('INT-05: financeiro ausente → financeiro()=null, temFinanceiro()=false, resto do dashboard segue', () => {
    const fixture = TestBed.createComponent(DashboardPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();
    flushDashboard({ financeiro: undefined });
    flushVencimentos();
    expect(cmp.financeiro()).toBeNull();
    expect(cmp.temFinanceiro()).toBe(false);
    // resto do dashboard não quebra:
    expect(cmp.nomeUsuario()).toBe('Maria Souza');
    expect(cmp.dashboard()?.kpis.saldoIbs).toBe(760);
  });
});
