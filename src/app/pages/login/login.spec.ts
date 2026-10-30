import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { SessaoService } from '@core/services/sessao.service';
import { LoginPage } from './login';

/**
 * A tela de entrada (issue #93).
 *
 * Era o "login de sabor" da #23: dois botões, sem senha, que só escolhiam de qual papel ver a
 * interface. Funcionava contra o profile `dev` do backend, que aceita `X-Usuario-Id` sem token — e
 * **só ele**. No app publicado, a primeira chamada de qualquer tela respondia 401
 * `NAO_AUTENTICADO`, e a demonstração parava aqui.
 */
describe('LoginPage', () => {
  let httpMock: HttpTestingController;
  let sessao: SessaoService;
  /** Para onde a tela mandou o usuário. Espião em vez de `router.url`: a navegação é assíncrona. */
  let navegouPara: string[];

  const login = {
    accessToken: 'jwt.de.acesso',
    tokenType: 'Bearer',
    expiraEm: new Date(Date.now() + 900_000).toISOString(),
    papel: 'PRODUTOR' as const,
    usuarioId: '4805bc94-8520-40ba-9e4a-63a96250df70',
  };

  /** Monta a tela com o `returnUrl` que o `sessaoGuard` teria anexado. */
  async function montar(returnUrl?: string) {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: convertToParamMap(returnUrl ? { returnUrl } : {}),
            },
          },
        },
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    sessao = TestBed.inject(SessaoService);

    navegouPara = [];
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockImplementation((destino) => {
      navegouPara.push(String(destino));
      return Promise.resolve(true);
    });

    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('não envia com os campos vazios', async () => {
    const cmp = (await montar()).componentInstance;

    expect(cmp.podeEnviar()).toBe(false);
    cmp.entrar();
    httpMock.expectNone('/auth/login');

    cmp.email.set('produtor@exemplo.com.br');
    expect(cmp.podeEnviar()).toBe(false);
    cmp.senha.set('SenhaDeTeste93!');
    expect(cmp.podeEnviar()).toBe(true);
  });

  it('entra e vai para a primeira tela do papel que o token declarou', async () => {
    const cmp = (await montar()).componentInstance;
    cmp.email.set('produtor@exemplo.com.br');
    cmp.senha.set('SenhaDeTeste93!');

    cmp.entrar();
    expect(cmp.enviando()).toBe(true);

    httpMock.expectOne('/auth/login').flush(login);
    httpMock.expectOne('/auth/me').flush({ ...login, nome: 'Produtor de Teste' });
    await Promise.resolve();

    expect(cmp.enviando()).toBe(false);
    expect(sessao.logado()).toBe(true);
    expect(navegouPara).toEqual(['/dashboard']);
  });

  /** O papel não é mais escolhido na tela: ele vem no token. */
  it('conta de contador cai na tela do contador, sem a tela escolher', async () => {
    const cmp = (await montar()).componentInstance;
    cmp.email.set('contador@exemplo.com.br');
    cmp.senha.set('SenhaDeTeste93!');

    cmp.entrar();
    httpMock.expectOne('/auth/login').flush({ ...login, papel: 'CONTADOR' });
    httpMock.expectOne('/auth/me').flush({ ...login, papel: 'CONTADOR', nome: 'Escritorio' });
    await Promise.resolve();

    expect(navegouPara).toEqual(['/contador']);
  });

  it('volta para a rota que a pessoa pediu antes de cair no login', async () => {
    const cmp = await montar('/documentos').then((f) => f.componentInstance);
    cmp.email.set('a@b.c');
    cmp.senha.set('senha');

    cmp.entrar();
    httpMock.expectOne('/auth/login').flush(login);
    httpMock.expectOne('/auth/me').flush({ ...login, nome: 'X' });
    await Promise.resolve();

    expect(navegouPara).toEqual(['/documentos']);
  });

  /**
   * Um `returnUrl` é query string: qualquer um o escreve. Sem a checagem, a tela de login viraria
   * um redirecionador para fora do site — o jeito clássico de usar um login confiável para levar a
   * um falso. `//site.externo` conta como absoluto para o navegador.
   */
  it.each(['https://site.externo/phishing', '//site.externo', 'documentos', '/login'])(
    'ignora returnUrl que não é caminho interno (%s)',
    async (perigoso) => {
      const cmp = (await montar(perigoso)).componentInstance;
      cmp.email.set('a@b.c');
      cmp.senha.set('senha');

      cmp.entrar();
      httpMock.expectOne('/auth/login').flush(login);
      httpMock.expectOne('/auth/me').flush({ ...login, nome: 'X' });
      await Promise.resolve();

      expect(navegouPara).toEqual(['/dashboard']);
    },
  );

  describe('quando não entra', () => {
    /**
     * `CREDENCIAIS_INVALIDAS` é a mesma resposta para e-mail sem conta, senha errada e conta
     * desativada — de propósito, para a resposta não dizer quem é cliente. A mensagem do backend
     * já é escrita para o usuário final (inclui o aviso de bloqueio por tentativas).
     */
    it('mostra a mensagem do servidor na credencial inválida', async () => {
      const cmp = (await montar()).componentInstance;
      cmp.email.set('a@b.c');
      cmp.senha.set('errada');

      cmp.entrar();
      httpMock.expectOne('/auth/login').flush(
        {
          errors: [
            {
              code: 'CREDENCIAIS_INVALIDAS',
              message: 'E-mail ou senha incorretos.',
            },
          ],
        },
        { status: 401, statusText: 'Unauthorized' },
      );

      expect(cmp.erro()).toBe('E-mail ou senha incorretos.');
      expect(cmp.enviando()).toBe(false);
      expect(sessao.logado()).toBe(false);
    });

    it('servidor fora do ar não é culpa de quem digitou', async () => {
      const cmp = (await montar()).componentInstance;
      cmp.email.set('a@b.c');
      cmp.senha.set('senha');

      cmp.entrar();
      httpMock.expectOne('/auth/login').error(new ProgressEvent('error'));

      expect(cmp.erro()).toContain('Sem conexão');
    });

    it('500 avisa que é o servidor, não a senha', async () => {
      const cmp = (await montar()).componentInstance;
      cmp.email.set('a@b.c');
      cmp.senha.set('senha');

      cmp.entrar();
      httpMock.expectOne('/auth/login').flush(null, { status: 500, statusText: 'Server Error' });

      expect(cmp.erro()).toContain('servidor');
      expect(cmp.erro()).not.toContain('senha');
    });

    it('uma nova tentativa limpa o erro anterior', async () => {
      const cmp = (await montar()).componentInstance;
      cmp.email.set('a@b.c');
      cmp.senha.set('errada');
      cmp.entrar();
      httpMock.expectOne('/auth/login').flush(null, { status: 401, statusText: 'Unauthorized' });
      expect(cmp.erro()).toBeTruthy();

      cmp.senha.set('certa');
      cmp.entrar();
      expect(cmp.erro()).toBeNull();

      httpMock.expectOne('/auth/login').flush(login);
      httpMock.expectOne('/auth/me').flush({ ...login, nome: 'X' });
    });
  });

  it('o campo de senha é de senha: o navegador não pode oferecer autocompletar errado', async () => {
    const fixture = await montar();
    const senha = (fixture.nativeElement as HTMLElement).querySelector('#login-senha');

    expect(senha?.getAttribute('type')).toBe('password');
    expect(senha?.getAttribute('autocomplete')).toBe('current-password');
  });
});
