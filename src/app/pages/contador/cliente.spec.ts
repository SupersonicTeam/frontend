import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { ClientePage } from './cliente';
import type { ProdutorCarteira } from '@models/carteira.model';
import type { NotaFiscal } from '@models/nota-fiscal.model';

/**
 * A tela de um cliente da carteira: `/contador/{produtorId}`.
 *
 * É o atendimento — a triagem é a lista. Aqui só entra o que o escritório **alcança** de um
 * cliente: notas (leitura), validações, guias e pedidos de documento. Apuração e conformidade não
 * têm rota por cliente (SupersonicTeam/backend#255), e a tela diz isso em vez de mostrar os
 * números de outra pessoa.
 */
describe('ClientePage', () => {
  let httpMock: HttpTestingController;

  const rota = {
    snapshot: {
      paramMap: convertToParamMap({ produtorId: 'p1' }),
      queryParamMap: convertToParamMap({}),
    },
  };

  const cliente = (over: Partial<ProdutorCarteira> = {}): ProdutorCarteira => ({
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
      notasComInconsistencia: 1,
      notasAguardandoAprovacao: 1,
      guiasVencidas: 1,
      vencimentosProximos7Dias: 0,
      pendenciasEnviadas: 1,
    },
    ...over,
  });

  const nota = (over: Partial<NotaFiscal> = {}) =>
    ({
      id: 'n1',
      numero: 7,
      serie: 1,
      status: 'COM_INCONSISTENCIAS',
      dataEmissao: '2026-06-20T03:00:00Z',
      destinatarioNome: 'Cooperativa XYZ',
      valorTotalNota: 85000,
      itens: [],
      ...over,
    }) as NotaFiscal;

  beforeEach(async () => {
    rota.snapshot.paramMap = convertToParamMap({ produtorId: 'p1' });
    rota.snapshot.queryParamMap = convertToParamMap({});
    await TestBed.configureTestingModule({
      imports: [ClientePage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: rota },
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function abrir() {
    const fixture = TestBed.createComponent(ClientePage);
    fixture.detectChanges();
    return fixture;
  }

  /** As quatro fontes que a tela abre, todas com o produtor da rota. */
  function responder(opcoes: {
    carteira?: ProdutorCarteira[];
    notas?: NotaFiscal[];
    guias?: unknown[];
    pendencias?: unknown[];
  }) {
    httpMock
      .expectOne((r) => r.url === '/contador/produtores')
      .flush(opcoes.carteira ?? [cliente()]);
    httpMock
      .expectOne((r) => r.url === '/contador/produtores/p1/notas')
      .flush(opcoes.notas ?? []);
    httpMock.expectOne((r) => r.url === '/contador/guias').flush(opcoes.guias ?? []);
    httpMock
      .expectOne((r) => r.url === '/contador/produtores/p1/pendencias')
      .flush(opcoes.pendencias ?? []);
  }

  it('abre buscando o cliente e as notas dele pelo produtorId da rota', () => {
    const fixture = abrir();
    responder({});

    expect(fixture.componentInstance.cliente()?.nomeCompleto).toBe('João da Silva Produtor');
  });

  it('pede as notas que são trabalho do escritório, num pedido só com os três status', () => {
    abrir();

    httpMock.expectOne((r) => r.url === '/contador/produtores').flush([cliente()]);
    const req = httpMock.expectOne((r) => r.url === '/contador/produtores/p1/notas');
    expect(req.request.params.getAll('status')).toEqual([
      'COM_INCONSISTENCIAS',
      'AGUARDANDO_APROVACAO',
      'DEVOLVIDA',
    ]);
    req.flush([]);

    httpMock.expectOne((r) => r.url === '/contador/guias').flush([]);
    httpMock.expectOne((r) => r.url === '/contador/produtores/p1/pendencias').flush([]);
  });

  it('pede só os documentos que esperam o escritório (status ENVIADA)', () => {
    abrir();

    httpMock.expectOne((r) => r.url === '/contador/produtores').flush([cliente()]);
    httpMock.expectOne((r) => r.url === '/contador/produtores/p1/notas').flush([]);
    httpMock.expectOne((r) => r.url === '/contador/guias').flush([]);
    const req = httpMock.expectOne((r) => r.url === '/contador/produtores/p1/pendencias');
    expect(req.request.params.getAll('status')).toEqual(['ENVIADA']);
    req.flush([]);
  });

  it('produtor fora da carteira não é erro genérico: a tela diz que ele não é cliente', () => {
    const fixture = abrir();
    httpMock.expectOne((r) => r.url === '/contador/produtores').flush([cliente({ id: 'outro' })]);

    expect(fixture.componentInstance.naoECliente()).toBe(true);
    expect(fixture.componentInstance.erro()).toBe(false);
  });

  it('não vai buscar trabalho de um produtor que não é cliente', () => {
    abrir();
    httpMock.expectOne((r) => r.url === '/contador/produtores').flush([cliente({ id: 'outro' })]);

    // Nenhuma das três listas é pedida: sem vínculo o backend responderia 404 nas três, e pedir
    // seria gastar requisição para receber erro.
    httpMock.expectNone((r) => r.url === '/contador/produtores/p1/notas');
    httpMock.expectNone((r) => r.url === '/contador/guias');
    httpMock.expectNone((r) => r.url === '/contador/produtores/p1/pendencias');
  });

  it('separa as notas por tipo de trabalho, porque a ação de cada uma é diferente', () => {
    const fixture = abrir();
    responder({
      notas: [
        nota({ id: 'a', status: 'COM_INCONSISTENCIAS' }),
        nota({ id: 'b', status: 'AGUARDANDO_APROVACAO' as NotaFiscal['status'] }),
        nota({ id: 'c', status: 'DEVOLVIDA' as NotaFiscal['status'] }),
      ],
    });

    const page = fixture.componentInstance;
    expect(page.notasComInconsistencia().map((n) => n.id)).toEqual(['a']);
    expect(page.notasAguardandoAprovacao().map((n) => n.id)).toEqual(['b']);
    expect(page.notasDevolvidas().map((n) => n.id)).toEqual(['c']);
  });

  it('guia paga sai da lista de cobrança; vencida de outro mês fica', () => {
    const fixture = abrir();
    responder({
      guias: [
        { id: 'g1', status: 'PAGA', dataVencimento: '2020-09-20', valor: 100 },
        { id: 'g2', status: 'PENDENTE', dataVencimento: '2020-01-10', valor: 200 },
        { id: 'g3', status: 'PENDENTE', dataVencimento: '2099-12-31', valor: 300 },
      ],
    });

    const page = fixture.componentInstance;
    expect(page.guiasACobrar().map((g) => g.id)).toEqual(['g2', 'g3']);
    // A vencida vem primeiro: é a que está rendendo multa.
    expect(page.guiasACobrar()[0]?.status).toBe('vencido');
  });

  it('expandir a nota busca as validações no escopo do cliente, não em /notas', () => {
    const fixture = abrir();
    responder({ notas: [nota({ id: 'n9' })] });

    fixture.componentInstance.alternarNota('n9');

    httpMock
      .expectOne((r) => r.url === '/contador/produtores/p1/notas/n9/validacoes')
      .flush([]);
  });

  it('fechar a nota expandida não dispara requisição nova', () => {
    const fixture = abrir();
    responder({ notas: [nota({ id: 'n9' })] });

    fixture.componentInstance.alternarNota('n9');
    httpMock.expectOne((r) => r.url === '/contador/produtores/p1/notas/n9/validacoes').flush([]);

    fixture.componentInstance.alternarNota('n9');
    expect(fixture.componentInstance.notaExpandida()).toBeNull();
    httpMock.expectNone((r) => r.url.includes('validacoes'));
  });

  it('o foco da query string escolhe por qual bloco a tela começa', () => {
    rota.snapshot.queryParamMap = convertToParamMap({ foco: 'guias' });
    const fixture = abrir();
    responder({});

    expect(fixture.componentInstance.foco()).toBe('guias');
  });
});
