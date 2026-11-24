import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { CeresEvento, CeresResposta } from '@dtos/assistente/ceres.response';
import { CeresApi, CeresError, extrairEventosSse } from './ceres.service';

/**
 * O valor destes testes está na **classificação do erro**: a tela decide o que
 * dizer pelo `errors[0].code`, e confundir "modelo fora do ar" com "servidor fora
 * do ar" (ou tratar `ASSISTENTE_OCUPADO` como falha definitiva, jogando fora o
 * `Retry-After`) faz o produtor desistir de uma pergunta que ia funcionar.
 */
describe('CeresApi — modo síncrono', () => {
  let api: CeresApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(CeresApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  /** Envia a pergunta e devolve o erro classificado (ou lança se vier resposta). */
  function erroDe(
    status: number,
    code: string | undefined,
    extras: { headers?: Record<string, string>; message?: string } = {},
  ): Promise<CeresError> {
    const capturado = new Promise<CeresError>((resolve, reject) => {
      api.perguntar('pergunta').subscribe({
        next: () => reject(new Error('deveria ter falhado')),
        error: (e: CeresError) => resolve(e),
      });
    });

    httpMock
      .expectOne((r) => r.url === '/assistente/chat')
      .flush(
        {
          status,
          message: extras.message ?? 'falhou',
          errors: code ? [{ code, message: extras.message ?? 'falhou' }] : [],
        },
        { status, statusText: 'erro', headers: extras.headers },
      );

    return capturado;
  }

  it('manda apenas a pergunta para /assistente/chat', async () => {
    const resposta = new Promise((resolve) => api.perguntar('Quanto eu pago?').subscribe(resolve));

    const req = httpMock.expectOne((r) => r.url === '/assistente/chat');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ pergunta: 'Quanto eu pago?' });
    req.flush({
      resposta: 'R$ 1.809,50.',
      rota: 'DADOS',
      citacoes: [],
      fontesDados: [],
      modoFallback: false,
    });

    await expect(resposta).resolves.toMatchObject({ rota: 'DADOS' });
  });

  it('lê o Retry-After do 503 ASSISTENTE_OCUPADO', async () => {
    const erro = await erroDe(503, 'ASSISTENTE_OCUPADO', { headers: { 'Retry-After': '5' } });
    expect(erro.codigo).toBe('ASSISTENTE_OCUPADO');
    expect(erro.retryAfterSegundos).toBe(5);
  });

  it('503 sem Retry-After não inventa espera', async () => {
    const erro = await erroDe(503, 'ASSISTENTE_INDISPONIVEL');
    expect(erro.codigo).toBe('ASSISTENTE_INDISPONIVEL');
    expect(erro.retryAfterSegundos).toBeUndefined();
  });

  it('403 do contador vem com o código do papel', async () => {
    expect((await erroDe(403, 'PAPEL_NAO_AUTORIZADO')).codigo).toBe('PAPEL_NAO_AUTORIZADO');
  });

  it('404 é backend sem a Ceres, não falha desconhecida', async () => {
    // Instância anterior à Sprint 6 do backend: o endpoint não existe.
    expect((await erroDe(404, undefined)).codigo).toBe('ASSISTENTE_INDISPONIVEL');
  });

  it('código que não está no contrato não é tratado como indisponibilidade', async () => {
    const erro = await erroDe(500, 'ALGO_NOVO', { message: 'Falha nova do servidor' });
    expect(erro.codigo).toBe('DESCONHECIDO');
    expect(erro.message).toBe('Falha nova do servidor');
  });

  /**
   * O corpo da continuidade (#183). Os dois campos são **omitidos** quando não há o que
   * mandar: para o backend dá na mesma, e na aba Network a diferença entre "mandei a
   * conversa" e "não mandei" é a única pista de que a tela está certa.
   */
  describe('corpo com o histórico da conversa (#183)', () => {
    const turno = { pergunta: 'p1', resposta: 'r1', assinatura: 'v1.aaa' };

    function corpoDe(contexto?: {
      historico: (typeof turno)[];
      ultimaRespostaSemTurno: boolean;
    }): Record<string, unknown> {
      api.perguntar('tem certeza?', contexto).subscribe({ error: () => undefined });
      const req = httpMock.expectOne((r) => r.url === '/assistente/chat');
      const corpo = req.request.body as Record<string, unknown>;
      req.flush({ resposta: 'ok', rota: 'DADOS', citacoes: [], fontesDados: [] });
      return corpo;
    }

    it('sem contexto, manda só a pergunta', () => {
      expect(corpoDe()).toEqual({ pergunta: 'tem certeza?' });
    });

    it('histórico vazio não vira campo vazio no corpo', () => {
      expect(corpoDe({ historico: [], ultimaRespostaSemTurno: false })).toEqual({
        pergunta: 'tem certeza?',
      });
    });

    it('com histórico, manda os turnos como vieram', () => {
      expect(corpoDe({ historico: [turno], ultimaRespostaSemTurno: false })).toEqual({
        pergunta: 'tem certeza?',
        historico: [turno],
      });
    });

    it('ultimaRespostaSemTurno só aparece quando é verdadeiro', () => {
      expect(corpoDe({ historico: [turno], ultimaRespostaSemTurno: true })).toEqual({
        pergunta: 'tem certeza?',
        historico: [turno],
        ultimaRespostaSemTurno: true,
      });
    });
  });

  /**
   * O `normalizar` existe para o template nunca receber `null` onde espera lista. O
   * `turno`, porém, **não é normalizado**: ele passa inteiro, porque a assinatura vale
   * para os bytes exatos (#183).
   */
  it('preserva turno e perguntaInterpretada, e usa null quando não vêm', async () => {
    const turno = { pergunta: 'p', resposta: 'r\n\n  com espaços  ', assinatura: 'v1.zzz' };
    const comTurno = new Promise((resolve) => api.perguntar('oi').subscribe(resolve));
    httpMock
      .expectOne((r) => r.url === '/assistente/chat')
      .flush({
        resposta: 'ok',
        rota: 'DADOS',
        citacoes: [],
        fontesDados: [],
        modoFallback: false,
        turno,
        perguntaInterpretada: 'Tenho algum crédito?',
      });
    await expect(comTurno).resolves.toMatchObject({
      turno,
      perguntaInterpretada: 'Tenho algum crédito?',
    });

    const semTurno = new Promise((resolve) => api.perguntar('oi').subscribe(resolve));
    httpMock
      .expectOne((r) => r.url === '/assistente/chat')
      .flush({ resposta: 'ok', rota: 'DADOS', citacoes: [], fontesDados: [] });
    await expect(semTurno).resolves.toMatchObject({ turno: null, perguntaInterpretada: null });
  });

  /** #187: o backend manda o campo **ausente** quando não há explicação; `null` vale o mesmo. */
  it('explicacao: texto quando vem, null quando ausente ou null', async () => {
    const corpo = { resposta: 'ok', rota: 'DADOS', citacoes: [], fontesDados: [] };
    const casos: [Record<string, unknown>, string | null][] = [
      [{ ...corpo, explicacao: 'É o IBS menos os créditos.' }, 'É o IBS menos os créditos.'],
      [corpo, null],
      [{ ...corpo, explicacao: null }, null],
    ];
    for (const [bruto, esperado] of casos) {
      const recebida = new Promise((resolve) => api.perguntar('oi').subscribe(resolve));
      httpMock.expectOne((r) => r.url === '/assistente/chat').flush(bruto);
      await expect(recebida).resolves.toMatchObject({ explicacao: esperado });
    }
  });

  it('servidor inalcançável é SEM_CONEXAO, não assistente fora do ar', async () => {
    const capturado = new Promise<CeresError>((resolve) =>
      api.perguntar('pergunta').subscribe({ error: resolve }),
    );
    httpMock
      .expectOne((r) => r.url === '/assistente/chat')
      .error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });

    expect((await capturado).codigo).toBe('SEM_CONEXAO');
  });
});

