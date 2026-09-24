import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { LOGGED_PRODUCER_ID } from '@core/config/produtor-logado';
import type { NotaFiscal } from '@models/nota-fiscal.model';
import { AssistenteStore } from './assistente.store';

/**
 * O que estes testes protegem é sobretudo **o que o assistente não faz**: não
 * inventa resposta quando `/chat` responde 404 e não manda contexto fixo no
 * código. Ambos existiam antes — o service devolvia uma frase de assistente
 * ("não consegui processar sua mensagem") como se ele tivesse respondido, e a
 * página mandava `estado: 'PR'` com culturas Soja/Milho enquanto o produtor é
 * de MT.
 */
describe('AssistenteStore', () => {
  let httpMock: HttpTestingController;
  let store: AssistenteStore;

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

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
    store = TestBed.inject(AssistenteStore);
  });

  afterEach(() => httpMock.verify());

  /** Drena as duas leituras de contexto: dashboard e notas. */
  function flushContexto(notas: unknown[] = []) {
    httpMock.match(r => r.url === '/dashboard').forEach(r => r.flush(dashboard));
    httpMock
      .match(r => r.url === '/notas')
      .forEach(r => r.flush({ content: notas, totalElements: notas.length }));
  }

  it('monta o contexto com os dados reais do produtor, não com valores fixos', () => {
    store.carregarContexto();
    flushContexto([
      { id: 'a', numero: 1, status: 'AUTORIZADA' },
      { id: 'b', numero: 2, status: 'COM_INCONSISTENCIAS' },
      { id: 'c', numero: 3, status: 'REJEITADA' },
    ]);

    const ctx = store.contexto();
    expect(ctx.produtorId).toBe(LOGGED_PRODUCER_ID);
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

    expect(httpMock.match(r => r.url === '/dashboard').length).toBe(0);
  });

  it('com /chat em 404, diz que o assistente não está ligado — não simula resposta', () => {
    store.carregarContexto();
    flushContexto();

    store.enviar('O que muda com o IBS?');
    httpMock
      .expectOne(r => r.url === '/chat')
      .flush('não existe', { status: 404, statusText: 'Not Found' });

    const msgs = store.mensagens();
    expect(msgs[0]).toEqual({ role: 'user', content: 'O que muda com o IBS?' });
    expect(msgs[1].content).toBe('INDISPONIVEL');
    expect(store.enviando()).toBe(false);
  });

  it('em falha de servidor (500), separa do caso "não ligado"', () => {
    store.carregarContexto();
    flushContexto();

    store.enviar('Posso aproveitar crédito?');
    httpMock.expectOne(r => r.url === '/chat').flush('boom', { status: 500, statusText: 'Erro' });

    const ultima = store.mensagens().at(-1);
    expect(ultima?.content).not.toBe('INDISPONIVEL');
    expect(ultima?.content).toContain('falha');
  });

  it('mostra a resposta quando o backend existir', () => {
    store.carregarContexto();
    flushContexto();

    store.enviar('E aí?');
    httpMock
      .expectOne(r => r.url === '/chat')
      .flush({ response: 'Você tem R$ 1.809,50 a pagar.', sources: ['LC 214/2025, art. 12'] });

    expect(store.mensagens().at(-1)).toEqual({
      role: 'assistant',
      content: 'Você tem R$ 1.809,50 a pagar.',
    });
  });

  it('não envia pergunta vazia nem repete o envio enquanto aguarda', () => {
    store.carregarContexto();
    flushContexto();

    expect(store.podeEnviar()).toBe(false);
    store.entrada.set('   ');
    expect(store.podeEnviar()).toBe(false);

    store.entrada.set('pergunta');
    expect(store.podeEnviar()).toBe(true);

    store.enviar();
    expect(store.entrada()).toBe('');
    store.enviar('outra enquanto a primeira não voltou');
    expect(httpMock.match(r => r.url === '/chat').length).toBe(1);
  });

  it('abrir sobre uma nota com pendência busca as validações reais do fisco', () => {
    store.abrirSobreNota(nota());
    flushContexto();

    const req = httpMock.expectOne(r => r.url === '/notas/n7/validacoes');
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
    httpMock.expectOne(r => r.url === '/notas/n7/validacoes').flush([
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

    expect(httpMock.match(r => r.url.includes('validacoes')).length).toBe(0);
    expect(store.validacoesDaNota()).toEqual([]);
  });

  it('com nota em foco, as sugestões passam a ser sobre ela', () => {
    store.abrirSobreNota(nota());
    flushContexto();
    httpMock.match(r => r.url.includes('validacoes')).forEach(r => r.flush([]));

    expect(store.sugestoes()[0]).toBe('Por que a nota 7 está com inconsistência?');

    store.limparNota();
    expect(store.sugestoes()).toEqual(store.perguntasSugeridas);
  });
});
