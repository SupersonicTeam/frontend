import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import {
  ActivatedRoute,
  Router,
  RouterLink,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { By } from '@angular/platform-browser';
import { vi } from 'vitest';
import { ClientePage } from './cliente';
import type { ProdutorCarteira } from '@models/carteira.model';
import type { NotaFiscal } from '@models/nota-fiscal.model';
import type { Pendencia as PendenciaTeste } from '@models/pendencia.model';
import { ClienteEmFocoService } from '@core/services/cliente-em-foco.service';

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

  afterEach(() => {
    // A secao de numeros (#138) tem o proprio spec (`apuracao-cliente.spec.ts`); aqui so drenamos
    // o que ela pede, para o `verify()` continuar severo com o resto da ficha.
    httpMock
      .match(
        (r) =>
          r.url === '/escritorio' ||
          r.url === '/escritorio/membros' ||
          r.url === '/contador/etiquetas' ||
          r.url === '/auditoria' ||
          /^\/contador\/produtores\/[^/]+\/ficha$/.test(r.url) ||
          /^\/contador\/produtores\/[^/]+\/(apuracao|creditos|relatorios\/conformidade)$/.test(
            r.url,
          ),
      )
      .forEach((r) =>
        r.flush(
          ['/escritorio/membros', '/contador/etiquetas', '/auditoria'].includes(r.request.url)
            ? []
            : {},
        ),
      );
    httpMock.verify();
  });

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
    httpMock.expectOne((r) => r.url === '/contador/produtores/p1/notas').flush(opcoes.notas ?? []);
    httpMock.expectOne((r) => r.url === '/contador/produtores/p1/guias').flush(opcoes.guias ?? []);
    httpMock
      .expectOne((r) => r.url === '/contador/produtores/p1/pendencias')
      .flush(opcoes.pendencias ?? []);
  }

  it('abre buscando o cliente e as notas dele pelo produtorId da rota', () => {
    const fixture = abrir();
    responder({});

    expect(fixture.componentInstance.cliente()?.nomeCompleto).toBe('João da Silva Produtor');
  });

  it('abrir a ficha faz deste o cliente em foco: Notas, Fechamento e Prazos abrem nele', () => {
    abrir();
    responder({});

    expect(TestBed.inject(ClienteEmFocoService).produtorId()).toBe('p1');
  });

  it('cliente suspenso não vira o cliente em foco: as outras telas só listam os ativos', () => {
    abrir();
    httpMock
      .expectOne((r) => r.url === '/contador/produtores' && r.params.get('situacao') === 'ATIVO')
      .flush([]);
    httpMock
      .expectOne((r) => r.url === '/contador/produtores' && r.params.get('situacao') === 'SUSPENSO')
      .flush([cliente({ situacaoVinculo: 'SUSPENSO', atencao: null })]);

    expect(TestBed.inject(ClienteEmFocoService).produtorId()).toBeNull();
  });

  it('"Cobrar em Prazos" leva o cliente no endereço', () => {
    const fixture = abrir();
    responder({
      guias: [
        {
          id: 'g1',
          produtorId: 'p1',
          tipoGuia: 'ICMS',
          dataVencimento: '2020-01-10',
          valor: 10,
          status: 'pendente',
        },
      ],
    });
    fixture.detectChanges();

    const link = fixture.debugElement
      .queryAll(By.directive(RouterLink))
      .find((de) => (de.nativeElement as HTMLElement).textContent?.includes('Cobrar em Prazos'));
    expect(link?.injector.get(RouterLink).urlTree?.toString()).toBe('/calendario?cliente=p1');
  });

  /** Os numeros (#138) saem com o produtorId da rota, e o aviso de "rota inexistente" sumiu. */
  it('a secao de apuracao usa o cliente da rota, e o aviso antigo nao existe mais', () => {
    const fixture = abrir();
    responder({});
    fixture.detectChanges();

    httpMock.expectOne((r) => r.url === '/contador/produtores/p1/apuracao').flush({});
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('não existe rota');
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

    httpMock.expectOne((r) => r.url === '/contador/produtores/p1/guias').flush([]);
    httpMock.expectOne((r) => r.url === '/contador/produtores/p1/pendencias').flush([]);
  });

  it('produtor fora da carteira não é erro genérico: a tela diz que ele não é cliente', () => {
    const fixture = abrir();
    httpMock
      .expectOne((r) => r.url === '/contador/produtores' && r.params.get('situacao') === 'ATIVO')
      .flush([cliente({ id: 'outro' })]);
    httpMock
      .expectOne((r) => r.url === '/contador/produtores' && r.params.get('situacao') === 'SUSPENSO')
      .flush([]);

    expect(fixture.componentInstance.naoECliente()).toBe(true);
    expect(fixture.componentInstance.erro()).toBe(false);
  });

  /** Vinculo suspenso: a ficha abre, mas sem trabalho, que daria 404 nas rotas do cliente (#147). */
  it('cliente suspenso abre a ficha sem buscar trabalho e diz que o vinculo esta suspenso', () => {
    const fixture = abrir();
    httpMock
      .expectOne((r) => r.url === '/contador/produtores' && r.params.get('situacao') === 'ATIVO')
      .flush([]);
    httpMock
      .expectOne((r) => r.url === '/contador/produtores' && r.params.get('situacao') === 'SUSPENSO')
      .flush([cliente({ situacaoVinculo: 'SUSPENSO', atencao: null })]);
    fixture.detectChanges();

    httpMock.expectNone((r) => r.url === '/contador/produtores/p1/notas');
    httpMock.expectNone((r) => r.url === '/contador/produtores/p1/apuracao');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Vínculo suspenso');
  });

  it('vinculo encerrado na ficha volta para a carteira; reativado, recarrega o trabalho', () => {
    const navegou = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = abrir();
    responder({});
    const cmp = fixture.componentInstance;

    cmp.aoMudarVinculo({ produtorId: 'p1', situacao: 'SUSPENSO', inicio: 'x', fim: null });
    expect(cmp.cliente()?.situacaoVinculo).toBe('SUSPENSO');

    cmp.aoMudarVinculo({ produtorId: 'p1', situacao: 'ATIVO', inicio: 'x', fim: null });
    responder({});

    cmp.aoMudarVinculo({ produtorId: 'p1', situacao: 'ENCERRADO', inicio: 'x', fim: 'y' });
    expect(navegou).toHaveBeenCalledWith(['/contador']);
  });

  /** A ficha editavel (#149) avisa o que mudou; o cabecalho acompanha sem recarregar. */
  /** Editar o pedido (#150) troca o item, mas nao perde os anexos que ja tinham sido carregados. */
  it('pedido editado substitui o da lista sem perder os anexos carregados', () => {
    const fixture = abrir();
    responder({});
    const cmp = fixture.componentInstance;
    const anexo = { id: 'a1', nomeArquivo: 'nf.pdf', situacao: 'LIMPO' };
    cmp.pendencias.set([
      { id: 'pe1', titulo: 'Antigo', status: 'PENDENTE', quantidadeAnexos: 1, anexos: [anexo] },
    ] as never);

    cmp.aoEditarPedido({ id: 'pe1', titulo: 'Novo', status: 'PENDENTE', anexos: [] } as never);

    expect(cmp.pendencias()[0]!.titulo).toBe('Novo');
    expect(cmp.pendencias()[0]!.anexos).toEqual([anexo]);
    expect(cmp.editandoPedido()).toBeNull();
  });

  it('etiquetas e responsavel mudados na ficha editavel chegam ao cabecalho', () => {
    const fixture = abrir();
    responder({});
    const cmp = fixture.componentInstance;

    cmp.aoMudarFicha({ etiquetas: ['Soja', 'Milho'] });
    cmp.aoMudarFicha({ responsavelId: null, responsavelNome: null });

    expect(cmp.cliente()?.etiquetas).toEqual(['Soja', 'Milho']);
    expect(cmp.cliente()?.responsavelNome).toBeNull();
  });

  it('não vai buscar trabalho de um produtor que não é cliente', () => {
    abrir();
    httpMock
      .expectOne((r) => r.url === '/contador/produtores' && r.params.get('situacao') === 'ATIVO')
      .flush([cliente({ id: 'outro' })]);
    // Nao esta entre os ativos: a ficha procura entre os suspensos (#147) antes de desistir.
    httpMock
      .expectOne((r) => r.url === '/contador/produtores' && r.params.get('situacao') === 'SUSPENSO')
      .flush([]);

    // Nenhuma das três listas é pedida: sem vínculo o backend responderia 404 nas três, e pedir
    // seria gastar requisição para receber erro.
    httpMock.expectNone((r) => r.url === '/contador/produtores/p1/notas');
    httpMock.expectNone((r) => r.url === '/contador/produtores/p1/guias');
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

    httpMock.expectOne((r) => r.url === '/contador/produtores/p1/notas/n9/validacoes').flush([]);
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

  /**
   * O lado do escritorio dos pedidos de documento (backend#180).
   *
   * O ciclo e PENDENTE -> ENVIADA -> CONCLUIDA/CANCELADA, e o servidor recusa o que estiver fora
   * de ordem com **409**. Entao a tela so pode oferecer o que vale para aquele status -- oferecer
   * "Aceitar" num pedido que o produtor nem respondeu e convidar o contador para um erro.
   */
  describe('pedidos de documento', () => {
    const pedido = (over: Partial<PendenciaTeste> = {}): PendenciaTeste => ({
      id: 'pd-1',
      produtorId: 'p1',
      escritorioId: 'e1',
      titulo: 'Extrato bancario de outubro',
      descricao: null,
      observacoes: null,
      dataLimite: '2026-11-10',
      tiposDocumento: ['EXTRATO'],
      status: 'ENVIADA',
      motivo: null,
      quantidadeAnexos: 1,
      anexos: [],
      createdAt: '2026-10-28T10:00:00Z',
      updatedAt: '2026-10-28T10:00:00Z',
      ...over,
    });

    function abrirCom(pendencias: PendenciaTeste[]) {
      const fixture = abrir();
      responder({ pendencias });
      // Quem tem anexo ganha uma busca de detalhe (ver `completarAnexos`); devolvemos o proprio
      // item, que e o caso neutro.
      httpMock
        .match((r) => /\/pendencias\/[^/]+$/.test(r.url))
        .forEach((r) => {
          const id = r.request.url.split('/').pop();
          r.flush(pendencias.find((p) => p.id === id) ?? pendencias[0]);
        });
      return fixture.componentInstance;
    }

    it('pede TODOS os pedidos, nao so os que esperam conferencia', () => {
      abrir();
      httpMock.expectOne((r) => r.url === '/contador/produtores').flush([cliente()]);
      httpMock.expectOne((r) => r.url === '/contador/produtores/p1/notas').flush([]);
      httpMock.expectOne((r) => r.url === '/contador/produtores/p1/guias').flush([]);

      const req = httpMock.expectOne((r) => r.url === '/contador/produtores/p1/pendencias');
      // Filtrar por ENVIADA escondia o que o escritorio pediu e ainda nao voltou -- justamente o
      // que ele precisa ver para saber que ja cobrou.
      expect(req.request.params.has('status')).toBe(false);
      req.flush([]);
    });

    /**
     * A listagem devolve `anexos: []` -- so o `quantidadeAnexos`. Para o produtor isso escondia o
     * aviso do antivirus; para o escritorio e pior: **conferir e abrir o arquivo**, e sem os
     * metadados nao ha o que baixar. O botao simplesmente nao existia.
     */
    it('busca o detalhe de quem tem arquivo, senao nao ha o que conferir', () => {
      // Sem o `abrirCom`: este teste precisa responder o detalhe ele mesmo.
      const fixture = abrir();
      responder({
        pendencias: [
          pedido({ id: 'com', quantidadeAnexos: 1 }),
          pedido({ id: 'sem', quantidadeAnexos: 0 }),
        ],
      });
      const page = fixture.componentInstance;

      httpMock.expectNone((r) => r.url === '/contador/produtores/p1/pendencias/sem');
      httpMock
        .expectOne((r) => r.url === '/contador/produtores/p1/pendencias/com')
        .flush(
          pedido({
            id: 'com',
            quantidadeAnexos: 1,
            anexos: [
              {
                id: 'a1',
                nomeArquivo: 'comprovante.pdf',
                mime: 'application/pdf',
                tamanho: 125,
                sha256: 'abc',
                situacao: 'LIMPO',
                enviadoEm: '2026-10-28T15:56:13Z',
              },
            ],
          }),
        );

      expect(page.pendencias().find((p) => p.id === 'com')!.anexos.length).toBe(1);
    });

    it('so oferece o que o status permite', () => {
      const page = abrirCom([
        pedido({ id: 'a', status: 'PENDENTE' }),
        pedido({ id: 'b', status: 'ENVIADA' }),
        pedido({ id: 'c', status: 'CONCLUIDA' }),
        pedido({ id: 'd', status: 'CANCELADA' }),
      ]);
      const acoes = (id: string) =>
        page.acoesDe(page.pendencias().find((p) => p.id === id)!).map((a) => a.verbo);

      expect(acoes('a')).toEqual(['cancelar']);
      expect(acoes('b')).toEqual(['concluir', 'rejeitar', 'cancelar']);
      expect(acoes('c')).toEqual(['reabrir']);
      expect(acoes('d')).toEqual(['reabrir']);
    });

    it('aceitar nao pede motivo e troca o pedido pelo que o servidor devolveu', () => {
      const page = abrirCom([pedido()]);

      page.executar(page.pendencias()[0]!, 'concluir');

      const req = httpMock.expectOne(
        (r) => r.url === '/contador/produtores/p1/pendencias/pd-1/concluir',
      );
      expect(req.request.body).toBeNull();
      req.flush(pedido({ status: 'CONCLUIDA' }));

      expect(page.pendencias()[0]!.status).toBe('CONCLUIDA');
    });

    it('devolver com motivo curto NAO vai ao servidor: ele recusa abaixo de 5 caracteres', () => {
      const page = abrirCom([pedido()]);

      page.abrirMotivo(page.pendencias()[0]!, 'rejeitar');
      page.motivo.set('ruim');
      page.confirmarMotivo();

      httpMock.expectNone((r) => r.url.includes('/rejeitar'));
      expect(page.motivoAberto()).not.toBeNull();
    });

    it('devolver manda o motivo e devolve o pedido ao produtor', () => {
      const page = abrirCom([pedido()]);

      page.abrirMotivo(page.pendencias()[0]!, 'rejeitar');
      page.motivo.set('A foto do comprovante saiu ilegivel.');
      page.confirmarMotivo();

      const req = httpMock.expectOne(
        (r) => r.url === '/contador/produtores/p1/pendencias/pd-1/rejeitar',
      );
      expect(req.request.body).toEqual({ motivo: 'A foto do comprovante saiu ilegivel.' });
      req.flush(pedido({ status: 'PENDENTE', motivo: 'A foto do comprovante saiu ilegivel.' }));

      expect(page.pendencias()[0]!.status).toBe('PENDENTE');
      expect(page.motivoAberto()).toBeNull();
    });

    it('criar o pedido manda o corpo e ele entra na lista', () => {
      const page = abrirCom([]);

      page.novoTitulo.set('Comprovantes de frete');
      page.alternarTipo('COMPROVANTE_PAGAMENTO');
      page.novoPrazo.set('2026-11-20');
      page.criarPedido();

      const req = httpMock.expectOne((r) => r.url === '/contador/produtores/p1/pendencias');
      expect(req.request.body).toEqual({
        titulo: 'Comprovantes de frete',
        tiposDocumento: ['COMPROVANTE_PAGAMENTO'],
        dataLimite: '2026-11-20',
      });
      req.flush(pedido({ id: 'novo', status: 'PENDENTE' }));

      expect(page.pendencias().length).toBe(1);
    });

    /**
     * "Usar um modelo" (#185, backend#517). O escritório que pede "extrato bancário" a 30 clientes
     * redigia o pedido 30 vezes. O modelo **só preenche**: quem envia é o contador, pelo mesmo
     * `POST .../pendencias` de sempre, e o pedido não guarda referência ao modelo.
     */
    describe('usar um modelo (#185)', () => {
      const modelo = {
        id: 'm1',
        titulo: 'Extrato bancário do mês',
        descricao: 'Extrato de todas as contas',
        tiposDocumento: ['EXTRATO'],
        prazoEmDias: 10,
        observacoes: 'Pode mandar em PDF',
      };

      it('abrir o formulário busca os modelos; fechar não busca nada', () => {
        const page = abrirCom([]);

        page.alternarPedido();
        httpMock.expectOne((r) => r.url === '/contador/modelos-pedido').flush([modelo]);
        expect(page.modelos().length).toBe(1);

        page.alternarPedido();
        httpMock.expectNone((r) => r.url === '/contador/modelos-pedido');
        expect(page.pedindo()).toBe(false);
      });

      /** Modelo é atalho, não requisito: sem a lista, o formulário funciona como sempre. */
      it('se os modelos não carregam, o formulário continua aberto e utilizável', () => {
        const page = abrirCom([]);

        page.alternarPedido();
        httpMock
          .expectOne((r) => r.url === '/contador/modelos-pedido')
          .flush('erro', { status: 500, statusText: 'Server Error' });

        expect(page.pedindo()).toBe(true);
        expect(page.modelos()).toEqual([]);
      });

      it('o modelo preenche os campos, e o pedido sai sem referência a ele', () => {
        const page = abrirCom([]);
        page.alternarPedido();
        httpMock.expectOne((r) => r.url === '/contador/modelos-pedido').flush([modelo]);

        page.usarModelo('m1');

        expect(page.novoTitulo()).toBe('Extrato bancário do mês');
        expect(page.novaDescricao()).toBe('Extrato de todas as contas');
        expect(page.novasObservacoes()).toBe('Pode mandar em PDF');
        expect(page.novosTipos()).toEqual(['EXTRATO']);
        expect(page.novoPrazo()).toMatch(/^\d{4}-\d{2}-\d{2}$/);

        // O contador ajusta antes de enviar.
        page.novoTitulo.set('Extrato bancário de outubro');
        page.criarPedido();

        const req = httpMock.expectOne((r) => r.url === '/contador/produtores/p1/pendencias');
        expect(req.request.body).toEqual({
          titulo: 'Extrato bancário de outubro',
          tiposDocumento: ['EXTRATO'],
          dataLimite: page.novoPrazo(),
          descricao: 'Extrato de todas as contas',
          observacoes: 'Pode mandar em PDF',
        });
        expect('modeloId' in (req.request.body as object)).toBe(false);
        req.flush(pedido({ id: 'novo', status: 'PENDENTE' }));

        // Depois de enviar, as observações também limpam: não vazam para o pedido seguinte.
        expect(page.novasObservacoes()).toBe('');
      });

      it('modelo sem prazo deixa a data vazia', () => {
        const page = abrirCom([]);
        page.alternarPedido();
        httpMock
          .expectOne((r) => r.url === '/contador/modelos-pedido')
          .flush([{ ...modelo, prazoEmDias: null }]);
        page.novoPrazo.set('2026-12-01');

        page.usarModelo('m1');

        expect(page.novoPrazo()).toBe('');
      });
    });

    it('pedido sem titulo ou sem tipo nao sai: o servidor exige os dois', () => {
      const page = abrirCom([]);

      page.novoTitulo.set('Algo');
      page.criarPedido();
      httpMock.expectNone((r) => r.url === '/contador/produtores/p1/pendencias');

      page.novoTitulo.set('');
      page.alternarTipo('EXTRATO');
      page.criarPedido();
      httpMock.expectNone((r) => r.url === '/contador/produtores/p1/pendencias');
    });
  });

  /**
   * A aprovação da nota antes da emissão (backend#178).
   *
   * Medido em 28/10: com escritório vinculado, `gerar-xml` num rascunho responde
   * **409 APROVACAO_EXIGIDA**. Ou seja, enquanto o contador não aprova, a nota do produtor não
   * sai — o que torna este bloco o gargalo do fluxo, não um enfeite.
   */
  describe('aprovação da nota', () => {
    const emRevisao = () =>
      nota({ id: 'nr', status: 'AGUARDANDO_APROVACAO' as NotaFiscal['status'] });

    it('aprovar não pede motivo e troca a nota pela que o servidor devolveu', () => {
      const fixture = abrir();
      responder({ notas: [emRevisao()] });
      const page = fixture.componentInstance;

      page.aprovar(page.notasAguardandoAprovacao()[0]!);

      const req = httpMock.expectOne((r) => r.url === '/contador/produtores/p1/notas/nr/aprovar');
      expect(req.request.body).toBeNull();
      req.flush(nota({ id: 'nr', status: 'APROVADA' as NotaFiscal['status'] }));

      // Saiu da fila de aprovação: ela passou a estar com o produtor para emitir.
      expect(page.notasAguardandoAprovacao().length).toBe(0);
    });

    it('devolver com motivo curto não vai ao servidor', () => {
      const fixture = abrir();
      responder({ notas: [emRevisao()] });
      const page = fixture.componentInstance;

      page.abrirMotivoDaNota(page.notasAguardandoAprovacao()[0]!);
      page.motivo.set('ruim');
      page.confirmarMotivo();

      httpMock.expectNone((r) => r.url.includes('/devolver'));
    });

    it('devolver manda o motivo e a nota volta para o produtor', () => {
      const fixture = abrir();
      responder({ notas: [emRevisao()] });
      const page = fixture.componentInstance;

      page.abrirMotivoDaNota(page.notasAguardandoAprovacao()[0]!);
      page.motivo.set('Falta o CFOP no item 2.');
      page.confirmarMotivo();

      const req = httpMock.expectOne((r) => r.url === '/contador/produtores/p1/notas/nr/devolver');
      expect(req.request.body).toEqual({ motivo: 'Falta o CFOP no item 2.' });
      req.flush(nota({ id: 'nr', status: 'DEVOLVIDA' as NotaFiscal['status'] }));

      expect(page.notasDevolvidas().length).toBe(1);
      expect(page.motivoAberto()).toBeNull();
    });

    it('o motivo de um pedido e o de uma nota não se misturam', () => {
      const fixture = abrir();
      responder({ notas: [emRevisao()] });
      const page = fixture.componentInstance;

      page.abrirMotivoDaNota(page.notasAguardandoAprovacao()[0]!);
      expect(page.motivoAberto()?.alvo).toBe('nota');
    });
  });

  it('o foco da query string escolhe por qual bloco a tela começa', () => {
    rota.snapshot.queryParamMap = convertToParamMap({ foco: 'guias' });
    const fixture = abrir();
    responder({});

    expect(fixture.componentInstance.foco()).toBe('guias');
  });
});
