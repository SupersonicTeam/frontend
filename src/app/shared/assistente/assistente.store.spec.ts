import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Observable, of } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { entrarComo } from '@core/services/sessao.testing';
import type { CeresEvento, CeresResposta } from '@dtos/assistente/ceres.response';
import type { NotaFiscal } from '@models/nota-fiscal.model';
import {
  CeresApi,
  CeresCancelada,
  CeresError,
  type ContextoConversa,
} from '@services/assistente/data-access/ceres.service';
import { AssistenteStore } from './assistente.store';

const dashboard = {
  produtor: { nome: 'Fazenda Boa Vista', tipoProdutor: 'PESSOA_FISICA', uf: 'MT' },
  periodo: '2026-09',
  kpis: { saldoIbs: 1200.5, saldoCbs: 609, totalNotas: 11 },
};

const nota = (over: Partial<NotaFiscal> = {}): NotaFiscal =>
  ({
    id: 'n7',
    numero: 7,
    status: 'COM_INCONSISTENCIAS',
    naturezaOperacao: 'Venda',
    dataEmissao: '2026-09-10T00:00:00Z',
    destinatarioNome: 'Cooperativa Cafeeira XYZ',
    destinatarioCpfCnpj: '00000000000191',
    itens: [],
    ...over,
  }) as NotaFiscal;

const resposta = (over: Partial<CeresResposta> = {}): CeresResposta => ({
  resposta: 'A guia de FUNRURAL vence em 20/10/2026 e tem valor de R$ 1.840,55.',
  rota: 'DADOS',
  citacoes: [],
  fontesDados: [{ funcao: 'proximosVencimentos', parametros: { dias: '30' }, origem: 'PRODUTOR' }],
  modoFallback: false,
  atalhos: [],
  ...over,
});

/**
 * O que estes testes protegem é sobretudo **o que a Ceres não faz**: não inventa
 * resposta quando o backend falha, não manda uma segunda pergunta por cima da
 * primeira e não joga fora as citações e as fontes — que são a garantia do
 * produto, não enfeite.
 */
