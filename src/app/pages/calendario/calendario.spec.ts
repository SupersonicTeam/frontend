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

  it('pede ao servidor a janela do mês que está na tela, em vez de filtrar depois', () => {
    const fixture = TestBed.createComponent(CalendarioPage);
    fixture.detectChanges();

    // Sem `de`/`ate` o backend devolve o mês corrente ±12 meses, e fora disso a lista volta
    // vazia — na tela, idêntico a "não há nada a pagar".
    const req = httpMock.expectOne((r) => r.url.includes('/calendario-fiscal'));
    const hoje = new Date();
    const mes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
    expect(req.request.params.get('de')).toBe(`${mes}-01`);
    expect(req.request.params.get('ate')).toMatch(new RegExp(`^${mes}-\\d{2}$`));
    req.flush([]);
    flushContadorVazio();
  });

  it('uma guia paga aparece como paga — não como pendente', () => {
    // Era o bug: o mapeamento só reconhecia "vencido" e jogava todo o resto em "pendente", então
    // guia quitada seguia cobrando atenção no calendário. O próprio DTO do backend registra isso.
    const fixture = TestBed.createComponent(CalendarioPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();

    httpMock.expectOne((r) => r.url.includes('/calendario-fiscal')).flush([
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

    httpMock.expectOne((r) => r.url.includes('/calendario-fiscal')).flush([
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

    httpMock.expectOne((r) => r.url.includes('/calendario-fiscal')).flush([
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
    httpMock.expectOne((r) => r.url.includes('/calendario-fiscal')).flush([
      { id: '', evento: 'Sem id', dataVencimento: '2026-08-10', tipo: 'imposto', status: 'pendente' },
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

    httpMock.expectOne((r) => r.url.includes('/calendario-fiscal')).flush([
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

  it('mudar de mês busca o mês novo; voltar não busca de novo', () => {
    const fixture = TestBed.createComponent(CalendarioPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();

    httpMock.expectOne((r) => r.url.includes('/calendario-fiscal')).flush([]);
    flushContadorVazio();

    cmp.mesAnterior();
    const req = httpMock.expectOne((r) => r.url.includes('/calendario-fiscal'));
    const anterior = new Date();
    anterior.setDate(1);
    anterior.setMonth(anterior.getMonth() - 1);
    const chave = `${anterior.getFullYear()}-${String(anterior.getMonth() + 1).padStart(2, '0')}`;
    expect(req.request.params.get('de')).toBe(`${chave}-01`);
    req.flush([]);

    // O mês já carregado fica guardado: voltar para ele não custa outra requisição.
    cmp.proximoMes();
    expect(httpMock.match((r) => r.url.includes('/calendario-fiscal')).length).toBe(0);
  });
});
