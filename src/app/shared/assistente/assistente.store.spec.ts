import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Observable, of } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { entrarComo } from '@core/services/sessao.testing';
import type { CeresEvento, CeresResposta } from '@dtos/assistente/ceres.response';
import type { NotaFiscal } from '@models/nota-fiscal.model';
import { CeresApi, CeresError } from '@services/assistente/data-access/ceres.service';
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
  fontesDados: [{ funcao: 'proximosVencimentos', parametros: { dias: '30' } }],
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

    expect(store.sugestoes()[0]).toBe('Por que a nota 7 está com inconsistência?');

    store.limparNota();
    expect(store.sugestoes()).toEqual(store.perguntasSugeridas);
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
    ): Promise<void> {
      this.perguntasRecebidas.push(pergunta);
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

  it('stream que termina sem resposta não vira mensagem vazia da Ceres', async () => {
    fake.desfechos = []; // encerra sem evento `resposta`

    store.enviar('pergunta');
    await vi.waitFor(() => expect(store.mensagens().length).toBe(2));

    expect(store.mensagens()[1].falha).toBe('DESCONHECIDO');
  });
});
