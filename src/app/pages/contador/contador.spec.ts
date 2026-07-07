import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ContadorPage } from './contador';
import { ToastService } from '@core/services/toast.service';

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
});
