import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { NotasContador } from './notas-contador';
import type { ProdutorCarteira } from '@models/carteira.model';

const cliente = (id: string, nomeCompleto: string) =>
  ({ id, nomeCompleto, vinculoId: `v-${id}`, situacaoVinculo: 'ATIVO' }) as ProdutorCarteira;

const nota = (id: string, status: string, numero = 1) => ({
  id,
  numero,
  serie: 1,
  status,
  dataEmissao: '2026-10-10T03:00:00Z',
  destinatarioNome: 'Cooperativa',
  valorTotalNota: 1000,
  itens: [],
});

/**
 * `/documentos` para o contador (issue #136).
 *
 * A tela antiga chamava `/api/notas`, `/api/vinculos` e `/api/pendencias`, que respondem 403 ao
 * escritório. O que estes testes guardam: só rota do escritório, sempre com o cliente no caminho,
 * nenhuma chamada sem cliente escolhido, e as caixas da triagem como filtro de status.
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

  /** Abre a tela com uma carteira de dois clientes — nenhum escolhido de saída. */
  function abrir() {
    const fixture = TestBed.createComponent(NotasContador);
    fixture.detectChanges();
    httpMock
      .expectOne((r) => r.url === '/contador/produtores')
      .flush([cliente('p1', 'Ana Produtora'), cliente('p2', 'Bruno')]);
    fixture.detectChanges();
    return fixture;
  }

  const daLista = (r: TestRequest) => r.request.params.get('size') === '20';
  const contagens = () =>
    httpMock.match(
      (r) => r.url === '/contador/produtores/p1/notas' && r.params.get('size') === '1',
    );

  it('sem cliente escolhido nao pede nota nenhuma e orienta a escolher', () => {
    const fixture = abrir();

    httpMock.expectNone((r) => r.url.includes('/notas'));
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Escolha um cliente para ver as notas',
    );
  });

  it('com cliente, so rotas do escritorio: nada de /notas, /vinculos ou /pendencias', () => {
    const fixture = abrir();
    fixture.componentInstance.aoTrocarCliente(cliente('p1', 'Ana Produtora'));

    const todas = httpMock.match(() => true);
    expect(todas.length).toBeGreaterThan(0);
    for (const req of todas) {
      expect(req.request.url.startsWith('/contador/produtores/p1/')).toBe(true);
    }
    todas.forEach((r) => r.flush([]));
  });

  it('abre em "Precisam de revisao": a lista pede AGUARDANDO_APROVACAO ao servidor', () => {
    const fixture = abrir();
    fixture.componentInstance.aoTrocarCliente(cliente('p1', 'Ana Produtora'));
    contagens().forEach((r) => r.flush([]));

    const lista = httpMock.match((r) => r.url === '/contador/produtores/p1/notas');
    expect(lista.length).toBe(1);
    expect(daLista(lista[0]!)).toBe(true);
    expect(lista[0]!.request.params.getAll('status')).toEqual(['AGUARDANDO_APROVACAO']);
    expect(lista[0]!.request.params.get('sort')).toBe('dataEmissao,desc');
    lista[0]!.flush([nota('n1', 'AGUARDANDO_APROVACAO')], {
      headers: { 'X-Total-Count': '1' },
    });

    expect(fixture.componentInstance.notas().map((n) => n.id)).toEqual(['n1']);
  });

  it('cada caixa conta pelo X-Total-Count, e "Travadas" junta inconsistencia e rejeicao', () => {
    const fixture = abrir();
    const cmp = fixture.componentInstance;
    cmp.aoTrocarCliente(cliente('p1', 'Ana Produtora'));

    const pedidos = contagens();
    expect(pedidos.length).toBe(cmp.caixas.length);
    const travadas = pedidos.find(
      (r) => r.request.params.getAll('status')?.join() === 'COM_INCONSISTENCIAS,REJEITADA',
    );
    expect(travadas).toBeTruthy();
    for (const r of pedidos) {
      r.flush([], { headers: { 'X-Total-Count': r === travadas ? '4' : '0' } });
    }
    httpMock.match((r) => r.url === '/contador/produtores/p1/notas').forEach((r) => r.flush([]));

    expect(cmp.contagens()['travadas']).toBe(4);
    expect(cmp.contagens()['revisao']).toBe(0);
  });

  it('trocar de caixa troca o filtro de status, sem recontar as caixas', () => {
    const fixture = abrir();
    const cmp = fixture.componentInstance;
    cmp.aoTrocarCliente(cliente('p1', 'Ana Produtora'));
    contagens().forEach((r) => r.flush([]));
    httpMock.match((r) => r.url === '/contador/produtores/p1/notas').forEach((r) => r.flush([]));

    cmp.trocarCaixa('travadas');

    const req = httpMock.expectOne((r) => r.url === '/contador/produtores/p1/notas');
    expect(req.request.params.getAll('status')).toEqual(['COM_INCONSISTENCIAS', 'REJEITADA']);
    req.flush([]);
  });

  it('aprovar vai na rota do escritorio e troca a nota pela que voltou', () => {
    const fixture = abrir();
    const cmp = fixture.componentInstance;
    cmp.aoTrocarCliente(cliente('p1', 'Ana Produtora'));
    contagens().forEach((r) => r.flush([]));
    httpMock
      .expectOne((r) => r.url === '/contador/produtores/p1/notas')
      .flush([nota('n1', 'AGUARDANDO_APROVACAO')], { headers: { 'X-Total-Count': '1' } });

    cmp.aprovar(cmp.notas()[0]!);
    const req = httpMock.expectOne('/contador/produtores/p1/notas/n1/aprovar');
    expect(req.request.method).toBe('POST');
    req.flush(nota('n1', 'APROVADA'));
    contagens().forEach((r) => r.flush([]));

    expect(cmp.notas()[0]!.status).toBe('APROVADA');
  });

  it('devolver exige motivo de 5 a 500 e o manda no corpo', () => {
    const fixture = abrir();
    const cmp = fixture.componentInstance;
    cmp.aoTrocarCliente(cliente('p1', 'Ana Produtora'));
    contagens().forEach((r) => r.flush([]));
    httpMock
      .expectOne((r) => r.url === '/contador/produtores/p1/notas')
      .flush([nota('n1', 'AGUARDANDO_APROVACAO')], { headers: { 'X-Total-Count': '1' } });

    cmp.abrirDevolucao(cmp.notas()[0]!);
    cmp.motivo.set('cfop');
    cmp.confirmarDevolucao();
    httpMock.expectNone((r) => r.url.endsWith('/devolver'));

    cmp.motivo.set('Falta o CFOP no item 2.');
    cmp.confirmarDevolucao();
    const req = httpMock.expectOne('/contador/produtores/p1/notas/n1/devolver');
    expect(req.request.body).toEqual({ motivo: 'Falta o CFOP no item 2.' });
    req.flush(nota('n1', 'DEVOLVIDA'));
    contagens().forEach((r) => r.flush([]));

    expect(cmp.devolvendo()).toBeNull();
  });

  it('resposta de um cliente antigo nao entra na tela do novo', () => {
    const fixture = abrir();
    const cmp = fixture.componentInstance;
    cmp.aoTrocarCliente(cliente('p1', 'Ana Produtora'));
    contagens().forEach((r) => r.flush([]));
    const atrasada = httpMock.expectOne((r) => r.url === '/contador/produtores/p1/notas');

    cmp.aoTrocarCliente(cliente('p2', 'Bruno'));
    atrasada.flush([nota('de-p1', 'AGUARDANDO_APROVACAO')], { headers: { 'X-Total-Count': '1' } });
    httpMock.match((r) => r.url === '/contador/produtores/p2/notas').forEach((r) => r.flush([]));

    expect(cmp.notas().map((n) => n.id)).toEqual([]);
  });

  it('busca curta nao sai: o servidor recusaria com 400', () => {
    const fixture = abrir();
    const cmp = fixture.componentInstance;
    cmp.aoTrocarCliente(cliente('p1', 'Ana Produtora'));
    contagens().forEach((r) => r.flush([]));
    httpMock.match((r) => r.url === '/contador/produtores/p1/notas').forEach((r) => r.flush([]));

    cmp.busca.set('ab');
    cmp.buscar();
    httpMock.expectNone((r) => r.url.includes('/notas'));

    cmp.busca.set('Cooperativa');
    cmp.buscar();
    const pedidos = httpMock.match((r) => r.url === '/contador/produtores/p1/notas');
    expect(pedidos.every((r) => r.request.params.get('busca') === 'Cooperativa')).toBe(true);
    pedidos.forEach((r) => r.flush([]));
  });
});
