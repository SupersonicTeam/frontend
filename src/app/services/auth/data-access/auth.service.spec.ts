import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthApi, type SessaoAtual } from './auth.service';

/**
 * `GET /api/auth/me` (issue #106).
 *
 * Quatro telas passavam um UUID **cravado no código** para rotas por id. Eu tratei isso três vezes
 * como "só o JWT da #93 resolve"; medido em 29/10, a rota **já existe** e devolve exatamente os
 * ids que estavam cravados. O id do próprio usuário é descobrível em tempo de execução.
 */
describe('AuthApi', () => {
  let service: AuthApi;
  let httpMock: HttpTestingController;

  const sessao: SessaoAtual = {
    usuarioId: 'aaee3cd4-9e47-41f9-bf0b-26ae5531c8a8',
    papel: 'PRODUTOR',
    nome: 'João da Silva Produtor',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [AuthApi, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('pergunta ao servidor quem eu sou', () => {
    let visto: SessaoAtual | undefined;
    service.carregar().subscribe((s) => (visto = s));

    const req = httpMock.expectOne('/auth/me');
    expect(req.request.method).toBe('GET');
    req.flush(sessao);

    expect(visto?.usuarioId).toBe(sessao.usuarioId);
    expect(service.sessao()?.papel).toBe('PRODUTOR');
  });

  it('quatro telas perguntando junto viram UMA requisicao', () => {
    const vistos: string[] = [];
    for (let i = 0; i < 4; i++) service.carregar().subscribe((s) => vistos.push(s.usuarioId));

    httpMock.expectOne('/auth/me').flush(sessao);

    expect(vistos).toHaveLength(4);
    expect(new Set(vistos).size).toBe(1);
  });

  it('depois de resolvido, responde do cache sem ir ao servidor', () => {
    service.carregar().subscribe();
    httpMock.expectOne('/auth/me').flush(sessao);

    let visto: SessaoAtual | undefined;
    service.carregar().subscribe((s) => (visto = s));
    httpMock.expectNone('/auth/me');
    expect(visto?.usuarioId).toBe(sessao.usuarioId);
  });

  /** Mesma razão do `DashboardApi.limpar()`: o service é `root` e sobrevive à troca de perfil. */
  it('sair esquece quem eu era — quem entra nao herda a identidade de quem saiu', () => {
    service.carregar().subscribe();
    httpMock.expectOne('/auth/me').flush(sessao);
    expect(service.sessao()).not.toBeNull();

    service.limpar();
    expect(service.sessao()).toBeNull();

    service.carregar().subscribe();
    httpMock.expectOne('/auth/me').flush({ ...sessao, papel: 'CONTADOR', nome: 'Escritorio' });
    expect(service.sessao()?.papel).toBe('CONTADOR');
  });

  it('o erro sobe para quem chamou — sem identidade a tela decide o que fazer', () => {
    let erro: unknown;
    service.carregar().subscribe({ error: (e) => (erro = e) });
    httpMock.expectOne('/auth/me').flush('nao', { status: 500, statusText: 'Server Error' });

    expect(erro).toBeTruthy();
    expect(service.sessao()).toBeNull();
  });
});
