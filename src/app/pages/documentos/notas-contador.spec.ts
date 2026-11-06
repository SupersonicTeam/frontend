import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { NotasContador } from './notas-contador';
import type { NotaCarteira, ProdutorCarteira, ResumoNotasCarteira } from '@models/carteira.model';

const cliente = (id: string, nomeCompleto: string) =>
  ({ id, nomeCompleto, vinculoId: `v-${id}`, situacaoVinculo: 'ATIVO' }) as ProdutorCarteira;

const nota = (id: string, status: string, produtorId = 'p1', numero = 1) =>
  ({
    id,
    produtorId,
    produtorNome: produtorId === 'p1' ? 'Ana Produtora' : 'Bruno',
    numero,
    serie: 1,
    status,
    dataEmissao: '2026-10-10T03:00:00Z',
    destinatarioNome: 'Cooperativa',
    valorTotalNota: 1000,
  }) as NotaCarteira;

const RESUMO_ZERADO: ResumoNotasCarteira = {
  revisao: 0,
  travadas: 0,
  rascunhos: 0,
  devolvidas: 0,
  autorizadas: 0,
  canceladas: 0,
  todas: 0,
};

/**
 * `/documentos` para o contador (#136, #164).
 *
 * A tela antiga chamava `/api/notas`, `/api/vinculos` e `/api/pendencias`, que respondem 403 ao
 * escritório; depois passou a exigir um cliente antes de mostrar qualquer nota. Desde a #164 ela
 * abre na carteira inteira (`GET /api/contador/notas`, backend#341), conta as caixas pelo
 * `/resumo` e manda o `produtorId` **da nota** às rotas por cliente.
 */
