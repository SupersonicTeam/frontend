import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ConfiguracoesPage } from './configuracoes';
import { entrarComo } from '@core/services/sessao.testing';

/**
 * A tela era quase toda encenação: nome e e-mail cravados no código, um botão
 * que fingia salvar com `setTimeout` e um formulário de troca de senha num
 * sistema sem senha — cujo botão nem handler tinha.
 *
 * Estes testes guardam o que passou a valer: dado real do backend, e nenhuma
 * promessa de ação que o servidor não cumpre.
 */
describe('ConfiguracoesPage', () => {
  let httpMock: HttpTestingController;

  const dashboard = {
    produtor: { nome: 'João da Silva Produtor', tipoProdutor: 'PESSOA_FISICA', uf: 'MT' },
    periodo: '2026-09',
    kpis: { saldoIbs: 0, saldoCbs: 0, totalNotas: 0 },
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConfiguracoesPage],
      // A secao de privacidade (#137) tem link para a politica de dados.
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    // O cadastro mostrado aqui e o do produtor: so a sessao dele pede `/api/dashboard` (#136).
    entrarComo('PRODUTOR');
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  /**
   * `/api/dashboard` e do produtor do token: para o contador responde 403 `PAPEL_NAO_AUTORIZADO`,
   * e a tela pedia mesmo assim, so para mostrar um cadastro de produtor que ele nao tem (#136).
   */
  /** O escritorio do produtor saiu daqui para a aba /escritorio; fica uma linha apontando para la. */
  it('o produtor nao tem mais a secao do escritorio, so o link para a aba', () => {
    const fixture = TestBed.createComponent(ConfiguracoesPage);
    fixture.detectChanges();
    httpMock.match((r) => r.url.startsWith('/dashboard')).forEach((r) => r.flush(dashboard));
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-escritorio-produtor')).toBeNull();
    expect(el.querySelector('a[href="/escritorio"]')).not.toBeNull();
    httpMock.expectNone((r) => r.url === '/vinculos' || r.url === '/convites');
  });

  /** A equipe saiu daqui para a aba /equipe (#157); fica uma linha apontando para la. */
  it('o contador nao tem mais a secao de equipe, so o link para a aba', () => {
    entrarComo('CONTADOR');
    const fixture = TestBed.createComponent(ConfiguracoesPage);
    fixture.detectChanges();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-equipe-escritorio')).toBeNull();
    expect(el.querySelector('a[href="/equipe"]')).not.toBeNull();
    httpMock.expectNone((r) => r.url.startsWith('/escritorio'));
  });

  it('o contador nao pede /api/dashboard: a rota e do produtor', () => {
    entrarComo('CONTADOR');
    const fixture = TestBed.createComponent(ConfiguracoesPage);
    fixture.detectChanges();

    httpMock.expectNone((r) => r.url === '/dashboard');
  });

  it('mostra o produtor que veio da API, não um nome cravado no código', () => {
    const fixture = TestBed.createComponent(ConfiguracoesPage);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === '/dashboard').flush(dashboard);
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('João da Silva Produtor');
    expect(texto).toContain('MT');
    // O nome antigo era inventado — se voltar, o teste pega.
    expect(texto).not.toContain('joao.silva@fazenda.com');
  });

  it('traduz o tipo do produtor em vez de mostrar o valor do banco', () => {
    const fixture = TestBed.createComponent(ConfiguracoesPage);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === '/dashboard').flush(dashboard);
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('pessoa física');
    expect(texto).not.toContain('PESSOA_FISICA');
  });

  /**
   * **Este teste virou o seu contrário, e isso é o certo.**
   *
   * Ele exigia que a tela **não** tivesse campo de senha, porque na época o sistema não tinha
   * senha nenhuma e o formulário que existia era encenação: um botão "Atualizar senha" sem
   * handler. Com a #93 e a #131, trocar a senha é uma ação de verdade — então o que ele passa a
   * guardar é que ela **existe** e que o botão só libera com os dois campos preenchidos.
   *
   * O que continua valendo é o princípio de sempre: nada de promessa que o servidor não cumpre.
   */
  it('oferece a troca de senha, e o botão só libera com os dois campos', () => {
    const fixture = TestBed.createComponent(ConfiguracoesPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === '/dashboard').flush(dashboard);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('input[type="password"]').length).toBe(2);
    expect(el.textContent).toContain('Sair de todos os dispositivos');

    expect(cmp.podeTrocarSenha()).toBe(false);
    cmp.senhaAtual.set('a-atual');
    expect(cmp.podeTrocarSenha()).toBe(false);
    cmp.novaSenha.set('UmaSenhaBoa2026!');
    expect(cmp.podeTrocarSenha()).toBe(true);
  });

  /** O texto dizia "esta versão ainda não tem login com senha" — virou mentira com a #93. */
  it('não diz mais que o sistema não tem login', () => {
    const fixture = TestBed.createComponent(ConfiguracoesPage);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === '/dashboard').flush(dashboard);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain(
      'ainda não tem login com senha',
    );
  });

  it('com o dashboard fora do ar, a tela continua de pé', () => {
    const fixture = TestBed.createComponent(ConfiguracoesPage);
    fixture.detectChanges();
    httpMock
      .expectOne((r) => r.url === '/dashboard')
      .flush('erro', { status: 500, statusText: 'x' });
    fixture.detectChanges();

    // O tema é local e não depende do backend: precisa continuar disponível.
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('input[type="checkbox"]')).toBeTruthy();
    expect(el.textContent).toContain('Aparência');
  });

  /**
   * O catalogo de obrigacoes morou aqui (backend#181) ate a #185. Agora e a aba "Modelos e
   * obrigacoes" do menu, e Configuracoes so aponta para la -- sem pedir a lista.
   */
  it('o contador nao tem mais o catalogo de obrigacoes, so o link para a aba', () => {
    entrarComo('CONTADOR');
    const fixture = TestBed.createComponent(ConfiguracoesPage);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('a[href="/catalogo"]')).not.toBeNull();
    expect(el.textContent).not.toContain('Obrigações do escritório');
    httpMock.expectNone((r) => r.url === '/contador/obrigacoes');
  });

  it('o produtor nao ve o link do catalogo: e coisa do escritorio', () => {
    const fixture = TestBed.createComponent(ConfiguracoesPage);
    fixture.detectChanges();
    httpMock.match((r) => r.url.startsWith('/dashboard')).forEach((r) => r.flush(dashboard));
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('a[href="/catalogo"]')).toBeNull();
  });
});
