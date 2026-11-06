import { vi } from 'vitest';
import { AuthApi } from '@services/auth/data-access/auth.service';
import { of } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PrazosProdutor } from './prazos-produtor';

/**
 * O calendário tinha **duas fontes para a mesma guia**: `/calendario-fiscal/{id}/vencimentos` e
 * `/contador/guias`. No backend as duas saem da mesma tabela (`CalendarioFiscalService` mapeia
 * `GuiaFiscalRepository`), então toda guia aparecia duas vezes na tela — e o bug de status do
 * `/calendario-fiscal` ficava escondido, porque a cópia vinda do ContadorApi trazia o status certo.
 *
 * Agora a fonte é uma só. O que estes testes protegem: o status real chega inteiro, o servidor é
 * quem recorta a janela, e a falha de uma fonte não apaga a outra.
 */

/**
 * Identidade de teste (issue #106).
 *
 * A tela resolve o id do produtor em `GET /auth/me` em vez de carregar um UUID cravado. Estes
 * testes sao sobre o que a tela FAZ com o id, nao sobre como ela o obtem -- isso tem spec propria
 * em `AuthApi`. Entao aqui ele e dependencia injetada, e o `httpMock` fica so com as rotas que
 * cada teste realmente examina.
 */
const SESSAO = {
  usuarioId: 'produtor-de-teste',
  papel: 'PRODUTOR' as const,
  nome: 'João da Silva Produtor',
};
const authFalso = {
  carregar: () => of(SESSAO),
  sessao: () => SESSAO,
  limpar: () => undefined,
};

