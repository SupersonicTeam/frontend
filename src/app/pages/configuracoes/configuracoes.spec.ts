import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ConfiguracoesPage } from './configuracoes';
import type { ObrigacaoCatalogo } from '@services/contador/data-access/obrigacoes.service';
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
    // A secao do escritorio do produtor (#147) tem o proprio spec; aqui so drenamos o que ela pede.
    httpMock
      .match((r) => r.url === '/convites' || r.url === '/vinculos')
      .forEach((r) => r.flush([]));
    // A secao de equipe do contador (#148) tambem tem spec proprio.
    httpMock
      .match((r) => r.url.startsWith('/escritorio'))
      .forEach((r) => r.flush(r.request.url === '/escritorio' ? { minhaFuncao: 'CONTADOR' } : []));
    httpMock.verify();
    localStorage.clear();
  });

  /**
   * `/api/dashboard` e do produtor do token: para o contador responde 403 `PAPEL_NAO_AUTORIZADO`,
   * e a tela pedia mesmo assim, so para mostrar um cadastro de produtor que ele nao tem (#136).
   */
  it('o contador nao pede /api/dashboard: a rota e do produtor', () => {
    entrarComo('CONTADOR');
    const fixture = TestBed.createComponent(ConfiguracoesPage);
    fixture.detectChanges();

    httpMock.expectNone((r) => r.url === '/dashboard');
    httpMock.match((r) => r.url === '/contador/obrigacoes').forEach((r) => r.flush([]));
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
   * O catalogo de obrigacoes do escritorio (backend#181).
   *
   * E o que alimenta as obrigacoes no calendario dos clientes: o que estiver `ativa` aqui aparece
   * la. Como e coisa do escritorio, so o contador ve -- e so o administrador altera, o que o
   * servidor cobra com 403.
   */
  describe('catalogo de obrigacoes (#181)', () => {
    const obrigacao = (over: Partial<ObrigacaoCatalogo> = {}): ObrigacaoCatalogo => ({
      id: 'o1',
      modeloId: 'm1',
      origemCatalogo: 'MODELO',
      titulo: 'Funrural (recolhimento)',
      descricao: 'Contribuicao sobre a comercializacao',
      periodicidade: 'MENSAL',
      dia: 20,
      mes: null,
      ajusteFimDeSemana: 'NENHUM',
      tipoProdutor: null,
      regimes: ['SIMPLES'],
      origem: 'Lei 8.212/1991, art. 30',
      ativa: true,
      ...over,
    });

    function abrirComo(papel: 'PRODUTOR' | 'CONTADOR') {
      entrarComo(papel);
      const fixture = TestBed.createComponent(ConfiguracoesPage);
      fixture.detectChanges();
      return fixture.componentInstance;
    }

    afterEach(() => localStorage.clear());

    it('o produtor nem pede o catalogo: nao e tela dele', () => {
      abrirComo('PRODUTOR');
      httpMock.match((r) => r.url === '/dashboard').forEach((r) => r.flush(dashboard));

      httpMock.expectNone((r) => r.url === '/contador/obrigacoes');
    });

    it('o contador recebe o catalogo e separa o que esta no calendario do que saiu', () => {
      const cmp = abrirComo('CONTADOR');
      httpMock.match((r) => r.url === '/dashboard').forEach((r) => r.flush(dashboard));
      httpMock
        .expectOne((r) => r.url === '/contador/obrigacoes')
        .flush([obrigacao(), obrigacao({ id: 'o2', ativa: false, titulo: 'DAS-MEI' })]);

      expect(cmp.obrigacoesAtivas().map((o) => o.id)).toEqual(['o1']);
      expect(cmp.obrigacoesForaDoCalendario().map((o) => o.id)).toEqual(['o2']);
    });

    it('tirar do calendario usa DELETE e troca o item pelo que o servidor devolveu', () => {
      const cmp = abrirComo('CONTADOR');
      httpMock.match((r) => r.url === '/dashboard').forEach((r) => r.flush(dashboard));
      httpMock.expectOne((r) => r.url === '/contador/obrigacoes').flush([obrigacao()]);

      cmp.alternarNoCalendario(cmp.obrigacoesAtivas()[0]!);

      const req = httpMock.expectOne((r) => r.url === '/contador/obrigacoes/o1');
      expect(req.request.method).toBe('DELETE');
      // Num modelo o servidor devolve a VERSAO DO ESCRITORIO, com id novo -- por isso a lista
      // troca o item pelo que voltou, em vez de so virar um booleano.
      req.flush(obrigacao({ id: 'versao-1', origemCatalogo: 'PERSONALIZADA', ativa: false }));

      expect(cmp.obrigacoesAtivas().length).toBe(0);
      expect(cmp.obrigacoesForaDoCalendario()[0]!.id).toBe('versao-1');
    });

    it('reativar devolve a obrigacao ao calendario', () => {
      const cmp = abrirComo('CONTADOR');
      httpMock.match((r) => r.url === '/dashboard').forEach((r) => r.flush(dashboard));
      httpMock
        .expectOne((r) => r.url === '/contador/obrigacoes')
        .flush([obrigacao({ ativa: false })]);

      cmp.alternarNoCalendario(cmp.obrigacoesForaDoCalendario()[0]!);

      httpMock.expectOne((r) => r.url === '/contador/obrigacoes/o1/reativar').flush(obrigacao());
      expect(cmp.obrigacoesAtivas().length).toBe(1);
    });

    it('so a versao do escritorio pode voltar ao padrao', () => {
      const cmp = abrirComo('CONTADOR');
      httpMock.match((r) => r.url === '/dashboard').forEach((r) => r.flush(dashboard));
      httpMock.expectOne((r) => r.url === '/contador/obrigacoes').flush([]);

      expect(cmp.podeRestaurar(obrigacao({ origemCatalogo: 'PERSONALIZADA' }))).toBe(true);
      expect(cmp.podeRestaurar(obrigacao({ origemCatalogo: 'MODELO' }))).toBe(false);
      expect(cmp.podeRestaurar(obrigacao({ origemCatalogo: 'PROPRIA' }))).toBe(false);
    });

    it('o 403 vira a explicacao certa: so o administrador altera o catalogo', () => {
      const cmp = abrirComo('CONTADOR');
      httpMock.match((r) => r.url === '/dashboard').forEach((r) => r.flush(dashboard));
      httpMock.expectOne((r) => r.url === '/contador/obrigacoes').flush([obrigacao()]);

      cmp.alternarNoCalendario(cmp.obrigacoesAtivas()[0]!);
      httpMock
        .expectOne((r) => r.url === '/contador/obrigacoes/o1')
        .flush(
          { errors: [{ code: 'PAPEL_NAO_AUTORIZADO' }] },
          { status: 403, statusText: 'Forbidden' },
        );

      expect(cmp.erroDoCatalogo()).toContain('administrador');
      // E a obrigacao continua como estava: nada mudou no servidor.
      expect(cmp.obrigacoesAtivas().length).toBe(1);
    });

    it('a periodicidade sai legivel, com o dia', () => {
      const cmp = abrirComo('CONTADOR');
      httpMock.match((r) => r.url === '/dashboard').forEach((r) => r.flush(dashboard));
      httpMock.expectOne((r) => r.url === '/contador/obrigacoes').flush([]);

      expect(cmp.quandoVence(obrigacao())).toBe('todo mês, dia 20');
      expect(cmp.quandoVence(obrigacao({ periodicidade: 'ANUAL', dia: 31, mes: 5 }))).toBe(
        'uma vez por ano, 31 de maio',
      );
    });
  });
});
