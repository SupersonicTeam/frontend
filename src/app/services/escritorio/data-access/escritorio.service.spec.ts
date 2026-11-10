import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { EscritorioApi } from './escritorio.service';

/** O escritório e a equipe (#148): função em cache, rotas da equipe e do convite. */
describe('EscritorioApi', () => {
  let api: EscritorioApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(EscritorioApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('pergunta o escritorio uma vez so, por mais telas que queiram a funcao', () => {
    let admin: boolean | undefined;
    let reabre: boolean | undefined;
    api.ehAdministrador().subscribe((v) => (admin = v));
    api.podeReabrirApuracao().subscribe((v) => (reabre = v));
    httpMock.expectOne('/escritorio').flush({ minhaFuncao: 'CONTADOR' });

    api.ehAdministrador().subscribe();
    httpMock.expectNone('/escritorio');
    expect(admin).toBe(false);
    expect(reabre).toBe(true);
  });

  it('falha nao fica guardada, e limpar faz perguntar de novo', () => {
    api.ehAdministrador().subscribe();
    httpMock.expectOne('/escritorio').flush('x', { status: 500, statusText: 'erro' });
    api.ehAdministrador().subscribe();
    httpMock.expectOne('/escritorio').flush({ minhaFuncao: 'ADMINISTRADOR' });

    api.limpar();
    api.ehAdministrador().subscribe();
    httpMock.expectOne('/escritorio').flush({ minhaFuncao: 'ADMINISTRADOR' });
  });

  it('as rotas da equipe', () => {
    api.alterarFuncao('m1', 'ASSISTENTE').subscribe();
    const patch = httpMock.expectOne('/escritorio/membros/m1');
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({ funcao: 'ASSISTENTE' });
    patch.flush({});

    api.removerMembro('m1').subscribe();
    expect(httpMock.expectOne('/escritorio/membros/m1').request.method).toBe('DELETE');

    api.convidarMembro(' ana@x.com ', 'CONTADOR').subscribe();
    const convite = httpMock.expectOne('/escritorio/membros/convites');
    expect(convite.request.body).toEqual({ email: 'ana@x.com', funcao: 'CONTADOR' });
    convite.flush(null, { status: 202, statusText: 'Accepted' });
  });

  it('aceitar o convite manda o token e esquece o escritorio de antes', () => {
    api.ehAdministrador().subscribe();
    httpMock.expectOne('/escritorio').flush({ minhaFuncao: 'ADMINISTRADOR' });

    api.aceitarConvite('tok').subscribe();
    const req = httpMock.expectOne('/escritorio/membros/convites/aceitar');
    expect(req.request.body).toEqual({ token: 'tok' });
    req.flush({ id: 'm9', nomeCompleto: 'Ana', crc: null, funcao: 'CONTADOR' });

    api.ehAdministrador().subscribe();
    httpMock.expectOne('/escritorio').flush({ minhaFuncao: 'CONTADOR' });
  });

  it('definir o endereço manda a ciência e guarda o escritório devolvido (#175)', () => {
    api.definirEndereco('ruraloeste').subscribe();
    const req = httpMock.expectOne('/escritorio/endereco');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ slug: 'ruraloeste', cienteExposicaoPublica: true });
    req.flush({ minhaFuncao: 'ADMINISTRADOR', slug: 'ruraloeste' });

    let slug: string | null | undefined;
    api.meuEscritorio().subscribe((e) => (slug = e.slug));
    httpMock.expectNone('/escritorio');
    expect(slug).toBe('ruraloeste');
  });

  it('remover o endereço esquece o escritório: o enderecoAlteravelEm muda', () => {
    api.ehAdministrador().subscribe();
    httpMock.expectOne('/escritorio').flush({ minhaFuncao: 'ADMINISTRADOR', slug: 'ruraloeste' });

    api.removerEndereco().subscribe();
    const req = httpMock.expectOne('/escritorio/endereco');
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });

    api.meuEscritorio().subscribe();
    httpMock.expectOne('/escritorio').flush({ minhaFuncao: 'ADMINISTRADOR', slug: null });
  });
});
