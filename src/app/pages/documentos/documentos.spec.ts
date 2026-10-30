import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { DocumentosPage } from './documentos';
import { ToastService } from '@core/services/toast.service';

describe('DocumentosPage', () => {
  let httpMock: HttpTestingController;

  /** Rota simulada: cada teste ajusta os query params antes de criar o componente. */
  const rota = { snapshot: { queryParamMap: convertToParamMap({}) } };

  beforeEach(async () => {
    rota.snapshot.queryParamMap = convertToParamMap({});
    await TestBed.configureTestingModule({
      imports: [DocumentosPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: rota },
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  /**
   * Responde a busca dos pedidos de documento que a tela faz ao abrir.
   *
   * Passou a casar `/pendencias` quando a #180 entrou: a rota antiga (`/contador/pendencias`)
   * nunca existiu no backend. O `includes('/contador')` fica para o caso de alguma chamada do
   * cliente antigo sobrar.
   */
  function flushPendencias() {
    httpMock
      .match((r) => r.url.includes('/pendencias') || r.url.includes('/contador'))
      .forEach((r) => r.flush([]));
    // Desde a #178 a tela tambem pergunta se ha escritorio vinculado: e isso que decide se o
    // botao e "Emitir" ou "Enviar para revisao".
    httpMock.match((r) => r.url === '/vinculos').forEach((r) => r.flush([]));
  }

  /** Uma página do Spring Data com as notas dadas. */
  function pagina(notas: Record<string, unknown>[]) {
    return {
      content: notas,
      totalElements: notas.length,
      totalPages: 1,
      number: 0,
      size: 100,
      first: true,
      last: true,
      numberOfElements: notas.length,
      empty: notas.length === 0,
    };
  }

  function nota(id: string, dataEmissao: string, over: Record<string, unknown> = {}) {
    return {
      id,
      numero: Number(id.replace(/\D/g, '')) || 1,
      dataEmissao,
      status: 'AUTORIZADA',
      destinatarioNome: 'Cerealista Sorriso Ltda',
      naturezaOperacao: 'Venda de produção',
      valorTotalNota: 1000,
      tipoDocumento: 'NFE',
      ...over,
    };
  }

  /** Cria a tela já com as notas carregadas. */
  function comNotas(notas: Record<string, unknown>[]) {
    const fixture = TestBed.createComponent(DocumentosPage);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === '/notas').flush(pagina(notas));
    flushPendencias();
    fixture.detectChanges();
    return fixture;
  }

  /** `AAAA-MM-DD` de `n` dias atrás. */
  function diasAtras(n: number) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${mes}-${String(d.getDate()).padStart(2, '0')}`;
  }

  it('as opções de período saem das notas que existem, com a contagem de cada mês', () => {
    // Antes as opções eram relativas a hoje ("Este mês", "Mês anterior") e, com notas de abril
    // a setembro, a maioria devolvia lista vazia: um filtro que só sabe dizer "nada aqui".
    const cmp = comNotas([
      nota('n1', '2026-09-10'),
      nota('n2', '2026-09-04'),
      nota('n3', '2026-06-20'),
      nota('n4', '2025-12-01'),
    ]).componentInstance;

    const anos = cmp.periodosPorAno();
    expect(anos.map((a) => a.ano)).toEqual(['2026', '2025']);
    expect(anos[0].total).toBe(3);
    expect(anos[0].meses.map((m) => m.value)).toEqual(['2026-09', '2026-06']);
    expect(anos[0].meses[0].label).toBe('Setembro (2)');
    expect(anos[1].meses.map((m) => m.label)).toEqual(['Dezembro (1)']);
  });

  it('escolher um mês deixa só as notas daquele mês; o ano inteiro, as do ano', () => {
    const cmp = comNotas([
      nota('n1', '2026-09-10'),
      nota('n2', '2026-06-20'),
      nota('n3', '2025-12-01'),
    ]).componentInstance;

    cmp.periodo.set('2026-09');
    expect(cmp.notasFiltradas().map((n) => n.id)).toEqual(['n1']);

    cmp.periodo.set('2026');
    expect(cmp.notasFiltradas().map((n) => n.id)).toEqual(['n1', 'n2']);

    cmp.periodo.set('todos');
    expect(cmp.notasFiltradas()).toHaveLength(3);
  });

  it('a data é comparada como texto: o mês não escorrega por causa do fuso', () => {
    // `new Date('2026-09-01')` é meia-noite em UTC e, no horário de Brasília, cai em 31/08 —
    // a nota do dia 1º sairia do filtro de setembro.
    const cmp = comNotas([
      nota('primeiro', '2026-09-01'),
      nota('ultimo', '2026-09-30'),
    ]).componentInstance;

    cmp.periodo.set('2026-09');
    expect(
      cmp
        .notasFiltradas()
        .map((n) => n.id)
        .sort(),
    ).toEqual(['primeiro', 'ultimo']);
  });

  it('"Últimos 30 dias" só aparece quando há nota nesse intervalo', () => {
    const recente = comNotas([nota('r', diasAtras(5))]).componentInstance;
    expect(recente.temNotasRecentes()).toBe(true);

    const antiga = comNotas([nota('a', diasAtras(120))]).componentInstance;
    expect(antiga.temNotasRecentes()).toBe(false);
  });

  it('o filtro de situação ganhou controle na tela — antes só existia no componente', () => {
    const fixture = comNotas([
      nota('auth', '2026-09-10', { status: 'AUTORIZADA' }),
      nota('rasc', '2026-09-11', { status: 'RASCUNHO' }),
    ]);
    const cmp = fixture.componentInstance;

    const select = (fixture.nativeElement as HTMLElement).querySelector<HTMLSelectElement>(
      'select[aria-label="Situação da nota"]',
    );
    expect(select).not.toBeNull();

    cmp.statusFilter.set('RASCUNHO');
    expect(cmp.notasFiltradas().map((n) => n.id)).toEqual(['rasc']);
  });

  it('o nome do destinatário tem a largura do card, em vez de dividir com o selo', () => {
    // "Com inconsistências" é um selo largo e dividia a linha com o nome: sobrava "Coope...".
    const fixture = comNotas([
      nota('n1', '2026-09-10', {
        destinatarioNome: 'Cooperativa Cafeeira XYZ Ltda',
        status: 'COM_INCONSISTENCIAS',
      }),
    ]);
    const texto = ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');
    expect(texto).toContain('Cooperativa Cafeeira XYZ Ltda');
  });

  it('DASH-11: em falha do GET /api/notas, mostra notasErro(true) e lista vazia — sem mockNotas', () => {
    const fixture = TestBed.createComponent(DocumentosPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();

    httpMock
      .expectOne((r) => r.url === '/notas')
      .flush('erro', { status: 500, statusText: 'Server Error' });
    flushPendencias();

    expect(cmp.notasErro()).toBe(true);
    expect(cmp.notas()).toEqual([]);
    expect(cmp.totalElements()).toBe(0);
  });

  it('DASH-11: em sucesso, notasErro fica false e a lista vem do backend', () => {
    const fixture = TestBed.createComponent(DocumentosPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();

    httpMock
      .expectOne((r) => r.url === '/notas')
      .flush({
        content: [],
        totalElements: 0,
        totalPages: 0,
        number: 0,
        size: 12,
        first: true,
        last: true,
        numberOfElements: 0,
        empty: true,
      });
    flushPendencias();

    expect(cmp.notasErro()).toBe(false);
  });

  it('DASH-11: ao tentar novamente após um erro, notasErro é limpo assim que a recarga começa', () => {
    const fixture = TestBed.createComponent(DocumentosPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();

    httpMock
      .expectOne((r) => r.url === '/notas')
      .flush('erro', { status: 500, statusText: 'Server Error' });
    flushPendencias();
    expect(cmp.notasErro()).toBe(true);

    cmp.recarregarNotas();
    expect(cmp.notasErro()).toBe(false);

    httpMock
      .expectOne((r) => r.url === '/notas')
      .flush({
        content: [],
        totalElements: 0,
        totalPages: 0,
        number: 0,
        size: 12,
        first: true,
        last: true,
        numberOfElements: 0,
        empty: true,
      });
    expect(cmp.notasErro()).toBe(false);
  });

  /**
   * Os pedidos de documento do escritorio (backend#180).
   *
   * Os dois testes que havia aqui exercitavam `salvarAnexo()` contra `/contador/pendencias` e
   * `/contador/documentos/anexar` -- rotas que **nunca existiram** no backend. Passavam porque o
   * `HttpTestingController` responde o que mandarem responder; contra o servidor de verdade era
   * 404 desde sempre, e a secao jamais apareceu na tela.
   */
  /**
   * A revisao do contador antes da emissao (backend#178).
   *
   * Medido em 28/10: com escritorio vinculado, `gerar-xml` num rascunho responde
   * **409 APROVACAO_EXIGIDA**. Ou seja, o botao "Gerar XML" desta tela **ja esta quebrado** para
   * quem tem contador -- e o produtor semente tem.
   */
  /**
   * "Precisam de revisao" voltou a significar uma coisa so (issue #111).
   *
   * O rotulo contava as notas **travadas pelo fisco** (`COM_INCONSISTENCIAS`/`REJEITADA`). Com a
   * #178 no ar, "revisao" passou a ser outra coisa: a nota que o produtor **enviou para o
   * contador aprovar**. No teste manual de 28/10 o painel dizia "Precisam de revisao: 0" com a
   * nota 117 aguardando aprovacao -- as duas pilhas sob o mesmo nome, e a que importava invisivel.
   *
   * Agora `revisao` e `AGUARDANDO_APROVACAO`, e o que o fisco travou tem a aba propria.
   */
  /**
   * Status desconhecido ou em transito nao oferece acao (#111, regra da #96).
   *
   * As predicates da tela sao **allowlists por status**, entao isso vale por construcao -- mas e
   * exatamente o tipo de garantia que se perde na primeira vez que alguem escrever
   * `status !== 'AUTORIZADA'` em vez de listar. O teste fixa a regra.
   */
  describe('acoes em estado transitorio ou desconhecido (#111)', () => {
    const notaCom = (status: string) =>
      ({ id: 'n1', numero: 1, status, dataEmissao: '2026-09-10T03:00:00Z', itens: [] }) as never;

    function abrir() {
      const fixture = TestBed.createComponent(DocumentosPage);
      fixture.detectChanges();
      httpMock.expectOne((r) => r.url === '/notas').flush(pagina([]));
      flushPendencias();
      return fixture.componentInstance;
    }

    it('ENVIANDO e CANCELANDO nao aceitam editar, emitir nem cancelar', () => {
      const cmp = abrir();
      for (const status of ['ENVIANDO', 'CANCELANDO']) {
        const nota = notaCom(status);
        expect(cmp.podeEditar(nota), status).toBe(false);
        expect(cmp.podeGerarXml(nota), status).toBe(false);
        expect(cmp.podeCancelar(nota), status).toBe(false);
        expect(cmp.podeEnviarParaRevisao(nota), status).toBe(false);
      }
    });

    it('um status que o backend invente tambem nao oferece nada', () => {
      const cmp = abrir();
      const nota = notaCom('ALGO_QUE_NAO_EXISTE_AINDA');

      expect(cmp.podeEditar(nota)).toBe(false);
      expect(cmp.podeGerarXml(nota)).toBe(false);
      expect(cmp.podeCancelar(nota)).toBe(false);
      expect(cmp.podeRetirarDaRevisao(nota)).toBe(false);
    });
  });

  describe('as duas pilhas do contador (#111)', () => {
    const nota = (id: string, status: string) => ({
      id,
      numero: Number(id.replace(/\D/g, '')) || 1,
      serie: 1,
      status,
      dataEmissao: '2026-09-10T03:00:00Z',
      destinatarioNome: 'Cooperativa',
      valorTotalNota: 1000,
      itens: [],
    });

    function abrirContador(notas: Record<string, unknown>[]) {
      localStorage.setItem('agrocontabil.perfil', 'contador');
      const fixture = TestBed.createComponent(DocumentosPage);
      fixture.detectChanges();
      httpMock.expectOne((r) => r.url === '/notas').flush(pagina(notas));
      flushPendencias();
      httpMock.match((r) => r.url.endsWith('/revisoes')).forEach((r) => r.flush([]));
      return fixture.componentInstance;
    }

    afterEach(() => localStorage.clear());

    it('"Precisam de revisao" conta o que aguarda aprovacao, nao o que o fisco travou', () => {
      const cmp = abrirContador([
        nota('n1', 'AGUARDANDO_APROVACAO'),
        nota('n2', 'AGUARDANDO_APROVACAO'),
        nota('n3', 'COM_INCONSISTENCIAS'),
      ]);

      const aba = cmp.triagemDoContador().find((t) => t.chave === 'revisao');
      expect(aba?.quantidade).toBe(2);
    });

    it('o que o fisco travou ganhou aba propria, em vez de sumir', () => {
      const cmp = abrirContador([
        nota('n1', 'AGUARDANDO_APROVACAO'),
        nota('n3', 'COM_INCONSISTENCIAS'),
        nota('n4', 'REJEITADA'),
      ]);

      const aba = cmp.triagemDoContador().find((t) => t.chave === 'travadas');
      expect(aba?.quantidade).toBe(2);
    });

    it('filtrar por revisao deixa so o que aguarda aprovacao', () => {
      const cmp = abrirContador([
        nota('n1', 'AGUARDANDO_APROVACAO'),
        nota('n3', 'COM_INCONSISTENCIAS'),
      ]);

      cmp.statusFilter.set('revisao');
      expect(cmp.notasFiltradas().map((n) => n.id)).toEqual(['n1']);
    });

    it('filtrar por DEVOLVIDA e por AGUARDANDO_APROVACAO funciona: sao status do backend', () => {
      const cmp = abrirContador([
        nota('n1', 'AGUARDANDO_APROVACAO'),
        nota('n5', 'DEVOLVIDA'),
      ]);

      cmp.statusFilter.set('DEVOLVIDA');
      expect(cmp.notasFiltradas().map((n) => n.id)).toEqual(['n5']);

      cmp.statusFilter.set('AGUARDANDO_APROVACAO');
      expect(cmp.notasFiltradas().map((n) => n.id)).toEqual(['n1']);
    });
  });

  describe('revisao do contador (#178)', () => {
    const rascunho = (over: Record<string, unknown> = {}) => ({
      id: 'n1',
      numero: 10,
      serie: 1,
      status: 'RASCUNHO',
      dataEmissao: '2026-10-01T03:00:00Z',
      destinatarioNome: 'Cooperativa',
      valorTotalNota: 1000,
      itens: [],
      ...over,
    });

    function abrir(notas: Record<string, unknown>[], vinculos: unknown[]) {
      const fixture = TestBed.createComponent(DocumentosPage);
      fixture.detectChanges();
      httpMock.expectOne((r) => r.url === '/notas').flush(pagina(notas));
      httpMock.expectOne((r) => r.url === '/pendencias').flush([]);
      httpMock.expectOne((r) => r.url === '/vinculos').flush(vinculos);
      return fixture.componentInstance;
    }

    /** Responde o historico de revisao que as notas DEVOLVIDAS disparam. */
    function flushRevisoes() {
      httpMock.match((r) => r.url.endsWith('/revisoes')).forEach((r) => r.flush([]));
    }

    const comEscritorio = [{ id: 'v1', escritorio: 'Campo Certo', situacao: 'ATIVO' }];

    it('pergunta ao servidor se ha escritorio vinculado', () => {
      const cmp = abrir([rascunho()], comEscritorio);
      expect(cmp.temContador()).toBe(true);
    });

    it('vinculo encerrado nao conta: so o ATIVO alcanca a nota', () => {
      const cmp = abrir([rascunho()], [{ id: 'v1', situacao: 'ENCERRADO' }]);
      expect(cmp.temContador()).toBe(false);
    });

    it('COM contador, o rascunho vai para revisao -- nao direto para o XML', () => {
      const cmp = abrir([rascunho()], comEscritorio);
      const nota = cmp.notas()[0]!;

      expect(cmp.podeEnviarParaRevisao(nota)).toBe(true);
      expect(cmp.podeGerarXml(nota)).toBe(false);
    });

    it('SEM contador, o fluxo antigo continua: rascunho gera XML direto', () => {
      const cmp = abrir([rascunho()], []);
      const nota = cmp.notas()[0]!;

      expect(cmp.podeEnviarParaRevisao(nota)).toBe(false);
      expect(cmp.podeGerarXml(nota)).toBe(true);
    });

    it('a nota aprovada volta a poder gerar XML, mesmo com contador', () => {
      const cmp = abrir([rascunho({ status: 'APROVADA' })], comEscritorio);
      expect(cmp.podeGerarXml(cmp.notas()[0]!)).toBe(true);
    });

    it('enviar para revisao troca a nota pela que o servidor devolveu', () => {
      const cmp = abrir([rascunho()], comEscritorio);

      cmp.enviarParaRevisao(cmp.notas()[0]!);

      httpMock
        .expectOne((r) => r.url === '/notas/n1/enviar-para-revisao')
        .flush(rascunho({ status: 'AGUARDANDO_APROVACAO' }));

      expect(cmp.notas()[0]!.status).toBe('AGUARDANDO_APROVACAO');
    });

    it('enquanto esta com o contador, a nota nao e editavel nem volta para o XML', () => {
      const cmp = abrir([rascunho({ status: 'AGUARDANDO_APROVACAO' })], comEscritorio);
      const nota = cmp.notas()[0]!;

      expect(cmp.podeEditar(nota)).toBe(false);
      expect(cmp.podeGerarXml(nota)).toBe(false);
      // Mas da para desistir e trazer de volta.
      expect(cmp.podeRetirarDaRevisao(nota)).toBe(true);
    });

    it('aprovada tambem nao e editavel: mudar invalidaria a aprovacao', () => {
      const cmp = abrir([rascunho({ status: 'APROVADA' })], comEscritorio);
      expect(cmp.podeEditar(cmp.notas()[0]!)).toBe(false);
    });

    it('devolvida volta a ser editavel, como rascunho', () => {
      const cmp = abrir([rascunho({ status: 'DEVOLVIDA' })], comEscritorio);
      flushRevisoes();
      const nota = cmp.notas()[0]!;

      expect(cmp.podeEditar(nota)).toBe(true);
      expect(cmp.podeEnviarParaRevisao(nota)).toBe(true);
    });

    it('a nota devolvida busca o motivo no historico: e o que diz o que corrigir', () => {
      const cmp = abrir([rascunho({ status: 'DEVOLVIDA' })], comEscritorio);

      httpMock
        .expectOne((r) => r.url === '/notas/n1/revisoes')
        .flush([
          { id: 'r2', acao: 'DEVOLVIDA', motivo: 'Falta o CFOP no item 2.', papel: 'CONTADOR', ocorridoEm: 'b' },
          { id: 'r1', acao: 'ENVIADA', motivo: null, papel: 'PRODUTOR', ocorridoEm: 'a' },
        ]);

      expect(cmp.motivoDaDevolucao('n1')).toBe('Falta o CFOP no item 2.');
    });
  });

  describe('pedidos de documento (#180)', () => {
    const pendencia = (over: Record<string, unknown> = {}) => ({
      id: 'pd-1',
      produtorId: 'p1',
      escritorioId: 'e1',
      titulo: 'Comprovantes de frete de setembro',
      descricao: 'Preciso dos comprovantes das tres cargas.',
      observacoes: null,
      dataLimite: '2026-11-05',
      tiposDocumento: ['NOTA_FISCAL', 'COMPROVANTE_PAGAMENTO'],
      status: 'PENDENTE',
      motivo: null,
      quantidadeAnexos: 0,
      anexos: [] as Record<string, unknown>[],
      createdAt: '2026-10-28T15:55:56Z',
      updatedAt: '2026-10-28T15:55:56Z',
      ...over,
    });

    const anexo = (situacao: string) => ({
      id: 'a1',
      nomeArquivo: 'comprovante.pdf',
      mime: 'application/pdf',
      tamanho: 125,
      sha256: 'abc',
      situacao,
      enviadoEm: '2026-10-28T15:56:13Z',
    });

    function abrir(pendencias: Record<string, unknown>[] = [pendencia()]) {
      const fixture = TestBed.createComponent(DocumentosPage);
      fixture.detectChanges();
      httpMock.expectOne((r) => r.url === '/notas').flush(pagina([]));
      httpMock.expectOne((r) => r.url === '/pendencias').flush(pendencias);
      // Desde a #178 a tela tambem pergunta se ha escritorio vinculado.
      httpMock.expectOne((r) => r.url === '/vinculos').flush([]);
      // Quem esta PENDENTE com anexo ganha uma busca de detalhe (ver `completarAnexosParados`);
      // devolvemos o proprio item, sem anexos, que e o caso neutro.
      httpMock
        .match((r) => /\/pendencias\/[^/]+$/.test(r.url))
        .forEach((r, i) => r.flush(pendencias[i] ?? pendencia()));
      return fixture;
    }

    function evento(arquivo: File) {
      return { target: { files: [arquivo], value: 'c:/fake/comprovante.pdf' } } as unknown as Event;
    }

    const pdf = (tamanho = 10) =>
      new File([new Uint8Array(tamanho)], 'comprovante.pdf', { type: 'application/pdf' });

    it('busca os pedidos na rota do produtor, sem produtorId', () => {
      const fixture = TestBed.createComponent(DocumentosPage);
      fixture.detectChanges();
      httpMock.expectOne((r) => r.url === '/notas').flush(pagina([]));

      const req = httpMock.expectOne((r) => r.url === '/pendencias');
      expect(req.request.params.keys()).toEqual([]);
      req.flush([pendencia()]);
      httpMock.expectOne((r) => r.url === '/vinculos').flush([]);

      expect(fixture.componentInstance.pendencias().length).toBe(1);
      expect(fixture.componentInstance.pendenciasEsperandoVoce()).toBe(1);
    });

    /**
     * A lista devolve `anexos: []` e so o `quantidadeAnexos` -- os metadados vem no detalhe.
     *
     * Sem buscar o detalhe, o aviso de "em verificacao" aparecia no instante do upload e **sumia
     * ao recarregar a pagina**: o produtor voltava, via "esperando voce" com o arquivo ja enviado
     * e nenhuma explicacao, e mandava de novo. E o unico caso em que vale gastar requisicao a
     * mais, e so para quem tem arquivo parado (PENDENTE com anexo).
     */
    it('busca o detalhe de quem tem arquivo parado, para saber do antivirus ao recarregar', () => {
      const fixture = TestBed.createComponent(DocumentosPage);
      fixture.detectChanges();
      httpMock.expectOne((r) => r.url === '/notas').flush(pagina([]));
      httpMock
        .expectOne((r) => r.url === '/pendencias')
        .flush([
          pendencia({ id: 'pd-1', status: 'PENDENTE', quantidadeAnexos: 1 }),
          pendencia({ id: 'pd-2', status: 'PENDENTE', quantidadeAnexos: 0 }),
          pendencia({ id: 'pd-3', status: 'ENVIADA', quantidadeAnexos: 2 }),
        ]);
      httpMock.expectOne((r) => r.url === '/vinculos').flush([]);

      // So a pd-1: a pd-2 nao tem arquivo e a pd-3 ja passou pelo antivirus.
      httpMock.expectNone((r) => r.url === '/pendencias/pd-2');
      httpMock.expectNone((r) => r.url === '/pendencias/pd-3');
      httpMock
        .expectOne((r) => r.url === '/pendencias/pd-1')
        .flush(
          pendencia({ id: 'pd-1', status: 'PENDENTE', quantidadeAnexos: 1, anexos: [anexo('EM_VERIFICACAO')] }),
        );

      const cmp = fixture.componentInstance;
      expect(cmp.emVerificacao(cmp.pendencias().find((p) => p.id === 'pd-1')!)).toBe(true);
    });

    it('detalhe que falha nao derruba a lista: o pedido continua na tela', () => {
      const fixture = TestBed.createComponent(DocumentosPage);
      fixture.detectChanges();
      httpMock.expectOne((r) => r.url === '/notas').flush(pagina([]));
      httpMock
        .expectOne((r) => r.url === '/pendencias')
        .flush([pendencia({ id: 'pd-1', status: 'PENDENTE', quantidadeAnexos: 1 })]);
      httpMock.expectOne((r) => r.url === '/vinculos').flush([]);
      httpMock
        .expectOne((r) => r.url === '/pendencias/pd-1')
        .flush('erro', { status: 500, statusText: 'Server Error' });

      expect(fixture.componentInstance.pendencias().length).toBe(1);
    });

    it('anexar manda o arquivo e troca a pendencia pela versao que o servidor devolveu', () => {
      const cmp = abrir().componentInstance;

      cmp.anexarNaPendencia(cmp.pendencias()[0]!, evento(pdf()));

      const req = httpMock.expectOne((r) => r.url === '/pendencias/pd-1/anexos');
      expect((req.request.body as FormData).get('arquivo')).toBeInstanceOf(File);
      req.flush(pendencia({ status: 'ENVIADA', quantidadeAnexos: 1, anexos: [anexo('LIMPO')] }));

      expect(cmp.pendencias()[0]!.status).toBe('ENVIADA');
      expect(cmp.anexandoEm()).toBeNull();
    });

    it('antivirus fora do ar: o arquivo sobe, mas o pedido CONTINUA esperando o produtor', () => {
      const cmp = abrir().componentInstance;

      cmp.anexarNaPendencia(cmp.pendencias()[0]!, evento(pdf()));
      httpMock
        .expectOne((r) => r.url === '/pendencias/pd-1/anexos')
        .flush(
          pendencia({ status: 'PENDENTE', quantidadeAnexos: 1, anexos: [anexo('EM_VERIFICACAO')] }),
          { status: 201, statusText: 'Created' },
        );

      // E o caso que mais confunde: sem dizer isto, o produtor acha que falhou e manda de novo.
      expect(cmp.emVerificacao(cmp.pendencias()[0]!)).toBe(true);
      expect(cmp.pendencias()[0]!.status).toBe('PENDENTE');
      expect(cmp.pendenciasEsperandoVoce()).toBe(1);
    });

    it('arquivo acima de 5 MB nem sai do navegador', () => {
      const cmp = abrir().componentInstance;

      cmp.anexarNaPendencia(cmp.pendencias()[0]!, evento(pdf(5 * 1024 * 1024 + 1)));

      // Gastar o upload inteiro do 4G da fazenda para receber 400 no fim seria cruel.
      httpMock.expectNone((r) => r.url === '/pendencias/pd-1/anexos');
      expect(cmp.anexandoEm()).toBeNull();
    });

    it('pedido que ja tem 10 arquivos nao tenta o 11o', () => {
      const cmp = abrir([pendencia({ quantidadeAnexos: 10 })]).componentInstance;

      cmp.anexarNaPendencia(cmp.pendencias()[0]!, evento(pdf()));

      httpMock.expectNone((r) => r.url === '/pendencias/pd-1/anexos');
    });

    it('a recusa do servidor para de ser generica: cada codigo tem a sua saida', () => {
      const cmp = abrir().componentInstance;
      const erros: string[] = [];
      const toast = TestBed.inject(ToastService);
      vi.spyOn(toast, 'error').mockImplementation(((m: string) => {
        erros.push(m);
      }) as typeof toast.error);

      const casos: [string, string][] = [
        ['ANEXO_INVALIDO', 'PDF, JPG, PNG ou XML'],
        ['ANEXO_INFECTADO', 'antivirus recusou'],
        ['LIMITE_ANEXOS', 'limite'],
        ['TRANSICAO_PENDENCIA_INVALIDA', 'nao esta mais aceitando'],
      ];
      for (const [codigo, trecho] of casos) {
        cmp.anexarNaPendencia(cmp.pendencias()[0]!, evento(pdf()));
        httpMock
          .expectOne((r) => r.url === '/pendencias/pd-1/anexos')
          .flush({ errors: [{ code: codigo }] }, { status: 400, statusText: 'Bad Request' });
        expect(erros.at(-1)).toContain(trecho);
      }

      expect(erros.length).toBe(4);
    });

    it('o status vira rotulo na voz do produtor, nao o codigo do backend', () => {
      const cmp = abrir().componentInstance;

      expect(cmp.pendenciaStatusLabel('PENDENTE')).toBe('Esperando você');
      expect(cmp.pendenciaStatusLabel('ENVIADA')).toBe('Com o escritório');
      expect(cmp.tiposAceitos(cmp.pendencias()[0]!)).toBe(
        'nota fiscal ou comprovante de pagamento',
      );
    });
  });

  /**
   * O alerta do painel ("2 notas precisam da sua correcao") levava so para a
   * lista, e quem chegava tinha que cacar a nota certa entre as 12 da pagina.
   * Sugestao do professor: abrir direto o modal da nota.
   */
  describe('abertura por ?nota= (vinda do alerta do painel)', () => {
    const nota7 = {
      id: 'n7',
      numero: 7,
      status: 'COM_INCONSISTENCIAS',
      naturezaOperacao: 'Venda de cafe',
      dataEmissao: '2026-06-20T00:00:00Z',
      destinatarioNome: 'Cooperativa Cafeeira XYZ',
      destinatarioCpfCnpj: '00000000000191',
      itens: [],
    };

    it('sem o parametro, nao busca nota nenhuma por id', () => {
      const fixture = TestBed.createComponent(DocumentosPage);
      fixture.detectChanges();
      httpMock.expectOne((r) => r.url === '/notas').flush({ content: [], totalElements: 0 });
      flushPendencias();

      expect(httpMock.match((r) => /\/notas\/[^/]+$/.test(r.url)).length).toBe(0);
      expect(fixture.componentInstance.previewNota()).toBeNull();
    });

    it('com ?nota=<id>, busca a nota e abre o modal dela', () => {
      rota.snapshot.queryParamMap = convertToParamMap({ nota: 'n7' });
      const fixture = TestBed.createComponent(DocumentosPage);
      fixture.detectChanges();
      httpMock.expectOne((r) => r.url === '/notas').flush({ content: [], totalElements: 0 });

      // Busca por id, e nao na lista: a nota pode estar na pagina 2.
      httpMock.expectOne((r) => r.url === '/notas/n7').flush(nota7);
      httpMock.match((r) => r.url === '/notas/n7/validacoes').forEach((r) => r.flush([]));
      flushPendencias();

      expect(fixture.componentInstance.previewNota()?.numero).toBe(7);
    });

    it('com id inexistente, avisa e mantem a pagina de pe', () => {
      rota.snapshot.queryParamMap = convertToParamMap({ nota: 'sumiu' });
      const toast = TestBed.inject(ToastService);
      const erro = vi.spyOn(toast, 'error');

      const fixture = TestBed.createComponent(DocumentosPage);
      fixture.detectChanges();
      httpMock.expectOne((r) => r.url === '/notas').flush({ content: [], totalElements: 0 });
      httpMock
        .expectOne((r) => r.url === '/notas/sumiu')
        .flush('nao existe', { status: 404, statusText: 'Not Found' });
      flushPendencias();

      expect(erro).toHaveBeenCalled();
      expect(fixture.componentInstance.previewNota()).toBeNull();
    });
  });

  /**
   * Eram dois botoes flutuantes concorrendo no canto: "Nova NF-e" e um "+" que
   * abria o anexo ao contador -- este nunca funcionou, porque
   * /contador/pendencias responde 404. Agora um botao so, com as duas formas de
   * trazer uma nota atras de abas.
   */
  describe('abas do modal de nova nota', () => {
    function abrirPagina() {
      const fixture = TestBed.createComponent(DocumentosPage);
      fixture.detectChanges();
      httpMock.expectOne((r) => r.url === '/notas').flush({ content: [], totalElements: 0 });
      flushPendencias();
      return fixture;
    }

    it('abre na aba de criar', () => {
      const cmp = abrirPagina().componentInstance;
      cmp.abrirNovaNota();
      httpMock
        .match((r) => r.url === '/notas')
        .forEach((r) => r.flush({ content: [], totalElements: 0 }));

      expect(cmp.abaNota()).toBe('criar');
      expect(cmp.showFormNota()).toBe(true);
    });

    it('abre direto na aba pedida', () => {
      const cmp = abrirPagina().componentInstance;
      cmp.abrirNovaNota('carregar');
      httpMock
        .match((r) => r.url === '/notas')
        .forEach((r) => r.flush({ content: [], totalElements: 0 }));

      expect(cmp.abaNota()).toBe('carregar');
    });

    it('editar uma nota volta para a aba de criar — nao ha o que escolher ali', () => {
      const cmp = abrirPagina().componentInstance;
      cmp.abrirNovaNota('carregar');
      httpMock
        .match((r) => r.url === '/notas')
        .forEach((r) => r.flush({ content: [], totalElements: 0 }));

      cmp.editarNota({
        id: 'n7',
        numero: 7,
        status: 'COM_INCONSISTENCIAS',
        naturezaOperacao: 'Venda',
        dataEmissao: '2026-06-20T00:00:00Z',
        destinatarioNome: 'Cooperativa',
        destinatarioCpfCnpj: '00000000000191',
        itens: [],
      } as never);

      expect(cmp.formNotaId()).toBe('n7');
      // O estado nao pode ficar preso em "carregar": ao voltar para "Nova nota"
      // a pessoa cairia na aba errada.
      expect(cmp.abaNota()).toBe('criar');
    });
  });

  /**
   * A fila de correcoes: o caminho que comeca no alerta do painel e termina com
   * todas as notas travadas resolvidas, sem sair do modal a cada uma.
   */
  describe('aba "Precisam de ajuste"', () => {
    const travada = (id: string, numero: number) => ({
      id,
      numero,
      status: 'COM_INCONSISTENCIAS',
      naturezaOperacao: 'Venda',
      dataEmissao: '2026-06-20T00:00:00Z',
      destinatarioNome: 'Cooperativa',
      destinatarioCpfCnpj: '00000000000191',
      itens: [],
    });

    function abrirComFila(notas: unknown[]) {
      const fixture = TestBed.createComponent(DocumentosPage);
      fixture.detectChanges();
      httpMock.expectOne((r) => r.url === '/notas').flush({ content: [], totalElements: 0 });
      flushPendencias();

      fixture.componentInstance.abrirNovaNota('ajustar');
      httpMock
        .match((r) => r.url === '/notas')
        .forEach((r) => r.flush({ content: notas, totalElements: notas.length }));
      return fixture;
    }

    it('lista so as notas travadas, ignorando as que estao em ordem', () => {
      const cmp = abrirComFila([
        travada('n7', 7),
        { ...travada('n9', 9), status: 'AUTORIZADA' },
        { ...travada('n2', 2), status: 'REJEITADA' },
      ]).componentInstance;

      expect(cmp.notasParaAjustar().map((n) => n.numero)).toEqual([7, 2]);
    });

    it('busca a fila alem da pagina atual — uma nota travada pode estar na pagina 2', () => {
      const fixture = TestBed.createComponent(DocumentosPage);
      fixture.detectChanges();
      httpMock.expectOne((r) => r.url === '/notas').flush({ content: [], totalElements: 0 });
      flushPendencias();

      fixture.componentInstance.abrirNovaNota('ajustar');
      // Ha duas chamadas a /notas aqui: a fila e a sugestao do proximo numero.
      // A da fila e a que pede 100 — nao a pagina de 12 que a tela ja mostra.
      const daFila = httpMock.match((r) => r.url === '/notas' && r.params.get('size') === '100');
      expect(daFila.length).toBe(1);
      httpMock
        .match((r) => r.url === '/notas')
        .forEach((r) => r.flush({ content: [], totalElements: 0 }));
    });

    it('corrigir uma da fila e sair devolve para a fila, nao fecha o modal', () => {
      const cmp = abrirComFila([travada('n7', 7), travada('n2', 2)]).componentInstance;

      cmp.corrigirDaFila(cmp.notasParaAjustar()[0] as never);
      expect(cmp.formNotaId()).toBe('n7');

      cmp.fecharForm();
      httpMock
        .match((r) => r.url === '/notas')
        .forEach((r) => r.flush({ content: [travada('n2', 2)], totalElements: 1 }));

      // O modal continua aberto, agora na fila — a proxima nota a um clique.
      expect(cmp.showFormNota()).toBe(true);
      expect(cmp.abaNota()).toBe('ajustar');
      expect(cmp.formNotaId()).toBeNull();
    });

    it('sair de uma nota aberta fora da fila fecha o modal, como antes', () => {
      const fixture = TestBed.createComponent(DocumentosPage);
      fixture.detectChanges();
      httpMock.expectOne((r) => r.url === '/notas').flush({ content: [], totalElements: 0 });
      flushPendencias();

      fixture.componentInstance.abrirNovaNota();
      httpMock
        .match((r) => r.url === '/notas')
        .forEach((r) => r.flush({ content: [], totalElements: 0 }));

      fixture.componentInstance.fecharForm();
      expect(fixture.componentInstance.showFormNota()).toBe(false);
    });
  });

  /**
   * A lista mostrava a natureza da operacao em destaque -- e ela se repetia em 7
   * dos 12 cards ("Venda de producao do estabelecimento"), enquanto destinatario
   * e valor, que distinguem uma nota da outra, ficavam em texto fraco.
   */
  describe('hierarquia da lista', () => {
    function comNotas(notas: unknown[], total = notas.length) {
      const fixture = TestBed.createComponent(DocumentosPage);
      fixture.detectChanges();
      httpMock.expectOne((r) => r.url === '/notas').flush({ content: notas, totalElements: total });
      flushPendencias();
      fixture.detectChanges();
      return fixture;
    }

    const nota = {
      id: 'n1',
      numero: 101,
      status: 'AUTORIZADA',
      naturezaOperacao: 'Venda de producao do estabelecimento',
      dataEmissao: '2026-09-10T00:00:00Z',
      destinatarioNome: 'Cerealista Sorriso Ltda',
      destinatarioCpfCnpj: '00000000000191',
      valorTotalNota: 70500,
      itens: [],
    };

    it('o destinatario e o elemento forte do card, nao a natureza', () => {
      const fixture = comNotas([nota]);
      const card = (fixture.nativeElement as HTMLElement).querySelector('.grid > div.bg-card');

      const destaque = card?.querySelector('.font-heading');
      expect(destaque?.textContent?.trim()).toBe('Cerealista Sorriso Ltda');
    });

    it('nao repete um botao "Ver" — clicar no card ja abre a nota', () => {
      const fixture = comNotas([nota]);
      const textos = [
        ...(fixture.nativeElement as HTMLElement).querySelectorAll('.grid button'),
      ].map((b) => b.textContent?.trim());

      expect(textos.some((t) => t === 'Ver')).toBe(false);
    });

    it('destaca a nota travada — o selo sozinho nao a separava das outras 11', () => {
      const travada = { ...nota, id: 'n7', numero: 7, status: 'COM_INCONSISTENCIAS' };
      const fixture = comNotas([nota, travada]);
      const cards = (fixture.nativeElement as HTMLElement).querySelectorAll('.grid > div.bg-card');

      expect(cards[0].className).not.toContain('border-aviso');
      expect(cards[1].className).toContain('border-aviso');
    });

    it('a contagem diz quantas de quantas — 12 e a pagina, nao o total', () => {
      const fixture = comNotas([nota], 15);
      const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';

      expect(texto).toContain('1 de 15');
    });
  });

  /**
   * Tres ideias que o dono aprovou de uma vez: agrupar por mes, adensar a grade
   * e fazer os filtros falarem. Os testes guardam o comportamento, nao o visual.
   */
  describe('agrupamento por mes e filtros', () => {
    function comNotas(notas: unknown[], total = notas.length) {
      const fixture = TestBed.createComponent(DocumentosPage);
      fixture.detectChanges();
      httpMock.expectOne((r) => r.url === '/notas').flush({ content: notas, totalElements: total });
      flushPendencias();
      fixture.detectChanges();
      return fixture;
    }

    function nota(id: string, dataEmissao: string, extra: Record<string, unknown> = {}) {
      return {
        id,
        numero: Number(id.slice(1)),
        status: 'AUTORIZADA',
        naturezaOperacao: 'Venda de producao',
        dataEmissao,
        destinatarioNome: 'Cerealista Sorriso Ltda',
        destinatarioCpfCnpj: '00000000000191',
        valorTotalNota: 1000,
        itens: [],
        ...extra,
      };
    }

    it('separa as notas em um grupo por mes de emissao', () => {
      const fixture = comNotas([
        nota('n1', '2026-09-10T00:00:00Z'),
        nota('n2', '2026-09-02T00:00:00Z'),
        nota('n3', '2026-08-15T00:00:00Z'),
      ]);
      const grupos = fixture.componentInstance.notasPorMes();

      expect(grupos.map((g) => g.chave)).toEqual(['2026-09', '2026-08']);
      expect(grupos[0].notas.length).toBe(2);
      expect(grupos[1].notas.length).toBe(1);
    });

    it('o cabecalho do mes sai por extenso e em portugues', () => {
      const fixture = comNotas([nota('n1', '2026-09-10T00:00:00Z')]);
      const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';

      expect(texto).toContain('Setembro de 2026');
      expect(texto).toContain('1 nota(s)');
    });

    it('ordenado por valor nao agrupa — um cabecalho de mes mentiria sobre a sequencia', () => {
      const fixture = comNotas([
        nota('n1', '2026-09-10T00:00:00Z', { valorTotalNota: 100 }),
        nota('n2', '2026-08-01T00:00:00Z', { valorTotalNota: 900 }),
      ]);
      const cmp = fixture.componentInstance;

      cmp.ordenacao.set('valor');
      fixture.detectChanges();

      expect(cmp.notasPorMes()).toEqual([]);
      // A lista continua inteira: so perdeu os cabecalhos.
      expect(cmp.listaAgrupada().length).toBe(1);
      expect(cmp.listaAgrupada()[0].notas.length).toBe(2);
      expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Setembro de 2026');
    });

    it('sem filtro ativo nao oferece "Limpar filtros"', () => {
      const fixture = comNotas([nota('n1', '2026-09-10T00:00:00Z')]);

      expect(fixture.componentInstance.temFiltroAtivo()).toBe(false);
      expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Limpar filtros');
    });

    it('com busca ativa, diz quantas sobraram e oferece limpar', () => {
      const fixture = comNotas([
        nota('n1', '2026-09-10T00:00:00Z', { destinatarioNome: 'Cerealista Sorriso Ltda' }),
        nota('n2', '2026-09-11T00:00:00Z', { destinatarioNome: 'Frigorifico Norte' }),
      ]);
      const cmp = fixture.componentInstance;

      cmp.busca.set('Sorriso');
      fixture.detectChanges();

      const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
      expect(cmp.temFiltroAtivo()).toBe(true);
      expect(texto).toContain('1 de 2');
      // Tudo carregado: dizer "nesta página" sugeriria que há nota fora do filtro.
      expect(texto).not.toContain('nesta página');
      expect(texto).toContain('Limpar filtros');
    });

    it('limparFiltros devolve os quatro filtros ao estado neutro', () => {
      const fixture = comNotas([nota('n1', '2026-09-10T00:00:00Z')]);
      const cmp = fixture.componentInstance;

      cmp.busca.set('qualquer');
      cmp.periodo.set('2026-09');
      cmp.tipo.set('NFE');
      cmp.statusFilter.set('AUTORIZADA');
      expect(cmp.temFiltroAtivo()).toBe(true);

      cmp.limparFiltros();
      // A situacao virou filtro de SERVIDOR (#104): limpa-la recarrega a lista.
      httpMock
        .match((r) => r.url === '/notas')
        .filter((r) => !r.cancelled)
        .forEach((r) => r.flush({ content: [], totalElements: 0 }));
      fixture.detectChanges();

      expect(cmp.temFiltroAtivo()).toBe(false);
      expect(cmp.busca()).toBe('');
      expect(cmp.periodo()).toBe('todos');
      expect(cmp.tipo()).toBe('todos');
      expect(cmp.statusFilter()).toBe('todos');
    });
  });

  /**
   * Com varios meses na tela a lista fica longa; fechar um mes e como fechar uma
   * pasta. O estado guardado e o **fechado**, para um mes novo nascer aberto.
   */
  describe('abrir e fechar os meses', () => {
    function comNotas(notas: unknown[], total = notas.length) {
      const fixture = TestBed.createComponent(DocumentosPage);
      fixture.detectChanges();
      httpMock.expectOne((r) => r.url === '/notas').flush({ content: notas, totalElements: total });
      flushPendencias();
      fixture.detectChanges();
      return fixture;
    }

    function nota(id: string, dataEmissao: string) {
      return {
        id,
        numero: Number(id.slice(1)),
        status: 'AUTORIZADA',
        naturezaOperacao: 'Venda de producao',
        dataEmissao,
        destinatarioNome: 'Cerealista Sorriso Ltda',
        destinatarioCpfCnpj: '00000000000191',
        valorTotalNota: 1000,
        itens: [],
      };
    }

    const doisMeses = () => [
      nota('n1', '2026-09-10T00:00:00Z'),
      nota('n2', '2026-08-05T00:00:00Z'),
    ];

    it('todo mes comeca aberto', () => {
      const cmp = comNotas(doisMeses()).componentInstance;

      expect(cmp.mesAberto('2026-09')).toBe(true);
      expect(cmp.mesAberto('2026-08')).toBe(true);
      expect(cmp.todosOsMesesAbertos()).toBe(true);
    });

    it('fechar um mes tira os cards dele do DOM, e so os dele', () => {
      const fixture = comNotas(doisMeses());
      const cmp = fixture.componentInstance;

      cmp.alternarMes('2026-09');
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(cmp.mesAberto('2026-09')).toBe(false);
      expect(cmp.mesAberto('2026-08')).toBe(true);
      // O cabecalho continua; o conteudo nao.
      expect(el.textContent).toContain('Setembro de 2026');
      expect(el.querySelectorAll('#notas-2026-09 > div.bg-card').length).toBe(0);
      expect(el.querySelectorAll('#notas-2026-08 > div.bg-card').length).toBe(1);
    });

    it('o cabecalho anuncia o estado para leitor de tela', () => {
      const fixture = comNotas(doisMeses());
      const botao = (fixture.nativeElement as HTMLElement).querySelector(
        '[aria-controls="notas-2026-09"]',
      );

      expect(botao?.getAttribute('aria-expanded')).toBe('true');

      fixture.componentInstance.alternarMes('2026-09');
      fixture.detectChanges();
      expect(botao?.getAttribute('aria-expanded')).toBe('false');
    });

    it('o cabecalho mostra a soma do mes — serve de resumo com o mes fechado', () => {
      const fixture = comNotas([
        nota('n1', '2026-09-10T00:00:00Z'),
        nota('n2', '2026-09-20T00:00:00Z'),
      ]);
      fixture.componentInstance.alternarMes('2026-09');
      fixture.detectChanges();

      const texto =
        (fixture.nativeElement as HTMLElement).textContent?.replace(/\u00a0/g, ' ') ?? '';
      expect(texto).toContain('R$ 2.000,00');
    });

    it('com busca ativa tudo reabre — resultado nao pode ficar escondido', () => {
      const fixture = comNotas(doisMeses());
      const cmp = fixture.componentInstance;

      cmp.alternarMes('2026-09');
      expect(cmp.mesAberto('2026-09')).toBe(false);

      cmp.busca.set('Cerealista');
      fixture.detectChanges();
      expect(cmp.mesAberto('2026-09')).toBe(true);

      // E o que ele fechou nao se perdeu: volta a valer quando o filtro sai.
      cmp.limparFiltros();
      fixture.detectChanges();
      expect(cmp.mesAberto('2026-09')).toBe(false);
    });

    // O grupo reclamou que "nao da opcao de ir ocultando por mes". Ele dava -- ate
    // alguem mexer em qualquer filtro: `temFiltroAtivo()` forcava tudo aberto, e
    // filtrar por tipo ou situacao continua devolvendo lista longa de varios meses.
    // Agora so a busca reabre.
    it('filtro de tipo nao tira o recolher — a lista continua com varios meses', () => {
      const fixture = comNotas(doisMeses());
      const cmp = fixture.componentInstance;

      cmp.tipo.set('NFE');
      fixture.detectChanges();
      expect(cmp.temFiltroAtivo()).toBe(true);

      cmp.alternarMes('2026-09');
      fixture.detectChanges();
      expect(cmp.mesAberto('2026-09')).toBe(false);
      expect(cmp.mesAberto('2026-08')).toBe(true);
    });

    it('filtro de periodo tambem nao tira o recolher', () => {
      const fixture = comNotas(doisMeses());
      const cmp = fixture.componentInstance;

      cmp.periodo.set('2026');
      fixture.detectChanges();

      cmp.alternarMes('2026-08');
      fixture.detectChanges();
      expect(cmp.mesAberto('2026-08')).toBe(false);
    });

    it('o botao global fecha todos e depois reabre todos', () => {
      const fixture = comNotas(doisMeses());
      const cmp = fixture.componentInstance;

      cmp.alternarTodosOsMeses();
      fixture.detectChanges();
      expect(cmp.mesAberto('2026-09')).toBe(false);
      expect(cmp.mesAberto('2026-08')).toBe(false);
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('Expandir todos');

      cmp.alternarTodosOsMeses();
      fixture.detectChanges();
      expect(cmp.todosOsMesesAbertos()).toBe(true);
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('Recolher todos');
    });

    it('com um mes so, nao oferece o botao global', () => {
      const fixture = comNotas([nota('n1', '2026-09-10T00:00:00Z')]);

      expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Recolher todos');
    });
  });

  describe('triagem do contador', () => {
    const carteira = () => [
      nota('n1', '2026-09-10T00:00:00Z', { status: 'COM_INCONSISTENCIAS' }),
      nota('n2', '2026-09-11T00:00:00Z', { status: 'REJEITADA' }),
      nota('n3', '2026-09-12T00:00:00Z', { status: 'RASCUNHO' }),
      nota('n4', '2026-08-01T00:00:00Z', { status: 'AUTORIZADA' }),
      nota('n5', '2026-08-02T00:00:00Z', { status: 'CANCELADA' }),
    ];

    /**
     * Este teste era de `revisao`. O recorte que ele descreve -- "atravessa inconsistencia e
     * rejeicao, e o trabalho, nao o status" -- continua existindo e continua certo; so mudou de
     * nome para **travadas**, porque "revisao" passou a ser a aprovacao do contador (#111).
     */
    it('"travadas pelo fisco" atravessa inconsistência e rejeição — é o trabalho, não o status', () => {
      const cmp = comNotas(carteira()).componentInstance;

      const caixas = Object.fromEntries(
        cmp.triagemDoContador().map((c) => [c.chave, c.quantidade]),
      );
      expect(caixas['travadas']).toBe(2);
      expect(caixas['RASCUNHO']).toBe(1);
      expect(caixas['AUTORIZADA']).toBe(1);
      expect(caixas['CANCELADA']).toBe(1);
      expect(caixas['todos']).toBe(5);

      cmp.statusFilter.set('travadas');
      expect(
        cmp
          .notasFiltradas()
          .map((n) => n.id)
          .sort(),
      ).toEqual(['n1', 'n2']);
    });

    it('escolher uma caixa não zera as outras — senão a triagem deixa de triar', () => {
      const fixture = comNotas(carteira());
      const cmp = fixture.componentInstance;

      cmp.statusFilter.set('AUTORIZADA');
      fixture.detectChanges();

      const caixas = Object.fromEntries(
        cmp.triagemDoContador().map((c) => [c.chave, c.quantidade]),
      );
      expect(caixas['travadas']).toBe(2);
      expect(caixas['todos']).toBe(5);
      expect(cmp.notasFiltradas()).toHaveLength(1);
    });

    it('o período continua valendo sobre a contagem — ela conta o que está na tela', () => {
      const cmp = comNotas(carteira()).componentInstance;

      cmp.periodo.set('2026-08');
      const caixas = Object.fromEntries(
        cmp.triagemDoContador().map((c) => [c.chave, c.quantidade]),
      );
      expect(caixas['todos']).toBe(2);
      expect(caixas['travadas']).toBe(0);
    });
  });

  describe('resumo do produtor', () => {
    const carteira = () => [
      nota('n1', '2026-09-10T00:00:00Z', { status: 'AUTORIZADA', valorTotalNota: 1000 }),
      nota('n2', '2026-09-11T00:00:00Z', { status: 'AUTORIZADA', valorTotalNota: 500 }),
      nota('n3', '2026-09-12T00:00:00Z', { status: 'COM_INCONSISTENCIAS', valorTotalNota: 999 }),
      nota('n4', '2026-08-01T00:00:00Z', { status: 'RASCUNHO', valorTotalNota: 777 }),
    ];

    it('só nota autorizada entra no faturamento — rascunho e inconsistência não são documento', () => {
      const cmp = comNotas(carteira()).componentInstance;

      // 1000 + 500. Somar as outras daria um numero que nao existe em lugar nenhum.
      expect(cmp.resumoDoPeriodo().faturado).toBe(1500);
      expect(cmp.resumoDoPeriodo().autorizadas).toBe(2);
      expect(cmp.resumoDoPeriodo().esperando).toBe(2);
      expect(cmp.resumoDoPeriodo().comInconsistencia).toBe(1);
      expect(cmp.resumoDoPeriodo().rascunhos).toBe(1);
    });

    it('"ver essas notas" mostra as três situações que ainda dependem do produtor', () => {
      const fixture = comNotas(carteira());
      const cmp = fixture.componentInstance;

      cmp.statusFilter.set('esperando');
      fixture.detectChanges();

      expect(
        cmp
          .notasFiltradas()
          .map((n) => n.id)
          .sort(),
      ).toEqual(['n3', 'n4']);
    });

    it('o resumo não muda quando a situação é filtrada — ele descreve o período', () => {
      const fixture = comNotas(carteira());
      const cmp = fixture.componentInstance;

      cmp.statusFilter.set('esperando');
      fixture.detectChanges();

      // Se mudasse, clicar em "ver essas notas" zeraria o faturamento que a faixa acabou de
      // mostrar, e a pessoa pensaria que perdeu o dado.
      expect(cmp.resumoDoPeriodo().faturado).toBe(1500);

      // Mas o periodo entra na conta, porque e o recorte que ela escolheu.
      cmp.periodo.set('2026-08');
      fixture.detectChanges();
      expect(cmp.resumoDoPeriodo().faturado).toBe(0);
      expect(cmp.resumoDoPeriodo().rascunhos).toBe(1);
    });
  });

  /**
   * A importação diz o que aconteceu com cada arquivo (issue #117).
   *
   * Antes a tela descartava a resposta e disparava sempre "Importação processada. Confira a lista
   * de notas." — inclusive quando o arquivo tinha sido **recusado** na conferência de destinatário,
   * assinatura ou SEFAZ. Mensagem de sucesso para uma recusa é pior do que um erro: a pessoa vai
   * embora achando que a nota entrou.
   */
  describe('importação relata cada arquivo (#117)', () => {
    function espiarToasts() {
      const toast = TestBed.inject(ToastService);
      const ditos: { tom: string; msg: string }[] = [];
      for (const tom of ['success', 'error', 'info'] as const) {
        vi.spyOn(toast, tom).mockImplementation(((m: string) => {
          ditos.push({ tom, msg: m });
        }) as never);
      }
      return ditos;
    }

    function importar(resultados: unknown[]) {
      const fixture = comNotas([]);
      const ditos = espiarToasts();
      fixture.componentInstance.importarArquivo(
        new File(['<nfe/>'], 'nota.xml', { type: 'text/xml' }),
      );
      httpMock.expectOne((r) => r.url === '/notas/importar').flush(resultados);
      // A lista recarrega depois da importacao.
      httpMock.match((r) => r.url === '/notas').forEach((r) => r.flush(pagina([])));
      flushPendencias();
      return ditos;
    }

    it('recusa NAO vira sucesso: mostra o motivo que o servidor deu', () => {
      const ditos = importar([
        {
          arquivo: 'nota.xml',
          sucesso: false,
          status: 'INVALIDA',
          notaId: null,
          chaveAcesso: null,
          motivo: 'O destinatário não é você.',
        },
      ]);

      expect(ditos.some((d) => d.tom === 'success')).toBe(false);
      const erro = ditos.find((d) => d.tom === 'error');
      expect(erro?.msg).toContain('O destinatário não é você.');
      expect(erro?.msg).toContain('nota.xml');
    });

    it('duplicada e aviso, nao erro — a nota ja esta na conta', () => {
      const ditos = importar([
        {
          arquivo: 'nota.xml',
          sucesso: false,
          status: 'DUPLICADA',
          notaId: null,
          chaveAcesso: '352',
          motivo: 'Esta nota já está na sua conta.',
        },
      ]);

      expect(ditos.find((d) => d.tom === 'info')?.msg).toContain('já está na sua conta');
      expect(ditos.some((d) => d.tom === 'error')).toBe(false);
    });

    it('importada e sucesso, e cada arquivo ganha o seu recado', () => {
      const ditos = importar([
        { arquivo: 'a.xml', sucesso: true, status: 'IMPORTADA', notaId: 'n1', chaveAcesso: null, motivo: 'Nota importada.' },
        { arquivo: 'b.xml', sucesso: false, status: 'INVALIDA', notaId: null, chaveAcesso: null, motivo: 'Assinatura não confere.' },
      ]);

      expect(ditos.filter((d) => d.tom === 'success')).toHaveLength(1);
      expect(ditos.find((d) => d.tom === 'error')?.msg).toContain('b.xml');
    });

    it('lista vazia nao e sucesso: o servidor nao disse nada sobre o arquivo', () => {
      const ditos = importar([]);

      expect(ditos.some((d) => d.tom === 'success')).toBe(false);
      expect(ditos.find((d) => d.tom === 'info')?.msg).toContain('não informou');
    });
  });
});