describe('AssistenteStore — modo síncrono contra /api/assistente/chat', () => {
  let httpMock: HttpTestingController;
  let store: AssistenteStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
    entrarComo('PRODUTOR');
    // Sem streaming no jsdom o caminho exercitado é o síncrono — que é
    // justamente o fallback que roda em navegador sem `TextDecoderStream`.
    vi.spyOn(TestBed.inject(CeresApi), 'suportaStream').mockReturnValue(false);
    store = TestBed.inject(AssistenteStore);
  });

  afterEach(() => {
    // A cota e recarregada depois de cada resposta, e isso e ruido para estes testes: o que
    // eles protegem e a conversa. Drenar aqui mantem o `verify()` severo com todo o resto.
    httpMock.match((r) => r.url === '/assistente/uso').forEach((r) => r.flush(usoPadrao));
    httpMock.verify();
  });

  /** Drena as leituras de contexto: dashboard, notas e a cota. */
  /** A cota da semana, drenada junto com o resto do contexto. */
  const usoPadrao = {
    plano: 'padrao',
    habilitada: true,
    creditosSemana: 1000,
    consumidos: 0,
    restantes: 1000,
    renovaEm: '2026-10-19T00:00:00-03:00',
  };

  function flushContexto(notas: unknown[] = []) {
    httpMock.match((r) => r.url === '/dashboard').forEach((r) => r.flush(dashboard));
    httpMock
      .match((r) => r.url === '/notas')
      .forEach((r) => r.flush({ content: notas, totalElements: notas.length }));
    httpMock.match((r) => r.url === '/assistente/uso').forEach((r) => r.flush(usoPadrao));
  }

  it('monta o contexto com os dados reais do produtor, não com valores fixos', () => {
    store.carregarContexto();
    flushContexto([
      { id: 'a', numero: 1, status: 'AUTORIZADA' },
      { id: 'b', numero: 2, status: 'COM_INCONSISTENCIAS' },
      { id: 'c', numero: 3, status: 'REJEITADA' },
    ]);

    const ctx = store.contexto();
    expect(ctx.nome).toBe('Fazenda Boa Vista');
    expect(ctx.uf).toBe('MT');
    expect(ctx.periodo).toBe('2026-09');
    expect(ctx.saldoAPagar).toBe(1809.5);
    expect(ctx.notasPendentes).toBe(2);
  });

  it('busca o contexto uma vez só, mesmo abrindo a gaveta várias vezes', () => {
    store.carregarContexto();
    flushContexto();
    store.abrir();
    store.fechar();
    store.abrir();

    expect(httpMock.match((r) => r.url === '/dashboard').length).toBe(0);
  });

  /**
   * `/api/dashboard`, `/api/notas` e `/api/assistente/uso` são do produtor do token e respondem
   * 403 ao contador (#136). A gaveta não aparece para ele, mas o store também não pede.
   */
  it('com sessao de contador, nao busca contexto nem a cota', () => {
    entrarComo('CONTADOR');
    store.carregarContexto();

    httpMock.expectNone((r) => r.url === '/dashboard');
    httpMock.expectNone((r) => r.url === '/notas');
    httpMock.expectNone((r) => r.url === '/assistente/uso');
  });

  it('manda só a pergunta — o produtor não é parâmetro, sai da identidade no servidor', async () => {
    store.carregarContexto();
    flushContexto();

    store.enviar('Quando vence a minha guia?');
    const req = httpMock.expectOne((r) => r.url === '/assistente/chat');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ pergunta: 'Quando vence a minha guia?' });
    req.flush(resposta());

    await vi.waitFor(() => expect(store.enviando()).toBe(false));
  });

  /** #187: no síncrono a explicação vem no próprio corpo; ausente e `null` são "sem explicação". */
  it('no síncrono, a explicação vem junto e entra abaixo da resposta', async () => {
    store.carregarContexto();
    flushContexto();

    store.enviar('Quanto eu pago?');
    httpMock
      .expectOne((r) => r.url === '/assistente/chat')
      .flush({ ...resposta(), explicacao: 'É o IBS menos os créditos.' });
    await vi.waitFor(() => expect(store.enviando()).toBe(false));

    expect(store.mensagens().at(-1)?.explicacao).toBe('É o IBS menos os créditos.');
    expect(store.mensagens().at(-1)?.explicacaoPendente).toBeUndefined();
  });

  it('no síncrono, explicação ausente ou null não deixa nada a esperar', async () => {
    store.carregarContexto();
    flushContexto();

    store.enviar('primeira');
    httpMock.expectOne((r) => r.url === '/assistente/chat').flush(resposta());
    await vi.waitFor(() => expect(store.enviando()).toBe(false));
    store.enviar('segunda');
    httpMock
      .expectOne((r) => r.url === '/assistente/chat')
      .flush({ ...resposta(), explicacao: null });
    await vi.waitFor(() => expect(store.enviando()).toBe(false));

    for (const m of store.mensagens().filter((x) => x.autor === 'ceres')) {
      expect(m.explicacao).toBeUndefined();
      expect(m.explicacaoPendente).toBeUndefined();
    }
  });

  it('traduz os atalhos do modo fallback em telas, e descarta código que não conhece', async () => {
    store.carregarContexto();
    flushContexto();

    store.enviar('qual a alíquota do IBS?');
    httpMock
      .expectOne((r) => r.url === '/assistente/chat')
      .flush(
        resposta({
          modoFallback: true,
          // CREDITOS e APURACAO levam a mesma tela: dois botoes iguais lado a lado confundem.
          atalhos: ['CALENDARIO', 'APURACAO', 'CREDITOS', 'TELA_QUE_NAO_EXISTE'],
        }),
      );

    await vi.waitFor(() => expect(store.enviando()).toBe(false));

    expect(store.mensagens().at(-1)?.atalhos).toEqual([
      { rota: '/calendario', rotulo: 'Prazos' },
      { rota: '/tributario', rotulo: 'Impostos' },
    ]);
  });

  it('guarda rota, citações e fontes da resposta — não só o texto', async () => {
    store.carregarContexto();
    flushContexto();

    store.enviar('Qual a redução para insumos?');
    httpMock
      .expectOne((r) => r.url === '/assistente/chat')
      .flush(
        resposta({
          resposta: 'A redução é de 60%. (LC 214/2025, art. 138, § 1º)',
          rota: 'LEGISLACAO',
          citacoes: [
            {
              norma: 'LC 214/2025',
              dispositivo: 'art. 138, § 1º',
              url: 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm',
              trecho: 'Art. 138. Ficam reduzidas em 60%...',
            },
          ],
          fontesDados: [],
        }),
      );

    await vi.waitFor(() => expect(store.mensagens().length).toBe(2));
    const ceres = store.mensagens()[1];
    expect(ceres.autor).toBe('ceres');
    expect(ceres.rota).toBe('LEGISLACAO');
    expect(ceres.citacoes?.[0].url).toContain('planalto.gov.br');
    expect(ceres.falha).toBeUndefined();
  });

  it('com a Ceres fora do ar (503), diz isso — não devolve texto de assistente', async () => {
    store.carregarContexto();
    flushContexto();

    store.enviar('O que muda com o IBS?');
    httpMock
      .expectOne((r) => r.url === '/assistente/chat')
      .flush(
        {
          status: 503,
          message: 'A assistente Ceres esta indisponivel no momento.',
          errors: [{ code: 'ASSISTENTE_INDISPONIVEL', message: 'A Ceres esta indisponivel.' }],
        },
        { status: 503, statusText: 'Service Unavailable' },
      );

    await vi.waitFor(() => expect(store.mensagens().length).toBe(2));
    const ultima = store.mensagens()[1];
    expect(ultima.falha).toBe('ASSISTENTE_INDISPONIVEL');
    expect(ultima.citacoes).toBeUndefined();
    expect(store.enviando()).toBe(false);
  });

  it('separa servidor fora do ar de assistente fora do ar', async () => {
    store.carregarContexto();
    flushContexto();

    store.enviar('E aí?');
    httpMock
      .expectOne((r) => r.url === '/assistente/chat')
      .error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });

    await vi.waitFor(() => expect(store.mensagens().at(-1)?.falha).toBe('SEM_CONEXAO'));
  });

  it('403 PAPEL_NAO_AUTORIZADO tira a conversa do ar para quem não é produtor', async () => {
    store.carregarContexto();
    flushContexto();

    store.enviar('Qual a apuração do mês?');
    httpMock
      .expectOne((r) => r.url === '/assistente/chat')
      .flush(
        {
          status: 403,
          message: 'sem acesso',
          errors: [{ code: 'PAPEL_NAO_AUTORIZADO', message: 'sem acesso' }],
        },
        { status: 403, statusText: 'Forbidden' },
      );

    await vi.waitFor(() => expect(store.bloqueadoPorPapel()).toBe(true));
    expect(store.disponivel()).toBe(false);
    expect(store.podeEnviar()).toBe(false);
  });

  it('não envia pergunta vazia, nem acima de 1000 caracteres, nem duas ao mesmo tempo', () => {
    store.carregarContexto();
    flushContexto();

    expect(store.podeEnviar()).toBe(false);
    store.entrada.set('   ');
    expect(store.podeEnviar()).toBe(false);

    store.entrada.set('a'.repeat(1001));
    expect(store.perguntaLonga()).toBe(true);
    expect(store.podeEnviar()).toBe(false);
    store.enviar();
    expect(httpMock.match((r) => r.url === '/assistente/chat').length).toBe(0);

    store.entrada.set('pergunta');
    expect(store.podeEnviar()).toBe(true);

    store.enviar();
    expect(store.entrada()).toBe('');
    store.enviar('outra enquanto a primeira não voltou');
    expect(httpMock.match((r) => r.url === '/assistente/chat').length).toBe(1);
  });

  it('cancelar aborta a pergunta e registra o desfecho na conversa', () => {
    store.carregarContexto();
    flushContexto();

    store.enviar('pergunta demorada');
    httpMock.expectOne((r) => r.url === '/assistente/chat');
    store.cancelar();

    expect(store.enviando()).toBe(false);
    expect(store.mensagens().at(-1)?.falha).toBe('CANCELADA');
  });

  it('abrir sobre uma nota com pendência busca as validações reais do fisco', () => {
    store.abrirSobreNota(nota());
    flushContexto();

    const req = httpMock.expectOne((r) => r.url === '/notas/n7/validacoes');
    req.flush([
      {
        loteValidacao: 'l1',
        code: 'DEST_ENDERECO_OBRIGATORIO',
        field: 'destinatarioEndereco',
        message: 'Endereço do destinatário é obrigatório para emissão da NF-e',
        validadoEm: '2026-09-10T00:00:00Z',
      },
    ]);

    expect(store.aberto()).toBe(true);
    expect(store.validacoesDaNota().length).toBe(1);
    expect(store.contexto().notaId).toBe('n7');
    expect(store.contexto().notaNumero).toBe(7);
  });

  it('mostra só a checagem mais recente — o backend devolve o histórico todo', () => {
    store.abrirSobreNota(nota());
    flushContexto();

    // A nota 7 real traz o mesmo problema duas vezes, de tentativas em horarios
    // diferentes. Repetir na tela só confunde quem precisa corrigir.
    httpMock
      .expectOne((r) => r.url === '/notas/n7/validacoes')
      .flush([
        {
          loteValidacao: 'antigo',
          code: 'NOTA_INVALIDA_EMISSAO',
          field: 'destinatarioEndereco',
          message: 'Endereço do destinatário é obrigatório',
          validadoEm: '2026-07-02T21:42:42Z',
        },
        {
          loteValidacao: 'atual',
          code: 'NOTA_INVALIDA_EMISSAO',
          field: 'destinatarioEndereco',
          message: 'Endereço do destinatário é obrigatório',
          validadoEm: '2026-07-02T22:00:18Z',
        },
      ]);

    expect(store.validacoesDaNota().length).toBe(1);
    expect(store.validacoesDaNota()[0].loteValidacao).toBe('atual');
  });

  it('nota autorizada não dispara busca de validações — não há o que corrigir', () => {
    store.abrirSobreNota(nota({ id: 'n9', numero: 9, status: 'AUTORIZADA' }));
    flushContexto();

    expect(httpMock.match((r) => r.url.includes('validacoes')).length).toBe(0);
    expect(store.validacoesDaNota()).toEqual([]);
  });

  it('com nota em foco, as sugestões passam a ser sobre ela', () => {
    store.abrirSobreNota(nota());
    flushContexto();
    httpMock.match((r) => r.url.includes('validacoes')).forEach((r) => r.flush([]));

    // Os sinais da nota (backend#276) vêm primeiro: é a pergunta que a consultarNota responde.
    expect(store.sugestoes()[0]).toBe('Tem algo para conferir na nota 7?');
    expect(store.sugestoes()).toContain('Por que a nota 7 está com inconsistência?');

    store.limparNota();
    expect(store.sugestoes()).toEqual(store.perguntasSugeridas);
  });

  it('a primeira sugestão é o resumo do produtor, e há uma da tabela oficial', () => {
    expect(store.perguntasSugeridas[0]).toBe('O que eu preciso saber?');
    expect(store.perguntasSugeridas).toContain('O feijão tem redução de IBS e CBS?');
    expect(store.sugestoes()).toEqual(store.perguntasSugeridas);
  });

  it('guarda os atalhos também quando não é modo fallback (dado não identificado, #266)', async () => {
    store.carregarContexto();
    flushContexto();

    store.enviar('me fala do negocio');
    httpMock
      .expectOne((r) => r.url === '/assistente/chat')
      .flush(
        resposta({
          resposta:
            'Nao consegui identificar qual dado consultar. Voce pode perguntar, por exemplo: ...',
          fontesDados: [],
          modoFallback: false,
          atalhos: ['NOTAS', 'APURACAO', 'CREDITOS', 'CALENDARIO'],
        }),
      );

    await vi.waitFor(() => expect(store.enviando()).toBe(false));

    const ultima = store.mensagens().at(-1);
    expect(ultima?.modoFallback).toBe(false);
    expect(ultima?.atalhos).toEqual([
      { rota: '/documentos', rotulo: 'Minhas notas' },
      { rota: '/tributario', rotulo: 'Impostos' },
      { rota: '/calendario', rotulo: 'Prazos' },
    ]);
  });

  it('guarda o texto de parágrafos e lista como veio, sem reescrever', async () => {
    store.carregarContexto();
    flushContexto();

    const texto = 'Encontrei 2 pontos de atencao.\n\n2 notas estao paradas:\n- Nota 1.\n- Nota 2.';
    store.enviar('O que eu preciso saber?');
    httpMock
      .expectOne((r) => r.url === '/assistente/chat')
      .flush(
        resposta({
          resposta: texto,
          fontesDados: [{ funcao: 'resumoDoProdutor', parametros: {}, origem: 'PRODUTOR' }],
        }),
      );

    await vi.waitFor(() => expect(store.enviando()).toBe(false));
    expect(store.mensagens().at(-1)?.texto).toBe(texto);
  });

  /**
   * O histórico da conversa (#183, backend#499).
   *
   * Cada pergunta chega isolada ao backend, e é por isso que "tem certeza?" recebia
   * "Não consegui identificar qual dado consultar". O que estes testes protegem é o
   * **contrato do envio**: o `turno` é assinado, então basta um `trim` ou um par montado
   * com o texto da tela para o backend descartar tudo **em silêncio** — sem erro, sem log,
   * só a Ceres voltando a não entender a pergunta seguinte.
   */
  describe('histórico da conversa (#183)', () => {
    const turno = (n: number) => ({
      pergunta: `pergunta ${n}`,
      resposta: `resposta ${n}`,
      assinatura: `v1.assinatura${n}`,
    });

    /** Pergunta e responde uma vez, devolvendo a requisição para quem quiser conferir. */
    async function trocar(pergunta: string, over: Partial<CeresResposta> = {}) {
      store.enviar(pergunta);
      const req = httpMock.expectOne((r) => r.url === '/assistente/chat');
      req.flush(resposta(over));
      await vi.waitFor(() => expect(store.enviando()).toBe(false));
      httpMock.match((r) => r.url === '/assistente/uso').forEach((r) => r.flush(usoPadrao));
      return req;
    }

    const corpo = (req: { request: { body: unknown } }) =>
      req.request.body as {
        pergunta: string;
        historico?: unknown[];
        ultimaRespostaSemTurno?: boolean;
      };

    beforeEach(() => {
      store.carregarContexto();
      flushContexto();
    });

    // Cancelar agenda a recarga da cota para 5 s depois; sem isto o timer sobreviveria ao
    // teste e pediria `/assistente/uso` a um TestBed já desmontado.
    afterEach(() => store.limpar());

    it('a primeira pergunta vai sem histórico; a segunda leva o turno da primeira', async () => {
      const primeira = await trocar('existe nota errada?', { turno: turno(1) });
      expect(corpo(primeira).historico).toBeUndefined();

      const segunda = await trocar('tem certeza?', { turno: turno(2) });
      expect(corpo(segunda).historico).toEqual([turno(1)]);
      expect(corpo(segunda).ultimaRespostaSemTurno).toBeUndefined();
    });

    it('manda no máximo 3 turnos, do mais antigo para o mais recente', async () => {
      for (let n = 1; n <= 4; n++) await trocar(`pergunta ${n}`, { turno: turno(n) });

      const quinta = await trocar('e agora?', { turno: turno(5) });
      expect(corpo(quinta).historico).toEqual([turno(2), turno(3), turno(4)]);
    });

    /**
     * A assinatura vale para os **bytes exatos**. Este teste existe porque o jeito
     * natural de guardar um par — montar `{ pergunta: minhaPergunta, resposta: texto }`
     * com o que está na tela — passa em qualquer outro teste e quebra só aqui.
     */
    it('o turno volta idêntico ao recebido, com quebras de linha e espaços das pontas', async () => {
      const original = {
        pergunta: 'ceres, existe alguma nota minha emitida da maneira errada?',
        resposta: '  Repeti a mesma consulta e o resultado é o mesmo.\n\n- Nota 15: devolvida.\n',
        assinatura: 'v1.eyJleHAiOjE3NjI3OTI2MDAs.kM3xQ',
      };
      await trocar('existe nota errada?', {
        resposta: 'outro texto, que a tela mostra',
        turno: original,
      });

      const req = await trocar('tem certeza?');
      const enviado = (corpo(req).historico as (typeof original)[])[0];
      expect(enviado).toEqual(original);
      expect(enviado.resposta).toBe(original.resposta);
      expect(JSON.stringify(req.request.body)).toContain(JSON.stringify(original.resposta));
    });

    it('resposta sem turno (fallback, conversa leve) não entra no histórico', async () => {
      await trocar('bom dia', { rota: 'FORA_DE_ESCOPO', turno: null });
      await trocar('existe nota errada?', { turno: turno(1) });
      await trocar('qual a alíquota?', { modoFallback: true, turno: null });

      const req = await trocar('tem certeza?');
      expect(corpo(req).historico).toEqual([turno(1)]);
    });

    it('depois de uma falha, a pergunta seguinte avisa que a última resposta não tem turno', async () => {
      await trocar('existe nota errada?', { turno: turno(1) });

      store.enviar('e agora?');
      httpMock
        .expectOne((r) => r.url === '/assistente/chat')
        .flush(
          { errors: [{ code: 'ASSISTENTE_INDISPONIVEL', message: 'Modelo fora do ar.' }] },
          { status: 503, statusText: 'Service Unavailable' },
        );
      await vi.waitFor(() => expect(store.enviando()).toBe(false));

      const req = await trocar('tem certeza?');
      expect(corpo(req).historico).toEqual([turno(1)]);
      expect(corpo(req).ultimaRespostaSemTurno).toBe(true);
    });

    it('depois de cancelar, a pergunta seguinte também avisa', async () => {
      await trocar('existe nota errada?', { turno: turno(1) });

      store.enviar('pergunta que vai ser cancelada');
      const emVoo = httpMock.expectOne((r) => r.url === '/assistente/chat');
      store.cancelar();
      // Cancelar fecha a conexão: o que chega depois é o erro de rede, e o store o ignora
      // porque o `AbortController` desta pergunta já disparou.
      emVoo.error(new ProgressEvent('error'));
      await vi.waitFor(() => expect(store.mensagens().at(-1)?.falha).toBe('CANCELADA'));

      const req = await trocar('tem certeza?');
      expect(corpo(req).ultimaRespostaSemTurno).toBe(true);
    });

    /** O backend junta os repetidos — a tela não tem de descobrir que são iguais. */
    it('o mesmo turno repetido é guardado sem erro', async () => {
      await trocar('o que diz a LC 214?', { rota: 'LEGISLACAO', turno: turno(1) });
      await trocar('tem certeza?', { rota: 'LEGISLACAO', turno: turno(1) });

      const req = await trocar('e sobre o frete?');
      expect(corpo(req).historico).toEqual([turno(1), turno(1)]);
    });

    it('o turno não aparece na tela e não sobra em storage nenhum', async () => {
      await trocar('existe nota errada?', { turno: turno(1) });

      const mensagem = store.mensagens().at(-1);
      expect(mensagem?.turno).toEqual(turno(1));
      expect(mensagem?.texto).not.toContain('assinatura');
      expect(JSON.stringify(localStorage)).not.toContain('assinatura');
      expect(JSON.stringify(sessionStorage)).not.toContain('assinatura');

      store.limpar();
      expect(store.mensagens()).toEqual([]);

      const depois = await trocar('existe nota errada?');
      expect(corpo(depois).historico).toBeUndefined();
      expect(corpo(depois).ultimaRespostaSemTurno).toBeUndefined();
    });
  });
});

