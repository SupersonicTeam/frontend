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

  function flushPendencias() {
    httpMock.match((r) => r.url.includes('/contador')).forEach((r) => r.flush([]));
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

  it('CTD-13/14: salvarAnexo() chama ContadorApi.anexarDocumento() e muda o status da solicitação para enviado', () => {
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
    httpMock
      .expectOne((r) => r.url === '/contador/pendencias')
      .flush([
        {
          id: 'sol-1',
          produtorId: 'p1',
          titulo: 'Balancete',
          descricao: 'Balancete',
          dataLimite: '2026-08-01',
          prioridade: 'media',
          status: 'pendente',
          tiposDocumentos: '["Balancete"]',
          createdAt: '2026-07-01T00:00:00',
          updatedAt: '2026-07-01T00:00:00',
        },
      ]);

    cmp.solicitacaoSelecionada.set('sol-1');
    cmp.arquivoSelecionado.set(
      new File(['conteudo'], 'balancete.pdf', { type: 'application/pdf' }),
    );
    cmp.salvarAnexo();

    httpMock
      .expectOne((r) => r.url === '/contador/documentos/anexar')
      .flush({
        id: 'doc-1',
        solicitacaoId: 'sol-1',
        nomeArquivo: 'balancete.pdf',
        arquivoUrl: '',
        tipo: 'Balancete',
        createdAt: '2026-07-07T00:00:00',
      });

    expect(cmp.solicitacoes().find((s) => s.id === 'sol-1')?.status).toBe('enviado');
    expect(cmp.showAnexar()).toBe(false);
  });

  it('bugfix (Copilot review): quando anexarDocumento() sucede mas retorna doc falsy, mostra erro e mantém o status/dialog', () => {
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
    httpMock
      .expectOne((r) => r.url === '/contador/pendencias')
      .flush([
        {
          id: 'sol-1',
          produtorId: 'p1',
          titulo: 'Balancete',
          descricao: 'Balancete',
          dataLimite: '2026-08-01',
          prioridade: 'media',
          status: 'pendente',
          tiposDocumentos: '["Balancete"]',
          createdAt: '2026-07-01T00:00:00',
          updatedAt: '2026-07-01T00:00:00',
        },
      ]);

    cmp.showAnexar.set(true);
    cmp.solicitacaoSelecionada.set('sol-1');
    cmp.arquivoSelecionado.set(
      new File(['conteudo'], 'balancete.pdf', { type: 'application/pdf' }),
    );
    cmp.salvarAnexo();

    httpMock
      .expectOne((r) => r.url === '/contador/documentos/anexar')
      .flush(null as unknown as object);

    expect(cmp.solicitacoes().find((s) => s.id === 'sol-1')?.status).toBe('pendente');
    expect(cmp.showAnexar()).toBe(true);
    const toasts = TestBed.inject(ToastService).toasts();
    expect(toasts.some((t) => t.type === 'error')).toBe(true);
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
});
