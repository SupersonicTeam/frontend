import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import {
  NotificacaoApi,
  NotificacaoError,
  type DisparoNotificacao,
  type NotificacaoRegistrada,
} from './notificacao.service';

/** O corpo que o backend devolve num disparo — medido contra a API local em 31/10. */
const DISPARO: DisparoNotificacao = {
  enviados: 2,
  urgentes: 2,
  notificacaoId: '91ab6c91-554f-4980-b6c9-a7ec6843e42e',
};

const REGISTRO: NotificacaoRegistrada = {
  id: '91ab6c91-554f-4980-b6c9-a7ec6843e42e',
  tipo: 'PROXIMAS_OBRIGACOES',
  canal: 'WHATSAPP',
  status: 'REGISTRADA',
  texto: 'AgroContabil: vencimentos dos proximos 7 dias.',
  quantidadeItens: 2,
  urgentes: 2,
  disparadoPor: 'PRODUTOR',
  criadoEm: '2026-10-31T19:01:20.196184Z',
};

/**
 * O cliente de notificação, contra o contrato que de fato existe (issue #94, backend#182).
 *
 * Até 31/10 a família `/api/notificacao` respondia 404, e o cliente engolia **tudo** num
 * `catchError(() => of({ enviados: 0, indisponivel: true }))`. As rotas existem agora, e cada
 * motivo de falha tem nome próprio.
 */
