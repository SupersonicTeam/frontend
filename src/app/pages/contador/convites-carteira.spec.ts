import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { ConvitesCarteira } from './convites-carteira';
import { ToastService } from '@core/services/toast.service';

/** Convidar cliente e ver os pendentes (#147). Só o administrador convida. */
describe('ConvitesCarteira', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ConvitesCarteira],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function abrir(funcao: string, pendentes: unknown[] = []) {
    const fixture = TestBed.createComponent(ConvitesCarteira);
    fixture.detectChanges();
    httpMock.expectOne('/escritorio').flush({ minhaFuncao: funcao });
    httpMock.expectOne('/contador/convites').flush(pendentes);
    fixture.detectChanges();
    return fixture;
  }

  const texto = (f: { nativeElement: unknown }) => (f.nativeElement as HTMLElement).textContent;

  it('o administrador ve o campo; as outras funcoes nao', () => {
    expect(abrir('ADMINISTRADOR').nativeElement.querySelector('input[type=email]')).toBeTruthy();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ConvitesCarteira],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const assistente = abrir('ASSISTENTE');
    expect(assistente.nativeElement.querySelector('input[type=email]')).toBeNull();
    expect(texto(assistente)).toContain('Quem convida cliente é o administrador');
  });

  it('lista so os convites pendentes', () => {
    const f = abrir('CONTADOR', [
      {
        id: 'a',
        email: 'ana@x.com',
        situacao: 'PENDENTE',
        criadoEm: '2026-11-01',
        expiraEm: '2026-11-08',
      },
      {
        id: 'b',
        email: 'bia@x.com',
        situacao: 'ACEITO',
        criadoEm: '2026-11-01',
        expiraEm: '2026-11-08',
      },
    ]);
    expect(texto(f)).toContain('ana@x.com');
    expect(texto(f)).not.toContain('bia@x.com');
  });

  it('convidar manda o e-mail, avisa sem prometer entrega e recarrega os pendentes', () => {
    const sucesso = vi.spyOn(TestBed.inject(ToastService), 'success');
    const cmp = abrir('ADMINISTRADOR').componentInstance;
    cmp.email.set('ana@fazenda.com');
    cmp.convidar();

    const req = httpMock.expectOne('/contador/convites');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'ana@fazenda.com' });
    req.flush(null, { status: 202, statusText: 'Accepted' });
    httpMock.expectOne((r) => r.method === 'GET' && r.url === '/contador/convites').flush([]);

    expect(sucesso).toHaveBeenCalled();
    expect(cmp.email()).toBe('');
  });

  it('e-mail invalido nao vai ao servidor', () => {
    const cmp = abrir('ADMINISTRADOR').componentInstance;
    cmp.email.set('ana@');
    cmp.convidar();
    httpMock.expectNone('/contador/convites');
  });

  it('429 diz o limite diario e quanto esperar', () => {
    const erro = vi.spyOn(TestBed.inject(ToastService), 'error');
    const cmp = abrir('ADMINISTRADOR').componentInstance;
    cmp.email.set('ana@fazenda.com');
    cmp.convidar();
    httpMock
      .expectOne('/contador/convites')
      .flush(
        { errors: [{ code: 'LIMITE_CONVITES', message: 'x' }] },
        { status: 429, statusText: 'Too Many', headers: { 'Retry-After': '600' } },
      );

    expect(erro).toHaveBeenCalledWith(expect.stringContaining('30 convites por dia'));
    expect(erro).toHaveBeenCalledWith(expect.stringContaining('10 min'));
  });
});