/**
 * O `perguntarEmStream` de ponta a ponta, com o corpo do SSE vindo de um `fetch` falso.
 * O foco é a explicação depois do número (#187, backend#268/#538).
 */
describe('CeresApi — streaming', () => {
  let api: CeresApi;

  const RESPOSTA =
    '{"resposta":"R$ 1.809,50.","rota":"DADOS","citacoes":[],"fontesDados":[],"modoFallback":false}';

  /** Responde ao `fetch` com estes pedaços de SSE, um por chunk. */
  function servirSse(...pedacos: string[]) {
    const corpo = new ReadableStream<Uint8Array>({
      start(controle) {
        const codificador = new TextEncoder();
        for (const p of pedacos) controle.enqueue(codificador.encode(p));
        controle.close();
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(corpo, { status: 200 })),
    );
  }

  async function eventosDe(): Promise<CeresEvento[]> {
    const eventos: CeresEvento[] = [];
    await api.perguntarEmStream('Quanto eu pago?', (e) => eventos.push(e));
    return eventos;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(CeresApi);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('com explicação: rota, resposta, explicacao e fim, nessa ordem', async () => {
    servirSse(
      'event:rota\ndata:{"rota":"DADOS"}\n\n',
      `event:resposta\ndata:${RESPOSTA}\n\n`,
      // Cortada no meio pela fronteira do chunk, como chega de verdade.
      'event:explicacao\ndata:{"explicacao":"É o IBS',
      ' menos os créditos."}\n\nevent:fim\ndata:{}\n\n',
    );

    const eventos = await eventosDe();

    expect(eventos.map((e) => e.evento)).toEqual(['rota', 'resposta', 'explicacao', 'fim']);
    expect(eventos[2]).toEqual({
      evento: 'explicacao',
      dado: { explicacao: 'É o IBS menos os créditos.' },
    });
    // A explicação nunca vem dentro da resposta.
    expect((eventos[1]?.dado as CeresResposta).explicacao).toBeNull();
  });

  it('sem explicação: o fim chega logo depois da resposta e não é erro', async () => {
    servirSse(`event:resposta\ndata:${RESPOSTA}\n\nevent:fim\ndata:{}\n\n`);

    const eventos = await eventosDe();

    expect(eventos.map((e) => e.evento)).toEqual(['resposta', 'fim']);
  });

  it('explicação sem texto é o mesmo que não ter vindo', async () => {
    servirSse(
      `event:resposta\ndata:${RESPOSTA}\n\n`,
      'event:explicacao\ndata:{"explicacao":"  "}\n\n',
      'event:explicacao\ndata:{}\n\n',
      'event:fim\ndata:{}\n\n',
    );

    expect((await eventosDe()).map((e) => e.evento)).toEqual(['resposta', 'fim']);
  });

  /** Quem decide manter a resposta é o store; aqui o erro só precisa chegar classificado. */
  it('erro depois da resposta: a resposta já foi entregue e o erro sobe classificado', async () => {
    servirSse(
      `event:resposta\ndata:${RESPOSTA}\n\n`,
      'event:erro\ndata:{"errors":[{"code":"ASSISTENTE_TEMPO_ESGOTADO","message":"Demorou."}]}\n\n',
    );
    const eventos: CeresEvento[] = [];

    const erro = await api
      .perguntarEmStream('Quanto eu pago?', (e) => eventos.push(e))
      .then(
        () => null,
        (e: unknown) => e,
      );

    expect(eventos.map((e) => e.evento)).toEqual(['resposta']);
    expect(erro).toBeInstanceOf(CeresError);
    expect((erro as CeresError).codigo).toBe('ASSISTENTE_TEMPO_ESGOTADO');
  });
});

/**
 * O risco real do SSE é o evento cortado na fronteira do chunk: a resposta da
 * Ceres é um JSON grande (texto + trechos de lei) e chega picada. Perder um
 * pedaço aqui significa perder a citação — a garantia do produto.
 */
describe('extrairEventosSse', () => {
  it('separa os eventos completos e devolve o resto', () => {
    const { eventos, resto } = extrairEventosSse('event:rota\ndata:{"rota":"DADOS"}\n\nevent:resp');

    expect(eventos).toEqual([{ nome: 'rota', dados: '{"rota":"DADOS"}' }]);
    expect(resto).toBe('event:resp');
  });

  it('aceita CRLF e junta data de várias linhas', () => {
    const { eventos } = extrairEventosSse('event:resposta\r\ndata:{"a":1,\r\ndata:"b":2}\r\n\r\n');

    expect(eventos).toEqual([{ nome: 'resposta', dados: '{"a":1,\n"b":2}' }]);
  });

  it('lê os três eventos da sequência do contrato de uma vez', () => {
    const bruto =
      'event:rota\ndata:{"rota":"DADOS"}\n\n' +
      'event:resposta\ndata:{"resposta":"ok","rota":"DADOS","citacoes":[],"fontesDados":[],"modoFallback":false}\n\n' +
      'event:fim\ndata:{}\n\n';

    const { eventos, resto } = extrairEventosSse(bruto);

    expect(eventos.map((e) => e.nome)).toEqual(['rota', 'resposta', 'fim']);
    expect(resto).toBe('');
  });

  it('bloco sem nome de evento é ignorado (comentário, heartbeat)', () => {
    expect(extrairEventosSse(':keep-alive\n\n').eventos).toEqual([]);
  });
});
