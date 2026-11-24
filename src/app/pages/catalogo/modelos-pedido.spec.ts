import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { entrarComo } from '@core/services/sessao.testing';
import {
  dataLimiteDoModelo,
  type ModeloPedido,
} from '@services/contador/data-access/modelos-pedido.service';
import { ModelosPedido } from './modelos-pedido';

/**
 * Os modelos de pedido de documento do escritório (#185, backend#517).
 *
 * O modelo é do escritório: vem do servidor, e todo membro vê o mesmo. Só o administrador cria,
 * edita e apaga. O que estes testes protegem é o corpo do `POST`/`PUT` e os dois 409 do contrato.
 */
describe('ModelosPedido', () => {
  let httpMock: HttpTestingController;

  const modelo = (over: Partial<ModeloPedido> = {}): ModeloPedido => ({
    id: 'm1',
    titulo: 'Extrato bancário do mês',
    descricao: 'Extrato de todas as contas do mês anterior',
    tiposDocumento: ['EXTRATO'],
    prazoEmDias: 10,
    observacoes: 'Pode mandar em PDF',
    ...over,
  });

  function abrir(
    lista: ModeloPedido[],
    funcao: 'ADMINISTRADOR' | 'CONTADOR' | 'ASSISTENTE' = 'ADMINISTRADOR',
  ): ComponentFixture<ModelosPedido> {
    const fixture = TestBed.createComponent(ModelosPedido);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url === '/contador/modelos-pedido').flush(lista);
    httpMock
      .expectOne((r) => r.url === '/escritorio')
      .flush({ id: 'e1', nome: 'Rural Oeste', minhaFuncao: funcao });
    fixture.detectChanges();
    return fixture;
  }

  const texto = (f: ComponentFixture<ModelosPedido>) =>
    (f.nativeElement as HTMLElement).textContent ?? '';
  const botoes = (f: ComponentFixture<ModelosPedido>) =>
    [...(f.nativeElement as HTMLElement).querySelectorAll('button')].map(
      (b) => b.textContent?.trim() ?? '',
    );

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ModelosPedido],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
    entrarComo('CONTADOR');
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('lista os modelos com os tipos e o prazo em português', () => {
    const f = abrir([modelo(), modelo({ id: 'm2', titulo: 'Contrato', prazoEmDias: null })]);

    expect(texto(f)).toContain('Extrato bancário do mês');
    expect(texto(f)).toContain('extrato · prazo de 10 dias');
    expect(texto(f)).toContain('sem prazo');
  });

  it.each(['CONTADOR', 'ASSISTENTE'] as const)(
    '%s lê os modelos sem botão de escrita',
    (funcao) => {
      const f = abrir([modelo()], funcao);

      expect(botoes(f)).toEqual([]);
      expect(texto(f)).toContain('Só o administrador do escritório cria e altera os modelos');
    },
  );

  it('o administrador vê criar, editar e apagar', () => {
    expect(botoes(abrir([modelo()]))).toEqual(['Novo modelo', 'Editar', 'Apagar']);
  });

  it('sem modelo nenhum, o vazio diz o que fazer', () => {
    expect(texto(abrir([]))).toContain('Nenhum modelo de pedido ainda');
  });

  it('criar manda só o que foi preenchido, com o prazo em número', () => {
    const cmp = abrir([]).componentInstance;
    cmp.abrirFormulario(null);
    cmp.titulo.set('  Comprovante do Funrural ');
    cmp.alternarTipo('COMPROVANTE_PAGAMENTO');
    cmp.prazo.set('15');

    cmp.salvar();

    const req = httpMock.expectOne((r) => r.url === '/contador/modelos-pedido');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      titulo: 'Comprovante do Funrural',
      tiposDocumento: ['COMPROVANTE_PAGAMENTO'],
      prazoEmDias: 15,
    });
    req.flush(modelo({ id: 'novo', titulo: 'Comprovante do Funrural' }), {
      status: 201,
      statusText: 'Created',
    });

    expect(cmp.modelos().map((m) => m.id)).toEqual(['novo']);
    expect(cmp.emEdicao()).toBeUndefined();
  });

  it('o formulário só libera com nome, de 1 a 5 tipos e prazo de 1 a 365', () => {
    const cmp = abrir([]).componentInstance;
    cmp.abrirFormulario(null);
    cmp.titulo.set('Extrato');
    expect(cmp.valido()).toBe(false);

    cmp.alternarTipo('EXTRATO');
    expect(cmp.valido()).toBe(true);

    cmp.prazo.set('400');
    expect(cmp.valido()).toBe(false);
    cmp.prazo.set('');
    expect(cmp.valido()).toBe(true);
  });

  it('editar nasce com o modelo e manda PUT para o id dele', () => {
    const cmp = abrir([modelo()]).componentInstance;
    cmp.abrirFormulario(cmp.modelos()[0]!);
    expect(cmp.titulo()).toBe('Extrato bancário do mês');
    expect(cmp.prazo()).toBe('10');

    cmp.prazo.set('5');
    cmp.salvar();

    const req = httpMock.expectOne((r) => r.url === '/contador/modelos-pedido/m1');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toMatchObject({ prazoEmDias: 5, observacoes: 'Pode mandar em PDF' });
    req.flush(modelo({ prazoEmDias: 5 }));
    expect(cmp.modelos()[0]!.prazoEmDias).toBe(5);
  });

  /** O 409 de título repetido é do campo, não do topo: é ali que a pessoa corrige. */
  it('nome repetido aparece sob o campo do nome', () => {
    const cmp = abrir([modelo()]).componentInstance;
    cmp.abrirFormulario(null);
    cmp.titulo.set('extrato bancario do mes');
    cmp.alternarTipo('EXTRATO');

    cmp.salvar();
    httpMock
      .expectOne((r) => r.url === '/contador/modelos-pedido')
      .flush(
        { errors: [{ code: 'MODELO_PEDIDO_DUPLICADO', field: 'titulo', message: 'Duplicado.' }] },
        { status: 409, statusText: 'Conflict' },
      );

    expect(cmp.erroDoTitulo()).toContain('Já existe um modelo com este nome');
    expect(cmp.erroDoFormulario()).toBe('');
    expect(cmp.emEdicao()).toBeNull();
  });

  it('no limite de 50, o servidor recusa e a tela diz o que fazer', () => {
    const cmp = abrir([]).componentInstance;
    cmp.abrirFormulario(null);
    cmp.titulo.set('Mais um');
    cmp.alternarTipo('OUTRO');

    cmp.salvar();
    httpMock
      .expectOne((r) => r.url === '/contador/modelos-pedido')
      .flush(
        { errors: [{ code: 'LIMITE_MODELOS_PEDIDO', message: 'Limite.' }] },
        { status: 409, statusText: 'Conflict' },
      );

    expect(cmp.erroDoFormulario()).toContain('50 modelos');
  });

  it('apagar pede confirmação e tira o modelo da lista', () => {
    const cmp = abrir([modelo(), modelo({ id: 'm2', titulo: 'Contrato' })]).componentInstance;
    cmp.apagando.set(cmp.modelos()[0]!);

    cmp.apagar();

    const req = httpMock.expectOne((r) => r.url === '/contador/modelos-pedido/m1');
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });

    expect(cmp.modelos().map((m) => m.id)).toEqual(['m2']);
    expect(cmp.apagando()).toBeNull();
  });

  /** Outra pessoa já apagou: a lista daqui estava velha. Recarrega em vez de insistir. */
  it('404 ao apagar recarrega a lista', () => {
    const cmp = abrir([modelo()]).componentInstance;
    cmp.apagando.set(cmp.modelos()[0]!);

    cmp.apagar();
    httpMock
      .expectOne((r) => r.url === '/contador/modelos-pedido/m1')
      .flush('x', { status: 404, statusText: 'Not Found' });

    httpMock.expectOne((r) => r.url === '/contador/modelos-pedido').flush([]);
    expect(cmp.modelos()).toEqual([]);
  });
});

/**
 * O prazo do modelo vira data-limite no pedido: hoje **em Brasília** mais os dias. Com
 * `toISOString()` um pedido feito às 22h já sairia com a data de amanhã (UTC).
 */
describe('dataLimiteDoModelo', () => {
  it('soma os dias à data de hoje', () => {
    expect(dataLimiteDoModelo(10, new Date('2026-11-12T15:00:00Z'))).toBe('2026-11-22');
  });

  it('vira o mês e o ano', () => {
    expect(dataLimiteDoModelo(30, new Date('2026-12-15T15:00:00Z'))).toBe('2027-01-14');
  });

  it('às 22h de Brasília ainda é hoje, não amanhã', () => {
    // 01:00Z do dia 13 = 22:00 do dia 12 em Brasília.
    expect(dataLimiteDoModelo(1, new Date('2026-11-13T01:00:00Z'))).toBe('2026-11-13');
  });

  it('sem prazo, a data fica vazia', () => {
    expect(dataLimiteDoModelo(null)).toBe('');
  });
});
