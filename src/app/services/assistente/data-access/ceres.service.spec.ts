import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
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
