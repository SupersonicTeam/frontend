import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CarteiraApi } from './carteira.service';
import type { PaginaCarteira, ProdutorCarteira } from '@models/carteira.model';

function cliente(parcial: Partial<ProdutorCarteira> = {}): ProdutorCarteira {
  return {
    vinculoId: 'v1',
    id: 'p1',
    nomeCompleto: 'João da Silva Produtor',
    cpfCnpj: '123.456.789-00',
    tipoProdutor: 'PESSOA_FISICA',
    regime: 'SIMPLES',
    uf: 'MT',
    situacaoVinculo: 'ATIVO',
    inicioVinculo: '2026-10-01T23:04:14Z',
    fimVinculo: null,
    responsavelId: null,
    responsavelNome: null,
    etiquetas: [],
    atencao: {
      notasComInconsistencia: 2,
      notasAguardandoAprovacao: 0,
      guiasVencidas: 2,
      vencimentosProximos7Dias: 1,
      pendenciasEnviadas: 0,
    },
    ...parcial,
  };
}

describe('CarteiraApi', () => {
  let service: CarteiraApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CarteiraApi, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CarteiraApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('listar lê o total do header X-Total-Count, não do tamanho do array', () => {
    let recebido: PaginaCarteira | undefined;
    service.listar().subscribe((r) => (recebido = r));

    const req = httpMock.expectOne((r) => r.url === '/contador/produtores');
    req.flush([cliente()], { headers: { 'X-Total-Count': '37' } });

    expect(recebido?.total).toBe(37);
    expect(recebido?.itens.length).toBe(1);
  });

  it('listar cai para o tamanho do array quando o header não vem', () => {
    let recebido: PaginaCarteira | undefined;
    service.listar().subscribe((r) => (recebido = r));

    httpMock.expectOne((r) => r.url === '/contador/produtores').flush([cliente(), cliente()]);

    expect(recebido?.total).toBe(2);
  });

  it('listar repete o parâmetro etiqueta em vez de juntar com vírgula', () => {
    service.listar({ etiqueta: ['café', 'atrasado'] }).subscribe();

    const req = httpMock.expectOne((r) => r.url === '/contador/produtores');
    expect(req.request.params.getAll('etiqueta')).toEqual(['café', 'atrasado']);
    req.flush([]);
  });

  it('listar omite filtro ausente em vez de mandar string vazia', () => {
    service.listar({ busca: '', uf: undefined, sort: 'urgencia' }).subscribe();

    const req = httpMock.expectOne((r) => r.url === '/contador/produtores');
    expect(req.request.params.has('busca')).toBe(false);
    expect(req.request.params.has('uf')).toBe(false);
    expect(req.request.params.get('sort')).toBe('urgencia');
    req.flush([]);
  });

  it('listar manda precisaAtencao false explicitamente', () => {
    service.listar({ precisaAtencao: false }).subscribe();

    const req = httpMock.expectOne((r) => r.url === '/contador/produtores');
    expect(req.request.params.get('precisaAtencao')).toBe('false');
    req.flush([]);
  });

  it('notasDoCliente usa a rota do escopo do contador, com o produtor no path', () => {
    service.notasDoCliente('p9', { size: 12, sort: 'dataEmissao,desc' }).subscribe();

    const req = httpMock.expectOne((r) => r.url === '/contador/produtores/p9/notas');
    expect(req.request.params.get('size')).toBe('12');
    expect(req.request.params.get('sort')).toBe('dataEmissao,desc');
    req.flush([]);
  });

  it('notasDoCliente repete o filtro status, que o backend aceita mais de uma vez', () => {
    service.notasDoCliente('p9', { status: ['COM_INCONSISTENCIAS', 'AGUARDANDO_APROVACAO'] }).subscribe();

    const req = httpMock.expectOne((r) => r.url === '/contador/produtores/p9/notas');
    expect(req.request.params.getAll('status')).toEqual([
      'COM_INCONSISTENCIAS',
      'AGUARDANDO_APROVACAO',
    ]);
    req.flush([]);
  });

  it('validacoesDaNota busca no escopo do cliente, não em /notas', () => {
    service.validacoesDaNota('p9', 'n1').subscribe();

    httpMock.expectOne((r) => r.url === '/contador/produtores/p9/notas/n1/validacoes').flush([]);
  });

  it('pendenciasDoCliente usa a rota nova por produtor (a antiga respondia 404)', () => {
    service.pendenciasDoCliente('p9').subscribe();

    httpMock.expectOne((r) => r.url === '/contador/produtores/p9/pendencias').flush([]);
  });

  it('guiasDoCliente usa produtorId na query: esta rota é anterior ao padrão do path', () => {
    service.guiasDoCliente('p9').subscribe();

    const req = httpMock.expectOne((r) => r.url === '/contador/guias');
    expect(req.request.params.get('produtorId')).toBe('p9');
    req.flush([]);
  });

  it('guiasDoCliente traduz o status e deriva o atraso, para não discordar da triagem', () => {
    let recebido: { status: string }[] | undefined;
    service.guiasDoCliente('p9').subscribe((r) => (recebido = r));

    httpMock.expectOne((r) => r.url === '/contador/guias').flush([
      // O backend devolve MAIÚSCULO e não deriva o atraso: esta venceu e vem como PENDENTE.
      { id: 'g1', status: 'PENDENTE', dataVencimento: '2020-01-10' },
      { id: 'g2', status: 'PAGA', dataVencimento: '2020-01-10' },
      { id: 'g3', status: 'PENDENTE', dataVencimento: '2099-12-31' },
    ]);

    expect(recebido?.map((g) => g.status)).toEqual(['vencido', 'pago', 'pendente']);
  });

  it('guiasDoCliente deixa o erro subir, em vez de devolver lista vazia', () => {
    let falhou = false;
    service.guiasDoCliente('p9').subscribe({ error: () => (falhou = true) });

    httpMock
      .expectOne((r) => r.url === '/contador/guias')
      .flush({ errors: [] }, { status: 404, statusText: 'Not Found' });

    expect(falhou).toBe(true);
  });

  it('obterCliente acha o cliente na carteira pelo id do produtor', () => {
    let recebido: ProdutorCarteira | null | undefined;
    service.obterCliente('p2').subscribe((r) => (recebido = r));

    httpMock
      .expectOne((r) => r.url === '/contador/produtores')
      .flush([cliente({ id: 'p1' }), cliente({ id: 'p2', nomeCompleto: 'Maria Agricultora' })]);

    expect(recebido?.nomeCompleto).toBe('Maria Agricultora');
  });

  it('obterCliente devolve null quando o produtor não está na carteira', () => {
    let recebido: ProdutorCarteira | null | undefined = undefined;
    service.obterCliente('fora').subscribe((r) => (recebido = r));

    httpMock.expectOne((r) => r.url === '/contador/produtores').flush([cliente({ id: 'p1' })]);

    expect(recebido).toBeNull();
  });

  it('obterCliente pede a carteira inteira: um cliente na segunda página não pode virar null', () => {
    service.obterCliente('p2').subscribe();

    const req = httpMock.expectOne((r) => r.url === '/contador/produtores');
    expect(req.request.params.get('size')).toBe('200');
    req.flush([]);
  });
});
