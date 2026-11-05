import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HistoricoRevisao } from './historico-revisao';

/** O histórico de revisão no lado do escritório (#150): só busca ao abrir, em ordem. */
describe('HistoricoRevisao', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HistoricoRevisao],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function abrir() {
    const fixture = TestBed.createComponent(HistoricoRevisao);
    fixture.componentRef.setInput('produtorId', 'p1');
    fixture.componentRef.setInput('notaId', 'n1');
    fixture.detectChanges();
    return fixture;
  }

  it('fechado nao pede nada; aberto busca na rota do cliente e mostra do mais antigo ao mais novo', () => {
    const f = abrir();
    httpMock.expectNone(() => true);

    f.componentInstance.alternar();
    httpMock.expectOne('/contador/produtores/p1/notas/n1/revisoes').flush([
      {
        id: 'b',
        acao: 'DEVOLVIDA',
        motivo: 'Falta o CFOP.',
        usuarioId: 'c',
        papel: 'CONTADOR',
        ocorridoEm: '2026-11-02T10:00:00Z',
      },
      {
        id: 'a',
        acao: 'ENVIADA',
        motivo: null,
        usuarioId: 'p',
        papel: 'PRODUTOR',
        ocorridoEm: '2026-11-01T10:00:00Z',
      },
    ]);
    f.detectChanges();

    const texto = (f.nativeElement as HTMLElement).textContent ?? '';
    expect(texto.indexOf('Enviada para revisão')).toBeLessThan(
      texto.indexOf('Devolvida ao produtor'),
    );
    expect(texto).toContain('Motivo: Falta o CFOP.');
  });

  it('fechar e abrir de novo nao busca outra vez', () => {
    const cmp = abrir().componentInstance;
    cmp.alternar();
    httpMock.expectOne('/contador/produtores/p1/notas/n1/revisoes').flush([]);
    cmp.alternar();
    cmp.alternar();
    httpMock.expectNone('/contador/produtores/p1/notas/n1/revisoes');
  });

  it('falha mostra o aviso e a proxima abertura tenta de novo', () => {
    const f = abrir();
    const cmp = f.componentInstance;
    cmp.alternar();
    httpMock
      .expectOne('/contador/produtores/p1/notas/n1/revisoes')
      .flush('x', { status: 500, statusText: 'erro' });
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).textContent).toContain('Não foi possível carregar');

    cmp.alternar();
    cmp.alternar();
    httpMock.expectOne('/contador/produtores/p1/notas/n1/revisoes').flush([]);
  });
});
