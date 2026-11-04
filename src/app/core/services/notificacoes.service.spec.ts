import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NotificacoesService } from './notificacoes.service';
import { SessaoService } from './sessao.service';
import { entrarComo } from './sessao.testing';

/**
 * O sino deixou de ser um mock fixo (issue #113).
 *
 * Ele trazia três itens cravados no código, iguais nos dois perfis: "Vencimento FUNRURAL em 3
 * dias" com data de **junho de 2025**, uma "NF-e 001234" que não existe no banco, e o badge "2"
 * sempre aceso. Numa apresentação, um sino que avisa de uma nota inventada é pior do que um sino
 * vazio.
 *
 * Agora cada papel lê a sua fonte: o produtor, `GET /api/alertas` (o que vence em menos de 5
 * dias); o contador, o `atencao{}` que a carteira já agrega.
 */
describe('NotificacoesService', () => {
  let service: NotificacoesService;
  let httpMock: HttpTestingController;

  function criar(perfil: 'produtor' | 'contador') {
    localStorage.clear();
    montar(perfil);
  }

  /** Recria o service **sem limpar o storage** — é o que simula recarregar a página. */
  function montar(perfil: 'produtor' | 'contador') {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [NotificacoesService, provideHttpClient(), provideHttpClientTesting()],
    });
    entrarComo(perfil === 'contador' ? 'CONTADOR' : 'PRODUTOR');
    service = TestBed.inject(NotificacoesService);
    httpMock = TestBed.inject(HttpTestingController);
  }

  afterEach(() => localStorage.clear());

  const alerta = (over: Record<string, unknown> = {}) => ({
    id: 'a1',
    tipo: 'VENCIMENTO_GUIA',
    referenciaId: 'g1',
    descricao: 'Guia de FUNRURAL de R$ 1.840,55',
    dataLimite: '2026-11-02',
    diasRestantes: 3,
    ...over,
  });

  it('nasce vazio: nada de item inventado antes de o servidor responder', () => {
    criar('produtor');

    expect(service.notificacoes()).toEqual([]);
    expect(service.naoLidas()).toBe(0);
  });

  it('o produtor le /api/alertas', () => {
    criar('produtor');
    service.carregar();

    httpMock.expectOne((r) => r.url === '/alertas').flush([alerta()]);

    expect(service.notificacoes().length).toBe(1);
    expect(service.notificacoes()[0]!.titulo).toContain('FUNRURAL');
  });

  it('o alerta vira uma notificacao que leva para onde se resolve', () => {
    criar('produtor');
    service.carregar();
    httpMock
      .expectOne((r) => r.url === '/alertas')
      .flush([
        alerta({ tipo: 'VENCIMENTO_GUIA' }),
        alerta({ id: 'a2', tipo: 'FECHAMENTO_APURACAO', descricao: 'Apuração de outubro fecha' }),
      ]);

    const [guia, apuracao] = service.notificacoes();
    expect(guia!.rota).toBe('/calendario');
    expect(apuracao!.rota).toBe('/tributario');
  });

  it('o contador NAO chama /api/alertas: a rota e do produtor e responde 403 para ele', () => {
    criar('contador');
    service.carregar();

    httpMock.expectNone((r) => r.url === '/alertas');
    httpMock.expectOne((r) => r.url === '/contador/produtores').flush([]);
  });

  /**
   * `/api/alertas` sai com sessão **de produtor**, não com "quem não é contador" (#136). Sem papel
   * não há fonte nenhuma, e o sino fica vazio em vez de colher um 403.
   */
  it('sem sessao nao chama fonte nenhuma', () => {
    criar('produtor');
    TestBed.inject(SessaoService).encerrar();
    service.carregar();

    httpMock.expectNone(() => true);
    expect(service.notificacoes()).toEqual([]);
  });

  it('o contador le o que a carteira ja agrega', () => {
    criar('contador');
    service.carregar();

    httpMock
      .expectOne((r) => r.url === '/contador/produtores')
      .flush([
        {
          vinculoId: 'v1',
          id: 'p1',
          nomeCompleto: 'João da Silva Produtor',
          situacaoVinculo: 'ATIVO',
          etiquetas: [],
          atencao: {
            notasComInconsistencia: 2,
            notasAguardandoAprovacao: 1,
            guiasVencidas: 0,
            vencimentosProximos7Dias: 0,
            pendenciasEnviadas: 0,
          },
        },
      ]);

    // Uma notificacao por tipo de atencao que existe, nomeando o cliente.
    const titulos = service.notificacoes().map((n) => n.titulo);
    expect(titulos.length).toBe(2);
    expect(titulos.join(' ')).toContain('João da Silva Produtor');
  });

  it('cliente sem nada pendente nao gera notificacao', () => {
    criar('contador');
    service.carregar();
    httpMock
      .expectOne((r) => r.url === '/contador/produtores')
      .flush([
        {
          vinculoId: 'v1',
          id: 'p1',
          nomeCompleto: 'Maria',
          situacaoVinculo: 'ATIVO',
          etiquetas: [],
          atencao: {
            notasComInconsistencia: 0,
            notasAguardandoAprovacao: 0,
            guiasVencidas: 0,
            vencimentosProximos7Dias: 0,
            pendenciasEnviadas: 0,
          },
        },
      ]);

    expect(service.notificacoes()).toEqual([]);
  });

  /**
   * O backend não guarda "lido" — nem para alerta, nem para o agregado da carteira. Guardar por
   * id no `localStorage` é o que impede o badge de reacender a cada recarga de página mostrando
   * o mesmo aviso que a pessoa já viu.
   */
  it('o que foi lido continua lido depois de recarregar', () => {
    criar('produtor');
    service.carregar();
    httpMock.expectOne((r) => r.url === '/alertas').flush([alerta()]);
    expect(service.naoLidas()).toBe(1);

    service.marcarLida('a1');
    expect(service.naoLidas()).toBe(0);

    // Mesma resposta, sessão nova **com o storage intacto**: o alerta volta, mas já lido.
    montar('produtor');
    service.carregar();
    httpMock.expectOne((r) => r.url === '/alertas').flush([alerta()]);

    expect(service.notificacoes().length).toBe(1);
    expect(service.naoLidas()).toBe(0);
  });

  it('o badge conta so o que nao foi lido', () => {
    criar('produtor');
    service.carregar();
    httpMock
      .expectOne((r) => r.url === '/alertas')
      .flush([alerta(), alerta({ id: 'a2' }), alerta({ id: 'a3' })]);

    expect(service.naoLidas()).toBe(3);
    service.marcarTodasLidas();
    expect(service.naoLidas()).toBe(0);
  });

  it('falha em silencio: o sino nao e lugar de estado de erro', () => {
    criar('produtor');
    service.carregar();

    httpMock
      .expectOne((r) => r.url === '/alertas')
      .flush('erro', { status: 500, statusText: 'Server Error' });

    expect(service.notificacoes()).toEqual([]);
  });
});
