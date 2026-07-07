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

  function flushPendencias() {
    httpMock.match(r => r.url.includes('/contador')).forEach(r => r.flush([]));
  }

  it('AC-9: em falha de getVencimentos, mostra vencimentosErro(true) e lista vazia — sem dado mockado', () => {
    const fixture = TestBed.createComponent(CalendarioPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();

    // Resolve pendências antes do erro para não disputar com o cancelamento do
    // forkJoin (que derruba o branch ainda pendente assim que um dos dois falha).
    flushPendencias();
    httpMock
      .expectOne(r => r.url.includes('/calendario-fiscal'))
      .flush('erro', { status: 500, statusText: 'Server Error' });

    expect(cmp.vencimentosErro()).toBe(true);
    expect(cmp.vencimentos()).toEqual([]);
  });

  it('AC-9: em sucesso, vencimentosErro fica false e a lista vem do backend', () => {
    const fixture = TestBed.createComponent(CalendarioPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();

    httpMock.expectOne(r => r.url.includes('/calendario-fiscal')).flush([]);
    flushPendencias();

    expect(cmp.vencimentosErro()).toBe(false);
  });

  it('AC-9: ao chamar retry() após um erro, vencimentosErro é limpo e a lista é preenchida no sucesso', () => {
    const fixture = TestBed.createComponent(CalendarioPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();

    // Resolve pendências antes do erro (ver nota no teste anterior).
    flushPendencias();
    httpMock
      .expectOne(r => r.url.includes('/calendario-fiscal'))
      .flush('erro', { status: 500, statusText: 'Server Error' });
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
    flushPendencias();

    expect(cmp.vencimentosErro()).toBe(false);
    expect(cmp.vencimentos().length).toBe(1);
  });
});
