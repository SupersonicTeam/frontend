import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { entrarComo } from '@core/services/sessao.testing';
import type { ObrigacaoCatalogo } from '@services/contador/data-access/obrigacoes.service';
import { ObrigacoesCatalogo } from './obrigacoes-catalogo';

/**
 * O catálogo de obrigações do escritório (backend#181), na aba "Modelos e obrigações" (#185).
 *
 * É o que alimenta as obrigações no calendário dos clientes: o que estiver `ativa` aqui aparece
 * lá. Todo membro lê; só o administrador altera, e o servidor cobra isso com 403.
 */
describe('ObrigacoesCatalogo', () => {
  let httpMock: HttpTestingController;

  const obrigacao = (over: Partial<ObrigacaoCatalogo> = {}): ObrigacaoCatalogo => ({
    id: 'o1',
    modeloId: 'm1',
    origemCatalogo: 'MODELO',
    titulo: 'Funrural (recolhimento)',
    descricao: 'Contribuição sobre a comercialização',
    periodicidade: 'MENSAL',
    dia: 20,
    mes: null,
    ajusteFimDeSemana: 'ANTECIPA',
    tipoProdutor: null,
    regimes: ['SIMPLES'],
    origem: 'Lei 8.212/1991, art. 30',
    ativa: true,
    ...over,
  });

  /** Abre a tela já com o catálogo e a função de quem está logado respondidos. */
  function abrir(
    lista: ObrigacaoCatalogo[],
    funcao: 'ADMINISTRADOR' | 'CONTADOR' | 'ASSISTENTE' = 'ADMINISTRADOR',
  ): ComponentFixture<ObrigacoesCatalogo> {
    const fixture = TestBed.createComponent(ObrigacoesCatalogo);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === '/contador/obrigacoes').flush(lista);
    httpMock
      .expectOne((r) => r.url === '/escritorio')
      .flush({ id: 'e1', nome: 'Rural Oeste', minhaFuncao: funcao });
    fixture.detectChanges();
    return fixture;
  }

  const texto = (f: ComponentFixture<ObrigacoesCatalogo>) =>
    (f.nativeElement as HTMLElement).textContent ?? '';
  const botoes = (f: ComponentFixture<ObrigacoesCatalogo>) =>
    [...(f.nativeElement as HTMLElement).querySelectorAll('button')].map(
      (b) => b.textContent?.trim() ?? '',
    );

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ObrigacoesCatalogo],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
    entrarComo('CONTADOR');
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('separa o que está no calendário do que o escritório tirou', () => {
    const cmp = abrir([
      obrigacao(),
      obrigacao({ id: 'o2', ativa: false, titulo: 'DAS-MEI' }),
    ]).componentInstance;

    expect(cmp.ativas().map((o) => o.id)).toEqual(['o1']);
    expect(cmp.foraDoCalendario().map((o) => o.id)).toEqual(['o2']);
  });

  it('mostra a descrição e de onde a obrigação veio, em português', () => {
    const f = abrir([obrigacao({ origemCatalogo: 'PERSONALIZADA' })]);

    expect(texto(f)).toContain('Contribuição sobre a comercialização');
    expect(texto(f)).toContain('Padrão ajustado pelo escritório');
    expect(texto(f)).not.toContain('PERSONALIZADA');
  });

  /** A tela antiga explicava a falta do formulário citando as rotas. Não é texto para o contador. */
  it('não cita rota nem verbo HTTP em lugar nenhum', () => {
    const f = abrir([obrigacao()]);

    expect(texto(f)).not.toContain('POST');
    expect(texto(f)).not.toContain('PUT');
    expect(texto(f)).not.toContain('/api/');
  });

  /**
   * Antes os botões apareciam para todos, e o `CONTADOR` e o `ASSISTENTE` clicavam para levar 403.
   * Botão que sempre falha ensina a desconfiar do sistema.
   */
  it.each(['CONTADOR', 'ASSISTENTE'] as const)(
    '%s vê o catálogo sem nenhum botão de escrita',
    (funcao) => {
      const f = abrir([obrigacao(), obrigacao({ id: 'o2', ativa: false })], funcao);

      expect(botoes(f)).toEqual([]);
      expect(texto(f)).toContain('Só o administrador do escritório altera o catálogo');
      expect(texto(f)).toContain('Funrural (recolhimento)');
    },
  );

  it('o administrador vê criar, editar e tirar do calendário', () => {
    const f = abrir([obrigacao()]);

    expect(botoes(f)).toEqual(['Nova obrigação', 'Editar', 'Tirar do calendário']);
  });

  /** Na dúvida sobre a função (o escritório não respondeu), ninguém vê botão. */
  it('se o escritório não carrega, a tela fica só de leitura', () => {
    const fixture = TestBed.createComponent(ObrigacoesCatalogo);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === '/contador/obrigacoes').flush([obrigacao()]);
    httpMock
      .expectOne((r) => r.url === '/escritorio')
      .flush('erro', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(botoes(fixture)).toEqual([]);
  });

  it('tirar do calendário usa DELETE e troca o item pelo que o servidor devolveu', () => {
    const cmp = abrir([obrigacao()]).componentInstance;

    cmp.alternarNoCalendario(cmp.ativas()[0]!);
    expect(cmp.ocupado(obrigacao(), 'calendario')).toBe(true);

    const req = httpMock.expectOne((r) => r.url === '/contador/obrigacoes/o1');
    expect(req.request.method).toBe('DELETE');
    // Num modelo do sistema o servidor devolve a versão do escritório, com id novo.
    req.flush(obrigacao({ id: 'versao-1', origemCatalogo: 'PERSONALIZADA', ativa: false }));

    expect(cmp.ativas().length).toBe(0);
    expect(cmp.foraDoCalendario()[0]!.id).toBe('versao-1');
    expect(cmp.emCurso()).toBeNull();
  });

  it('reativar devolve a obrigação ao calendário', () => {
    const cmp = abrir([obrigacao({ ativa: false })]).componentInstance;

    cmp.alternarNoCalendario(cmp.foraDoCalendario()[0]!);

    httpMock.expectOne((r) => r.url === '/contador/obrigacoes/o1/reativar').flush(obrigacao());
    expect(cmp.ativas().length).toBe(1);
  });

  it('só a versão do escritório pode voltar ao padrão', () => {
    const cmp = abrir([]).componentInstance;

    expect(cmp.podeRestaurar(obrigacao({ origemCatalogo: 'PERSONALIZADA' }))).toBe(true);
    expect(cmp.podeRestaurar(obrigacao({ origemCatalogo: 'MODELO' }))).toBe(false);
    expect(cmp.podeRestaurar(obrigacao({ origemCatalogo: 'PROPRIA' }))).toBe(false);
  });

  /** "Voltar ao padrão" não mostrava carregamento, e os outros dois botões mostravam (#185). */
  it('voltar ao padrão mostra carregamento no botão dele, não no vizinho', () => {
    const versao = obrigacao({ id: 'v1', origemCatalogo: 'PERSONALIZADA' });
    const cmp = abrir([versao]).componentInstance;

    cmp.restaurarPadrao(versao);

    expect(cmp.ocupado(versao, 'padrao')).toBe(true);
    expect(cmp.ocupado(versao, 'calendario')).toBe(false);
    httpMock
      .expectOne((r) => r.url === '/contador/obrigacoes/v1/restaurar-padrao')
      .flush(obrigacao());
    expect(cmp.ativas()[0]!.id).toBe('o1');
  });

  it('o 403 vira a explicação certa, e nada muda na lista', () => {
    const cmp = abrir([obrigacao()]).componentInstance;

    cmp.alternarNoCalendario(cmp.ativas()[0]!);
    httpMock
      .expectOne((r) => r.url === '/contador/obrigacoes/o1')
      .flush(
        { errors: [{ code: 'PAPEL_NAO_AUTORIZADO' }] },
        { status: 403, statusText: 'Forbidden' },
      );

    expect(cmp.erroDaAcao()).toContain('administrador');
    expect(cmp.ativas().length).toBe(1);
  });

  /** Erro não é lista vazia: "nenhuma obrigação" diria que o calendário está sem prazo nenhum. */
  it('quando a lista não chega, diz que não carregou e oferece tentar de novo', () => {
    const fixture = TestBed.createComponent(ObrigacoesCatalogo);
    fixture.detectChanges();
    httpMock
      .expectOne((r) => r.url === '/contador/obrigacoes')
      .flush('erro', { status: 500, statusText: 'Server Error' });
    httpMock
      .expectOne((r) => r.url === '/escritorio')
      .flush({ id: 'e1', nome: 'Rural Oeste', minhaFuncao: 'ADMINISTRADOR' });
    fixture.detectChanges();

    expect(texto(fixture)).toContain('Não foi possível carregar as obrigações');
    expect(texto(fixture)).not.toContain('Nenhuma obrigação');
    expect(botoes(fixture)).toEqual(['Tentar de novo']);

    fixture.componentInstance.carregar();
    httpMock.expectOne((r) => r.url === '/contador/obrigacoes').flush([obrigacao()]);
    expect(fixture.componentInstance.ativas().length).toBe(1);
  });

  it('a periodicidade sai legível, com o dia', () => {
    const cmp = abrir([]).componentInstance;

    expect(cmp.quandoVence(obrigacao())).toBe('todo mês, dia 20');
    expect(cmp.quandoVence(obrigacao({ periodicidade: 'ANUAL', dia: 31, mes: 5 }))).toBe(
      'uma vez por ano, 31 de maio',
    );
  });

  describe('criar e editar', () => {
    it('a obrigação criada entra na lista', () => {
      const cmp = abrir([obrigacao()]).componentInstance;
      cmp.formulario.set(null);

      cmp.aoSalvar(obrigacao({ id: 'nova', origemCatalogo: 'PROPRIA', titulo: 'ITR' }));

      expect(cmp.ativas().map((o) => o.id)).toEqual(['o1', 'nova']);
      expect(cmp.formulario()).toBeUndefined();
    });

    /** Editar um modelo do sistema cria a versão do escritório: o servidor devolve id novo. */
    it('a editada troca de lugar com a antiga, mesmo voltando com outro id', () => {
      const original = obrigacao();
      const cmp = abrir([original]).componentInstance;
      cmp.formulario.set(original);

      cmp.aoSalvar(obrigacao({ id: 'versao-9', origemCatalogo: 'PERSONALIZADA', dia: 25 }));

      expect(cmp.ativas().map((o) => o.id)).toEqual(['versao-9']);
      expect(cmp.ativas()[0]!.dia).toBe(25);
    });
  });
});
