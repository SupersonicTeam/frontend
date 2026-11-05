import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HistoricoOperacoes } from './historico-operacoes';

const registro = (id: string, acao: string, sucesso = true) => ({
  id,
  ocorridoEm: '2026-11-03T10:00:00-03:00',
  acao,
  recurso: 'NOTA_FISCAL',
  recursoId: 'n1',
  usuarioId: 'u1',
  papel: 'PRODUTOR',
  sucesso,
  codigoErro: sucesso ? null : 'NOTA_NAO_EDITAVEL',
  estadoAntes: null,
  estadoDepois: null,
});

/** O histórico de operações na ficha (#137): paginado pelo X-Total-Count; 404 = saiu da carteira. */
describe('HistoricoOperacoes', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HistoricoOperacoes],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function abrir() {
    const fixture = TestBed.createComponent(HistoricoOperacoes);
    fixture.componentRef.setInput('produtorId', 'p1');
    fixture.detectChanges();
    return fixture;
  }

  const texto = (f: { nativeElement: unknown }) => (f.nativeElement as HTMLElement).textContent;

  it('pede a primeira pagina do cliente e traduz a acao; falha mostra o codigo', () => {
    const f = abrir();
    const req = httpMock.expectOne((r) => r.url === '/auditoria');
    expect(req.request.params.get('produtorId')).toBe('p1');
    expect(req.request.params.get('page')).toBe('0');
    expect(req.request.params.get('size')).toBe('20');
    req.flush([registro('a', 'GUIA_PAGA'), registro('b', 'NOTA_ATUALIZADA', false)], {
      headers: { 'X-Total-Count': '2' },
    });
    f.detectChanges();

    expect(texto(f)).toContain('Guia paga');
    expect(texto(f)).toContain('falhou: NOTA_NAO_EDITAVEL');
  });

  it('pagina pelo X-Total-Count', () => {
    const f = abrir();
    httpMock
      .expectOne((r) => r.url === '/auditoria')
      .flush([registro('a', 'GUIA_PAGA')], { headers: { 'X-Total-Count': '45' } });
    const cmp = f.componentInstance;
    expect(cmp.totalPaginas()).toBe(3);

    cmp.carregar(1);
    const req = httpMock.expectOne((r) => r.url === '/auditoria');
    expect(req.request.params.get('page')).toBe('1');
    req.flush([], { headers: { 'X-Total-Count': '45' } });
    expect(cmp.pagina()).toBe(1);
  });

  it('vazio diz que nao ha operacao', () => {
    const f = abrir();
    httpMock
      .expectOne((r) => r.url === '/auditoria')
      .flush([], { headers: { 'X-Total-Count': '0' } });
    f.detectChanges();
    expect(texto(f)).toContain('Nenhuma operação registrada');
  });

  it('404: o cliente saiu da carteira, sem "tentar de novo"', () => {
    const f = abrir();
    httpMock
      .expectOne((r) => r.url === '/auditoria')
      .flush({}, { status: 404, statusText: 'Not Found' });
    f.detectChanges();
    expect(texto(f)).toContain('não está mais na carteira');
    expect(texto(f)).not.toContain('Tentar de novo');
  });
});
