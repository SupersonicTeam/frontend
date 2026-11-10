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
    service
      .notasDoCliente('p9', { status: ['COM_INCONSISTENCIAS', 'AGUARDANDO_APROVACAO'] })
      .subscribe();

    const req = httpMock.expectOne((r) => r.url === '/contador/produtores/p9/notas');
    expect(req.request.params.getAll('status')).toEqual([
      'COM_INCONSISTENCIAS',
      'AGUARDANDO_APROVACAO',
    ]);
    req.flush([]);
  });

  describe('aprovacao da nota (#178)', () => {
    it('aprovar nao manda corpo', () => {
      service.aprovarNota('p9', 'n1').subscribe();

      const req = httpMock.expectOne((r) => r.url === '/contador/produtores/p9/notas/n1/aprovar');
      expect(req.request.body).toBeNull();
      req.flush({});
    });

    it('devolver leva o motivo, que e o que o produtor le para corrigir', () => {
      service.devolverNota('p9', 'n1', 'Falta o CFOP no item 2.').subscribe();

      const req = httpMock.expectOne((r) => r.url === '/contador/produtores/p9/notas/n1/devolver');
      expect(req.request.body).toEqual({ motivo: 'Falta o CFOP no item 2.' });
      req.flush({});
    });

    it('o preview da DANFE sai em blob, para conferir antes de aprovar', () => {
      service.previewDanfe('p9', 'n1').subscribe();

      const req = httpMock.expectOne(
        (r) => r.url === '/contador/produtores/p9/notas/n1/danfe-preview',
      );
      expect(req.request.responseType).toBe('blob');
      req.flush(new Blob());
    });
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

    httpMock
      .expectOne((r) => r.url === '/contador/guias')
      .flush([
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

  /**
   * O lado do escritorio dos pedidos de documento (backend#180).
   *
   * O ciclo e PENDENTE -> ENVIADA -> CONCLUIDA/CANCELADA, e **o servidor recusa o que estiver fora
   * de ordem** com 409 TRANSICAO_PENDENCIA_INVALIDA (medido: concluir uma PENDENTE devolve
   * "esta PENDENTE e nao permite esta acao"). Por isso quem decide o que oferecer e a tela; aqui
   * so garantimos que cada verbo bate na rota certa, com o corpo certo.
   */
  describe('pedidos de documento', () => {
    it('criar manda o pedido na rota do cliente', () => {
      service
        .criarPendencia('p9', {
          titulo: 'Extrato de outubro',
          tiposDocumento: ['EXTRATO'],
          dataLimite: '2026-11-10',
        })
        .subscribe();

      const req = httpMock.expectOne((r) => r.url === '/contador/produtores/p9/pendencias');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        titulo: 'Extrato de outubro',
        tiposDocumento: ['EXTRATO'],
        dataLimite: '2026-11-10',
      });
      req.flush({});
    });

    it('concluir nao manda corpo: aceitar o que veio nao precisa de justificativa', () => {
      service.concluirPendencia('p9', 'pd1').subscribe();

      const req = httpMock.expectOne(
        (r) => r.url === '/contador/produtores/p9/pendencias/pd1/concluir',
      );
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toBeNull();
      req.flush({});
    });

    it('rejeitar leva o motivo, que e o que o produtor vai ler para refazer', () => {
      service.rejeitarPendencia('p9', 'pd1', 'A foto do comprovante saiu ilegivel.').subscribe();

      const req = httpMock.expectOne(
        (r) => r.url === '/contador/produtores/p9/pendencias/pd1/rejeitar',
      );
      expect(req.request.body).toEqual({ motivo: 'A foto do comprovante saiu ilegivel.' });
      req.flush({});
    });

    it('cancelar tambem leva motivo', () => {
      service.cancelarPendencia('p9', 'pd1', 'Pedido duplicado.').subscribe();

      httpMock
        .expectOne((r) => r.url === '/contador/produtores/p9/pendencias/pd1/cancelar')
        .flush({});
    });

    it('reabrir volta um pedido concluido ou cancelado', () => {
      service.reabrirPendencia('p9', 'pd1').subscribe();

      httpMock
        .expectOne((r) => r.url === '/contador/produtores/p9/pendencias/pd1/reabrir')
        .flush({});
    });

    it('baixar o anexo pede blob e a resposta inteira, pelo nome no Content-Disposition', () => {
      service.baixarAnexoDoCliente('p9', 'pd1', 'a1').subscribe();

      const req = httpMock.expectOne(
        (r) => r.url === '/contador/produtores/p9/pendencias/pd1/anexos/a1',
      );
      expect(req.request.responseType).toBe('blob');
      req.flush(new Blob());
    });
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

    httpMock
      .expectOne((r) => r.url === '/contador/produtores' && r.params.get('situacao') === 'ATIVO')
      .flush([cliente({ id: 'p1' })]);
    httpMock
      .expectOne((r) => r.url === '/contador/produtores' && r.params.get('situacao') === 'SUSPENSO')
      .flush([]);

    expect(recebido).toBeNull();
  });

  /** A ficha abre para o vinculo suspenso: e nela que o administrador reativa ou encerra (#147). */
  it('obterCliente acha o cliente suspenso quando ele nao esta entre os ativos', () => {
    let recebido: ProdutorCarteira | null | undefined;
    service.obterCliente('p3').subscribe((r) => (recebido = r));

    httpMock
      .expectOne((r) => r.url === '/contador/produtores' && r.params.get('situacao') === 'ATIVO')
      .flush([cliente({ id: 'p1' })]);
    httpMock
      .expectOne((r) => r.url === '/contador/produtores' && r.params.get('situacao') === 'SUSPENSO')
      .flush([cliente({ id: 'p3', situacaoVinculo: 'SUSPENSO', atencao: null })]);

    expect(recebido?.situacaoVinculo).toBe('SUSPENSO');
  });

  it('convidar manda o e-mail aparado e nao espera corpo', () => {
    service.convidar('  ana@fazenda.com ').subscribe();
    const req = httpMock.expectOne('/contador/convites');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'ana@fazenda.com' });
    req.flush(null, { status: 202, statusText: 'Accepted' });
  });

  it('o ciclo do vinculo vai na rota do cliente, sem corpo', () => {
    for (const acao of ['suspender', 'reativar', 'encerrar'] as const) {
      service.mudarVinculo('p1', acao).subscribe();
      const req = httpMock.expectOne(`/contador/produtores/p1/${acao}`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toBeNull();
      req.flush({ produtorId: 'p1', situacao: 'ATIVO', inicio: 'x', fim: null });
    }
  });

  it('obterCliente pede a carteira inteira: um cliente na segunda página não pode virar null', () => {
    service.obterCliente('p2').subscribe();

    const ativos = httpMock.expectOne((r) => r.params.get('situacao') === 'ATIVO');
    expect(ativos.request.params.get('size')).toBe('200');
    ativos.flush([]);
    const suspensos = httpMock.expectOne((r) => r.params.get('situacao') === 'SUSPENSO');
    expect(suspensos.request.params.get('size')).toBe('200');
    suspensos.flush([]);
  });

  /**
   * A reabertura da apuracao mudou de dono (issue #117).
   *
   * Era `POST /apuracao/{id}/reabrir`, do produtor -- e o botao vivia **desabilitado nos dois
   * lados** porque o `ApuracaoResponse` nunca expos o `id` que essa rota pedia. A rota nova nao
   * pede id: pede produtor e periodo. A antiga esta deprecated e responde 403 a todos.
   */
  describe('reabrir a apuracao de um cliente (#117)', () => {
    it('vai na rota do contador, com produtor e periodo no caminho e sem corpo', () => {
      service.reabrirApuracao('p-1', '2026-09').subscribe();

      const req = httpMock.expectOne('/contador/produtores/p-1/apuracao/2026-09/reabrir');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toBeNull();
      req.flush({ periodo: '2026-09', status: 'ABERTO' });
    });

    it('nao usa mais a rota antiga, que responde 403 a todos', () => {
      service.reabrirApuracao('p-1', '2026-09').subscribe();

      httpMock.expectNone((r) => r.url.startsWith('/apuracao/'));
      httpMock.expectOne('/contador/produtores/p-1/apuracao/2026-09/reabrir').flush({});
    });

    it('o erro sobe com o codigo, para a tela dizer o motivo certo', () => {
      let erro: { status: number } | undefined;
      service.reabrirApuracao('p-1', '2025-01').subscribe({ error: (e) => (erro = e) });

      httpMock
        .expectOne('/contador/produtores/p-1/apuracao/2025-01/reabrir')
        .flush(
          { errors: [{ code: 'REABERTURA_FORA_PRAZO', message: 'Mais de 3 meses.' }] },
          { status: 422, statusText: 'Unprocessable Entity' },
        );

      expect(erro?.status).toBe(422);
    });
  });

  /**
   * Os números de um cliente pelas rotas do escritório (issue #136, backend#255).
   *
   * As do produtor (`/apuracao`, `/relatorios/conformidade`, `/creditos`, `/dashboard`, `/notas`)
   * derivam o produtor do token e respondem 403 ao contador. Cada uma tem aqui a versão com o
   * cliente no caminho; o response é o mesmo.
   */
  describe('rotas por cliente (#136)', () => {
    it('apuracao de um mes vai em /contador/produtores/{id}/apuracao?periodo=', () => {
      service.apuracaoDoCliente('p1', '2026-10').subscribe();
      const req = httpMock.expectOne((r) => r.url === '/contador/produtores/p1/apuracao');
      expect(req.request.params.get('periodo')).toBe('2026-10');
      req.flush({});
    });

    it('a faixa de meses vai com de e ate, sem periodo', () => {
      service.apuracaoFaixaDoCliente('p1', '2026-05', '2026-10').subscribe();
      const req = httpMock.expectOne((r) => r.url === '/contador/produtores/p1/apuracao');
      expect(req.request.params.get('de')).toBe('2026-05');
      expect(req.request.params.get('ate')).toBe('2026-10');
      expect(req.request.params.has('periodo')).toBe(false);
      req.flush([]);
    });

    it('relatorio de conformidade em JSON e em PDF, com o periodo', () => {
      service.relatorioConformidadeDoCliente('p1', '2026-10').subscribe();
      const json = httpMock.expectOne(
        (r) => r.url === '/contador/produtores/p1/relatorios/conformidade',
      );
      expect(json.request.params.get('periodo')).toBe('2026-10');
      json.flush({});

      service.relatorioConformidadePdfDoCliente('p1', '2026-10').subscribe();
      const pdf = httpMock.expectOne(
        (r) => r.url === '/contador/produtores/p1/relatorios/conformidade/pdf',
      );
      expect(pdf.request.responseType).toBe('blob');
      expect(pdf.request.params.get('periodo')).toBe('2026-10');
      pdf.flush(new Blob(['%PDF']));
    });

    it('creditos levam o periodo; dashboard so leva quando ha um', () => {
      service.creditosDoCliente('p1', '2026-10').subscribe();
      const creditos = httpMock.expectOne((r) => r.url === '/contador/produtores/p1/creditos');
      expect(creditos.request.params.get('periodo')).toBe('2026-10');
      creditos.flush({});

      service.dashboardDoCliente('p1').subscribe();
      const semPeriodo = httpMock.expectOne((r) => r.url === '/contador/produtores/p1/dashboard');
      expect(semPeriodo.request.params.has('periodo')).toBe(false);
      semPeriodo.flush({});

      service.dashboardDoCliente('p1', '2026-09').subscribe();
      const comPeriodo = httpMock.expectOne((r) => r.url === '/contador/produtores/p1/dashboard');
      expect(comPeriodo.request.params.get('periodo')).toBe('2026-09');
      comPeriodo.flush({});
    });

    it('as notas da carteira repetem o status, levam os filtros e leem o X-Total-Count', () => {
      let total = -1;
      service
        .notasDaCarteira({
          status: ['COM_INCONSISTENCIAS', 'REJEITADA'],
          busca: 'soja',
          page: 0,
          size: 20,
          sort: 'dataEmissao,desc',
        })
        .subscribe((p) => (total = p.total));

      const req = httpMock.expectOne((r) => r.url === '/contador/notas');
      expect(req.request.params.getAll('status')).toEqual(['COM_INCONSISTENCIAS', 'REJEITADA']);
      expect(req.request.params.get('busca')).toBe('soja');
      expect(req.request.params.get('size')).toBe('20');
      // Sem cliente: a carteira inteira, nenhum produtorId vazio no endereco.
      expect(req.request.params.has('produtorId')).toBe(false);
      req.flush([{ id: 'n1', produtorId: 'p1' }], { headers: { 'X-Total-Count': '12' } });

      expect(total).toBe(12);
    });

    it('um cliente so: a mesma rota, com produtorId', () => {
      service.notasDaCarteira({ produtorId: 'p1' }).subscribe();
      const req = httpMock.expectOne((r) => r.url === '/contador/notas');
      expect(req.request.params.get('produtorId')).toBe('p1');
      req.flush([]);
    });

    it('o resumo conta as caixas numa consulta so, sem status', () => {
      let todas = -1;
      service
        .resumoDasNotas({ busca: 'soja', produtorId: 'p1' })
        .subscribe((r) => (todas = r.todas));

      const req = httpMock.expectOne((r) => r.url === '/contador/notas/resumo');
      expect(req.request.params.get('busca')).toBe('soja');
      expect(req.request.params.get('produtorId')).toBe('p1');
      expect(req.request.params.has('status')).toBe(false);
      req.flush({
        revisao: 1,
        travadas: 2,
        rascunhos: 0,
        devolvidas: 1,
        autorizadas: 40,
        canceladas: 1,
        todas: 47,
      });

      expect(todas).toBe(47);
    });

    it('uma nota do cliente pelo id', () => {
      service.notaDoCliente('p1', 'n9').subscribe();
      httpMock.expectOne('/contador/produtores/p1/notas/n9').flush({ id: 'n9' });
    });
  });
});
