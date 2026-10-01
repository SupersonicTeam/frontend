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
});
