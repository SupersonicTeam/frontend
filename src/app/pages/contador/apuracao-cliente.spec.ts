import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApuracaoCliente, mesesDoSeletor } from './apuracao-cliente';

const apuracao = (periodo: string, over: Record<string, unknown> = {}) => ({
  periodo,
  inicio: `${periodo}-01`,
  fim: `${periodo}-28`,
  parcial: false,
  status: 'ABERTO',
  debitoIbs: 100,
  debitoCbs: 50,
  creditoIbs: 10,
  creditoCbs: 5,
  saldoIbs: 90,
  saldoCbs: 45,
  totalNotas: 3,
  dataFechamento: null,
  ...over,
});

/**
 * Os números do cliente na ficha (#138).
 *
 * O que estes testes guardam: toda chamada com o `produtorId` da ficha, nunca a rota do produtor;
 * os estados de vazio e erro; e o "Reabrir" só para administrador e contador.
 */
describe('ApuracaoCliente', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ApuracaoCliente],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function abrir(funcao = 'CONTADOR') {
    const fixture = TestBed.createComponent(ApuracaoCliente);
    fixture.componentRef.setInput('produtorId', 'p1');
    fixture.detectChanges();
    httpMock.expectOne('/escritorio').flush({ minhaFuncao: funcao });
    return fixture;
  }

  function responder(ap: object) {
    httpMock.expectOne((r) => r.url === '/contador/produtores/p1/apuracao').flush(ap);
    httpMock
      .expectOne((r) => r.url === '/contador/produtores/p1/creditos')
      .flush({
        creditoTotal: 15,
        quantidadeNotas: 1,
      });
    httpMock
      .expectOne((r) => r.url === '/contador/produtores/p1/relatorios/conformidade')
      .flush({ saldoAPagar: 135, quantidadeSaidas: 2, quantidadeEntradas: 1 });
  }

  it('abre no mes que acabou, com as tres rotas do cliente e nenhuma do produtor', () => {
    const fixture = abrir();
    const periodo = mesesDoSeletor()[0]!.valor;
    expect(fixture.componentInstance.periodo()).toBe(periodo);

    const todas = httpMock.match(() => true);
    expect(todas.every((r) => r.request.url.startsWith('/contador/produtores/p1/'))).toBe(true);
    expect(todas.every((r) => r.request.params.get('periodo') === periodo)).toBe(true);
    todas.forEach((r) => r.flush(r.request.url.endsWith('/apuracao') ? apuracao(periodo) : {}));
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Saldo');
  });

  it('mes sem nota diz "Sem notas emitidas"', () => {
    const fixture = abrir();
    responder(apuracao('2026-10', { totalNotas: 0 }));
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Sem notas emitidas');
  });

  it('falha da apuracao mostra o erro com "tentar novamente"', () => {
    const fixture = abrir();
    httpMock
      .expectOne((r) => r.url === '/contador/produtores/p1/apuracao')
      .flush('x', { status: 500, statusText: 'erro' });
    httpMock.match(() => true).forEach((r) => r.flush({}));
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Não foi possível carregar a apuração',
    );
  });

  it('trocar de mes descarta a resposta do mes anterior', () => {
    const fixture = abrir();
    const cmp = fixture.componentInstance;
    const velhas = httpMock.match(() => true);
    const outro = cmp.meses[1]!.valor;

    cmp.mudarPeriodo(outro);
    responder(apuracao(outro, { saldoIbs: 7 }));
    velhas.forEach((r) => r.flush(apuracao('velho', { saldoIbs: 999 })));

    expect(cmp.apuracao()?.saldoIbs).toBe(7);
  });

  it('o contador ve "Reabrir" no mes fechado, e ele chama a rota do cliente', () => {
    const fixture = abrir('CONTADOR');
    const cmp = fixture.componentInstance;
    responder(apuracao(cmp.periodo(), { status: 'FECHADO', dataFechamento: '2026-11-01' }));
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Reabrir apuração');

    cmp.reabrir();
    const req = httpMock.expectOne(`/contador/produtores/p1/apuracao/${cmp.periodo()}/reabrir`);
    expect(req.request.method).toBe('POST');
    req.flush(apuracao(cmp.periodo(), { status: 'ABERTO' }));
    expect(cmp.fechada()).toBe(false);
  });

  it('o assistente nao ve "Reabrir": o servidor responderia 403', () => {
    const fixture = abrir('ASSISTENTE');
    responder(apuracao(fixture.componentInstance.periodo(), { status: 'FECHADO' }));
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Reabrir apuração');
  });

  it('sem saber a funcao (rota falhou), o botao tambem fica escondido', () => {
    const fixture = TestBed.createComponent(ApuracaoCliente);
    fixture.componentRef.setInput('produtorId', 'p1');
    fixture.detectChanges();
    httpMock.expectOne('/escritorio').flush('x', { status: 500, statusText: 'erro' });
    responder(apuracao(fixture.componentInstance.periodo(), { status: 'FECHADO' }));
    fixture.detectChanges();

    expect(fixture.componentInstance.podeReabrir()).toBe(false);
  });

  it('o PDF vem da rota do cliente, com o mes escolhido', () => {
    const fixture = abrir();
    const cmp = fixture.componentInstance;
    responder(apuracao(cmp.periodo()));

    cmp.baixarPdf();
    const req = httpMock.expectOne(
      (r) => r.url === '/contador/produtores/p1/relatorios/conformidade/pdf',
    );
    expect(req.request.params.get('periodo')).toBe(cmp.periodo());
    req.flush(new Blob(['%PDF']));
  });
});
