import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { ObrigacaoCatalogo } from '@services/contador/data-access/obrigacoes.service';
import { FormularioObrigacao } from './formulario-obrigacao';

/**
 * Criar e editar obrigação do catálogo (#185). As rotas existiam desde a backend#181; faltava a
 * tela. O que estes testes protegem é o **corpo**: o servidor recusa mês na mensal e exige mês na
 * anual (400 `OBRIGACAO_INVALIDA`), e o `PUT` substitui a obrigação inteira.
 */
describe('FormularioObrigacao', () => {
  let httpMock: HttpTestingController;

  const modelo: ObrigacaoCatalogo = {
    id: 'o1',
    modeloId: 'm1',
    origemCatalogo: 'MODELO',
    titulo: 'Funrural (recolhimento)',
    descricao: 'Contribuição sobre a comercialização',
    periodicidade: 'MENSAL',
    dia: 20,
    mes: null,
    ajusteFimDeSemana: 'ANTECIPA',
    tipoProdutor: 'PESSOA_FISICA',
    regimes: ['PRESUMIDO'],
    origem: 'Lei 8.212/1991, art. 30',
    ativa: true,
  };

  function abrir(obrigacao: ObrigacaoCatalogo | null = null) {
    const fixture = TestBed.createComponent(FormularioObrigacao);
    fixture.componentRef.setInput('obrigacao', obrigacao);
    fixture.detectChanges();
    const salvas: ObrigacaoCatalogo[] = [];
    fixture.componentInstance.salvo.subscribe((o) => salvas.push(o));
    return { cmp: fixture.componentInstance, salvas };
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [FormularioObrigacao],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('só libera com nome e dia válidos', () => {
    const { cmp } = abrir();
    expect(cmp.valido()).toBe(false);

    cmp.titulo.set('Guia do ITR');
    cmp.dia.set('32');
    expect(cmp.valido()).toBe(false);

    cmp.dia.set('30');
    expect(cmp.valido()).toBe(true);
  });

  it('a anual exige o mês; a mensal nem o pede', () => {
    const { cmp } = abrir();
    cmp.titulo.set('Guia do ITR');
    cmp.dia.set('30');
    cmp.periodicidade.set('ANUAL');
    expect(cmp.valido()).toBe(false);

    cmp.mes.set('9');
    expect(cmp.valido()).toBe(true);
  });

  it('criar manda POST com o mês só na anual', () => {
    const { cmp, salvas } = abrir();
    cmp.titulo.set('  Guia do ITR ');
    cmp.dia.set('30');
    cmp.periodicidade.set('ANUAL');
    cmp.mes.set('9');
    cmp.origem.set('Lei 9.393/1996');
    cmp.alternarRegime('REAL');

    cmp.salvar();

    const req = httpMock.expectOne((r) => r.url === '/contador/obrigacoes');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      titulo: 'Guia do ITR',
      periodicidade: 'ANUAL',
      dia: 30,
      mes: 9,
      regimes: ['REAL'],
      origem: 'Lei 9.393/1996',
    });
    req.flush({ ...modelo, id: 'nova', origemCatalogo: 'PROPRIA' });
    expect(salvas.map((o) => o.id)).toEqual(['nova']);
  });

  /** Trocar de anual para mensal com o mês ainda escolhido não pode mandar o mês: é 400. */
  it('na mensal o mês não vai, mesmo que tenha ficado preenchido', () => {
    const { cmp } = abrir();
    cmp.titulo.set('Guia');
    cmp.dia.set('10');
    cmp.periodicidade.set('ANUAL');
    cmp.mes.set('3');
    cmp.periodicidade.set('MENSAL');

    cmp.salvar();

    const req = httpMock.expectOne((r) => r.url === '/contador/obrigacoes');
    expect('mes' in (req.request.body as object)).toBe(false);
    req.flush(modelo);
  });

  it('editar nasce com os dados da obrigação e manda PUT para o id dela', () => {
    const { cmp, salvas } = abrir(modelo);
    expect(cmp.titulo()).toBe('Funrural (recolhimento)');
    expect(cmp.dia()).toBe('20');
    expect(cmp.regimes()).toEqual(['PRESUMIDO']);

    cmp.dia.set('25');
    cmp.salvar();

    const req = httpMock.expectOne((r) => r.url === '/contador/obrigacoes/o1');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toMatchObject({ dia: 25, tipoProdutor: 'PESSOA_FISICA' });
    // Editar um modelo cria a versão do escritório: o id que volta é outro.
    req.flush({ ...modelo, id: 'versao-1', origemCatalogo: 'PERSONALIZADA', dia: 25 });
    expect(salvas[0]!.id).toBe('versao-1');
  });

  /**
   * O `PUT` substitui tudo. A tela não edita o ajuste de fim de semana; sem devolvê-lo, corrigir
   * um título apagaria a regra de antecipar o vencimento.
   */
  it('o ajuste de fim de semana volta como veio', () => {
    const { cmp } = abrir(modelo);

    cmp.salvar();

    const req = httpMock.expectOne((r) => r.url === '/contador/obrigacoes/o1');
    expect((req.request.body as { ajusteFimDeSemana?: string }).ajusteFimDeSemana).toBe('ANTECIPA');
    req.flush(modelo);
  });

  it('o erro do servidor fica dentro do formulário, com a frase dele', () => {
    const { cmp, salvas } = abrir(modelo);

    cmp.salvar();
    httpMock
      .expectOne((r) => r.url === '/contador/obrigacoes/o1')
      .flush(
        { errors: [{ code: 'OBRIGACAO_INVALIDA', message: 'Pessoa física não tem Simples.' }] },
        { status: 400, statusText: 'Bad Request' },
      );

    expect(cmp.erro()).toBe('Pessoa física não tem Simples.');
    expect(cmp.salvando()).toBe(false);
    expect(salvas).toEqual([]);
  });

  it('o 403 explica que só o administrador altera', () => {
    const { cmp } = abrir(modelo);

    cmp.salvar();
    httpMock
      .expectOne((r) => r.url === '/contador/obrigacoes/o1')
      .flush({ errors: [{ code: 'PAPEL_NAO_AUTORIZADO' }] }, { status: 403, statusText: 'x' });

    expect(cmp.erro()).toContain('administrador');
  });
});
