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
    httpMock.match(r => r.url.includes('/contador')).forEach(r => r.flush([]));
  }

  it('DASH-11: em falha do GET /api/notas, mostra notasErro(true) e lista vazia — sem mockNotas', () => {
    const fixture = TestBed.createComponent(DocumentosPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();

    httpMock.expectOne(r => r.url === '/notas').flush('erro', { status: 500, statusText: 'Server Error' });
    flushPendencias();

    expect(cmp.notasErro()).toBe(true);
    expect(cmp.notas()).toEqual([]);
    expect(cmp.totalElements()).toBe(0);
  });

  it('DASH-11: em sucesso, notasErro fica false e a lista vem do backend', () => {
    const fixture = TestBed.createComponent(DocumentosPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();

    httpMock.expectOne(r => r.url === '/notas').flush({
      content: [], totalElements: 0, totalPages: 0, number: 0, size: 12,
      first: true, last: true, numberOfElements: 0, empty: true,
    });
    flushPendencias();

    expect(cmp.notasErro()).toBe(false);
  });

  it('DASH-11: ao tentar novamente após um erro, notasErro é limpo assim que a recarga começa', () => {
    const fixture = TestBed.createComponent(DocumentosPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();

    httpMock.expectOne(r => r.url === '/notas').flush('erro', { status: 500, statusText: 'Server Error' });
    flushPendencias();
    expect(cmp.notasErro()).toBe(true);

    cmp.recarregarNotas();
    expect(cmp.notasErro()).toBe(false);

    httpMock.expectOne(r => r.url === '/notas').flush({
      content: [], totalElements: 0, totalPages: 0, number: 0, size: 12,
      first: true, last: true, numberOfElements: 0, empty: true,
    });
    expect(cmp.notasErro()).toBe(false);
  });

  it('CTD-13/14: salvarAnexo() chama ContadorApi.anexarDocumento() e muda o status da solicitação para enviado', () => {
    const fixture = TestBed.createComponent(DocumentosPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();

    httpMock.expectOne(r => r.url === '/notas').flush({
      content: [], totalElements: 0, totalPages: 0, number: 0, size: 12,
      first: true, last: true, numberOfElements: 0, empty: true,
    });
    httpMock.expectOne(r => r.url === '/contador/pendencias').flush([
      {
        id: 'sol-1', produtorId: 'p1', titulo: 'Balancete', descricao: 'Balancete',
        dataLimite: '2026-08-01', prioridade: 'media', status: 'pendente',
        tiposDocumentos: '["Balancete"]', createdAt: '2026-07-01T00:00:00', updatedAt: '2026-07-01T00:00:00',
      },
    ]);

    cmp.solicitacaoSelecionada.set('sol-1');
    cmp.arquivoSelecionado.set(new File(['conteudo'], 'balancete.pdf', { type: 'application/pdf' }));
    cmp.salvarAnexo();

    httpMock.expectOne(r => r.url === '/contador/documentos/anexar').flush({
      id: 'doc-1', solicitacaoId: 'sol-1', nomeArquivo: 'balancete.pdf', arquivoUrl: '', tipo: 'Balancete',
      createdAt: '2026-07-07T00:00:00',
    });

    expect(cmp.solicitacoes().find(s => s.id === 'sol-1')?.status).toBe('enviado');
    expect(cmp.showAnexar()).toBe(false);
  });

  it('bugfix (Copilot review): quando anexarDocumento() sucede mas retorna doc falsy, mostra erro e mantém o status/dialog', () => {
    const fixture = TestBed.createComponent(DocumentosPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();

    httpMock.expectOne(r => r.url === '/notas').flush({
      content: [], totalElements: 0, totalPages: 0, number: 0, size: 12,
      first: true, last: true, numberOfElements: 0, empty: true,
    });
    httpMock.expectOne(r => r.url === '/contador/pendencias').flush([
      {
        id: 'sol-1', produtorId: 'p1', titulo: 'Balancete', descricao: 'Balancete',
        dataLimite: '2026-08-01', prioridade: 'media', status: 'pendente',
        tiposDocumentos: '["Balancete"]', createdAt: '2026-07-01T00:00:00', updatedAt: '2026-07-01T00:00:00',
      },
    ]);

    cmp.showAnexar.set(true);
    cmp.solicitacaoSelecionada.set('sol-1');
    cmp.arquivoSelecionado.set(new File(['conteudo'], 'balancete.pdf', { type: 'application/pdf' }));
    cmp.salvarAnexo();

    httpMock.expectOne(r => r.url === '/contador/documentos/anexar').flush(null as unknown as object);

    expect(cmp.solicitacoes().find(s => s.id === 'sol-1')?.status).toBe('pendente');
    expect(cmp.showAnexar()).toBe(true);
    const toasts = TestBed.inject(ToastService).toasts();
    expect(toasts.some(t => t.type === 'error')).toBe(true);
  });

  /**
   * O alerta do painel ("2 notas precisam da sua correcao") levava so para a
   * lista, e quem chegava tinha que cacar a nota certa entre as 12 da pagina.
   * Sugestao do professor: abrir direto o modal da nota.
   */
  describe('abertura por ?nota= (vinda do alerta do painel)', () => {
    const nota7 = {
      id: 'n7', numero: 7, status: 'COM_INCONSISTENCIAS', naturezaOperacao: 'Venda de cafe',
      dataEmissao: '2026-06-20T00:00:00Z', destinatarioNome: 'Cooperativa Cafeeira XYZ',
      destinatarioCpfCnpj: '00000000000191', itens: [],
    };

    it('sem o parametro, nao busca nota nenhuma por id', () => {
      const fixture = TestBed.createComponent(DocumentosPage);
      fixture.detectChanges();
      httpMock.expectOne(r => r.url === '/notas').flush({ content: [], totalElements: 0 });
      flushPendencias();

      expect(httpMock.match(r => /\/notas\/[^/]+$/.test(r.url)).length).toBe(0);
      expect(fixture.componentInstance.previewNota()).toBeNull();
    });

    it('com ?nota=<id>, busca a nota e abre o modal dela', () => {
      rota.snapshot.queryParamMap = convertToParamMap({ nota: 'n7' });
      const fixture = TestBed.createComponent(DocumentosPage);
      fixture.detectChanges();
      httpMock.expectOne(r => r.url === '/notas').flush({ content: [], totalElements: 0 });

      // Busca por id, e nao na lista: a nota pode estar na pagina 2.
      httpMock.expectOne(r => r.url === '/notas/n7').flush(nota7);
      httpMock.match(r => r.url === '/notas/n7/validacoes').forEach(r => r.flush([]));
      flushPendencias();

      expect(fixture.componentInstance.previewNota()?.numero).toBe(7);
    });

    it('com id inexistente, avisa e mantem a pagina de pe', () => {
      rota.snapshot.queryParamMap = convertToParamMap({ nota: 'sumiu' });
      const toast = TestBed.inject(ToastService);
      const erro = vi.spyOn(toast, 'error');

      const fixture = TestBed.createComponent(DocumentosPage);
      fixture.detectChanges();
      httpMock.expectOne(r => r.url === '/notas').flush({ content: [], totalElements: 0 });
      httpMock.expectOne(r => r.url === '/notas/sumiu')
        .flush('nao existe', { status: 404, statusText: 'Not Found' });
      flushPendencias();

      expect(erro).toHaveBeenCalled();
      expect(fixture.componentInstance.previewNota()).toBeNull();
    });
  });
});
