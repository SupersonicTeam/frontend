import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ContadorPage } from './contador';
import { ToastService } from '@core/services/toast.service';
import { NotificacoesService } from '@core/services/notificacoes.service';

describe('ContadorPage', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ContadorPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  /** Flush das duas leituras disparadas no ngOnInit (pendências + guias), ambas vazias. */
  function flushInit() {
    httpMock.expectOne(r => r.url === '/contador/pendencias').flush([]);
    httpMock.expectOne(r => r.url === '/contador/guias').flush([]);
  }

  it('CTD-12: categorias incluem as novas categorias contábeis (guia, balancete, balanço, extrato, IR)', () => {
    const fixture = TestBed.createComponent(ContadorPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();
    flushInit();

    for (const categoria of [
      'Guia de imposto', 'Balancete', 'Balanço', 'Extrato bancário', 'Documento para IR',
    ]) {
      expect(cmp.categorias).toContain(categoria);
    }
  });

  it('CTD-06: salvarGuia() cria a guia (fallback mock) e ela passa a aparecer em guias()', () => {
    const fixture = TestBed.createComponent(ContadorPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();
    flushInit();

    cmp.abrirAnexarGuia();
    cmp.novaGuiaForm.setValue({
      tipoGuia: 'ICMS', dataVencimento: '2026-08-10', valor: '500', observacoes: '',
    });
    cmp.salvarGuia();
    httpMock
      .expectOne(r => r.url === '/contador/guias')
      .flush('erro', { status: 500, statusText: 'Server Error' });

    expect(cmp.guias().length).toBe(1);
    expect(cmp.guias()[0].valor).toBe(500);
    expect(cmp.guias()[0].tipoGuia).toBe('ICMS');
    expect(cmp.showAnexarGuia()).toBe(false);
  });

  it('edge case: valor <= 0 bloqueia o envio do form de guia, sem nenhuma chamada HTTP', () => {
    const fixture = TestBed.createComponent(ContadorPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();
    flushInit();

    cmp.abrirAnexarGuia();
    cmp.novaGuiaForm.setValue({
      tipoGuia: 'ICMS', dataVencimento: '2026-08-10', valor: '0', observacoes: '',
    });
    expect(cmp.novaGuiaForm.invalid).toBe(true);

    cmp.salvarGuia();

    expect(httpMock.match(() => true).length).toBe(0);
  });

  it('CTD-23: ao anexar uma guia, mostra o toast "WhatsApp — em breve" sem nenhuma chamada HTTP adicional', () => {
    const fixture = TestBed.createComponent(ContadorPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();
    flushInit();

    cmp.abrirAnexarGuia();
    cmp.novaGuiaForm.setValue({
      tipoGuia: 'ICMS', dataVencimento: '2026-08-10', valor: '500', observacoes: '',
    });
    cmp.salvarGuia();
    httpMock
      .expectOne(r => r.url === '/contador/guias')
      .flush('erro', { status: 500, statusText: 'Server Error' });

    const toasts = TestBed.inject(ToastService).toasts();
    expect(toasts.some(t => t.message === 'Envio por WhatsApp — em breve')).toBe(true);
    expect(httpMock.match(() => true).length).toBe(0);
  });

  it('CTD-09: marcarPaga() atualiza o status da guia para pago em guias()', () => {
    const fixture = TestBed.createComponent(ContadorPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();
    httpMock.expectOne(r => r.url === '/contador/pendencias').flush([]);
    httpMock.expectOne(r => r.url === '/contador/guias').flush([
      {
        id: 'g1', produtorId: 'p1', tipoGuia: 'ICMS', dataVencimento: '2026-08-10',
        valor: 500, status: 'pendente', createdAt: '2026-07-01T00:00:00',
      },
    ]);

    cmp.marcarPaga('g1');
    httpMock
      .expectOne(r => r.url === '/contador/guias/g1/pagar')
      .flush('erro', { status: 500, statusText: 'Server Error' });

    expect(cmp.guias().find(g => g.id === 'g1')?.status).toBe('pago');
  });

  it('CTD-20/21: checklist de fechamento — sem período selecionado mostra estado vazio explícito; ao selecionar, marcar recebido persiste no signal', () => {
    const fixture = TestBed.createComponent(ContadorPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();
    flushInit();

    expect(cmp.periodoChecklist()).toBe('');
    cmp.setTab('documentos');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Selecione um período');

    cmp.setPeriodoChecklist('2026-07');
    expect(cmp.isChecklistItemRecebido('Balancete')).toBe(false);

    cmp.toggleChecklistItem('Balancete');
    expect(cmp.isChecklistItemRecebido('Balancete')).toBe(true);

    cmp.toggleChecklistItem('Balancete');
    expect(cmp.isChecklistItemRecebido('Balancete')).toBe(false);
  });

  it('CTD-19: aba Docs Oficiais exibe as guias de exemplo em vez do placeholder vazio', () => {
    const fixture = TestBed.createComponent(ContadorPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();
    httpMock.expectOne(r => r.url === '/contador/pendencias').flush([]);
    httpMock
      .expectOne(r => r.url === '/contador/guias')
      .flush('erro', { status: 500, statusText: 'Server Error' });

    expect(cmp.guias().length).toBeGreaterThan(0);
  });

  it('CTD-24: ao criar uma nova solicitação, mostra o mesmo toast "WhatsApp — em breve"', () => {
    const fixture = TestBed.createComponent(ContadorPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();
    flushInit();

    cmp.abrirNova();
    cmp.novaSolicitacaoForm.setValue({
      titulo: 'Notas de agosto', descricao: 'Notas do mês', categoria: 'Guia de imposto',
      mesReferencia: '', prioridade: 'media', prazo: '', observacoes: '',
    });
    cmp.salvarSolicitacao();
    httpMock
      .expectOne(r => r.url === '/contador/pendencias' && r.method === 'POST')
      .flush('erro', { status: 500, statusText: 'Server Error' });

    const toasts = TestBed.inject(ToastService).toasts();
    expect(toasts.some(t => t.message === 'Envio por WhatsApp — em breve')).toBe(true);
  });

  it('CTD-17: ao criar uma nova solicitação, gera uma notificação via NotificacoesService', () => {
    const fixture = TestBed.createComponent(ContadorPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();
    flushInit();

    const notificacoesAntes = TestBed.inject(NotificacoesService).notificacoes().length;

    cmp.abrirNova();
    cmp.novaSolicitacaoForm.setValue({
      titulo: 'Notas de agosto', descricao: 'Notas do mês', categoria: 'Guia de imposto',
      mesReferencia: '', prioridade: 'media', prazo: '', observacoes: '',
    });
    cmp.salvarSolicitacao();
    httpMock
      .expectOne(r => r.url === '/contador/pendencias' && r.method === 'POST')
      .flush('erro', { status: 500, statusText: 'Server Error' });

    const notificacoes = TestBed.inject(NotificacoesService).notificacoes();
    expect(notificacoes.length).toBe(notificacoesAntes + 1);
    expect(notificacoes[0].titulo).toContain('Notas de agosto');
    expect(notificacoes[0].tipo).toBe('Solicitação');
    expect(notificacoes[0].lida).toBe(false);
  });
});