describe('NotificacaoApi', () => {
  let api: NotificacaoApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [NotificacaoApi, provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(NotificacaoApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  /**
   * **O `produtorId` saiu do caminho.** Ele vinha do cliente, que é exatamente o que a #93 tirou
   * do app: quem o pedido é vem do token.
   */
  describe('produtor — o id vem do token, não do caminho', () => {
    it.each([
      ['notificarProximasObrigacoes', '/notificacao/proximas-obrigacoes'],
      ['notificarTodosAtrasados', '/notificacao/todos-atrasados'],
    ] as const)('%s chama %s', (metodo, rota) => {
      let visto: DisparoNotificacao | undefined;
      api[metodo]().subscribe((d) => (visto = d));

      const req = httpMock.expectOne(rota);
      expect(req.request.method).toBe('POST');
      expect(req.request.url).not.toContain('aaee3cd4');
      req.flush(DISPARO);

      expect(visto).toEqual(DISPARO);
    });

    it('a mensagem livre vai no corpo', () => {
      api.enviarMensagem('Sua guia vence amanhã.').subscribe();

      const req = httpMock.expectOne('/notificacao/enviar');
      expect(req.request.body).toEqual({ mensagem: 'Sua guia vence amanhã.' });
      req.flush(DISPARO);
    });
  });

  /**
   * **`enviados: 0` é sucesso**, não erro — quer dizer "não havia nada a avisar". Confundir os
   * dois é o defeito que o antigo `indisponivel` existia para evitar.
   */
  it('zero enviados chega como resposta, não como falha', () => {
    let visto: DisparoNotificacao | undefined;
    let falhou = false;
    api.notificarProximasObrigacoes().subscribe({
      next: (d) => (visto = d),
      error: () => (falhou = true),
    });

    httpMock.expectOne('/notificacao/proximas-obrigacoes').flush({
      enviados: 0,
      urgentes: 0,
      notificacaoId: 'x',
    });

    expect(falhou).toBe(false);
    expect(visto?.enviados).toBe(0);
  });

  describe('histórico', () => {
    /** Array mais `X-Total-Count`, como a carteira — **não** `Page<T>`. */
    it('lê o total do header, não do tamanho da lista', () => {
      let visto: { itens: NotificacaoRegistrada[]; total: number } | undefined;
      api.historico().subscribe((h) => (visto = h));

      httpMock
        .expectOne('/api/notificacao')
        .flush([REGISTRO], { headers: { 'X-Total-Count': '37' } });

      expect(visto?.itens).toHaveLength(1);
      expect(visto?.total).toBe(37);
    });

    it('sem o header, cai no tamanho da lista', () => {
      let visto: { total: number } | undefined;
      api.historico().subscribe((h) => (visto = h));

      httpMock.expectOne('/api/notificacao').flush([REGISTRO]);

      expect(visto?.total).toBe(1);
    });
  });

  /**
   * O escritório cobra pelo cliente escolhido na carteira. Aqui o id no caminho é de **outra
   * pessoa**, e é legítimo — produtor fora da carteira responde 404.
   */
  describe('contador — o id no caminho é o do cliente', () => {
    it('cobra as próximas obrigações do cliente', () => {
      api.cobrarProximasObrigacoes('p-1').subscribe();

      const req = httpMock.expectOne('/contador/produtores/p-1/notificacao/proximas-obrigacoes');
      expect(req.request.method).toBe('POST');
      req.flush(DISPARO);
    });

    it('lê o histórico que o escritório disparou ao cliente', () => {
      api.historicoDoCliente('p-1').subscribe();

      httpMock
        .expectOne('/api/contador/produtores/p-1/notificacao')
        .flush([REGISTRO], { headers: { 'X-Total-Count': '1' } });
    });
  });

  describe('as falhas têm nome', () => {
    /**
     * Produtor sem WhatsApp **não é "nada pendente"**: a tela tem de pedir o número. Dizer que não
     * há pendência com uma guia vencida na mesma página é a mentira que a #107 apagou.
     */
    it('422 vira CONTATO_AUSENTE', () => {
      let erro: NotificacaoError | undefined;
      api.notificarProximasObrigacoes().subscribe({ error: (e) => (erro = e) });

      httpMock
        .expectOne('/notificacao/proximas-obrigacoes')
        .flush(
          { errors: [{ code: 'CONTATO_AUSENTE', message: 'Produtor sem WhatsApp.' }] },
          { status: 422, statusText: 'Unprocessable Entity' },
        );

      expect(erro).toBeInstanceOf(NotificacaoError);
      expect(erro?.codigo).toBe('CONTATO_AUSENTE');
      expect(erro?.message).toBe('Produtor sem WhatsApp.');
    });

    it('429 vira LIMITE_NOTIFICACOES e guarda o Retry-After', () => {
      let erro: NotificacaoError | undefined;
      api.notificarTodosAtrasados().subscribe({ error: (e) => (erro = e) });

      httpMock
        .expectOne('/notificacao/todos-atrasados')
        .flush(
          { errors: [{ code: 'LIMITE_NOTIFICACOES', message: 'Muitos disparos.' }] },
          { status: 429, statusText: 'Too Many Requests', headers: { 'Retry-After': '900' } },
        );

      expect(erro?.codigo).toBe('LIMITE_NOTIFICACOES');
      expect(erro?.retryAfterSegundos).toBe(900);
    });

    it('o resto chega como DESCONHECIDO, sem inventar motivo', () => {
      let erro: NotificacaoError | undefined;
      api.notificarProximasObrigacoes().subscribe({ error: (e) => (erro = e) });

      httpMock
        .expectOne('/notificacao/proximas-obrigacoes')
        .flush(null, { status: 500, statusText: 'Server Error' });

      expect(erro?.codigo).toBe('DESCONHECIDO');
      expect(erro?.status).toBe(500);
    });

    /** A falha **sobe**: o cliente antigo a transformava em `{ enviados: 0 }` e a tela mentia. */
    it('a falha não vira resposta de sucesso', () => {
      let visto: unknown = 'nada';
      api.notificarProximasObrigacoes().subscribe({
        next: (d) => (visto = d),
        error: () => undefined,
      });

      httpMock
        .expectOne('/notificacao/proximas-obrigacoes')
        .flush(null, { status: 422, statusText: 'Unprocessable Entity' });

      expect(visto).toBe('nada');
    });
  });
});