describe('PrazosProdutor', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PrazosProdutor],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthApi, useValue: authFalso },
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // O historico de avisos (#94) e carregado na abertura da tela e nao e assunto destes testes,
    // que sao sobre prazos. Drenado aqui, num lugar so, em vez de em cada `createComponent`.
    httpMock.match((r) => r.url === '/api/notificacao').forEach((r) => r.flush([]));
    httpMock.verify();
  });

  /**
   * Era o flush da segunda fonte do calendario. Virou **guarda**.
   *
   * A tela buscava as solicitacoes do contador a parte, em `/contador/pendencias?produtorId=` --
   * rota que nunca existiu e respondia 404 em toda abertura. Desde a backend#180 o proprio
   * `/calendario-fiscal` devolve a pendencia com prazo como `tipo: "solicitacao"`, entao nao ha
   * segunda fonte: cada chamada deste helper afirma que a rota morta ficou morta.
   */
  function flushContadorVazio() {
    expect(httpMock.match((r) => r.url.includes('/contador')).length).toBe(0);
  }

  /** `AAAA-MM-DD` de `n` dias a partir de hoje (negativo para trás). */
  function emDias(n: number) {
    const d = new Date();
    d.setDate(d.getDate() + n);
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${mes}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /** `AAAA-MM` de `n` meses a partir de hoje (negativo para trás). */
  function mesRelativo(n: number) {
    const hoje = new Date();
    const d = new Date(hoje.getFullYear(), hoje.getMonth() + n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  it('pede ao servidor a janela inteira de −3/+3 meses, numa requisição só', () => {
    const fixture = TestBed.createComponent(PrazosProdutor);
    fixture.detectChanges();

    // A tela só pedia o mês corrente, e por isso não mostrava guia vencida em mês anterior —
    // justamente o que mais precisa ser visto numa tela de prazos. O recorte segue do servidor:
    // sem `de`/`ate` o backend devolve ±12 meses, e fora disso a lista volta vazia, que na tela
    // é idêntico a "não há nada a pagar".
    const req = httpMock.expectOne((r) => r.url.includes('/calendario-fiscal'));
    expect(req.request.params.get('de')).toBe(`${mesRelativo(-3)}-01`);
    expect(req.request.params.get('ate')).toMatch(new RegExp(`^${mesRelativo(3)}-\\d{2}$`));
    req.flush([]);
    flushContadorVazio();
  });

  it('a descrição entra na frase sem ponto duplo e sem apagar a sigla', () => {
    const fixture = TestBed.createComponent(PrazosProdutor);
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url.includes('/calendario-fiscal')).flush([]);
    flushContadorVazio();
    const cmp = fixture.componentInstance;
    const prazo = (descricao: string) =>
      cmp.frasePrazo({
        id: 'fech:2026-11-30',
        titulo: 'Fechamento da apuração do mês',
        descricao,
        dataVencimento: emDias(10),
        tipo: 'obrigacao',
        status: null,
      });

    const fechamento = prazo('A apuração de IBS/CBS do mês fecha sozinha no último dia.');
    expect(fechamento).toMatch(/, a apuração de IBS\/CBS do mês fecha sozinha no último dia\.$/);
    expect(fechamento).not.toContain('..');
    expect(prazo('DITR, declaração do ITR.')).toMatch(/, DITR, declaração do ITR\.$/);
  });

  it('uma guia paga aparece como paga — não como pendente', () => {
    // Era o bug: o mapeamento só reconhecia "vencido" e jogava todo o resto em "pendente", então
    // guia quitada seguia cobrando atenção no calendário. O próprio DTO do backend registra isso.
    const fixture = TestBed.createComponent(PrazosProdutor);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();

    httpMock
      .expectOne((r) => r.url.includes('/calendario-fiscal'))
      .flush([
        {
          id: 'g2',
          evento: 'Guia FUNRURAL',
          descricao: null,
          dataVencimento: '2026-06-10',
          tipo: 'imposto',
          status: 'pago',
          valor: 320,
        },
      ]);
    flushContadorVazio();

    const guia = cmp.vencimentos().find((v) => v.id === 'g2');
    expect(guia?.status).toBe('pago');
    expect(guia?.tipo).toBe('imposto');
    expect(guia?.valor).toBe(320);
  });

  it('guia vencida continua vencida', () => {
    const fixture = TestBed.createComponent(PrazosProdutor);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();

    httpMock
      .expectOne((r) => r.url.includes('/calendario-fiscal'))
      .flush([
        {
          id: 'g9',
          evento: 'Guia ICMS',
          descricao: null,
          dataVencimento: '2026-05-20',
          tipo: 'imposto',
          status: 'vencido',
          valor: 110,
        },
      ]);
    flushContadorVazio();

    expect(cmp.vencimentos()[0].status).toBe('vencido');
  });

  it('a mesma guia não aparece duas vezes — o ContadorApi não é mais consultado para guias', () => {
    const fixture = TestBed.createComponent(PrazosProdutor);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();

    httpMock
      .expectOne((r) => r.url.includes('/calendario-fiscal'))
      .flush([
        {
          id: 'g1',
          evento: 'Guia ICMS',
          descricao: null,
          dataVencimento: '2026-08-10',
          tipo: 'imposto',
          status: 'pendente',
          valor: 700,
        },
      ]);
    expect(httpMock.match((r) => r.url.includes('/contador')).length).toBe(0);
    expect(cmp.vencimentos().length).toBe(1);
  });

  it('item sem id ou sem data é descartado — nada de prazo fiscal inventado', () => {
    const fixture = TestBed.createComponent(PrazosProdutor);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();

    // Antes: id virava `Math.random()` e a data ausente virava **hoje** — a tela mostrava ao
    // produtor um vencimento para hoje que o servidor nunca informou.
    httpMock
      .expectOne((r) => r.url.includes('/calendario-fiscal'))
      .flush([
        {
          id: '',
          evento: 'Sem id',
          dataVencimento: '2026-08-10',
          tipo: 'imposto',
          status: 'pendente',
        },
        { id: 'x1', evento: 'Sem data', dataVencimento: '', tipo: 'imposto', status: 'pendente' },
        {
          id: 'ok',
          evento: 'Guia ICMS',
          descricao: null,
          dataVencimento: '2026-08-10',
          tipo: 'imposto',
          status: 'pendente',
          valor: 50,
        },
      ]);
    flushContadorVazio();

    expect(cmp.vencimentos().map((v) => v.id)).toEqual(['ok']);
  });

  /**
   * A resiliencia de duas fontes saiu junto com a segunda fonte.
   *
   * Havia dois testes aqui provando que uma falha em `/calendario-fiscal` nao escondia as
   * solicitacoes do contador, em qualquer ordem de resposta. A premissa deles era a busca paralela
   * em `/contador/pendencias` -- que respondia 404, ou seja, a "segunda fonte" estava sempre
   * vazia e a resiliencia protegia nada. Agora ha uma fonte so, e o que importa provar e que a
   * pendencia **chega por ela**.
   */
  it('a pendencia com prazo chega pelo proprio calendario, como tipo solicitacao', () => {
    const fixture = TestBed.createComponent(PrazosProdutor);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();

    httpMock
      .expectOne((r) => r.url.includes('/calendario-fiscal'))
      .flush([
        {
          id: '615ff9e2-418f-4aa5-9276-24ff369a7538',
          evento: 'Comprovantes de frete de setembro',
          descricao: null,
          dataVencimento: emDias(3),
          tipo: 'solicitacao',
          status: 'pendente',
        },
      ]);
    flushContadorVazio();

    expect(cmp.vencimentos().map((v) => v.tipo)).toEqual(['solicitacao']);
  });

  it('falha em /calendario-fiscal acende o erro, e nao sobra fonte para disfarcar', () => {
    const fixture = TestBed.createComponent(PrazosProdutor);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();

    httpMock
      .expectOne((r) => r.url.includes('/calendario-fiscal'))
      .flush('erro', { status: 500, statusText: 'Server Error' });
    flushContadorVazio();

    expect(cmp.vencimentosErro()).toBe(true);
    expect(cmp.vencimentos()).toEqual([]);
  });

  it('em sucesso, vencimentosErro fica false', () => {
    const fixture = TestBed.createComponent(PrazosProdutor);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();

    httpMock.expectOne((r) => r.url.includes('/calendario-fiscal')).flush([]);
    flushContadorVazio();

    expect(cmp.vencimentosErro()).toBe(false);
  });

  it('retry() limpa o erro e busca o mês de novo', () => {
    const fixture = TestBed.createComponent(PrazosProdutor);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();

    httpMock
      .expectOne((r) => r.url.includes('/calendario-fiscal'))
      .flush('erro', { status: 500, statusText: 'Server Error' });
    flushContadorVazio();
    expect(cmp.vencimentosErro()).toBe(true);

    cmp.retry();
    expect(cmp.vencimentosErro()).toBe(false);

    httpMock
      .expectOne((r) => r.url.includes('/calendario-fiscal'))
      .flush([
        {
          id: 'v1',
          evento: 'ITR',
          descricao: null,
          dataVencimento: '2026-09-30',
          tipo: 'imposto',
          status: 'pendente',
          valor: 500,
        },
      ]);
    flushContadorVazio();

    expect(cmp.vencimentosErro()).toBe(false);
    expect(cmp.vencimentos().length).toBe(1);
  });

  it('andar dentro da janela não custa requisição; sair dela, sim', () => {
    const fixture = TestBed.createComponent(PrazosProdutor);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();

    httpMock.expectOne((r) => r.url.includes('/calendario-fiscal')).flush([]);
    flushContadorVazio();

    // Os sete meses da janela já vieram na carga — inclusive os vazios, senão a grade pediria
    // de novo um mês que a resposta acabou de dizer que não tem nada.
    cmp.mesAnterior();
    cmp.mesAnterior();
    cmp.mesAnterior();
    expect(httpMock.match((r) => r.url.includes('/calendario-fiscal')).length).toBe(0);

    // O quarto mês para trás está fora da janela: aí sim o servidor é consultado.
    cmp.mesAnterior();
    const req = httpMock.expectOne((r) => r.url.includes('/calendario-fiscal'));
    expect(req.request.params.get('de')).toBe(`${mesRelativo(-4)}-01`);
    req.flush([]);

    // E o mês que acabou de vir fica guardado: voltar para ele não custa outra requisição.
    cmp.proximoMes();
    cmp.mesAnterior();
    expect(httpMock.match((r) => r.url.includes('/calendario-fiscal')).length).toBe(0);
  });

  it('ordena por data e separa o atrasado do que ainda vai vencer', () => {
    const fixture = TestBed.createComponent(PrazosProdutor);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();

    const guia = (id: string, data: string, status: string, valor: number) => ({
      id,
      evento: `Guia ${id}`,
      descricao: null,
      dataVencimento: data,
      tipo: 'imposto',
      status,
      valor,
    });
    // De propósito fora de ordem na resposta: a lista antiga mostrava 31/10 antes de 20/10.
    httpMock
      .expectOne((r) => r.url.includes('/calendario-fiscal'))
      .flush([
        guia('DARF', emDias(24), 'pendente', 640.9),
        guia('ICMS', emDias(13), 'pendente', 2310),
        guia('GPS', emDias(-27), 'vencido', 890),
        guia('FUNRURAL', emDias(-17), 'pago', 1840.55),
      ]);
    flushContadorVazio();

    expect(cmp.prazos().map((v) => v.id)).toEqual(['GPS', 'FUNRURAL', 'ICMS', 'DARF']);
    expect(cmp.atrasados().map((v) => v.id)).toEqual(['GPS']);
    expect(cmp.totalAtrasado()).toBe(890);
    // A paga do mês passado não conta como atraso, mesmo com data no passado.
    expect(cmp.jaPagos().map((v) => v.id)).toEqual(['FUNRURAL']);
    expect(cmp.gruposDePrazo().map((g) => g.chave)).toEqual(['atrasados', 'a-vencer', 'pagos']);
  });

  it('data no passado e sem pagamento é atraso, mesmo que o status ainda diga pendente', () => {
    // Quem vira a guia para `vencido` é um job diário: entre a meia-noite e a rodada do job,
    // uma guia vencida ainda chega como `pendente`. A data não mente.
    const fixture = TestBed.createComponent(PrazosProdutor);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();

    httpMock
      .expectOne((r) => r.url.includes('/calendario-fiscal'))
      .flush([
        {
          id: 'atrasada',
          evento: 'Guia ICMS',
          descricao: null,
          dataVencimento: `${mesRelativo(-1)}-15`,
          tipo: 'imposto',
          status: 'pendente',
          valor: 100,
        },
      ]);
    flushContadorVazio();

    expect(cmp.atrasados().map((v) => v.id)).toEqual(['atrasada']);
    expect(cmp.proximoPrazo()).toBeNull();
  });

  it('o próximo prazo é o primeiro que ainda vai vencer, e diz em quantos dias', () => {
    const fixture = TestBed.createComponent(PrazosProdutor);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();

    httpMock
      .expectOne((r) => r.url.includes('/calendario-fiscal'))
      .flush([
        {
          id: 'longe',
          evento: 'Guia DARF',
          descricao: null,
          dataVencimento: emDias(20),
          tipo: 'imposto',
          status: 'pendente',
          valor: 50,
        },
        {
          id: 'perto',
          evento: 'Guia ICMS',
          descricao: null,
          dataVencimento: emDias(2),
          tipo: 'imposto',
          status: 'pendente',
          valor: 70,
        },
      ]);
    flushContadorVazio();
    fixture.detectChanges();

    expect(cmp.proximoPrazo()?.id).toBe('perto');
    expect(cmp.rotuloPrazo(emDias(2))).toBe('em 2 dias');
    expect(cmp.rotuloPrazo(emDias(1))).toBe('vence amanhã');
    expect(cmp.rotuloPrazo(emDias(0))).toBe('vence hoje');
    expect(cmp.rotuloPrazo(emDias(-1))).toBe('venceu ontem');
    expect(cmp.rotuloPrazo(emDias(-27))).toBe('venceu há 27 dias');
    // Dentro de três dias o rótulo já muda de tom.
    expect(cmp.classeRotulo(emDias(2), 'pendente')).toContain('aviso');
    expect(cmp.classeRotulo(emDias(-1), 'pendente')).toContain('perigo');
    // O card "O proximo prazo" saiu: ele repetia, num bloco proprio, o primeiro item da lista.
    // Agora o proximo e simplesmente o primeiro prazo abaixo do eixo de hoje.
    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Hoje é');
    expect(texto).toContain('em 2 dias');
    expect(texto).not.toContain('O próximo prazo');
  });

  /**
   * Relógio congelado em 15/10/2026, e não `new Date()`.
   *
   * A versão anterior montava o mês a partir de hoje e afirmava que o dia 28 seria "a vencer"
   * "no pior caso em que o teste roda dia 28, porque a comparação inclui hoje". Não inclui:
   * `diaClass` devolve o estilo do **dia selecionado** antes de olhar o prazo, e o dia selecionado
   * começa sendo hoje. O teste passou até 27/10/2026 e virou vermelho sozinho em 28/10.
   *
   * Com a data fixa, os três dias escolhidos têm papel estável: o 5 já passou e está pago, o 28
   * ainda vai vencer, o 14 não tem nada — e nenhum deles é "hoje".
   */
  it('o dia com prazo vira célula colorida pela situação, não um ponto de 6px', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 0));
    try {
      executarTesteDeCorDoDia();
    } finally {
      vi.useRealTimers();
    }
  });

  function executarTesteDeCorDoDia() {
    const fixture = TestBed.createComponent(PrazosProdutor);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();

    const hoje = new Date();
    const mes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
    const guia = (id: string, dia: string, status: string) => ({
      id,
      evento: `Guia ${id}`,
      descricao: null,
      dataVencimento: `${mes}-${dia}`,
      tipo: 'imposto',
      status,
      valor: 100,
    });
    httpMock
      .expectOne((r) => r.url.includes('/calendario-fiscal'))
      .flush([guia('paga', '05', 'pago'), guia('futura', '28', 'pendente')]);
    flushContadorVazio();
    fixture.detectChanges();

    // Com o relógio em 15/10, o 28 ainda vai vencer e não é o dia selecionado.
    expect(cmp.diaClass(28)).toContain('aviso');
    expect(cmp.diaClass(5)).toContain('sucesso');
    // Dia sem nada não ganha cor nenhuma.
    expect(cmp.diaClass(14)).not.toContain('aviso');
    expect(cmp.diaClass(14)).not.toContain('sucesso');
    expect(cmp.diaClass(14)).not.toContain('perigo');
  }

  // O grupo lembrava da versao antiga "mostrando em que data mandar cada coisa". A celula so
  // pintava: o nome do que vencia morava num painel lateral, atras de um clique.
  it('a célula diz o que vence, não só que algo vence', () => {
    const fixture = TestBed.createComponent(PrazosProdutor);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();

    const hoje = new Date();
    const mes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
    httpMock
      .expectOne((r) => r.url.includes('/calendario-fiscal'))
      .flush([
        {
          id: 'g1',
          evento: 'Guia ICMS',
          descricao: null,
          dataVencimento: `${mes}-20`,
          tipo: 'imposto',
          status: 'pendente',
          valor: 2310,
        },
        {
          id: 'g2',
          evento: 'Guia DARF',
          descricao: null,
          dataVencimento: `${mes}-20`,
          tipo: 'imposto',
          status: 'pendente',
          valor: 640,
        },
      ]);
    flushContadorVazio();
    fixture.detectChanges();

    // "Guia ICMS" vira "ICMS": na celula cabe a sigla, e e ela que distingue uma guia da outra.
    expect(cmp.diasComPrazo()[20].rotulo).toBe('ICMS');
    expect(cmp.diasComPrazo()[20].quantidade).toBe(2);

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('ICMS');
  });

  /**
   * **A data fica presa aqui, e o motivo custou uma manhã.**
   *
   * O teste usava "ontem" de verdade. No dia 1º de qualquer mês, ontem cai no mês **anterior** —
   * fora da grade que a tela desenha —, então `diaClass(31)` voltava ao padrão e a suíte amanhecia
   * vermelha sozinha, sem ninguém ter tocado no código. Aconteceu em 01/11/2026.
   *
   * Com o relógio preso num dia do meio do mês, "ontem" continua no mesmo mês e o teste passa a
   * medir o que diz medir: que o atraso manda na cor, mesmo com uma guia paga no mesmo dia.
   */
  it('o atraso manda na cor do dia, mesmo com uma guia paga no mesmo dia', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 0));

    // O alívio de ter pago uma não apaga o problema da outra.
    const fixture = TestBed.createComponent(PrazosProdutor);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();

    const ontem = new Date();
    ontem.setDate(ontem.getDate() - 1);
    const data = `${ontem.getFullYear()}-${String(ontem.getMonth() + 1).padStart(2, '0')}-${String(ontem.getDate()).padStart(2, '0')}`;
    const dia = ontem.getDate();

    httpMock
      .expectOne((r) => r.url.includes('/calendario-fiscal'))
      .flush([
        {
          id: 'a',
          evento: 'GPS',
          descricao: null,
          dataVencimento: data,
          tipo: 'imposto',
          status: 'pendente',
          valor: 10,
        },
        {
          id: 'b',
          evento: 'FUNRURAL',
          descricao: null,
          dataVencimento: data,
          tipo: 'imposto',
          status: 'pago',
          valor: 20,
        },
      ]);
    flushContadorVazio();
    fixture.detectChanges();

    expect(cmp.diaClass(dia)).toContain('perigo');
    expect(cmp.diasComPrazo()[dia].quantidade).toBe(2);
    expect(cmp.rotuloDoDia(dia)).toContain('2 prazos');
    expect(cmp.rotuloDoDia(dia)).toContain('atraso');

    vi.useRealTimers();
  });

  it('o cabeçalho da grade diz quantos prazos o mês tem', () => {
    const fixture = TestBed.createComponent(PrazosProdutor);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url.includes('/calendario-fiscal')).flush([]);
    flushContadorVazio();
    fixture.detectChanges();

    expect(cmp.prazosNoMes()).toBe(0);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('nada vence aqui');
  });

  it('"Voltar para hoje" só aparece quando a grade saiu do mês corrente', () => {
    const fixture = TestBed.createComponent(PrazosProdutor);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url.includes('/calendario-fiscal')).flush([]);
    flushContadorVazio();
    fixture.detectChanges();

    expect(cmp.foraDoMesCorrente()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Voltar para hoje');

    cmp.mesAnterior();
    fixture.detectChanges();
    expect(cmp.foraDoMesCorrente()).toBe(true);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Voltar para hoje');

    cmp.irParaHoje();
    expect(cmp.foraDoMesCorrente()).toBe(false);
  });

  it('o nome do mês não vira Title Case', () => {
    const fixture = TestBed.createComponent(PrazosProdutor);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url.includes('/calendario-fiscal')).flush([]);
    flushContadorVazio();

    // A classe `capitalize` do Tailwind subia toda palavra: saía "Outubro De 2026".
    expect(cmp.nomeMes()).not.toMatch(/ De /);
    expect(cmp.nomeMes()).toMatch(/^[A-Z]/);
    expect(cmp.nomeDiaSelecionado()).not.toMatch(/ De /);
  });

  /**
   * Obrigacao nao e guia (backend#181).
   *
   * O calendario passou a devolver obrigacoes -- `tipo: "obrigacao"`, sem status e sem valor. Como
   * o cliente supunha `pendente`, a data no passado as transformava em atrasadas, e o aviso
   * "guia atrasada costuma ter multa e juros" saia no **primeiro atrasado qualquer**: o
   * Fechamento da apuracao aparecia com conselho de pagamento para algo que nao se paga.
   */
  describe('obrigacoes (#181)', () => {
    const obrigacaoAtrasada = {
      id: '00000000-0000-4000-8181-0000000000ff:' + emDias(-5),
      evento: 'Fechamento da apuracao do mes',
      descricao: null,
      dataVencimento: emDias(-5),
      tipo: 'obrigacao',
      status: null,
      valor: null,
      periodicidade: 'MENSAL',
      origem: 'RN004 (apuracao mensal de IBS/CBS)',
    };
    const guiaAtrasada = {
      id: 'g1',
      evento: 'Guia GPS',
      descricao: null,
      dataVencimento: emDias(-2),
      tipo: 'imposto',
      status: 'pendente',
      valor: 890,
    };

    function abrirCom(itens: unknown[]) {
      const fixture = TestBed.createComponent(PrazosProdutor);
      fixture.detectChanges();
      httpMock.expectOne((r) => r.url.includes('/calendario-fiscal')).flush(itens);
      flushContadorVazio();
      fixture.detectChanges();
      return fixture.componentInstance;
    }

    it('o aviso de multa e juros se cola na primeira GUIA, nao no primeiro atrasado', () => {
      // A obrigacao vem antes na lista (venceu ha mais tempo), e era nela que o aviso caia.
      const cmp = abrirCom([obrigacaoAtrasada, guiaAtrasada]);

      expect(cmp.atrasados()[0]!.tipo).toBe('obrigacao');
      expect(cmp.primeiraGuiaAtrasada()?.id).toBe('g1');
    });

    it('so com obrigacao atrasada, o aviso de multa e juros nao aparece', () => {
      const cmp = abrirCom([obrigacaoAtrasada]);

      expect(cmp.atrasados().length).toBe(1);
      expect(cmp.temGuiaAtrasada()).toBe(false);
      expect(cmp.primeiraGuiaAtrasada()).toBeNull();
    });

    it('a obrigacao e "A fazer", nunca "Vencido"', () => {
      const cmp = abrirCom([obrigacaoAtrasada]);

      expect(cmp.statusLabel(cmp.atrasados()[0]!.status)).toBe('A fazer');
      expect(cmp.statusColor(null)).not.toContain('perigo');
    });

    it('a obrigacao nao entra no total atrasado: nao ha o que somar', () => {
      const cmp = abrirCom([obrigacaoAtrasada, guiaAtrasada]);

      expect(cmp.totalAtrasado()).toBe(890);
    });

    it('a periodicidade sai em portugues, nao em caixa alta', () => {
      const cmp = abrirCom([obrigacaoAtrasada]);

      expect(cmp.rotuloPeriodicidade('MENSAL')).toBe('todo mês');
      expect(cmp.atrasados()[0]!.origem).toBe('RN004 (apuracao mensal de IBS/CBS)');
    });
  });

  /**
   * O histórico de avisos (#94) — prestação de contas do WhatsApp.
   *
   * O produtor dispara o aviso no topo desta tela; o registro do que saiu mora no fim dela.
   */
  describe('avisos enviados', () => {
    const aviso = (over: Partial<Record<string, unknown>> = {}) => ({
      id: 'n1',
      tipo: 'PROXIMAS_OBRIGACOES',
      canal: 'WHATSAPP',
      status: 'REGISTRADA',
      texto: 'AgroContabil: vencimentos dos proximos 7 dias.',
      quantidadeItens: 2,
      urgentes: 1,
      disparadoPor: 'PRODUTOR',
      criadoEm: '2026-10-31T19:01:20.196184Z',
      ...over,
    });

    /** Monta a tela drenando o calendário, para sobrar só o histórico. */
    function abrirCom(itens: unknown[]) {
      const fixture = TestBed.createComponent(PrazosProdutor);
      const cmp = fixture.componentInstance;
      fixture.detectChanges();
      httpMock.match((r) => r.url.includes('/calendario-fiscal')).forEach((r) => r.flush([]));
      httpMock.match((r) => r.url === '/api/notificacao').forEach((r) => r.flush(itens));
      fixture.detectChanges();
      return cmp;
    }

    it('busca o histórico na abertura e o mostra', () => {
      const cmp = abrirCom([aviso()]);

      expect(cmp.avisos()).toHaveLength(1);
      expect(cmp.carregandoAvisos()).toBe(false);
    });

    /**
     * **Falha em silêncio de propósito**: o histórico é periférico, e um erro vermelho aqui
     * roubaria a atenção de quem veio ver os próprios prazos.
     */
    it('falha do histórico não acende erro na tela', () => {
      const fixture = TestBed.createComponent(PrazosProdutor);
      const cmp = fixture.componentInstance;
      fixture.detectChanges();
      httpMock.match((r) => r.url.includes('/calendario-fiscal')).forEach((r) => r.flush([]));
      httpMock
        .match((r) => r.url === '/api/notificacao')
        .forEach((r) => r.flush(null, { status: 500, statusText: 'Server Error' }));

      expect(cmp.avisos()).toEqual([]);
      expect(cmp.carregandoAvisos()).toBe(false);
    });

    /** "Você pediu" e "o seu escritório enviou" são coisas diferentes, e o job diário é uma terceira. */
    it.each([
      ['PRODUTOR', 'Você pediu'],
      ['CONTADOR', 'O seu escritório enviou'],
      ['SISTEMA', 'Aviso automático'],
    ])('a origem %s é dita em português', (origem, esperado) => {
      expect(abrirCom([]).origemDoAviso(origem)).toBe(esperado);
    });

    /** Tipo ou origem que o backend inventar aparece cru — melhor que rótulo adivinhado. */
    it('o que não conhece sai com o nome do servidor', () => {
      const cmp = abrirCom([]);

      expect(cmp.rotuloDoAviso('ALGO_NOVO')).toBe('ALGO_NOVO');
      expect(cmp.origemDoAviso('ROBO')).toBe('ROBO');
    });

    it('traduz os tipos conhecidos', () => {
      const cmp = abrirCom([]);

      expect(cmp.rotuloDoAviso('PROXIMAS_OBRIGACOES')).toContain('próximos 7 dias');
      expect(cmp.rotuloDoAviso('TODOS_ATRASADOS')).toContain('atrasado');
    });
  });
});
