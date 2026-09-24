import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ChatPage } from './chat';
import { LOGGED_PRODUCER_ID } from '@core/config/produtor-logado';

/**
 * Cobertura da casca do assistente (#51).
 *
 * O que estes testes protegem é sobretudo **o que a tela não faz**: não inventa
 * resposta quando `/chat` responde 404 e não manda contexto fixo no código.
 * Ambos existiam antes — o service devolvia uma frase de assistente ("não consegui
 * processar sua mensagem") como se ele tivesse respondido, e a página mandava
 * `estado: 'PR'` com culturas Soja/Milho enquanto o produtor é de MT.
 */
describe('ChatPage (#51)', () => {
  let httpMock: HttpTestingController;

  const dashboard = {
    produtor: { nome: 'Fazenda Boa Vista', tipoProdutor: 'PESSOA_FISICA', uf: 'MT' },
    periodo: '2026-09',
    kpis: { saldoIbs: 1200.5, saldoCbs: 609, totalNotas: 11 },
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  /** Drena as duas leituras do ngOnInit: dashboard e notas. */
  function flushInit(notas: unknown[] = []) {
    httpMock.match(r => r.url === '/dashboard').forEach(r => r.flush(dashboard));
    httpMock
      .match(r => r.url === '/notas')
      .forEach(r => r.flush({ content: notas, totalElements: notas.length }));
  }

  it('monta o contexto com os dados reais do produtor, não com valores fixos', () => {
    const fixture = TestBed.createComponent(ChatPage);
    fixture.detectChanges();
    flushInit([
      { id: 'n1', numero: 1, status: 'AUTORIZADA' },
      { id: 'n2', numero: 2, status: 'COM_INCONSISTENCIAS' },
      { id: 'n3', numero: 3, status: 'REJEITADA' },
    ]);

    const ctx = fixture.componentInstance.contexto();
    expect(ctx.produtorId).toBe(LOGGED_PRODUCER_ID);
    expect(ctx.nome).toBe('Fazenda Boa Vista');
    expect(ctx.uf).toBe('MT');
    expect(ctx.periodo).toBe('2026-09');
    expect(ctx.saldoAPagar).toBe(1809.5);
    expect(ctx.notasPendentes).toBe(2);
  });

  it('envia a pergunta com o contexto do produtor no corpo', () => {
    const fixture = TestBed.createComponent(ChatPage);
    fixture.detectChanges();
    flushInit();

    fixture.componentInstance.enviar('Quanto eu tenho que pagar este mês?');

    const req = httpMock.expectOne(r => r.url === '/chat');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.message).toBe('Quanto eu tenho que pagar este mês?');
    expect(req.request.body.context.uf).toBe('MT');
    expect(req.request.body.context.produtorId).toBe(LOGGED_PRODUCER_ID);
    req.flush('não existe', { status: 404, statusText: 'Not Found' });
  });

  it('com /chat em 404, diz que o assistente não está ligado — não simula resposta', () => {
    const fixture = TestBed.createComponent(ChatPage);
    fixture.detectChanges();
    flushInit();

    fixture.componentInstance.enviar('O que muda com o IBS?');
    httpMock
      .expectOne(r => r.url === '/chat')
      .flush('não existe', { status: 404, statusText: 'Not Found' });

    const msgs = fixture.componentInstance.mensagens();
    expect(msgs[0]).toEqual({ role: 'user', content: 'O que muda com o IBS?' });
    expect(msgs[1].role).toBe('assistant');
    expect(msgs[1].content).toBe('INDISPONIVEL');
    expect(fixture.componentInstance.enviando()).toBe(false);
  });

  it('em falha de servidor (500), separa do caso "não ligado"', () => {
    const fixture = TestBed.createComponent(ChatPage);
    fixture.detectChanges();
    flushInit();

    fixture.componentInstance.enviar('Posso aproveitar crédito?');
    httpMock.expectOne(r => r.url === '/chat').flush('boom', { status: 500, statusText: 'Erro' });

    const ultima = fixture.componentInstance.mensagens().at(-1);
    expect(ultima?.content).not.toBe('INDISPONIVEL');
    expect(ultima?.content).toContain('falha');
  });

  it('mostra a resposta e não bloqueia quando o backend existir', () => {
    const fixture = TestBed.createComponent(ChatPage);
    fixture.detectChanges();
    flushInit();

    fixture.componentInstance.enviar('E aí?');
    httpMock
      .expectOne(r => r.url === '/chat')
      .flush({ response: 'Você tem R$ 1.809,50 a pagar.', sources: ['LC 214/2025, art. 12'] });

    expect(fixture.componentInstance.mensagens().at(-1)).toEqual({
      role: 'assistant',
      content: 'Você tem R$ 1.809,50 a pagar.',
    });
  });

  it('não envia pergunta vazia nem repete o envio enquanto aguarda', () => {
    const fixture = TestBed.createComponent(ChatPage);
    fixture.detectChanges();
    flushInit();
    const cmp = fixture.componentInstance;

    expect(cmp.podeEnviar()).toBe(false);
    cmp.entrada.set('   ');
    expect(cmp.podeEnviar()).toBe(false);

    cmp.entrada.set('pergunta');
    expect(cmp.podeEnviar()).toBe(true);

    cmp.enviar();
    expect(cmp.entrada()).toBe('');
    cmp.enviar('outra enquanto a primeira não voltou');
    expect(httpMock.match(r => r.url === '/chat').length).toBe(1);
  });

  it('sem dashboard, a tela continua de pé com o contexto possível', () => {
    const fixture = TestBed.createComponent(ChatPage);
    fixture.detectChanges();
    httpMock.match(r => r.url === '/dashboard').forEach(r => r.flush({}, { status: 500, statusText: 'x' }));
    httpMock.match(r => r.url === '/notas').forEach(r => r.flush('erro', { status: 500, statusText: 'x' }));

    const ctx = fixture.componentInstance.contexto();
    expect(ctx.nome).toBeUndefined();
    expect(ctx.saldoAPagar).toBe(0);
    expect(ctx.notasPendentes).toBe(0);
  });
});
