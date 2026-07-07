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

  function flushDashboard(overrides: Partial<DashboardResponse> = {}) {
    const req = httpMock.expectOne(r => r.url === '/dashboard');
    req.flush(buildResponse(overrides));
  }

  function flushVencimentos() {
    httpMock.match(r => r.url.includes('/calendario-fiscal')).forEach(r => r.flush([]));
  }

  it('DASH-01/02: ngOnInit chama GET /api/dashboard uma vez e expõe o nome do produtor', () => {
    const fixture = TestBed.createComponent(DashboardPage);
    fixture.detectChanges();
    flushDashboard();
    flushVencimentos();
    expect(fixture.componentInstance.nomeUsuario()).toBe('Maria Souza');
    httpMock.verify();
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
});
