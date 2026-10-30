import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SessaoService } from '@core/services/sessao.service';
import { entrarComo } from '@core/services/sessao.testing';
import { AppLayout } from './app-layout';

/**
 * O shell precisa dizer **quem** está olhando.
 *
 * O nome vinha do `GET /api/dashboard`, que é do **produtor**: usá-lo para o contador o
 * identificava como o próprio cliente, e o `DashboardApi` ser `providedIn: 'root'` fazia o nome de
 * quem saiu sobrar para quem entrou. Desde a #93 os dois papéis leem o mesmo `/auth/me` — a fonte
 * que emite o token — e o painel não é mais pedido aqui.
 */
describe('AppLayout', () => {
  let httpMock: HttpTestingController;
  let sessao: SessaoService;

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AppLayout],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        // `sair()` navega para /login. Com a tabela vazia o Angular rejeita com NG04002, e a
        // promessa sem dono reprova a RODADA inteira no Vitest — os testes passam e o CI fica
        // vermelho mesmo assim. Uma rota que case basta.
        provideRouter([{ path: 'login', children: [] }]),
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    sessao = TestBed.inject(SessaoService);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  /** Monta o shell e drena o que ele busca na abertura (identidade e sino). */
  function montar(nomeDoServidor?: string) {
    const fixture = TestBed.createComponent(AppLayout);
    fixture.detectChanges();

    httpMock
      .match((r) => r.url === '/auth/me')
      .forEach((r) =>
        r.flush({
          usuarioId: sessao.usuarioId(),
          papel: sessao.papel(),
          nome: nomeDoServidor ?? '',
        }),
      );
    // O sino busca na fonte do papel atual desde a #113: `/alertas` para o produtor,
    // `/contador/produtores` para o escritório. Drenar aqui mantém os testes do shell focados
    // no que eles provam — nome, papel e painéis.
    httpMock.match((r) => r.url === '/alertas').forEach((r) => r.flush([]));
    httpMock.match((r) => r.url === '/contador/produtores').forEach((r) => r.flush([]));
    fixture.detectChanges();
    return fixture;
  }

  it('mostra o nome que o servidor respondeu, para o produtor', () => {
    entrarComo('PRODUTOR');
    const cmp = montar('João da Silva Produtor').componentInstance;

    expect(cmp.nomeExibido()).toBe('João da Silva Produtor');
    expect(cmp.papelExibido()).toBe('Produtor rural');
  });

  /**
   * O contador tem nome **próprio** agora.
   *
   * Antes o chip dizia "João da Silva Produtor" com "Contador" embaixo — duas pessoas no mesmo
   * lugar — porque o único nome disponível era o do painel do produtor. O `/auth/me` responde o
   * nome do escritório, então não há mais por que cair no rótulo.
   */
  it('mostra o nome do escritório, não o do produtor', () => {
    entrarComo('CONTADOR');
    const cmp = montar('Escritorio Contabil Campo Certo').componentInstance;

    expect(cmp.nomeExibido()).toBe('Escritorio Contabil Campo Certo');
    expect(cmp.papelExibido()).toBe('Contador');
  });

  /** Enquanto o nome não chegou, o rótulo do papel — e a segunda linha some, para não gaguejar. */
  it('sem nome ainda, usa o rótulo do papel e não repete na segunda linha', () => {
    entrarComo('CONTADOR');
    const cmp = montar().componentInstance;

    expect(cmp.nomeExibido()).toBe('Contador');
    expect(cmp.papelExibido()).toBe('');
  });

  /**
   * O painel saiu da abertura do shell (#93).
   *
   * Ele era pedido só para preencher o nome, o que custava um `GET /api/dashboard` em **cada**
   * navegação do produtor fora do `/dashboard` — e respondia 403 para o contador.
   */
  it('não pede o painel do produtor: o nome não vem mais dele', () => {
    entrarComo('PRODUTOR');
    const fixture = TestBed.createComponent(AppLayout);
    fixture.detectChanges();

    expect(httpMock.match((r) => r.url === '/dashboard').length).toBe(0);

    httpMock.match((r) => r.url === '/auth/me').forEach((r) => r.flush({}));
    httpMock.match((r) => r.url === '/alertas').forEach((r) => r.flush([]));
  });

  /**
   * O vazamento entre sessões, medido no navegador em 29/10.
   *
   * Entrando como produtor, saindo e entrando como contador **sem recarregar a página**, a topbar
   * do escritório exibia o nome do produtor — o que sobrou nos signals `root`, que não morrem na
   * troca de usuário. Pior que mostrar nada: parece dado, então se acredita nele. Quem limpa agora
   * é o `EncerramentoService`, chamado tanto pelo botão Sair quanto pela renovação que falhou.
   */
  it('sair esquece o nome: o de quem saiu não aparece para quem entra', () => {
    entrarComo('PRODUTOR');
    const cmp = montar('João da Silva Produtor').componentInstance;
    expect(cmp.nomeExibido()).toBe('João da Silva Produtor');

    cmp.sair();
    httpMock.match((r) => r.url === '/auth/logout').forEach((r) => r.flush(null));

    expect(sessao.logado()).toBe(false);
    expect(cmp.nomeExibido()).not.toContain('João');

    entrarComo('CONTADOR');
    expect(cmp.nomeExibido()).not.toContain('João');
    expect(cmp.papelExibido()).not.toContain('João');
  });

  it('Esc fecha os paineis sobrepostos', () => {
    entrarComo('PRODUTOR');
    const cmp = montar().componentInstance;

    cmp.toggleNotificacoes();
    expect(cmp.notificacoesOpen()).toBe(true);
    cmp.aoPressionarEsc();
    expect(cmp.notificacoesOpen()).toBe(false);
  });
});
