import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ContadorPage } from './contador';
import type { ProdutorCarteira } from '@models/carteira.model';

/**
 * A tela de Acompanhamento **depois da carteira** (backend#177, frontend#95).
 *
 * O spec anterior cobria "o que impede fechar" e "os números do mês" de um produtor só — o que a
 * tela mostrava porque era o único produtor que existia. Com a carteira ela passa a responder
 * outra pergunta ("quais dos meus clientes estão com problema") e esses blocos saíram: os números
 * são de um cliente, e o lugar deles é o Fechamento.
 */
describe('ContadorPage — triagem da carteira', () => {
  let httpMock: HttpTestingController;

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
      notasComInconsistencia: 2,
      notasAguardandoAprovacao: 0,
      guiasVencidas: 2,
      vencimentosProximos7Dias: 1,
      pendenciasEnviadas: 0,
    },
    ...over,
  });

  const semAtencao = (over: Partial<ProdutorCarteira> = {}) =>
    cliente({
      atencao: {
        notasComInconsistencia: 0,
        notasAguardandoAprovacao: 0,
        guiasVencidas: 0,
        vencimentosProximos7Dias: 0,
        pendenciasEnviadas: 0,
      },
      ...over,
    });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ContadorPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // O cartao de convites (#147) tem o proprio spec; aqui so drenamos o que ele pede.
    httpMock
      .match((r) => r.url === '/escritorio' || r.url === '/contador/convites')
      .forEach((r) => r.flush(r.request.url === '/escritorio' ? { minhaFuncao: 'CONTADOR' } : []));
    httpMock.verify();
  });

  function abrir() {
    const fixture = TestBed.createComponent(ContadorPage);
    fixture.detectChanges();
    return fixture;
  }

  /** A única requisição que a tela faz ao abrir. */
  function requisicaoDaCarteira() {
    return httpMock.expectOne((r) => r.url === '/contador/produtores');
  }

  it('abre pedindo a carteira ordenada por urgência: a ordem é a fila de trabalho', () => {
    abrir();

    const req = requisicaoDaCarteira();
    expect(req.request.params.get('sort')).toBe('urgencia');
    req.flush([]);
  });

  it('NÃO afirma que a carteira está em dia enquanto ela não chegou', () => {
    const fixture = abrir();
    const page = fixture.componentInstance;

    expect(page.aindaNaoSabe()).toBe(true);
    expect(page.carteiraEmDia()).toBe(false);

    requisicaoDaCarteira().flush([]);
    expect(page.aindaNaoSabe()).toBe(false);
  });

  it('conta quantos clientes pedem atenção, não quantos existem', () => {
    const fixture = abrir();
    requisicaoDaCarteira().flush([cliente({ id: 'p1' }), semAtencao({ id: 'p2' })]);

    expect(fixture.componentInstance.clientes().length).toBe(2);
    expect(fixture.componentInstance.quantosPedemAtencao()).toBe(1);
  });

  it('cliente com todos os indicadores em zero conta como em dia', () => {
    const fixture = abrir();
    requisicaoDaCarteira().flush([semAtencao()]);

    const [c] = fixture.componentInstance.clientes();
    expect(fixture.componentInstance.estaEmDia(c!)).toBe(true);
  });

  it('vínculo não ativo NÃO é lido como em dia: sem atencao a tela não sabe nada do cliente', () => {
    const fixture = abrir();
    requisicaoDaCarteira().flush([cliente({ situacaoVinculo: 'SUSPENSO', atencao: null })]);

    const [c] = fixture.componentInstance.clientes();
    expect(fixture.componentInstance.estaEmDia(c!)).toBe(false);
    expect(fixture.componentInstance.quantosPedemAtencao()).toBe(0);
  });

  it('mostra só os indicadores acima de zero, na ordem de trabalho (dinheiro antes de papel)', () => {
    const fixture = abrir();
    requisicaoDaCarteira().flush([cliente()]);

    const [c] = fixture.componentInstance.clientes();
    const sinais = fixture.componentInstance.sinaisDe(c!);

    // Guia vencida primeiro: já está rendendo multa e juros. Depois a nota travada, que impede
    // emitir. O que vence em 7 dias vem por último dos três — ainda dá tempo.
    expect(sinais.map((s) => s.chave)).toEqual([
      'guiasVencidas',
      'notasComInconsistencia',
      'vencimentosProximos7Dias',
    ]);
    expect(sinais.every((s) => s.quantidade > 0)).toBe(true);
  });

  it('o rótulo do indicador pluraliza no substantivo, não com um "s" no fim', () => {
    const fixture = abrir();
    requisicaoDaCarteira().flush([
      cliente({
        atencao: {
          notasComInconsistencia: 2,
          notasAguardandoAprovacao: 0,
          guiasVencidas: 1,
          vencimentosProximos7Dias: 0,
          pendenciasEnviadas: 0,
        },
      }),
    ]);

    const [c] = fixture.componentInstance.clientes();
    const rotulos = fixture.componentInstance.sinaisDe(c!).map((s) => s.rotulo);

    expect(rotulos).toEqual(['guia vencida', 'notas com inconsistência']);
  });

  it('busca de menos de três caracteres não vai ao servidor', async () => {
    vi.useFakeTimers();
    try {
      const fixture = abrir();
      requisicaoDaCarteira().flush([cliente()]);

      fixture.componentInstance.busca.set('jo');
      fixture.detectChanges();
      await vi.advanceTimersByTimeAsync(400);

      httpMock.expectNone((r) => r.url === '/contador/produtores');
    } finally {
      vi.useRealTimers();
    }
  });

  it('busca de três caracteres espera o debounce e manda uma requisição só', async () => {
    vi.useFakeTimers();
    try {
      const fixture = abrir();
      requisicaoDaCarteira().flush([cliente()]);

      fixture.componentInstance.busca.set('mar');
      fixture.detectChanges();
      fixture.componentInstance.busca.set('mari');
      fixture.detectChanges();
      fixture.componentInstance.busca.set('maria');
      fixture.detectChanges();
      await vi.advanceTimersByTimeAsync(299);
      httpMock.expectNone((r) => r.url === '/contador/produtores');

      await vi.advanceTimersByTimeAsync(2);
      const req = requisicaoDaCarteira();
      expect(req.request.params.get('busca')).toBe('maria');
      req.flush([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('o filtro "só quem precisa de atenção" vai como parâmetro do servidor', async () => {
    vi.useFakeTimers();
    try {
      const fixture = abrir();
      requisicaoDaCarteira().flush([cliente()]);

      fixture.componentInstance.somenteAtencao.set(true);
      fixture.detectChanges();
      await vi.advanceTimersByTimeAsync(400);

      const req = requisicaoDaCarteira();
      expect(req.request.params.get('precisaAtencao')).toBe('true');
      req.flush([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('guarda o erro quando a carteira falha, em vez de mostrar carteira vazia', () => {
    const fixture = abrir();
    requisicaoDaCarteira().flush(
      { errors: [{ code: 'PAPEL_NAO_AUTORIZADO' }] },
      { status: 403, statusText: 'Forbidden' },
    );

    expect(fixture.componentInstance.erro()).toBe(true);
    expect(fixture.componentInstance.clientes().length).toBe(0);
  });
});
