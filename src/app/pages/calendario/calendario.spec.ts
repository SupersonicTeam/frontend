import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CalendarioPage } from './calendario';

/**
 * O calendário tinha **duas fontes para a mesma guia**: `/calendario-fiscal/{id}/vencimentos` e
 * `/contador/guias`. No backend as duas saem da mesma tabela (`CalendarioFiscalService` mapeia
 * `GuiaFiscalRepository`), então toda guia aparecia duas vezes na tela — e o bug de status do
 * `/calendario-fiscal` ficava escondido, porque a cópia vinda do ContadorApi trazia o status certo.
 *
 * Agora a fonte é uma só. O que estes testes protegem: o status real chega inteiro, o servidor é
 * quem recorta a janela, e a falha de uma fonte não apaga a outra.
 */
describe('CalendarioPage', () => {
  let httpMock: HttpTestingController;

  /** Uma pendência do contador com prazo — a outra fonte do calendário. */
  const pendencia = (over: Record<string, unknown> = {}) => ({
    id: 'p1',
    produtorId: 'prod-1',
    titulo: 'Enviar notas de agosto',
    descricao: 'O escritório precisa das notas do mês',
    dataLimite: '2026-08-15',
    prioridade: 'alta',
    status: 'pendente',
    createdAt: '2026-08-01T00:00:00',
    updatedAt: '2026-08-01T00:00:00',
    ...over,
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CalendarioPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function flushContadorVazio() {
    httpMock.match((r) => r.url.includes('/contador')).forEach((r) => r.flush([]));
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
    const fixture = TestBed.createComponent(CalendarioPage);
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

  it('uma guia paga aparece como paga — não como pendente', () => {
    // Era o bug: o mapeamento só reconhecia "vencido" e jogava todo o resto em "pendente", então
    // guia quitada seguia cobrando atenção no calendário. O próprio DTO do backend registra isso.
    const fixture = TestBed.createComponent(CalendarioPage);
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
    const fixture = TestBed.createComponent(CalendarioPage);
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
    const fixture = TestBed.createComponent(CalendarioPage);
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
    httpMock.expectOne((r) => r.url === '/contador/pendencias').flush([]);

    expect(httpMock.match((r) => r.url === '/contador/guias').length).toBe(0);
    expect(cmp.vencimentos().length).toBe(1);
  });

  it('item sem id ou sem data é descartado — nada de prazo fiscal inventado', () => {
    const fixture = TestBed.createComponent(CalendarioPage);
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

  it('falha em /calendario-fiscal não esconde as solicitações do contador', () => {
    const fixture = TestBed.createComponent(CalendarioPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();

    httpMock
      .expectOne((r) => r.url.includes('/calendario-fiscal'))
      .flush('erro', { status: 500, statusText: 'Server Error' });
    httpMock.expectOne((r) => r.url === '/contador/pendencias').flush([pendencia()]);

    expect(cmp.vencimentosErro()).toBe(true);
    expect(cmp.vencimentos()).toEqual([
      {
        id: 'sol-p1',
        titulo: 'Enviar notas de agosto',
        descricao: 'O escritório precisa das notas do mês',
        dataVencimento: '2026-08-15',
        tipo: 'solicitacao',
        status: 'pendente',
        prioridade: 'alta',
      },
    ]);
  });

  it('a resiliência não depende de quem responde primeiro', () => {
    const fixture = TestBed.createComponent(CalendarioPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();

    // Ordem invertida: o contador resolve antes de `/calendario-fiscal` falhar.
    httpMock.expectOne((r) => r.url === '/contador/pendencias').flush([pendencia({ id: 'p3' })]);
    httpMock
      .expectOne((r) => r.url.includes('/calendario-fiscal'))
      .flush('erro', { status: 500, statusText: 'Server Error' });

    expect(cmp.vencimentosErro()).toBe(true);
    expect(cmp.vencimentos().map((v) => v.id)).toEqual(['sol-p3']);
  });

  it('em sucesso, vencimentosErro fica false', () => {
    const fixture = TestBed.createComponent(CalendarioPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();

    httpMock.expectOne((r) => r.url.includes('/calendario-fiscal')).flush([]);
    flushContadorVazio();

    expect(cmp.vencimentosErro()).toBe(false);
  });

  it('retry() limpa o erro e busca o mês de novo', () => {
    const fixture = TestBed.createComponent(CalendarioPage);
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
    const fixture = TestBed.createComponent(CalendarioPage);
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
    const fixture = TestBed.createComponent(CalendarioPage);
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
    const fixture = TestBed.createComponent(CalendarioPage);
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
    const fixture = TestBed.createComponent(CalendarioPage);
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
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('O próximo prazo');
  });

  it('o nome do mês não vira Title Case', () => {
    const fixture = TestBed.createComponent(CalendarioPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();
    httpMock.expectOne((r) => r.url.includes('/calendario-fiscal')).flush([]);
    flushContadorVazio();

    // A classe `capitalize` do Tailwind subia toda palavra: saía "Outubro De 2026".
    expect(cmp.nomeMes()).not.toMatch(/ De /);
    expect(cmp.nomeMes()).toMatch(/^[A-Z]/);
    expect(cmp.nomeDiaSelecionado()).not.toMatch(/ De /);
  });
});