/**
 * Streaming e reenvio com um `CeresApi` de mentira: aqui o que importa é o
 * **comportamento do store** diante dos eventos e do `Retry-After`, não o
 * transporte. O jsdom não tem `TextDecoderStream`, e simular um `ReadableStream`
 * só para isso testaria o navegador, não o nosso código.
 */
describe('AssistenteStore — streaming e reenvio quando a Ceres está ocupada', () => {
  let store: AssistenteStore;
  let fake: CeresFake;

  /** Dublê do `CeresApi`: a resposta de cada pergunta é programada pelo teste. */
  class CeresFake {
    /** Fila de desfechos, um por tentativa. */
    desfechos: (CeresResposta | CeresError)[] = [];
    perguntasRecebidas: string[] = [];
    /** O contexto de conversa de cada tentativa (#183), para conferir o reenvio. */
    contextosRecebidos: (ContextoConversa | undefined)[] = [];
    abortos = 0;

    suportaStream(): boolean {
      return true;
    }

    perguntar(): never {
      throw new Error('O streaming deveria ter sido usado.');
    }

    /** A cota (#166). O dublê precisa dela: o store a recarrega depois de cada resposta. */
    uso(): Observable<null> {
      return of(null);
    }

    async perguntarEmStream(
      pergunta: string,
      aoEvento: (evento: CeresEvento) => void,
      sinal?: AbortSignal,
      contexto?: ContextoConversa,
    ): Promise<void> {
      this.perguntasRecebidas.push(pergunta);
      this.contextosRecebidos.push(contexto);
      sinal?.addEventListener('abort', () => (this.abortos += 1));

      const desfecho = this.desfechos.shift();
      if (desfecho instanceof CeresError) throw desfecho;
      if (!desfecho) return;

      aoEvento({ evento: 'rota', dado: { rota: desfecho.rota } });
      aoEvento({ evento: 'resposta', dado: desfecho });
      aoEvento({ evento: 'fim', dado: {} });
    }
  }

  beforeEach(() => {
    fake = new CeresFake();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: CeresApi, useValue: fake },
      ],
    });
    entrarComo('PRODUTOR');
    store = TestBed.inject(AssistenteStore);
  });

  it('mostra o que a Ceres está fazendo assim que a rota chega', async () => {
    // `rota` é o único retorno rápido que o contrato dá (segundos, contra até
    // 1,5 min da resposta): é o que impede a tela de ficar só "pensando".
    const etapas: (string | null)[] = [];
    const naoLida = new Promise<void>(() => undefined);
    vi.spyOn(fake, 'perguntarEmStream').mockImplementation(async (_p, aoEvento) => {
      aoEvento({ evento: 'rota', dado: { rota: 'LEGISLACAO' } });
      etapas.push(store.etapa());
      await naoLida; // mantém a pergunta em andamento
    });

    store.enviar('O que diz a LC 214?');
    await vi.waitFor(() => expect(etapas.length).toBe(1));

    expect(etapas[0]).toBe('Consultando a legislação…');
    expect(store.enviando()).toBe(true);
  });

  it('reenvia uma vez quando a Ceres está ocupada, esperando o Retry-After', async () => {
    vi.useFakeTimers();
    try {
      fake.desfechos = [
        new CeresError('ASSISTENTE_OCUPADO', 503, 'Sem vaga agora.', 7),
        resposta({ resposta: 'Pronto.' }),
      ];

      store.enviar('Quanto eu pago este mês?');
      await vi.advanceTimersByTimeAsync(0);

      expect(store.aguardandoVaga()).toBe(7);
      expect(store.etapa()).toBe('Ceres ocupada, tentando de novo em 7 s…');
      expect(store.enviando()).toBe(true);

      await vi.advanceTimersByTimeAsync(7000);

      expect(fake.perguntasRecebidas.length).toBe(2);
      expect(store.mensagens().at(-1)?.texto).toBe('Pronto.');
      expect(store.mensagens().filter((m) => m.falha).length).toBe(0);
      expect(store.enviando()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('desiste depois do segundo ASSISTENTE_OCUPADO em vez de insistir para sempre', async () => {
    vi.useFakeTimers();
    try {
      fake.desfechos = [
        new CeresError('ASSISTENTE_OCUPADO', 503, 'Sem vaga.', 1),
        new CeresError('ASSISTENTE_OCUPADO', 503, 'Sem vaga.', 1),
      ];

      store.enviar('pergunta');
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(1000);

      expect(fake.perguntasRecebidas.length).toBe(2);
      expect(store.mensagens().at(-1)?.falha).toBe('ASSISTENTE_OCUPADO');
      expect(store.enviando()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('sair da tela aborta a conexão e não deixa recado na conversa', async () => {
    const naoLida = new Promise<void>(() => undefined);
    vi.spyOn(fake, 'perguntarEmStream').mockImplementation(async (_p, _e, sinal) => {
      sinal?.addEventListener('abort', () => (fake.abortos += 1));
      await naoLida;
    });

    store.enviar('pergunta longa');
    await vi.waitFor(() => expect(store.enviando()).toBe(true));

    store.cancelar(false);

    expect(fake.abortos).toBe(1);
    expect(store.enviando()).toBe(false);
    expect(store.mensagens().length).toBe(1); // só a pergunta do produtor
  });

  /**
   * O reenvio do 503 é a **mesma** pergunta, e precisa ser a mesma conversa: recalcular o
   * histórico na hora de reenviar mandaria um contexto que não existia quando a pergunta
   * saiu (#183).
   */
  it('o reenvio depois do ASSISTENTE_OCUPADO manda o mesmo histórico', async () => {
    vi.useFakeTimers();
    try {
      const turno = { pergunta: 'p1', resposta: 'r1', assinatura: 'v1.aaa' };
      fake.desfechos = [resposta({ turno })];
      store.enviar('existe nota errada?');
      await vi.advanceTimersByTimeAsync(0);

      fake.desfechos = [
        new CeresError('ASSISTENTE_OCUPADO', 503, 'Sem vaga.', 2),
        resposta({ turno: { pergunta: 'p2', resposta: 'r2', assinatura: 'v1.bbb' } }),
      ];
      store.enviar('tem certeza?');
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(2000);

      expect(fake.perguntasRecebidas).toEqual([
        'existe nota errada?',
        'tem certeza?',
        'tem certeza?',
      ]);
      expect(fake.contextosRecebidos[1]).toEqual(fake.contextosRecebidos[2]);
      expect(fake.contextosRecebidos[2]?.historico).toEqual([turno]);
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * Cancelar passou a custar o que já foi gasto (#183). O backend só percebe o
   * cancelamento na chamada seguinte ao modelo, então a cota é relida **depois** de uns
   * segundos — pedir na hora traria o número de antes.
   */
  it('depois de cancelar, recarrega a cota uns segundos depois — não na hora', async () => {
    vi.useFakeTimers();
    try {
      const uso = vi.spyOn(fake, 'uso');
      const naoLida = new Promise<void>(() => undefined);
      vi.spyOn(fake, 'perguntarEmStream').mockImplementation(async (_p, _e, sinal) => {
        sinal?.addEventListener('abort', () => (fake.abortos += 1));
        await naoLida;
      });

      store.enviar('pergunta longa');
      await vi.advanceTimersByTimeAsync(0);

      store.cancelar();
      expect(uso).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(5000);
      expect(uso).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  /** Sair leva embora o que estava agendado: nada de pedir cota de uma sessão que acabou. */
  it('o logout desarma a recarga de cota agendada pelo cancelamento', async () => {
    vi.useFakeTimers();
    try {
      const uso = vi.spyOn(fake, 'uso');
      const naoLida = new Promise<void>(() => undefined);
      vi.spyOn(fake, 'perguntarEmStream').mockImplementation(async () => {
        await naoLida;
      });

      store.enviar('pergunta longa');
      await vi.advanceTimersByTimeAsync(0);
      store.cancelar();
      store.limpar();

      await vi.advanceTimersByTimeAsync(5000);
      expect(uso).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('stream que termina sem resposta não vira mensagem vazia da Ceres', async () => {
    fake.desfechos = []; // encerra sem evento `resposta`

    store.enviar('pergunta');
    await vi.waitFor(() => expect(store.mensagens().length).toBe(2));

    expect(store.mensagens()[1].falha).toBe('DESCONHECIDO');
  });

  /**
   * A explicação depois do número (#187, backend#268): `rota` → `resposta` → `explicacao`
   * (opcional) → `fim`. O número aparece na hora; a explicação, se vier, segundos depois.
   */
  describe('explicação depois do número (#187)', () => {
    /** Um stream que para depois da `resposta` e só segue quando o teste mandar. */
    function streamEmDuasPartes() {
      const passos: {
        aoEvento?: (evento: CeresEvento) => void;
        seguir?: () => void;
        falhar?: (erro: unknown) => void;
        abortado: boolean;
      } = { abortado: false };
      vi.spyOn(fake, 'perguntarEmStream').mockImplementation(async (_p, aoEvento, sinal) => {
        passos.aoEvento = aoEvento;
        aoEvento({ evento: 'rota', dado: { rota: 'DADOS' } });
        aoEvento({ evento: 'resposta', dado: resposta({ resposta: 'Você paga R$ 1.809,50.' }) });
        await new Promise<void>((seguir, falhar) => {
          passos.seguir = seguir;
          passos.falhar = falhar;
          sinal?.addEventListener('abort', () => {
            passos.abortado = true;
            falhar(new CeresCancelada());
          });
        });
      });
      return passos;
    }

    const daCeres = () => store.mensagens().filter((m) => m.autor === 'ceres');

    it('mostra o número assim que a resposta chega e encerra o "pensando"', async () => {
      streamEmDuasPartes();

      store.enviar('Quanto eu pago este mês?');
      await vi.waitFor(() => expect(daCeres().length).toBe(1));

      expect(daCeres()[0]?.texto).toBe('Você paga R$ 1.809,50.');
      expect(store.enviando()).toBe(false);
      expect(store.etapa()).toBeNull();
      expect(daCeres()[0]?.explicacaoPendente).toBe(true);
    });

    it('a explicação entra abaixo da resposta, sem mexer no texto', async () => {
      const passos = streamEmDuasPartes();
      store.enviar('Quanto eu pago este mês?');
      await vi.waitFor(() => expect(daCeres().length).toBe(1));

      passos.aoEvento?.({
        evento: 'explicacao',
        dado: { explicacao: 'É o IBS menos os créditos.' },
      });
      passos.aoEvento?.({ evento: 'fim', dado: {} });
      passos.seguir?.();
      await vi.waitFor(() => expect(daCeres()[0]?.explicacaoPendente).toBeUndefined());

      expect(daCeres()).toHaveLength(1);
      expect(daCeres()[0]?.texto).toBe('Você paga R$ 1.809,50.');
      expect(daCeres()[0]?.explicacao).toBe('É o IBS menos os créditos.');
    });

    it('fim sem explicação não é erro: nada a fazer', async () => {
      fake.desfechos = [resposta({ resposta: 'Pronto.' })];

      store.enviar('pergunta');
      await vi.waitFor(() => expect(daCeres().length).toBe(1));

      expect(daCeres()[0]?.falha).toBeUndefined();
      expect(daCeres()[0]?.explicacao).toBeUndefined();
      expect(daCeres()[0]?.explicacaoPendente).toBeUndefined();
    });

    it('um erro depois da resposta não apaga a resposta nem vira falha', async () => {
      const passos = streamEmDuasPartes();
      store.enviar('Quanto eu pago este mês?');
      await vi.waitFor(() => expect(daCeres().length).toBe(1));

      passos.falhar?.(new CeresError('ASSISTENTE_TEMPO_ESGOTADO', 503, 'Demorou.'));
      await vi.waitFor(() => expect(daCeres()[0]?.explicacaoPendente).toBeUndefined());

      expect(daCeres()).toHaveLength(1);
      expect(daCeres()[0]?.texto).toBe('Você paga R$ 1.809,50.');
      expect(daCeres()[0]?.falha).toBeUndefined();
      expect(store.enviando()).toBe(false);
    });

    it('a pergunta seguinte não espera a explicação: fecha aquele stream e segue', async () => {
      const passos = streamEmDuasPartes();
      store.enviar('Quanto eu pago este mês?');
      await vi.waitFor(() => expect(daCeres().length).toBe(1));

      expect(store.podeEnviar()).toBe(false); // campo vazio
      store.entrada.set('e no mês passado?');
      expect(store.podeEnviar()).toBe(true);
      store.enviar();

      expect(passos.abortado).toBe(true);
      // A primeira resposta continua, sem "Pergunta cancelada" e sem esperar mais nada.
      await vi.waitFor(() => expect(daCeres()[0]?.explicacaoPendente).toBeUndefined());
      expect(daCeres()[0]?.texto).toBe('Você paga R$ 1.809,50.');
      expect(store.mensagens().some((m) => m.falha === 'CANCELADA')).toBe(false);
    });

    it('uma explicação atrasada não cai na resposta da pergunta seguinte', async () => {
      const passos = streamEmDuasPartes();
      store.enviar('Quanto eu pago este mês?');
      await vi.waitFor(() => expect(daCeres().length).toBe(1));
      const primeiro = passos.aoEvento;

      fake.desfechos = [resposta({ resposta: 'Em outubro, R$ 900,00.' })];
      vi.mocked(fake.perguntarEmStream).mockRestore();
      store.enviar('e no mês passado?');
      await vi.waitFor(() => expect(daCeres().length).toBe(2));

      primeiro?.({ evento: 'explicacao', dado: { explicacao: 'tarde demais' } });

      expect(daCeres()[1]?.explicacao).toBeUndefined();
    });

    it('a explicação não entra no histórico: o turno volta como veio', async () => {
      const turno = { pergunta: 'p1', resposta: 'r1', assinatura: 'v1.aaa' };
      vi.spyOn(fake, 'perguntarEmStream').mockImplementation(async (_p, aoEvento) => {
        aoEvento({ evento: 'resposta', dado: resposta({ turno }) });
        aoEvento({ evento: 'explicacao', dado: { explicacao: 'Porque sim.' } });
        aoEvento({ evento: 'fim', dado: {} });
      });
      store.enviar('existe nota errada?');
      await vi.waitFor(() => expect(daCeres()[0]?.explicacao).toBe('Porque sim.'));

      vi.mocked(fake.perguntarEmStream).mockRestore();
      fake.desfechos = [resposta()];
      store.enviar('tem certeza?');
      await vi.waitFor(() => expect(daCeres().length).toBe(2));

      expect(fake.contextosRecebidos.at(-1)?.historico).toEqual([turno]);
      expect(fake.contextosRecebidos.at(-1)?.historico?.[0]).toBe(turno);
    });

    it('sair (logout) fecha o stream que esperava a explicação', async () => {
      const passos = streamEmDuasPartes();
      store.enviar('Quanto eu pago este mês?');
      await vi.waitFor(() => expect(daCeres().length).toBe(1));

      store.limpar();

      expect(passos.abortado).toBe(true);
      expect(store.mensagens()).toEqual([]);
    });
  });
});
