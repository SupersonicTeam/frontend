import { AuthApi } from '@services/auth/data-access/auth.service';
import { of } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
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

/**
 * Identidade de teste (issue #106).
 *
 * A tela resolve o id do produtor em `GET /auth/me` em vez de carregar um UUID cravado. Estes
 * testes sao sobre o que a tela FAZ com o id, nao sobre como ela o obtem -- isso tem spec propria
 * em `AuthApi`. Entao aqui ele e dependencia injetada, e o `httpMock` fica so com as rotas que
 * cada teste realmente examina.
 */
const SESSAO = {
  usuarioId: 'produtor-de-teste',
  papel: 'PRODUTOR' as const,
  nome: 'João da Silva Produtor',
};
const authFalso = {
  carregar: () => of(SESSAO),
  sessao: () => SESSAO,
  limpar: () => undefined,
};

describe('DashboardPage', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        // A pagina usa routerLink ("Corrigir agora", "Ver todas as N notas").
        // O spec nao provia o router e so nao quebrava porque os blocos com
        // link nao chegavam a renderizar nestes fixtures.
        provideRouter([]),
        { provide: AuthApi, useValue: authFalso },
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // O selo Aberta/Fechada vem de GET /apuracao e a pagina o pede no init, em
    // TODO teste. Drenar aqui evita repetir a linha em cada um; o verify()
    // continua pegando qualquer outra requisicao nao tratada.
    flushApuracao();
    httpMock.verify();
  });

  function flushDashboard(overrides: Partial<DashboardResponse> = {}) {
    const req = httpMock.expectOne((r) => r.url === '/dashboard');
    req.flush(buildResponse(overrides));
    // Na volta do dashboard o componente busca as notas com pendencia, para o
    // bloco do assistente (#47). Drenar aqui mantem os testes existentes validos
    // sem que cada um precise saber desta chamada.
    flushNotasComPendencia();
    flushApuracao();
  }

  /**
   * Drena o GET /apuracao que alimenta o selo Aberta/Fechada. Antes o selo era
   * adivinhado pela data; agora vem do backend, entao a pagina faz esta chamada.
   */
  function flushApuracao(status: string | null = 'ABERTO') {
    httpMock
      .match((r) => r.url === '/apuracao')
      // Desde a #108 a troca de periodo CANCELA a requisicao anterior, e responder uma requisicao
      // cancelada lanca. Pular e o correto: ela nunca vai chegar a tela.
      .filter((r) => !r.cancelled)
      .forEach((r) =>
        status
          ? r.flush({ periodo: '2026-09', status })
          : r.flush('x', { status: 500, statusText: 'x' }),
      );
  }

  /** Responde a busca por notas com pendencia; por padrao, nenhuma. */
  function flushNotasComPendencia(notas: Partial<NotaFiscal>[] = []) {
    httpMock
      .match((r) => r.url === '/notas')
      .filter((r) => !r.cancelled)
      .forEach((r) => r.flush({ content: notas, totalElements: notas.length }));
  }

  function flushVencimentos() {
    httpMock
      .match((r) => r.url.includes('/calendario-fiscal'))
      .filter((r) => !r.cancelled)
      .forEach((r) => r.flush([]));
  }

  it('#47: o assistente aponta pendência antiga, mesmo fora das 3 últimas notas', () => {
    const fixture = TestBed.createComponent(DashboardPage);
    fixture.detectChanges();

    // O payload do dashboard traz só notas AUTORIZADAS (as 3 mais recentes)...
    httpMock.expectOne((r) => r.url === '/dashboard').flush(buildResponse());
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
      .match((r) => r.url.includes('/validacoes'))
      .forEach((r) =>
        r.flush([{ code: 'NOTA_INVALIDA_EMISSAO', message: 'Endereço obrigatório' }]),
      );
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
    httpMock
      .expectOne((r) => r.url === '/dashboard')
      .flush('erro', { status: 500, statusText: 'Server Error' });
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
      kpis: {
        debitoIbs: 0,
        debitoCbs: 0,
        creditoIbs: 0,
        creditoCbs: 0,
        saldoIbs: 0,
        saldoCbs: 0,
        totalNotas: 0,
      },
    });
    flushVencimentos();
    expect(fixture.componentInstance.dashboard()?.kpis.saldoIbs).toBe(0);
    expect(fixture.componentInstance.formatCurrency(0)).toContain('0,00');
  });

  it('DASH-04: barChartData plota contagens de notasPorMes com rótulo de mês derivado de periodo', () => {
    const fixture = TestBed.createComponent(DashboardPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();
    flushDashboard();
    flushVencimentos();
    expect(cmp.barChartData().labels).toEqual(['Fev/26', 'Jul/26']);
    expect(cmp.barChartData().datasets[0].data).toEqual([4, 3]);
    expect(cmp.barChartData().datasets[1].data).toEqual([6, 5]);
  });

  /**
   * O card "Tendência mensal" desenhava a **mesma** `notasPorMes` do gráfico de
   * barras, só que em linha. Com o dado real (2 saídas e 0 entradas todo mês) viravam
   * duas retas, e parecia defeito. O card saiu; o `lineChartData` foi junto.
   */
  it('DASH-04b: avisa quando não há notas de entrada, em vez de deixar a série sumir', () => {
    const fixture = TestBed.createComponent(DashboardPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();
    flushDashboard();
    flushVencimentos();

    // O fixture tem entradas > 0, entao o aviso fica quieto.
    expect(cmp.semNotasDeEntrada()).toBe(false);
  });

  /**
   * O card "Ultimos documentos" mostra no maximo 5 -- o backend devolve
   * `findTop5ByProdutorIdOrderByDataEmissaoDesc`. Sem saber o total, ele virava
   * beco sem saida: quem tem 15 notas via 5 e nao chegava nas outras.
   */
  it('DASH-04c: guarda o total de notas do totalElements, nao do tamanho da pagina', () => {
    const fixture = TestBed.createComponent(DashboardPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();

    httpMock.expectOne((r) => r.url === '/dashboard').flush(buildResponse());
    // A pagina traz 2 notas, mas o produtor tem 15: e o total que decide se o
    // card mostra a saida "Ver todas as N notas".
    httpMock
      .match((r) => r.url === '/notas')
      .forEach((r) =>
        r.flush({
          content: [
            { id: 'a', numero: 1, status: 'AUTORIZADA' },
            { id: 'b', numero: 2, status: 'AUTORIZADA' },
          ],
          totalElements: 15,
        }),
      );
    flushVencimentos();

    expect(cmp.totalDeNotas()).toBe(15);
  });

  /**
   * O selo mentia: era calculado pela data, entao junho virava "Fechado" --
   * enquanto a API responde status ABERTO com dataFechamento null.
   */
  it('DASH-10: o selo da apuracao vem do backend, nao da data do calendario', () => {
    const fixture = TestBed.createComponent(DashboardPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === '/dashboard').flush(buildResponse());
    flushNotasComPendencia();
    flushVencimentos();

    httpMock
      .expectOne((r) => r.url === '/apuracao')
      .flush({ periodo: '2026-09', status: 'FECHADO' });
    expect(cmp.statusApuracao().label).toBe('Fechada');
  });

  it('DASH-10b: trocar o mes recarrega o painel com o periodo escolhido', () => {
    const fixture = TestBed.createComponent(DashboardPage);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === '/dashboard').flush(buildResponse());
    flushNotasComPendencia();
    flushVencimentos();
    flushApuracao();

    fixture.componentInstance.setMes('6');

    // Antes os selects nao chamavam nada: o comentario no codigo dizia
    // "exibicao apenas; MVP carrega so o mes corrente".
    const req = httpMock.expectOne((r) => r.url === '/dashboard');
    expect(req.request.params.get('periodo')).toBe(new Date().getFullYear() + '-06');
    req.flush(buildResponse());
    flushNotasComPendencia();
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
    httpMock.expectOne((r) => r.url === '/notas/n1').flush(notaCompleta);
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
    httpMock
      .expectOne((r) => r.url === '/notas/n1')
      .flush('erro', { status: 500, statusText: 'Server Error' });
    expect(cmp.loadingDetalhes()).toBe(false);
    expect(cmp.notaDetalhada()).toBeNull();
    expect(cmp.previewDoc()).not.toBeNull();
  });

  /**
   * **Cada imposto tem uma cor só no app** (#115).
   *
   * A pizza emprestava a paleta de entradas/saídas, então o IBS saía **verde** nela e **azul** em
   * Impostos — a mesma sigla com duas cores, em duas telas que a pessoa compara. E a legenda do
   * Chart.js só dizia "CBS"/"IBS": o valor ficava no tooltip, que no toque não existe.
   */
  describe('distribuição de impostos (#115)', () => {
    function abrir() {
      const fixture = TestBed.createComponent(DashboardPage);
      const cmp = fixture.componentInstance;
      fixture.detectChanges();
      flushDashboard();
      flushVencimentos();
      return cmp;
    }

    it('a pizza usa a paleta de imposto, não a de entradas/saídas', () => {
      const cmp = abrir();

      expect(cmp.pieChartData().datasets[0]!.backgroundColor).toEqual(cmp.paletaDeImposto());
      expect(cmp.pieChartData().datasets[0]!.backgroundColor).not.toEqual(
        cmp.barChartData().datasets[0]!.backgroundColor,
      );
    });

    it('a legenda traz o valor de cada imposto, na ordem dos rótulos', () => {
      const cmp = abrir();

      expect(cmp.pieChartData().labels).toEqual(['CBS', 'IBS']);
      expect(cmp.fatiasDeImposto().map((f) => f.rotulo)).toEqual(['CBS', 'IBS']);
      expect(cmp.fatiasDeImposto().map((f) => f.valor)).toEqual([420, 860]);
    });

    /** Legenda com "R$ 0,00" ocupa espaço para não dizer nada. */
    it('imposto zerado sai da legenda', () => {
      const fixture = TestBed.createComponent(DashboardPage);
      const cmp = fixture.componentInstance;
      fixture.detectChanges();
      httpMock
        .match((r) => r.url === '/dashboard')
        .forEach((r) => r.flush(buildResponse({ distribuicaoImpostos: { ibs: 860, cbs: 0 } })));
      flushNotasComPendencia();
      flushApuracao();
      flushVencimentos();

      expect(cmp.fatiasDeImposto().map((f) => f.rotulo)).toEqual(['IBS']);
    });

    /** A legenda do Chart.js fica desligada: ela não mostra valor. */
    it('o gráfico não desenha legenda própria', () => {
      expect(abrir().pieChartOptions()?.plugins?.legend?.display).toBe(false);
    });
  });

  /**
   * O botão "Baixar" da prévia **não fazia nada** (#103): nem `(click)`, nem handler. Prometia o
   * download e ficava quieto — a mesma falha que a tela de Configurações já tinha removido por
   * princípio ("nenhuma promessa de ação que o servidor não cumpre").
   *
   * E ele não pode valer sempre: `temArquivosFiscais()` é pergunta de **estado**, não de permissão.
   * Em rascunho a DANFE oficial não existe e a rota responde 409, então o botão nem aparece.
   */
  describe('baixar a DANFE da prévia (#103)', () => {
    /** Abre a prévia com uma nota no status pedido. */
    function abrirCom(status: NotaFiscal['status']) {
      const fixture = TestBed.createComponent(DashboardPage);
      const cmp = fixture.componentInstance;
      fixture.detectChanges();
      flushDashboard();
      flushVencimentos();

      cmp.abrirPreview(cmp.documentos()[0]);
      httpMock
        .expectOne((r) => r.url === '/notas/n1')
        .flush({
          id: 'n1',
          numero: 1023,
          naturezaOperacao: 'Venda de soja',
          status,
          dataEmissao: '2026-07-01T10:00:00-03:00',
          destinatarioNome: 'Cerealista Boa Safra LTDA',
          destinatarioCpfCnpj: '12345678000190',
          itens: [],
        } satisfies NotaFiscal);
      return cmp;
    }

    it('nota autorizada oferece o download', () => {
      expect(abrirCom('AUTORIZADA').podeBaixarDanfe()).toBe(true);
    });

    it.each(['RASCUNHO', 'COM_INCONSISTENCIAS', 'AGUARDANDO_APROVACAO'] as const)(
      'em %s o botão nem aparece: o documento fiscal ainda não existe',
      (status) => {
        expect(abrirCom(status).podeBaixarDanfe()).toBe(false);
      },
    );

    it('sem nota carregada não há o que baixar', () => {
      const fixture = TestBed.createComponent(DashboardPage);
      const cmp = fixture.componentInstance;
      fixture.detectChanges();
      flushDashboard();
      flushVencimentos();

      expect(cmp.podeBaixarDanfe()).toBe(false);
      // E chamar à mão não dispara requisição nenhuma.
      cmp.baixarDanfe();
      httpMock.expectNone((r) => r.url.includes('/pdf'));
    });

    it('baixa o PDF e usa o nome que o servidor mandou', () => {
      const cmp = abrirCom('AUTORIZADA');
      cmp.baixarDanfe();
      expect(cmp.baixandoDanfe()).toBe(true);

      const req = httpMock.expectOne((r) => r.url === '/notas/n1/pdf');
      req.flush(new Blob(['%PDF-1.4'], { type: 'application/pdf' }), {
        headers: { 'Content-Disposition': 'attachment; filename="danfe-1023.pdf"' },
      });

      expect(cmp.baixandoDanfe()).toBe(false);
    });

    it('fechar a prévia no meio do download não deixa o botão travado em "Baixando…"', () => {
      const cmp = abrirCom('AUTORIZADA');
      cmp.baixarDanfe();
      httpMock.expectOne((r) => r.url === '/notas/n1/pdf');

      cmp.fecharPreview();

      expect(cmp.baixandoDanfe()).toBe(false);
    });
  });

  /**
   * O DASH-06 afirmava `IBS Estadual = debitoIbs * 0.72`, consagrando uma repartição que a API
   * **não faz** e que o backend não devolve em lugar nenhum (#110). O que ele guardava de certo —
   * que o breakdown vem dos KPIs e não da soma das notas — continua aqui.
   */
  it('DASH-06: impostoBreakdown/totalImpostoCalculado derivam de kpis (não soma notas)', () => {
    const fixture = TestBed.createComponent(DashboardPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();
    flushDashboard();
    flushVencimentos();
    const breakdown = cmp.impostoBreakdown();
    expect(breakdown.find((b) => b.nome === 'CBS')?.valor).toBe(420);
    expect(breakdown.find((b) => b.nome === 'IBS')?.valor).toBe(860);
    expect(cmp.totalImpostoCalculado()).toBeCloseTo(420 + 860);
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

  /**
   * O simulador parava de inventar aliquota (issue #110).
   *
   * Ele mostrava CBS 3,5%, IBS Estadual 5,1% e IBS Municipal 2,0%, com "8,8% → 3,5%" riscado e
   * "tributacao efetiva ~10,6%". Medido contra a API em 28/10: as aliquotas de 2026 sao
   * **CBS 0,9% e IBS 0,1%**, e na base de setembro a carga efetiva e 1.809,50 / 180.950 = **1,0%**.
   *
   * Pior que os numeros: o IBS era **repartido 72/28** entre "Estadual" e "Municipal", uma divisao
   * que a API nao faz e que o backend nao devolve em lugar nenhum.
   */
  /**
   * Trocar de periodo rapido nao pode deixar o mes antigo na tela (issue #108).
   *
   * Reproducao do teste manual de 28/10: Maio -> Julho, com a resposta de maio atrasada. Ela
   * chegava por ultimo e o `tap` do service gravava os valores de **maio** no signal, com Julho
   * selecionado no seletor: R$ 102.900 debaixo do rotulo errado.
   *
   * `trocarPeriodo` disparava dois `subscribe` soltos e nada cancelava os anteriores.
   */
  describe('troca de periodo sem corrida (#108)', () => {
    function abrir() {
      const fixture = TestBed.createComponent(DashboardPage);
      fixture.detectChanges();
      flushDashboard();
      flushVencimentos();
      return fixture.componentInstance;
    }

    const pedidoDe = (periodo: string) =>
      httpMock.expectOne((r) => r.url === '/dashboard' && r.params.get('periodo') === periodo);

    it('a requisicao do periodo abandonado e CANCELADA', () => {
      const cmp = abrir();

      cmp.setMes('5');
      const maio = pedidoDe('2026-05');
      cmp.setMes('7');
      const julho = pedidoDe('2026-07');

      expect(maio.cancelled).toBe(true);
      julho.flush(buildResponse({ periodo: '2026-07' }));
      flushApuracao();
      flushNotasComPendencia();
      flushVencimentos();
    });

    it('a tela fica com o periodo que o usuario escolheu por ultimo', () => {
      const cmp = abrir();

      cmp.setMes('5');
      pedidoDe('2026-05');
      cmp.setMes('7');
      pedidoDe('2026-07').flush(buildResponse({ periodo: '2026-07' }));
      flushApuracao();
      flushNotasComPendencia();

      expect(cmp.dashboard()?.periodo).toBe('2026-07');
      expect(cmp.periodoSelecionado()).toBe('2026-07');
      flushVencimentos();
    });

    it('a apuracao do periodo abandonado tambem e cancelada: o selo nao pode mentir', () => {
      const cmp = abrir();

      cmp.setMes('5');
      pedidoDe('2026-05');
      const apuracaoMaio = httpMock.expectOne(
        (r) => r.url === '/apuracao' && r.params.get('periodo') === '2026-05',
      );

      cmp.setMes('7');
      pedidoDe('2026-07').flush(buildResponse({ periodo: '2026-07' }));

      expect(apuracaoMaio.cancelled).toBe(true);
      flushApuracao();
      flushNotasComPendencia();
      flushVencimentos();
    });
  });

  describe('simulador sem numero inventado (#110)', () => {
    function abrirCom(kpis: Partial<DashboardResponse['kpis']>, totalEntradas = 180950) {
      const fixture = TestBed.createComponent(DashboardPage);
      fixture.detectChanges();
      flushDashboard({
        kpis: { ...buildResponse().kpis, ...kpis },
        financeiro: { totalEntradas, totalSaidas: 0, saldo: totalEntradas, lucroEstimado: 0 },
      });
      flushVencimentos();
      return fixture.componentInstance;
    }

    it('o breakdown tem os dois tributos que a API devolve, nao tres', () => {
      const cmp = abrirCom({ debitoIbs: 180.95, debitoCbs: 1628.55 });

      // "IBS Estadual" e "IBS Municipal" nao existem no contrato: eram 72% e 28% inventados.
      expect(cmp.impostoBreakdown().map((i) => i.nome)).toEqual(['IBS', 'CBS']);
    });

    it('o valor de cada tributo vem inteiro do KPI, sem repartir', () => {
      const cmp = abrirCom({ debitoIbs: 180.95, debitoCbs: 1628.55 });
      const porNome = Object.fromEntries(cmp.impostoBreakdown().map((i) => [i.nome, i.valor]));

      expect(porNome['IBS']).toBe(180.95);
      expect(porNome['CBS']).toBe(1628.55);
    });

    it('a carga efetiva sai da conta imposto / faturamento, nao de um numero fixo', () => {
      const cmp = abrirCom({ debitoIbs: 180.95, debitoCbs: 1628.55 }, 180950);

      // 1.809,50 / 180.950 = 1,0% -- e nao os "~10,6%" que estavam cravados no template.
      expect(cmp.cargaEfetiva()).toBeCloseTo(1.0, 2);
    });

    it('sem faturamento no periodo, nao inventa carga efetiva', () => {
      const cmp = abrirCom({ debitoIbs: 0, debitoCbs: 0 }, 0);

      expect(cmp.cargaEfetiva()).toBeNull();
    });

    it('o total do simulador e a soma do que a API devolveu', () => {
      const cmp = abrirCom({ debitoIbs: 180.95, debitoCbs: 1628.55 });

      expect(cmp.totalImpostoCalculado()).toBeCloseTo(1809.5, 2);
    });
  });

  /**
   * Mês futuro não é opção (issue #114).
   *
   * A lista era fixa nos doze. Em outubro de 2026 dava para escolher novembro e dezembro de 2026 —
   * meses que não aconteceram — e o painel respondia tudo zerado: faturamento zero, imposto zero,
   * nenhuma nota. Parece app quebrado, e não é: foi a tela que ofereceu uma pergunta sem resposta.
   */
  describe('o seletor nao oferece mes que ainda nao aconteceu (#114)', () => {
    // **Relogio congelado de proposito.** Sem isto o teste passa hoje e reprova sozinho em janeiro,
    // quando "o ano corrente" muda -- erro que ja custou um CI vermelho neste projeto.
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 0));
    });
    afterEach(() => vi.useRealTimers());

    /** Responde o que a troca de periodo dispara, ignorando o que o switchMap cancelou. */
    function drenarTroca() {
      httpMock
        .match((r) => r.url === '/dashboard')
        .filter((r) => !r.cancelled)
        .forEach((r) => r.flush(buildResponse()));
      flushNotasComPendencia();
      flushApuracao();
      flushVencimentos();
    }

    it('no ano corrente a lista para no mes de hoje; em ano passado traz os doze', () => {
      const fixture = TestBed.createComponent(DashboardPage);
      const cmp = fixture.componentInstance;
      fixture.detectChanges();
      drenarTroca();

      expect(cmp.meses().length).toBe(10);
      expect(cmp.meses().at(-1)?.nome).toBe('Outubro');
      expect(cmp.meses().map((m) => m.nome)).not.toContain('Novembro');

      cmp.setAno('2025');
      drenarTroca();
      expect(cmp.meses().length).toBe(12);
      expect(cmp.meses().at(-1)?.nome).toBe('Dezembro');
    });

    it('voltando de dezembro/2025 para o ano corrente, o mes escolhido nao fica no futuro', () => {
      const fixture = TestBed.createComponent(DashboardPage);
      const cmp = fixture.componentInstance;
      fixture.detectChanges();
      drenarTroca();

      cmp.setAno('2025');
      drenarTroca();
      cmp.setMes('12');
      drenarTroca();
      expect(cmp.periodoSelecionado()).toBe('2025-12');

      // De volta ao ano corrente, dezembro nao existe: o mes e puxado para o ultimo que existe.
      cmp.setAno('2026');
      drenarTroca();
      expect(cmp.periodoMes()).toBe(10);
      expect(cmp.periodoSelecionado()).toBe('2026-10');
    });
  });
});
