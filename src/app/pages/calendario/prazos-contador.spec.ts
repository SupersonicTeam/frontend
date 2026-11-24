import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { PrazosContador } from './prazos-contador';
import { ClienteEmFocoService } from '@core/services/cliente-em-foco.service';
import type { GuiaFiscal } from '@models/solicitacao-contador.model';
import type { ProdutorCarteira } from '@models/carteira.model';

/**
 * Prazos na visão do contador: a fila de cobrança.
 *
 * Os testes de lançar guia vieram da tela de Acompanhamento, junto com a própria funcionalidade —
 * as guias eram mostradas inteiras nas duas telas. O de **dar baixa** virou o contrário: uma
 * guarda de que esta tela não oferece a baixa (#198). Ver `PrazosProdutor`.
 */
/** As guias de um cliente da carteira: `/contador/produtores/{id}/guias` (#198). */
const ehGuiasDoCliente = (url: string) => /^\/contador\/produtores\/[^/]+\/guias$/.test(url);

describe('PrazosContador', () => {
  let httpMock: HttpTestingController;

  /** `AAAA-MM-DD` de `n` dias a partir de hoje (negativo para trás). */
  function emDias(n: number) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${mes}-${String(d.getDate()).padStart(2, '0')}`;
  }

  const guia = (over: Partial<GuiaFiscal> = {}): GuiaFiscal => ({
    id: 'g1',
    produtorId: 'p1',
    tipoGuia: 'ICMS',
    dataVencimento: emDias(30),
    valor: 1250.5,
    status: 'pendente',
    createdAt: '2026-09-01T10:00:00Z',
    ...over,
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PrazosContador],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    // Com dois clientes, o seletor so escolhe sozinho o que o contador ja esta atendendo (#136).
    TestBed.inject(ClienteEmFocoService).escolher('p-joao');
  });

  afterEach(() => httpMock.verify());

  /**
   * A carteira do escritorio (#106). A tela era cravada no produtor semente -- em duas chamadas,
   * a que lista e a que **lanca**. Dois clientes aqui de proposito: e o que faz o seletor existir
   * e prova que a guia nasce no escolhido, nao no primeiro.
   */
  const CLIENTES = [
    {
      vinculoId: 'v1',
      id: 'p-joao',
      nomeCompleto: 'João da Silva Produtor',
      situacaoVinculo: 'ATIVO',
      etiquetas: [],
    },
    {
      vinculoId: 'v2',
      id: 'p-maria',
      nomeCompleto: 'Maria Agricultora',
      situacaoVinculo: 'ATIVO',
      etiquetas: [],
    },
  ];

  const MARIA = CLIENTES[1] as unknown as ProdutorCarteira;

  /** Responde a carteira que o `<app-seletor-cliente>` busca antes das guias. */
  function flushCarteira(clientes: unknown[] = CLIENTES) {
    httpMock.expectOne((r) => r.url === '/contador/produtores').flush(clientes);
  }

  function montar(guias: GuiaFiscal[] = []) {
    const fixture = TestBed.createComponent(PrazosContador);
    fixture.detectChanges();
    flushCarteira();
    httpMock.expectOne((r) => ehGuiasDoCliente(r.url)).flush(guias);
    fixture.detectChanges();
    return fixture;
  }

  it('a fila de cobrança é o que venceu mais o que vence em sete dias, nessa ordem', () => {
    const cmp = montar([
      guia({ id: 'longe', dataVencimento: emDias(40) }),
      guia({ id: 'semana', dataVencimento: emDias(3), valor: 100 }),
      guia({ id: 'atrasada', dataVencimento: emDias(-20), valor: 890 }),
      guia({ id: 'paga', dataVencimento: emDias(-5), status: 'pago', valor: 9999 }),
    ]).componentInstance;

    expect(cmp.atrasadas().map((g) => g.id)).toEqual(['atrasada']);
    expect(cmp.vencendo().map((g) => g.id)).toEqual(['semana']);
    expect(cmp.aCobrar().map((g) => g.id)).toEqual(['atrasada', 'semana']);
    expect(cmp.totalACobrar()).toBe(990);
    // A paga não entra em nada disso, mesmo com data no passado.
    expect(cmp.totalEmAberto()).toBe(990 + 1250.5);
  });

  it('data no passado e sem pagamento é atraso, mesmo com o status ainda em pendente', () => {
    // Quem vira a guia para `vencido` é um job diário; entre a meia-noite e a rodada do job ela
    // ainda chega como `pendente`.
    const cmp = montar([
      guia({ id: 'a', dataVencimento: emDias(-1), status: 'pendente' }),
    ]).componentInstance;

    expect(cmp.atrasadas().map((g) => g.id)).toEqual(['a']);
    expect(cmp.rotuloPrazo(cmp.atrasadas()[0])).toBe('venceu ontem');
    expect(cmp.classeRotulo(cmp.atrasadas()[0])).toContain('perigo');
  });

  it('sem nada vencido nem vencendo, diz que não há o que cobrar', () => {
    const fixture = montar([guia({ dataVencimento: emDias(40) })]);
    expect(fixture.componentInstance.aCobrar()).toEqual([]);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Nada para cobrar agora');
  });

  it('o filtro de situação recorta a tabela sem refazer requisição', () => {
    const fixture = montar([
      guia({ id: 'aberta', dataVencimento: emDias(40) }),
      guia({ id: 'atrasada', dataVencimento: emDias(-2) }),
      guia({ id: 'paga', status: 'pago' }),
    ]);
    const cmp = fixture.componentInstance;

    expect(cmp.guiasFiltradas().map((g) => g.id)).toEqual(['atrasada', 'paga', 'aberta']);

    cmp.situacao.set('cobrar');
    expect(cmp.guiasFiltradas().map((g) => g.id)).toEqual(['atrasada']);

    cmp.situacao.set('pago');
    expect(cmp.guiasFiltradas().map((g) => g.id)).toEqual(['paga']);

    cmp.situacao.set('pendente');
    expect(cmp.guiasFiltradas().map((g) => g.id)).toEqual(['atrasada', 'aberta']);
  });

  it('o formulário de guia só habilita com vencimento e valor positivo', () => {
    const cmp = montar().componentInstance;

    cmp.abrirNovaGuia();
    expect(cmp.formValido()).toBe(false);

    cmp.formVencimento.set('2026-11-20');
    expect(cmp.formValido()).toBe(false);

    cmp.formValor.set('0');
    expect(cmp.formValido()).toBe(false);

    cmp.formValor.set('1200.90');
    expect(cmp.formValido()).toBe(true);
  });

  it('lançar guia manda o POST e recarrega a lista', () => {
    const cmp = montar().componentInstance;
    cmp.abrirNovaGuia();
    cmp.formVencimento.set('2026-11-20');
    cmp.formValor.set('500');
    cmp.salvarGuia();

    const req = httpMock.expectOne((r) => ehGuiasDoCliente(r.url) && r.method === 'POST');
    expect(req.request.body).toMatchObject({ tipoGuia: 'ICMS', valor: 500 });
    req.flush(guia({ id: 'nova' }));

    expect(cmp.showNovaGuia()).toBe(false);
    httpMock.expectOne((r) => ehGuiasDoCliente(r.url) && r.method === 'GET').flush([]);
  });

  it('não oferece a baixa: ela é do produtor e aqui respondia 403 (#198)', () => {
    // O botão "Dar baixa" vivia nesta tela, em dois lugares, chamando a rota do PRODUTOR
    // (`PATCH /api/guias/{id}/pagar`). O contador leva 403 `PAPEL_NAO_AUTORIZADO` nela: era a
    // única baixa do sistema e não funcionava para ninguém, enquanto o produtor não tinha botão.
    // O teste é a guarda de que ele não volta para cá.
    const f = montar([guia({ id: 'g9', status: 'pendente', dataVencimento: emDias(-5) })]);
    const texto = ((f.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');

    expect(texto).not.toContain('Dar baixa');
    expect(texto).toContain('Quem dá baixa é o produtor');
    expect(httpMock.match((r) => r.url.includes('/pagar')).length).toBe(0);

    // E a tela não tem mais por onde pedir a baixa, nem por fora do template.
    expect((f.componentInstance as unknown as Record<string, unknown>)['marcarPaga']).toBe(
      undefined,
    );
  });

  it('guia paga diz quando foi paga (`dataPagamento`, #116)', () => {
    const f = montar([
      guia({ id: 'g1', status: 'pago', dataPagamento: '2026-11-03T12:00:00-03:00' }),
      guia({ id: 'g2', status: 'pendente', dataPagamento: null }),
    ]);
    const texto = ((f.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');
    expect(texto).toContain('em 03/11/2026');
    // Só a paga ganha a linha; a pendente não inventa data.
    expect(texto.match(/em \d{2}\/\d{2}\/\d{4}/g)).toHaveLength(1);
  });

  it('traduz o status da guia para linguagem de quem lê, não a do banco', () => {
    const cmp = montar().componentInstance;
    expect(cmp.rotuloStatus('pendente')).toBe('Em aberto');
    expect(cmp.rotuloStatus('vencido')).toBe('Vencida');
    expect(cmp.rotuloStatus('pago')).toBe('Paga');
  });

  /**
   * O produtor certo (issue #106).
   *
   * A tela era cravada em `LOGGED_PRODUCER_ID`, em **duas** chamadas: a que lista e a que lanca.
   * Medido contra a API local em 29/10, a carteira semeada tem dois clientes -- o escritorio nunca
   * via as guias do segundo, e qualquer guia que lancasse ia para o primeiro, mesmo achando que
   * atendia o outro. Escrita no cliente errado e bem pior do que leitura errada.
   */
  describe('as guias sao do cliente escolhido (#106)', () => {
    it('abre no cliente que o contador está atendendo e pergunta as guias DELE', () => {
      const fixture = TestBed.createComponent(PrazosContador);
      fixture.detectChanges();
      flushCarteira();

      const req = httpMock.expectOne((r) => ehGuiasDoCliente(r.url));
      expect(req.request.url).toBe('/contador/produtores/p-joao/guias');
      req.flush([]);
      expect(fixture.componentInstance.clienteAtual()?.nomeCompleto).toBe('João da Silva Produtor');
    });

    /**
     * Roteiro da demo (06/11): "Cobrar em Prazos" na ficha do Carlos abria o PRIMEIRO cliente da
     * carteira, que nao tinha nada vencido. O endereco manda mais que o cliente em foco.
     */
    it('o ?cliente= do endereço manda: é o que o "Cobrar em Prazos" da ficha envia', async () => {
      await TestBed.inject(Router).navigateByUrl('/?cliente=p-maria');
      const fixture = TestBed.createComponent(PrazosContador);
      fixture.detectChanges();
      flushCarteira();

      const req = httpMock.expectOne((r) => ehGuiasDoCliente(r.url));
      expect(req.request.url).toBe('/contador/produtores/p-maria/guias');
      req.flush([]);
    });

    it('com dois clientes e nenhum em foco, pede a escolha em vez de abrir o primeiro', () => {
      TestBed.inject(ClienteEmFocoService).limpar();
      const fixture = TestBed.createComponent(PrazosContador);
      fixture.detectChanges();
      flushCarteira();
      fixture.detectChanges();

      httpMock.expectNone((r) => ehGuiasDoCliente(r.url));
      expect(fixture.componentInstance.cliente()).toBeNull();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain(
        'Escolha um cliente para ver as guias',
      );
      expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Lançar guia');
    });

    it('trocar de cliente refaz a busca para o outro', () => {
      const cmp = montar().componentInstance;

      cmp.aoTrocarCliente(MARIA);

      const req = httpMock.expectOne((r) => ehGuiasDoCliente(r.url));
      expect(req.request.url).toBe('/contador/produtores/p-maria/guias');
      req.flush([]);
      expect(cmp.clienteAtual()?.nomeCompleto).toBe('Maria Agricultora');
    });

    it('a guia lancada nasce no cliente ESCOLHIDO, nao no primeiro', () => {
      const cmp = montar().componentInstance;
      cmp.aoTrocarCliente(MARIA);
      httpMock.expectOne((r) => ehGuiasDoCliente(r.url)).flush([]);

      cmp.formTipo.set('ICMS');
      cmp.formVencimento.set('2026-12-10');
      cmp.formValor.set('1200');
      cmp.salvarGuia();

      const post = httpMock.expectOne((r) => ehGuiasDoCliente(r.url) && r.method === 'POST');
      expect(post.request.url).toBe('/contador/produtores/p-maria/guias');
      // O produtor vai no caminho; o corpo nao o leva mais (#198).
      expect(post.request.body.produtorId).toBeUndefined();
      post.flush({});
      httpMock.expectOne((r) => ehGuiasDoCliente(r.url) && r.method === 'GET').flush([]);
    });

    it('carteira vazia nao inventa produtor: nao pergunta guia de ninguem', () => {
      const fixture = TestBed.createComponent(PrazosContador);
      fixture.detectChanges();
      flushCarteira([]);

      httpMock.expectNone((r) => ehGuiasDoCliente(r.url));
      expect(fixture.componentInstance.guias()).toEqual([]);
    });
  });

  it('em erro ao listar, mostra lista vazia — nunca dados de exemplo', () => {
    const fixture = TestBed.createComponent(PrazosContador);
    fixture.detectChanges();
    flushCarteira();
    httpMock
      .expectOne((r) => ehGuiasDoCliente(r.url))
      .flush('erro', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(fixture.componentInstance.guias()).toEqual([]);
  });

  /**
   * Erro nao e lista vazia (issue #107).
   *
   * A pagina tinha `error: () => this.guias.set([])`: a falha da API virava a mesma tela de
   * "Nenhuma guia lancada". Com o produtor errado da #106 (404), o escritorio via "nenhuma guia"
   * enquanto havia oito no banco, uma de ICMS de R$ 3.420 vencida.
   */
  describe('erro separado do vazio (#107)', () => {
    function abrir() {
      const fixture = TestBed.createComponent(PrazosContador);
      fixture.detectChanges();
      flushCarteira();
      return fixture.componentInstance;
    }

    it('404 vira estado de erro, nao lista vazia', () => {
      const cmp = abrir();

      httpMock
        .expectOne((r) => ehGuiasDoCliente(r.url))
        .flush(
          { errors: [{ code: 'NAO_ENCONTRADO', message: 'Produtor nao encontrado.' }] },
          { status: 404, statusText: 'Not Found' },
        );

      expect(cmp.erro()?.mensagem).toBe('Produtor nao encontrado.');
      expect(cmp.carregando()).toBe(false);
    });

    it('no 404 nao oferece "tentar de novo": repetir nao faz o produtor existir', () => {
      const cmp = abrir();

      httpMock
        .expectOne((r) => ehGuiasDoCliente(r.url))
        .flush({ errors: [] }, { status: 404, statusText: 'Not Found' });

      expect(cmp.erro()?.podeTentarDeNovo).toBe(false);
    });

    it('no 500 oferece tentar de novo', () => {
      const cmp = abrir();

      httpMock
        .expectOne((r) => ehGuiasDoCliente(r.url))
        .flush('falhou', { status: 500, statusText: 'Server Error' });

      expect(cmp.erro()?.podeTentarDeNovo).toBe(true);
    });

    it('sucesso limpa o erro anterior', () => {
      const cmp = abrir();
      httpMock
        .expectOne((r) => ehGuiasDoCliente(r.url))
        .flush('falhou', { status: 500, statusText: 'Server Error' });
      expect(cmp.erro()).not.toBeNull();

      cmp.carregar();
      httpMock.expectOne((r) => ehGuiasDoCliente(r.url)).flush([]);

      expect(cmp.erro()).toBeNull();
      expect(cmp.guias()).toEqual([]);
    });
  });

  /**
   * O botão "Lançar guia" apagava sem dizer por quê (#115): valor vazio e valor negativo
   * desabilitavam igual, e a pessoa ficava procurando o erro na tela.
   */
  describe('o campo de valor explica por que o botão está apagado', () => {
    it('em branco não acusa nada: avisar antes de digitar é ranzinza', () => {
      const cmp = montar().componentInstance;
      expect(cmp.formValor()).toBe('');
      expect(cmp.erroDoValor()).toBe('');
    });

    it('zero e negativo dizem que precisa ser maior que zero', () => {
      const cmp = montar().componentInstance;

      cmp.formValor.set('0');
      expect(cmp.erroDoValor()).toContain('maior que zero');

      cmp.formValor.set('-5');
      expect(cmp.erroDoValor()).toContain('maior que zero');
    });

    it('texto que não é número pede número', () => {
      const cmp = montar().componentInstance;
      cmp.formValor.set('mil reais');

      expect(cmp.erroDoValor()).toContain('números');
    });

    it('valor válido não acusa', () => {
      const cmp = montar().componentInstance;
      cmp.formValor.set('1840.55');

      expect(cmp.erroDoValor()).toBe('');
    });
  });

  /**
   * A cobrança do cliente selecionado (#94).
   *
   * O id vai no **caminho** porque é de outra pessoa — o cliente da carteira —, e é essa a
   * diferença para o lado do produtor, onde o id some e vem do token.
   */
  describe('cobrar o cliente no WhatsApp', () => {
    it('usa a rota do escritório, com o id do cliente selecionado', () => {
      const cmp = montar().componentInstance;
      cmp.clienteId.set('p-9');

      cmp.cobrarCliente();
      expect(cmp.cobrando()).toBe(true);

      const req = httpMock.expectOne('/contador/produtores/p-9/notificacao/proximas-obrigacoes');
      expect(req.request.method).toBe('POST');
      req.flush({ enviados: 2, urgentes: 1, notificacaoId: 'n1' });

      expect(cmp.cobrando()).toBe(false);
    });

    it('sem cliente escolhido não dispara nada', () => {
      const cmp = montar().componentInstance;
      cmp.clienteId.set(null);

      cmp.cobrarCliente();

      httpMock.expectNone((r) => r.url.includes('/notificacao'));
    });

    /** Clique repetido enquanto a primeira cobrança está em voo não manda duas. */
    it('não dispara duas vezes enquanto a primeira não volta', () => {
      const cmp = montar().componentInstance;
      cmp.clienteId.set('p-9');

      cmp.cobrarCliente();
      cmp.cobrarCliente();

      const reqs = httpMock.match((r) => r.url.includes('/notificacao'));
      expect(reqs).toHaveLength(1);
      reqs[0]!.flush({ enviados: 1, urgentes: 0, notificacaoId: 'n1' });
    });

    /** `enviados: 0` é sucesso: não havia o que cobrar. O botão volta ao normal. */
    it('zero a cobrar não é erro', () => {
      const cmp = montar().componentInstance;
      cmp.clienteId.set('p-9');

      cmp.cobrarCliente();
      httpMock
        .expectOne((r) => r.url.includes('/notificacao'))
        .flush({ enviados: 0, urgentes: 0, notificacaoId: 'n1' });

      expect(cmp.cobrando()).toBe(false);
    });

    /** Cliente sem WhatsApp **não** é "nada a cobrar" — e quem cadastra o número é o cliente. */
    it('CONTATO_AUSENTE devolve o botão e não trava a tela', () => {
      const cmp = montar().componentInstance;
      cmp.clienteId.set('p-9');

      cmp.cobrarCliente();
      httpMock
        .expectOne((r) => r.url.includes('/notificacao'))
        .flush(
          { errors: [{ code: 'CONTATO_AUSENTE', message: 'Sem WhatsApp.' }] },
          { status: 422, statusText: 'Unprocessable Entity' },
        );

      expect(cmp.cobrando()).toBe(false);
    });
  });
});