describe('NotasContador', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [NotasContador],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  /** Abre a tela com uma carteira de dois clientes — nenhum escolhido: a carteira inteira. */
  function abrir() {
    const fixture = TestBed.createComponent(NotasContador);
    fixture.detectChanges();
    httpMock
      .expectOne((r) => r.url === '/contador/produtores')
      .flush([cliente('p1', 'Ana Produtora'), cliente('p2', 'Bruno')]);
    fixture.detectChanges();
    return fixture;
  }

  const lista = () => httpMock.expectOne((r) => r.url === '/contador/notas');
  const resumo = () => httpMock.expectOne((r) => r.url === '/contador/notas/resumo');

  /** Responde a lista e o resumo que cada troca de cliente pede. */
  function responder(notas: NotaCarteira[] = [], contagem: Partial<ResumoNotasCarteira> = {}) {
    resumo().flush({ ...RESUMO_ZERADO, ...contagem });
    lista().flush(notas, { headers: { 'X-Total-Count': String(notas.length) } });
  }

  it('sem cliente escolhido abre a carteira inteira, em "Precisam de revisão"', () => {
    const fixture = abrir();

    const contagem = resumo();
    expect(contagem.request.params.has('produtorId')).toBe(false);
    contagem.flush({ ...RESUMO_ZERADO, revisao: 2, todas: 9 });
    const req = lista();
    expect(req.request.params.has('produtorId')).toBe(false);
    expect(req.request.params.getAll('status')).toEqual(['AGUARDANDO_APROVACAO']);
    expect(req.request.params.get('sort')).toBe('dataEmissao,desc');
    req.flush(
      [nota('n1', 'AGUARDANDO_APROVACAO', 'p1'), nota('n2', 'AGUARDANDO_APROVACAO', 'p2')],
      {
        headers: { 'X-Total-Count': '2' },
      },
    );
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).not.toContain('Escolha um cliente');
    expect(texto).toContain('toda a carteira');
    // De quem e a nota, quando a lista mistura clientes.
    expect(texto).toContain('Ana Produtora');
    expect(texto).toContain('Bruno');
    expect(fixture.componentInstance.contagens()['revisao']).toBe(2);
  });

  it('com cliente, a mesma rota com produtorId; nada de /notas, /vinculos ou /pendencias', () => {
    const fixture = abrir();
    responder();
    fixture.componentInstance.aoTrocarCliente(cliente('p1', 'Ana Produtora'));

    const pedidos = httpMock.match(() => true);
    expect(pedidos.map((r) => r.request.url).sort()).toEqual([
      '/contador/notas',
      '/contador/notas/resumo',
    ]);
    for (const req of pedidos) {
      expect(req.request.params.get('produtorId')).toBe('p1');
    }
    pedidos.forEach((r) =>
      r.request.url.endsWith('/resumo') ? r.flush(RESUMO_ZERADO) : r.flush([]),
    );
  });

  it('as caixas contam pelo resumo, numa consulta só', () => {
    const fixture = abrir();
    const cmp = fixture.componentInstance;
    responder([], { travadas: 4, revisao: 1, todas: 30 });

    httpMock.expectNone((r) => r.url === '/contador/notas/resumo');
    expect(cmp.contagens()['travadas']).toBe(4);
    expect(cmp.contagens()['revisao']).toBe(1);
    expect(cmp.contagens()['todas']).toBe(30);
  });

  it('trocar de caixa troca o filtro de status, sem recontar as caixas', () => {
    const cmp = abrir().componentInstance;
    responder();

    cmp.trocarCaixa('travadas');

    httpMock.expectNone((r) => r.url === '/contador/notas/resumo');
    const req = lista();
    expect(req.request.params.getAll('status')).toEqual(['COM_INCONSISTENCIAS', 'REJEITADA']);
    req.flush([]);
  });

  it('com a carteira inteira, aprovar vai para o cliente DA NOTA e troca só o status', () => {
    const cmp = abrir().componentInstance;
    responder([nota('n1', 'AGUARDANDO_APROVACAO', 'p2')]);

    cmp.aprovar(cmp.notas()[0]!);
    const req = httpMock.expectOne('/contador/produtores/p2/notas/n1/aprovar');
    expect(req.request.method).toBe('POST');
    req.flush({ id: 'n1', status: 'APROVADA', itens: [] });
    expect(cmp.notas()[0]!.status).toBe('APROVADA');
    // O resumo da carteira continua: o nome do cliente nao some com a nota completa.
    expect(cmp.notas()[0]!.produtorNome).toBe('Bruno');

    // A caixa recarrega em silencio: aprovada, a nota saiu de "Precisam de revisao" no servidor.
    responder();
    expect(cmp.notas()).toEqual([]);
  });

  it('devolver exige motivo de 5 a 500 e vai para o cliente da nota', () => {
    const cmp = abrir().componentInstance;
    responder([nota('n1', 'AGUARDANDO_APROVACAO', 'p2')]);

    cmp.abrirDevolucao(cmp.notas()[0]!);
    cmp.motivo.set('cfop');
    cmp.confirmarDevolucao();
    httpMock.expectNone((r) => r.url.endsWith('/devolver'));

    cmp.motivo.set('Falta o CFOP no item 2.');
    cmp.confirmarDevolucao();
    const req = httpMock.expectOne('/contador/produtores/p2/notas/n1/devolver');
    expect(req.request.body).toEqual({ motivo: 'Falta o CFOP no item 2.' });
    req.flush({ id: 'n1', status: 'DEVOLVIDA', itens: [] });
    responder();

    expect(cmp.devolvendo()).toBeNull();
  });

  it('o que o fisco apontou vem da rota do cliente da nota', () => {
    const cmp = abrir().componentInstance;
    responder([nota('n1', 'COM_INCONSISTENCIAS', 'p2')]);

    cmp.alternarNota(cmp.notas()[0]!);

    httpMock.expectOne('/contador/produtores/p2/notas/n1/validacoes').flush([]);
  });

  it('resposta de um recorte antigo não entra na tela do novo', () => {
    const cmp = abrir().componentInstance;
    resumo().flush(RESUMO_ZERADO);
    const atrasada = lista();

    cmp.aoTrocarCliente(cliente('p2', 'Bruno'));
    atrasada.flush([nota('de-todos', 'AGUARDANDO_APROVACAO', 'p1')], {
      headers: { 'X-Total-Count': '1' },
    });
    responder();

    expect(cmp.notas().map((n) => n.id)).toEqual([]);
  });

  it('voltar para "Toda a carteira" tira o produtorId do pedido', () => {
    const cmp = abrir().componentInstance;
    responder();
    cmp.aoTrocarCliente(cliente('p1', 'Ana Produtora'));
    responder();

    cmp.aoTrocarCliente(null);

    expect(resumo().request.params.has('produtorId')).toBe(false);
    httpMock
      .match((r) => r.url === '/contador/notas/resumo')
      .forEach((r) => r.flush(RESUMO_ZERADO));
    const req = lista();
    expect(req.request.params.has('produtorId')).toBe(false);
    req.flush([]);
  });

  it('busca curta não sai: o servidor recusaria com 400', () => {
    const cmp = abrir().componentInstance;
    responder();

    cmp.busca.set('ab');
    cmp.buscar();
    httpMock.expectNone((r) => r.url.startsWith('/contador/notas'));

    cmp.busca.set('Cooperativa');
    cmp.buscar();
    const pedidos = httpMock.match((r) => r.url.startsWith('/contador/notas'));
    expect(pedidos).toHaveLength(2);
    expect(pedidos.every((r) => r.request.params.get('busca') === 'Cooperativa')).toBe(true);
    pedidos.forEach((r) =>
      r.request.url.endsWith('/resumo') ? r.flush(RESUMO_ZERADO) : r.flush([]),
    );
  });
});
