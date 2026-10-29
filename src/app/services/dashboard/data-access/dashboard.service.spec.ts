import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DashboardApi } from './dashboard.service';
import { DashboardResponse } from '@dtos/dashboard/dashboard.response';

function buildResponse(overrides: Partial<DashboardResponse> = {}): DashboardResponse {
  return {
    produtor: { nome: 'João Silva', tipoProdutor: 'PF', uf: 'PR' },
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
    notasPorMes: [{ periodo: '2026-07', entradas: 3, saidas: 5 }],
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
    ],
    ...overrides,
  };
}

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

  it('carregar() faz uma única requisição GET /dashboard sem periodo', () => {
    let resultado: DashboardResponse | undefined;
    service.carregar().subscribe(res => (resultado = res));
    const req = httpMock.expectOne('/dashboard');
    expect(req.request.method).toBe('GET');
    req.flush(buildResponse());
    expect(resultado?.produtor.nome).toBe('João Silva');
  });

  it('não chama nenhum dos endpoints antigos (fluxo-caixa, notas-por-mes, distribuicao-impostos, produtores)', () => {
    service.carregar().subscribe();
    httpMock.expectOne('/dashboard').flush(buildResponse());
    httpMock.expectNone('/dashboard/fluxo-caixa');
    httpMock.expectNone('/dashboard/produtores');
    httpMock.expectNone(req => req.url.includes('notas-por-mes'));
    httpMock.expectNone(req => req.url.includes('distribuicao-impostos'));
  });

  it('cacheia o resultado em sucesso — o signal dashboard() retém o DashboardResponse', () => {
    expect(service.dashboard()).toBeNull();
    service.carregar().subscribe();
    httpMock.expectOne('/dashboard').flush(buildResponse());
    expect(service.dashboard()?.periodo).toBe('2026-07');
    expect(service.dashboard()?.kpis.saldoIbs).toBe(760);
  });

  it('propaga o erro HTTP ao chamador sem cair em fallback mock', () => {
    let erro: unknown;
    service.carregar().subscribe({ error: e => (erro = e) });
    httpMock.expectOne('/dashboard').flush('erro', { status: 500, statusText: 'Server Error' });
    expect(erro).toBeTruthy();
    expect(service.dashboard()).toBeNull();
  });

  it('DASH-12: ao revisitar, o signal exibe o cache da 1ª carga e depois atualiza com a 2ª (revalidação em background)', () => {
    service.carregar().subscribe();
    httpMock.expectOne('/dashboard').flush(buildResponse({ periodo: '2026-06' }));
    expect(service.dashboard()?.periodo).toBe('2026-06');

    service.carregar().subscribe();
    expect(service.dashboard()?.periodo).toBe('2026-06');
    httpMock.expectOne('/dashboard').flush(buildResponse({ periodo: '2026-07' }));
    expect(service.dashboard()?.periodo).toBe('2026-07');
  });

  /**
   * Quatro telas chamam este service e só uma se importa com período (issue #114).
   *
   * Medido no navegador em 29/10, antes: **dois `GET /api/dashboard`** em toda abertura do painel,
   * os dois **sem período**, ao lado de um `apuracao?periodo=2026-10`. Os três chamadores de fora
   * já tinham `if (!dashboard())`, mas esse guard olha o resultado — e eles montam no mesmo tick,
   * quando resposta nenhuma voltou.
   */
  describe('concorrência entre as telas que compartilham o painel (#114)', () => {
    it('dois pedidos do mesmo periodo, com o primeiro em voo, viram UMA requisicao', () => {
      const vistos: string[] = [];
      service.carregar('2026-09').subscribe((r) => vistos.push(`a:${r.periodo}`));
      service.carregar('2026-09').subscribe((r) => vistos.push(`b:${r.periodo}`));

      httpMock
        .expectOne((r) => r.url === '/dashboard' && r.params.get('periodo') === '2026-09')
        .flush(buildResponse({ periodo: '2026-09' }));

      // Uma requisicao, os dois assinantes atendidos.
      expect(vistos).toEqual(['a:2026-09', 'b:2026-09']);
    });

    it('garantirCarregado pega carona no pedido da pagina em vez de abrir o seu', () => {
      service.carregar('2026-09').subscribe();
      // A topbar chega depois, querendo so o nome do produtor.
      service.garantirCarregado().subscribe();

      httpMock
        .expectOne((r) => r.url === '/dashboard' && r.params.get('periodo') === '2026-09')
        .flush(buildResponse({ periodo: '2026-09' }));
      httpMock.expectNone((r) => r.url === '/dashboard' && !r.params.has('periodo'));
    });

    it('garantirCarregado nao busca nada se ja ha painel carregado', () => {
      service.carregar().subscribe();
      httpMock.expectOne('/dashboard').flush(buildResponse());

      service.garantirCarregado().subscribe();
      httpMock.expectNone('/dashboard');
    });

    /**
     * O coracao do "periodo inconsistente": a topbar pede sem periodo, a pagina pede com. Se a da
     * topbar chega depois, ela nao pode jogar os KPIs de volta para o padrao do backend enquanto o
     * seletor continua dizendo Setembro.
     */
    it('quem NAO pediu periodo nunca sobrescreve quem pediu, mesmo chegando depois', () => {
      service.garantirCarregado().subscribe();
      service.carregar('2026-09').subscribe();

      const semPeriodo = httpMock.expectOne((r) => r.url === '/dashboard' && !r.params.has('periodo'));
      const comPeriodo = httpMock.expectOne((r) => r.params.get('periodo') === '2026-09');

      comPeriodo.flush(buildResponse({ periodo: '2026-09' }));
      expect(service.dashboard()?.periodo).toBe('2026-09');

      // A topbar responde por ultimo — e tem de ser ignorada.
      semPeriodo.flush(buildResponse({ periodo: '2026-10' }));
      expect(service.dashboard()?.periodo).toBe('2026-09');
    });

    /**
     * A fresta que sobrou do `limpar()` na primeira versao.
     *
     * Zerar `sequencia` e `aceita` nao bastava: o pedido ja em voo guarda a sua vez no closure, e
     * o `tap` dele roda quando a resposta chega -- depois do logout. Com os contadores zerados, a
     * resposta passava na conferencia e **reescrevia o painel de quem acabou de sair**, trazendo
     * de volta o vazamento que o `limpar()` existe para evitar.
     */
    it('resposta que chega DEPOIS do limpar nao ressuscita o painel da sessao anterior', () => {
      service.carregar('2026-09').subscribe();
      const req = httpMock.expectOne((r) => r.params.get('periodo') === '2026-09');

      // O produtor sai enquanto a resposta ainda esta na estrada.
      service.limpar();
      req.flush(buildResponse({ periodo: '2026-09' }));

      expect(service.dashboard()).toBeNull();
    });

    it('o mesmo vale para o pedido da topbar, que nao tem periodo', () => {
      service.garantirCarregado().subscribe();
      const req = httpMock.expectOne((r) => r.url === '/dashboard' && !r.params.has('periodo'));

      service.limpar();
      req.flush(buildResponse());

      expect(service.dashboard()).toBeNull();
    });

    it('depois do limpar, um pedido NOVO volta a escrever normalmente', () => {
      service.carregar('2026-09').subscribe();
      const antigo = httpMock.expectOne((r) => r.params.get('periodo') === '2026-09');
      service.limpar();
      antigo.flush(buildResponse({ periodo: '2026-09' }));

      service.carregar('2026-10').subscribe();
      httpMock
        .expectOne((r) => r.params.get('periodo') === '2026-10')
        .flush(buildResponse({ periodo: '2026-10' }));

      expect(service.dashboard()?.periodo).toBe('2026-10');
    });

    it('resposta atrasada de um periodo antigo nao passa a frente da mais nova', () => {
      service.carregar('2026-08').subscribe();
      service.carregar('2026-09').subscribe();

      const agosto = httpMock.expectOne((r) => r.params.get('periodo') === '2026-08');
      const setembro = httpMock.expectOne((r) => r.params.get('periodo') === '2026-09');

      setembro.flush(buildResponse({ periodo: '2026-09' }));
      agosto.flush(buildResponse({ periodo: '2026-08' }));

      expect(service.dashboard()?.periodo).toBe('2026-09');
    });
  });
});
