import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SessaoService } from '@core/services/sessao.service';
import { entrarComo } from '@core/services/sessao.testing';
import { AuthApi, ContaError, type LoginResponse, type SessaoAtual } from './auth.service';

/**
 * O cliente de `/api/auth` (issue #93).
 *
 * Antes da #93 esta classe só sabia perguntar `GET /auth/me` (#106). Agora ela **autentica**: o
 * papel e o id deixam de vir de um `localStorage` escolhido na tela de entrada e passam a vir de
 * um token que só o backend emite.
 */
describe('AuthApi', () => {
  let service: AuthApi;
  let sessao: SessaoService;
  let httpMock: HttpTestingController;

  /** O corpo que `POST /auth/login` devolve — medido contra a API local em 30/10. */
  const login: LoginResponse = {
    accessToken: 'jwt.de.acesso',
    tokenType: 'Bearer',
    expiraEm: new Date(Date.now() + 900_000).toISOString(),
    papel: 'PRODUTOR',
    usuarioId: '4805bc94-8520-40ba-9e4a-63a96250df70',
  };

  const me: SessaoAtual = {
    usuarioId: login.usuarioId,
    papel: 'PRODUTOR',
    nome: 'Produtor de Teste',
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [AuthApi, SessaoService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthApi);
    sessao = TestBed.inject(SessaoService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  describe('entrar', () => {
    it('abre a sessão com o token, o papel e o id do servidor', () => {
      service.entrar('produtor@exemplo.com.br', 'SenhaDeTeste93!').subscribe();

      const req = httpMock.expectOne('/auth/login');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        email: 'produtor@exemplo.com.br',
        senha: 'SenhaDeTeste93!',
      });
      req.flush(login);

      // Sessão já aberta ANTES do /auth/me: é o token guardado que autentica a segunda chamada.
      expect(sessao.token()).toBe('jwt.de.acesso');
      expect(sessao.papel()).toBe('PRODUTOR');
      expect(sessao.usuarioId()).toBe(login.usuarioId);

      httpMock.expectOne('/auth/me').flush(me);
      expect(sessao.nome()).toBe('Produtor de Teste');
    });

    /**
     * O cookie de refresh é HttpOnly: JavaScript não o lê nem o escreve. Sem `withCredentials` o
     * navegador não o manda nem o guarda numa chamada entre origens — e aí **não há renovação**,
     * só login de 15 minutos.
     */

    it('no host principal o corpo é exatamente { email, senha }, sem a chave escritorio (#175)', () => {
      service.entrar('a@b.c', 'senha').subscribe();
      const req = httpMock.expectOne('/auth/login');
      expect(Object.keys(req.request.body)).toEqual(['email', 'senha']);
      req.flush(login);
      httpMock.expectOne('/auth/me').flush(me);
    });

    it('no endereço do escritório o corpo leva o slug', () => {
      service.entrar('a@b.c', 'senha', 'ruraloeste').subscribe();
      const req = httpMock.expectOne('/auth/login');
      expect(req.request.body).toStrictEqual({
        email: 'a@b.c',
        senha: 'senha',
        escritorio: 'ruraloeste',
      });
      req.flush(login);
      httpMock.expectOne('/auth/me').flush(me);
    });

    it('pede credenciais: o refresh vem por cookie HttpOnly', () => {
      service.entrar('a@b.c', 'senha').subscribe();

      const req = httpMock.expectOne('/auth/login');
      expect(req.request.withCredentials).toBe(true);
      req.flush(login);
      httpMock.expectOne('/auth/me').flush(me);
    });

    it('o e-mail vai sem espaços nas pontas — teclado de celular costuma acrescentar um', () => {
      service.entrar('  produtor@exemplo.com.br  ', 'senha').subscribe();

      const req = httpMock.expectOne('/auth/login');
      expect((req.request.body as { email: string }).email).toBe('produtor@exemplo.com.br');
      req.flush(login);
      httpMock.expectOne('/auth/me').flush(me);
    });

    /**
     * Recusar um login que deu certo seria pior do que uma topbar sem nome: o token vale, as telas
     * carregam, e o nome é cosmético. Ele cai no rótulo do papel até a próxima tentativa.
     */
    it('o /auth/me falhando NÃO desfaz o login', () => {
      let entrou = false;
      service.entrar('a@b.c', 'senha').subscribe(() => (entrou = true));

      httpMock.expectOne('/auth/login').flush(login);
      httpMock.expectOne('/auth/me').flush(null, { status: 500, statusText: 'Server Error' });

      expect(entrou).toBe(true);
      expect(sessao.logado()).toBe(true);
      expect(sessao.nome()).toBe('');
    });

    it('credencial inválida não abre sessão e o erro sobe para a tela', () => {
      let erro: unknown;
      service.entrar('a@b.c', 'errada').subscribe({ error: (e) => (erro = e) });

      httpMock
        .expectOne('/auth/login')
        .flush(
          { errors: [{ code: 'CREDENCIAIS_INVALIDAS', message: 'E-mail ou senha incorretos.' }] },
          { status: 401, statusText: 'Unauthorized' },
        );

      expect(erro).toBeTruthy();
      expect(sessao.logado()).toBe(false);
    });
  });

  describe('renovar', () => {
    it('troca só o token, preservando quem eu sou', () => {
      const antes = entrarComo('PRODUTOR', 'Maria');
      service.renovar().subscribe();

      const req = httpMock.expectOne('/auth/refresh');
      expect(req.request.method).toBe('POST');
      expect(req.request.withCredentials).toBe(true);
      req.flush({ ...login, accessToken: 'jwt.renovado' });

      expect(sessao.token()).toBe('jwt.renovado');
      expect(sessao.usuarioId()).toBe(antes.usuarioId);
      expect(sessao.nome()).toBe('Maria');
    });

    /**
     * **A fila é exigência do contrato, não zelo.** Medido contra a API local em 30/10: reusar um
     * refresh já trocado responde 401 `SESSAO_INVALIDA` **e encerra toda a linhagem** daquele
     * login — inclusive o cookie que a renovação anterior acabou de entregar. Duas renovações em
     * paralelo, portanto, derrubam a sessão em vez de a manterem.
     */
    it('chamadas simultâneas compartilham UMA requisição', () => {
      entrarComo('PRODUTOR');
      const tokens: string[] = [];
      for (let i = 0; i < 4; i++) service.renovar().subscribe((t) => tokens.push(t));

      // `expectOne` reprova se houver duas.
      httpMock.expectOne('/auth/refresh').flush({ ...login, accessToken: 'jwt.renovado' });

      expect(tokens).toEqual(Array(4).fill('jwt.renovado'));
    });

    it('depois de terminar, uma nova chamada renova de novo', () => {
      entrarComo('PRODUTOR');
      service.renovar().subscribe();
      httpMock.expectOne('/auth/refresh').flush({ ...login, accessToken: 'um' });

      service.renovar().subscribe();
      httpMock.expectOne('/auth/refresh').flush({ ...login, accessToken: 'dois' });

      expect(sessao.token()).toBe('dois');
    });

    it('a falha sobe: quem chamou decide encerrar', () => {
      entrarComo('PRODUTOR');
      let erro: unknown;
      service.renovar().subscribe({ error: (e) => (erro = e) });

      httpMock
        .expectOne('/auth/refresh')
        .flush(
          { errors: [{ code: 'SESSAO_INVALIDA' }] },
          { status: 401, statusText: 'Unauthorized' },
        );

      expect(erro).toBeTruthy();
    });
  });

  describe('sair', () => {
    it('revoga o refresh no servidor', () => {
      entrarComo('PRODUTOR');
      service.sair().subscribe();

      const req = httpMock.expectOne('/auth/logout');
      expect(req.request.method).toBe('POST');
      expect(req.request.withCredentials).toBe(true);
      req.flush(null, { status: 204, statusText: 'No Content' });
    });

    /** Servidor fora do ar não é motivo para manter alguém numa tela que ele mandou fechar. */
    it('não falha para quem chamou quando o servidor não responde', () => {
      entrarComo('PRODUTOR');
      let completou = false;
      let erro: unknown;
      service.sair().subscribe({ complete: () => (completou = true), error: (e) => (erro = e) });

      httpMock.expectOne('/auth/logout').error(new ProgressEvent('error'));

      expect(completou).toBe(true);
      expect(erro).toBeUndefined();
    });
  });

  describe('carregar', () => {
    it('responde da sessão sem ir ao servidor: o id e o papel vêm do token', () => {
      entrarComo('CONTADOR', 'Escritorio Campo Certo');

      let visto: SessaoAtual | undefined;
      service.carregar().subscribe((s) => (visto = s));

      httpMock.expectNone('/auth/me');
      expect(visto).toEqual({
        usuarioId: sessao.usuarioId(),
        papel: 'CONTADOR',
        nome: 'Escritorio Campo Certo',
      });
    });

    /**
     * E grava o nome na sessão, que é de onde a topbar o lê. Buscar e jogar fora deixaria o chip
     * da topbar no rótulo do papel para sempre.
     */
    it('vai ao servidor quando o nome ainda não chegou — e o guarda', () => {
      entrarComo('PRODUTOR');

      service.carregar().subscribe();
      httpMock.expectOne('/auth/me').flush(me);

      expect(sessao.nome()).toBe('Produtor de Teste');
    });

    it('telas perguntando junto viram UMA requisição', () => {
      const vistos: string[] = [];
      for (let i = 0; i < 4; i++) service.carregar().subscribe((s) => vistos.push(s.usuarioId));

      httpMock.expectOne('/auth/me').flush(me);

      expect(vistos).toHaveLength(4);
      expect(new Set(vistos).size).toBe(1);
    });

    it('o erro sobe para quem chamou', () => {
      let erro: unknown;
      service.carregar().subscribe({ error: (e) => (erro = e) });
      httpMock.expectOne('/auth/me').flush('nao', { status: 500, statusText: 'Server Error' });

      expect(erro).toBeTruthy();
    });
  });

  /**
   * As rotas de conta (#131). Os códigos e as mensagens abaixo foram **medidos** contra a API
   * local em 03/11 — a issue dizia `MUITAS_TENTATIVAS` para o 429 da notificação e o real era
   * outro, então aqui nada veio de suposição.
   */
  describe('conta', () => {
    it('cadastrar manda o documento só com dígitos', () => {
      service
        .cadastrar({
          papel: 'PRODUTOR',
          nomeCompleto: '  Maria Agricultora  ',
          cpfCnpj: '529.982.247-25',
          email: '  maria@exemplo.com.br ',
          senha: 'UmaSenhaBoa2026!',
          aceiteTermos: true,
        })
        .subscribe();

      const req = httpMock.expectOne('/auth/cadastro');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        papel: 'PRODUTOR',
        nomeCompleto: 'Maria Agricultora',
        cpfCnpj: '52998224725',
        email: 'maria@exemplo.com.br',
        senha: 'UmaSenhaBoa2026!',
        aceiteTermos: true,
      });
      req.flush(null, { status: 201, statusText: 'Created' });
    });

    it('o cadastro NÃO abre sessão: o contrato manda ir ao login', () => {
      service
        .cadastrar({
          papel: 'CONTADOR',
          nomeCompleto: 'Escritorio',
          cpfCnpj: '11144477735',
          email: 'e@x.com.br',
          senha: 'UmaSenhaBoa2026!',
          aceiteTermos: true,
        })
        .subscribe();
      httpMock.expectOne('/auth/cadastro').flush(null, { status: 201, statusText: 'Created' });

      expect(sessao.logado()).toBe(false);
    });

    it.each([
      ['SENHA_FRACA', 400, 'senha', 'A senha precisa ter pelo menos 10 caracteres.'],
      ['CADASTRO_CONFLITO', 409, undefined, 'Nao foi possivel concluir o cadastro.'],
    ])('o erro %s chega classificado, com o campo', (code, status, field, message) => {
      let erro: ContaError | undefined;
      service
        .cadastrar({
          papel: 'PRODUTOR',
          nomeCompleto: 'X',
          cpfCnpj: '52998224725',
          email: 'x@x.com.br',
          senha: 'curta',
          aceiteTermos: true,
        })
        .subscribe({ error: (e) => (erro = e) });

      httpMock
        .expectOne('/auth/cadastro')
        .flush({ errors: [{ code, field, message }] }, { status, statusText: 'erro' });

      expect(erro).toBeInstanceOf(ContaError);
      expect(erro?.codigo).toBe(code);
      expect(erro?.campo).toBe(field);
      // A mensagem do servidor e usada como esta: ela distingue os motivos melhor que a tela.
      expect(erro?.message).toBe(message);
    });

    /**
     * **Sempre 202**, exista a conta ou não — medido nos dois casos. É o que impede a resposta de
     * revelar quem tem conta, e a tela precisa tratar os dois como sucesso.
     */
    it('esqueci a senha trata o 202 como sucesso', () => {
      let completou = false;
      service
        .esqueciSenha(' alguem@exemplo.com.br ')
        .subscribe({ complete: () => (completou = true) });

      const req = httpMock.expectOne('/auth/senha/esqueci');
      expect(req.request.body).toEqual({ email: 'alguem@exemplo.com.br' });
      req.flush(null, { status: 202, statusText: 'Accepted' });

      expect(completou).toBe(true);
    });

    it('redefinir manda token e senha, e o link morto vira TOKEN_REDEFINICAO_INVALIDO', () => {
      let erro: ContaError | undefined;
      service.redefinirSenha('tok-123', 'UmaSenhaBoa2026!').subscribe({ error: (e) => (erro = e) });

      const req = httpMock.expectOne('/auth/senha/redefinir');
      expect(req.request.body).toEqual({ token: 'tok-123', novaSenha: 'UmaSenhaBoa2026!' });
      req.flush(
        {
          errors: [
            {
              code: 'TOKEN_REDEFINICAO_INVALIDO',
              field: 'token',
              message: 'Link de redefinicao invalido ou expirado.',
            },
          ],
        },
        { status: 400, statusText: 'Bad Request' },
      );

      expect(erro?.codigo).toBe('TOKEN_REDEFINICAO_INVALIDO');
      expect(erro?.campo).toBe('token');
    });

    it('alterar senha leva as duas e separa SENHA_ATUAL_INCORRETA', () => {
      entrarComo('PRODUTOR');
      let erro: ContaError | undefined;
      service.alterarSenha('errada', 'UmaSenhaBoa2026!').subscribe({ error: (e) => (erro = e) });

      const req = httpMock.expectOne('/auth/senha/alterar');
      expect(req.request.body).toEqual({ senhaAtual: 'errada', novaSenha: 'UmaSenhaBoa2026!' });
      req.flush(
        {
          errors: [
            {
              code: 'SENHA_ATUAL_INCORRETA',
              field: 'senhaAtual',
              message: 'A senha atual nao confere.',
            },
          ],
        },
        { status: 400, statusText: 'Bad Request' },
      );

      expect(erro?.codigo).toBe('SENHA_ATUAL_INCORRETA');
      expect(erro?.campo).toBe('senhaAtual');
    });

    it('sair de todos os dispositivos usa a rota autenticada', () => {
      entrarComo('PRODUTOR');
      service.sairDeTodosOsDispositivos().subscribe();

      const req = httpMock.expectOne('/auth/logout-todos');
      expect(req.request.method).toBe('POST');
      req.flush(null, { status: 204, statusText: 'No Content' });
    });

    it('o 429 preserva o Retry-After', () => {
      let erro: ContaError | undefined;
      service
        .cadastrar({
          papel: 'PRODUTOR',
          nomeCompleto: 'X',
          cpfCnpj: '52998224725',
          email: 'x@x.com.br',
          senha: 'UmaSenhaBoa2026!',
          aceiteTermos: true,
        })
        .subscribe({ error: (e) => (erro = e) });

      httpMock
        .expectOne('/auth/cadastro')
        .flush(
          { errors: [{ code: 'MUITAS_TENTATIVAS', message: 'Muitas tentativas.' }] },
          { status: 429, statusText: 'Too Many Requests', headers: { 'Retry-After': '120' } },
        );

      expect(erro?.codigo).toBe('MUITAS_TENTATIVAS');
      expect(erro?.retryAfterSegundos).toBe(120);
    });
  });
});
