import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, DeferBlockState, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SessaoService } from '@core/services/sessao.service';
import { entrarComo } from '@core/services/sessao.testing';
import type { NotaFiscal } from '@models/nota-fiscal.model';
import { AssistenteStore } from '@shared/assistente/assistente.store';
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
    httpMock.match((r) => r.url === '/convites').forEach((r) => r.flush([]));
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
    httpMock.match((r) => r.url === '/convites').forEach((r) => r.flush([]));
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

  /**
   * Com sessão de contador, o shell não chama rota nenhuma do produtor (issue #136).
   *
   * `/api/alertas`, `/api/assistente/*` e `/api/convites` derivam o produtor do token e respondem
   * 403 `PAPEL_NAO_AUTORIZADO` ao escritório — e o 403 vira toast em toda tela que ele abre. O sino
   * dele vem da carteira, e a Ceres não existe para ele.
   */
  it('o contador nao chama /alertas, /assistente nem /convites, e nao ve a Ceres', () => {
    entrarComo('CONTADOR');
    const fixture = TestBed.createComponent(AppLayout);
    fixture.detectChanges();

    const pedidas = httpMock.match(() => true);
    const urls = pedidas.map((r) => r.request.url);
    expect(urls.some((u) => u.startsWith('/alertas'))).toBe(false);
    expect(urls.some((u) => u.startsWith('/assistente'))).toBe(false);
    expect(urls.some((u) => u.startsWith('/convites'))).toBe(false);
    expect(urls).toContain('/contador/produtores');
    pedidas.forEach((r) => r.flush(r.request.url === '/auth/me' ? { nome: '' } : []));
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-assistente-launcher')).toBeNull();
    expect(el.querySelector('app-assistente-drawer')).toBeNull();
  });

  /**
   * A gaveta saiu do bundle inicial (#143): ela só nasce no primeiro `abrir()`. O pedido feito
   * antes de o bloco carregar não pode se perder -- o primeiro clique tem que abrir a gaveta já
   * com a nota, não exigir um segundo clique.
   */
  it('a gaveta da Ceres carrega no primeiro abrir e já nasce aberta, com a nota pedida', async () => {
    entrarComo('PRODUTOR');
    const fixture = montar();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-assistente-launcher')).not.toBeNull();
    expect(el.querySelector('app-assistente-drawer')).toBeNull();

    const store = TestBed.inject(AssistenteStore);
    store.abrirSobreNota({ id: 'n7', numero: 7, status: 'AUTORIZADA' } as NotaFiscal);
    await abrirGaveta(fixture);

    const gaveta = el.querySelector('app-assistente-drawer');
    expect(gaveta).not.toBeNull();
    expect(gaveta?.querySelector('[role="dialog"]')).not.toBeNull();
    expect(gaveta?.textContent).toContain('Falando sobre a nota 7');
  });

  it('o clique no launcher carrega a gaveta, e ao fechar o launcher volta', async () => {
    entrarComo('PRODUTOR');
    const fixture = montar();
    const el = fixture.nativeElement as HTMLElement;

    el.querySelector<HTMLButtonElement>('app-assistente-launcher button')!.click();
    await abrirGaveta(fixture);
    expect(el.querySelector('app-assistente-drawer [role="dialog"]')).not.toBeNull();
    expect(el.querySelector('app-assistente-launcher button')).toBeNull();

    TestBed.inject(AssistenteStore).fechar();
    fixture.detectChanges();
    expect(el.querySelector('app-assistente-drawer [role="dialog"]')).toBeNull();
    expect(el.querySelector('app-assistente-launcher button')).not.toBeNull();
  });

  it('se o chunk da gaveta falhar, explica e oferece recarregar, em vez de sumir com a Ceres', async () => {
    entrarComo('PRODUTOR');
    const fixture = montar();
    const el = fixture.nativeElement as HTMLElement;
    TestBed.inject(AssistenteStore).aberto.set(true);
    fixture.detectChanges();

    const [bloco] = await fixture.getDeferBlocks();
    await bloco.render(DeferBlockState.Error);

    expect(el.querySelector('[role="alert"]')?.textContent).toContain(
      'Não foi possível abrir a Ceres',
    );
    expect(el.querySelector('app-assistente-drawer')).toBeNull();
  });

  /**
   * Espera o `@defer` carregar e responde só o que o `abrir()` do store pede: painel, notas e a
   * cota. Qualquer outra chamada fica pendente e o `verify()` do afterEach reprova.
   */
  async function abrirGaveta(fixture: ComponentFixture<AppLayout>) {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    httpMock.match((r) => r.url === '/dashboard').forEach((r) => r.flush({}));
    httpMock.match((r) => r.url === '/notas').forEach((r) => r.flush({ content: [] }));
    httpMock.match((r) => r.url === '/assistente/uso').forEach((r) => r.flush({}));
    fixture.detectChanges();
  }

  /** A equipe do escritório virou aba do contador (#157), nos dois menus. */
  describe('menu', () => {
    const links = (f: ComponentFixture<AppLayout>, seletor: string) =>
      [
        ...(f.nativeElement as HTMLElement).querySelectorAll<HTMLAnchorElement>(
          `${seletor} a[href]`,
        ),
      ].map((a) => a.getAttribute('href'));

    it('o contador tem a aba Equipe na barra lateral', () => {
      entrarComo('CONTADOR');
      expect(links(montar(), 'aside')).toContain('/equipe');
    });

    it('o produtor não vê a aba Equipe', () => {
      entrarComo('PRODUTOR');
      expect(links(montar(), 'aside')).not.toContain('/equipe');
    });

    /**
     * O menu do celular do contador estava desatualizado: mostrava "Minhas notas", na voz do
     * produtor, e "Contador", sem Fechamento nem Prazos. Agora espelha a barra lateral.
     */
    it('no celular, o contador vê o mesmo menu da barra lateral', () => {
      entrarComo('CONTADOR');
      const f = montar();
      f.componentInstance.toggleMobileMenu();
      f.detectChanges();

      const nav = (f.nativeElement as HTMLElement).querySelector('nav.rounded-b-xl');
      const hrefs = [...(nav?.querySelectorAll('a[href]') ?? [])].map((a) =>
        a.getAttribute('href'),
      );
      expect(hrefs).toEqual(['/contador', '/documentos', '/tributario', '/calendario', '/equipe']);
      expect(nav?.textContent).toContain('Notas do produtor');
      expect(nav?.textContent).not.toContain('Minhas notas');
    });
  });
});
