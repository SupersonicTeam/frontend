import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CalendarioPage } from './calendario';

describe('CalendarioPage', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CalendarioPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  /** Flush das duas leituras do ContadorApi (pendências + guias) com listas vazias. */
  function flushContadorVazio() {
    httpMock.match(r => r.url.includes('/contador')).forEach(r => r.flush([]));
  }

  it('AC-9/CTD-11: em falha de getVencimentos, mostra vencimentosErro(true) mas NÃO esconde os itens do ContadorApi (guia/solicitação mock)', () => {
    const fixture = TestBed.createComponent(CalendarioPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();

    httpMock
      .expectOne(r => r.url.includes('/calendario-fiscal'))
      .flush('erro', { status: 500, statusText: 'Server Error' });
    // ContadorApi tem fallback mock — sucede normalmente mesmo com getPendencias/getGuias "vazios" aqui.
    flushContadorVazio();

    expect(cmp.vencimentosErro()).toBe(true);
    expect(cmp.vencimentos()).toEqual([]);
  });

  it('AC-9/CTD-11: falha isolada em /calendario-fiscal não esconde guias reais retornadas pelo ContadorApi', () => {
    const fixture = TestBed.createComponent(CalendarioPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();

    httpMock
      .expectOne(r => r.url.includes('/calendario-fiscal'))
      .flush('erro', { status: 500, statusText: 'Server Error' });
    httpMock.expectOne(r => r.url === '/contador/pendencias').flush([]);
    httpMock.expectOne(r => r.url === '/contador/guias').flush([
      {
        id: 'g1',
        produtorId: 'p1',
        tipoGuia: 'ICMS',
        dataVencimento: '2026-08-10',
        valor: 700,
        status: 'pendente',
        createdAt: '2026-07-01T00:00:00',
      },
    ]);

    expect(cmp.vencimentosErro()).toBe(true);
    expect(cmp.vencimentos()).toEqual([
      {
        id: 'guia-g1',
        titulo: 'Guia ICMS',
        dataVencimento: '2026-08-10',
        tipo: 'imposto',
        status: 'pendente',
        valor: 700,
      },
    ]);
  });

  it('CTD-07: uma guia paga aparece no calendário como imposto com status pago e o valor correto', () => {
    const fixture = TestBed.createComponent(CalendarioPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();

    httpMock.expectOne(r => r.url.includes('/calendario-fiscal')).flush([]);
    httpMock.expectOne(r => r.url === '/contador/pendencias').flush([]);
    httpMock.expectOne(r => r.url === '/contador/guias').flush([
      {
        id: 'g2',
        produtorId: 'p1',
        tipoGuia: 'FUNRURAL',
        dataVencimento: '2026-06-10',
        valor: 320,
        status: 'pago',
        createdAt: '2026-06-01T00:00:00',
      },
    ]);

    const guia = cmp.vencimentos().find(v => v.id === 'guia-g2');
    expect(guia?.tipo).toBe('imposto');
    expect(guia?.status).toBe('pago');
    expect(guia?.valor).toBe(320);
  });

  it('AC-9: em sucesso, vencimentosErro fica false e a lista vem do backend + ContadorApi', () => {
    const fixture = TestBed.createComponent(CalendarioPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();

    httpMock.expectOne(r => r.url.includes('/calendario-fiscal')).flush([]);
    flushContadorVazio();

    expect(cmp.vencimentosErro()).toBe(false);
  });

  it('AC-9: ao chamar retry() após um erro, vencimentosErro é limpo e a lista é preenchida no sucesso', () => {
    const fixture = TestBed.createComponent(CalendarioPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();

    httpMock
      .expectOne(r => r.url.includes('/calendario-fiscal'))
      .flush('erro', { status: 500, statusText: 'Server Error' });
    flushContadorVazio();
    expect(cmp.vencimentosErro()).toBe(true);

    cmp.retry();
    expect(cmp.vencimentosErro()).toBe(false);

    httpMock.expectOne(r => r.url.includes('/calendario-fiscal')).flush([
      {
        id: 'v1',
        evento: 'ITR',
        dataVencimento: '2026-09-30T00:00:00',
        status: 'normal',
        valor: 500,
      },
    ]);
    flushContadorVazio();

    expect(cmp.vencimentosErro()).toBe(false);
    expect(cmp.vencimentos().length).toBe(1);
  });
});
