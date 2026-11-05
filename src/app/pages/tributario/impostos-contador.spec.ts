import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ImpostosContador } from './impostos-contador';
import { ToastService } from '@core/services/toast.service';
import type { ProdutorCarteira } from '@models/carteira.model';
import { vi } from 'vitest';

const cliente = (id: string, nomeCompleto: string) =>
  ({ id, nomeCompleto, vinculoId: `v-${id}`, situacaoVinculo: 'ATIVO' }) as ProdutorCarteira;

const apuracao = (periodo: string, status = 'ABERTO', saldo = 100) => ({
  periodo,
  status,
  debitoIbs: saldo,
  creditoIbs: 0,
  saldoIbs: saldo,
  debitoCbs: 0,
  creditoCbs: 0,
  saldoCbs: 0,
  totalNotas: 2,
  dataFechamento: status === 'FECHADO' ? '2026-10-05' : null,
});

/**
 * O Fechamento do contador (issue #136).
 *
 * Ele lia `/api/apuracao`, `/api/relatorios/conformidade` e `/api/notas`, que respondem 403 ao
 * escritório: a tela abria em erro e nunca mostrava número. Agora lê as rotas por cliente, e só
 * depois de um cliente escolhido.
 */
describe('ImpostosContador', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ImpostosContador],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function abrir() {
    const fixture = TestBed.createComponent(ImpostosContador);
    fixture.detectChanges();
    httpMock
      .expectOne((r) => r.url === '/contador/produtores')
      .flush([cliente('p1', 'Ana Produtora'), cliente('p2', 'Bruno')]);
    httpMock.expectOne('/escritorio').flush({ minhaFuncao: 'CONTADOR' });
    fixture.detectChanges();
    return fixture;
  }

  it('sem cliente nao pede nada e orienta a escolher', () => {
    const fixture = abrir();

    httpMock.expectNone(() => true);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Escolha um cliente para ver o fechamento',
    );
  });

  it('com cliente, apuracao, mes anterior, relatorio e notas vem das rotas do escritorio', () => {
    const fixture = abrir();
    const cmp = fixture.componentInstance;
    cmp.aoTrocarCliente(cliente('p1', 'Ana Produtora'));
    const periodo = cmp.periodo();

    const todas = httpMock.match(() => true);
    expect(todas.every((r) => r.request.url.startsWith('/contador/produtores/p1/'))).toBe(true);

    const apuracoes = todas.filter((r) => r.request.url === '/contador/produtores/p1/apuracao');
    expect(apuracoes.map((r) => r.request.params.get('periodo')).sort()).toHaveLength(2);
    const doMes = apuracoes.find((r) => r.request.params.get('periodo') === periodo)!;
    const anterior = apuracoes.find((r) => r.request.params.get('periodo') !== periodo)!;
    doMes.flush(apuracao(periodo, 'ABERTO', 300));
    anterior.flush(apuracao(anterior.request.params.get('periodo')!, 'FECHADO', 100));

    const relatorio = todas.find(
      (r) => r.request.url === '/contador/produtores/p1/relatorios/conformidade',
    )!;
    expect(relatorio.request.params.get('periodo')).toBe(periodo);
    relatorio.flush({ periodo, saldoAPagar: 300 });

    const notas = todas.find((r) => r.request.url === '/contador/produtores/p1/notas')!;
    // Tudo que nao e AUTORIZADA, inclusive o que espera o escritorio ou esta no meio da emissao.
    expect(notas.request.params.getAll('status')).toContain('AGUARDANDO_APROVACAO');
    expect(notas.request.params.getAll('status')).toContain('PENDENTE_SEFAZ');
    expect(notas.request.params.getAll('status')).not.toContain('AUTORIZADA');
    // Antes de as notas responderem, a tela nao sabe se o mes esta pronto.
    expect(cmp.prontoParaFechar()).toBe(false);
    notas.flush([]);
    expect(cmp.prontoParaFechar()).toBe(true);

    expect(cmp.apuracaoDoPeriodo()?.saldoIbs).toBe(300);
    expect(cmp.variacao()?.diferenca).toBe(200);
    expect(cmp.conta()?.saldoAPagar).toBe(300);
  });

  /** Abre p1 e responde tudo, com a apuracao do mes em `over`. Devolve o texto do fechamento. */
  function textoDoFechamento(over: Record<string, unknown>): string {
    const fixture = abrir();
    const cmp = fixture.componentInstance;
    cmp.aoTrocarCliente(cliente('p1', 'Ana Produtora'));
    const periodo = cmp.periodo();
    for (const r of httpMock.match(() => true)) {
      const url = r.request.url;
      if (url.endsWith('/apuracao')) {
        const p = r.request.params.get('periodo')!;
        r.flush(p === periodo ? { ...apuracao(periodo), ...over } : apuracao(p, 'FECHADO'));
      } else if (url.endsWith('/relatorios/conformidade')) r.flush({ periodo, saldoAPagar: 0 });
      else r.flush([]);
    }
    fixture.detectChanges();
    return ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');
  }

  it('mes aberto e corrente: a conta muda, e o fechamento e no ultimo dia, nao "por dia" (#116)', () => {
    const texto = textoDoFechamento({ parcial: true });
    expect(texto).toContain('o mês não terminou');
    expect(texto).toContain('23h do último dia do mês');
    expect(texto).not.toContain('uma vez por dia');
  });

  it('mes passado ainda aberto diz que terminou, sem prometer fechamento (#116)', () => {
    const texto = textoDoFechamento({ parcial: false });
    expect(texto).toContain('o mês já tenha terminado');
    expect(texto).not.toContain('cada nota autorizada muda os valores');
    // Pode ter sido reaberto, e o job refecha os reabertos: a tela nao promete nem nega.
    expect(texto).not.toContain('não fecha mais sozinho');
  });

  it('apuracao sem nota diz "Sem notas emitidas", nao "0 nota(s)" (#116)', () => {
    const texto = textoDoFechamento({ totalNotas: 0 });
    expect(texto).toContain('Sem notas emitidas no período.');
    expect(texto).not.toContain('0 nota(s)');
  });

  it('notas que nao responderam nao viram "todas entraram na apuracao"', () => {
    const fixture = abrir();
    const cmp = fixture.componentInstance;
    cmp.aoTrocarCliente(cliente('p1', 'Ana Produtora'));
    httpMock
      .expectOne((r) => r.url === '/contador/produtores/p1/notas')
      .flush('x', { status: 500, statusText: 'erro' });
    httpMock.match(() => true).forEach((r) => r.flush({}));

    expect(cmp.notasErro()).toBe(true);
    expect(cmp.prontoParaFechar()).toBe(false);
  });

  it('o PDF do relatorio vem da rota do cliente', () => {
    const fixture = abrir();
    const cmp = fixture.componentInstance;
    cmp.aoTrocarCliente(cliente('p1', 'Ana Produtora'));
    httpMock.match(() => true).forEach((r) => r.flush([]));

    cmp.baixarPdf();
    const req = httpMock.expectOne(
      (r) => r.url === '/contador/produtores/p1/relatorios/conformidade/pdf',
    );
    expect(req.request.params.get('periodo')).toBe(cmp.periodo());
    req.flush(new Blob(['%PDF']));
  });

  it('reabrir chama a rota do escritorio e poe na tela a apuracao que voltou', () => {
    const fixture = abrir();
    const cmp = fixture.componentInstance;
    cmp.aoTrocarCliente(cliente('p1', 'Ana Produtora'));
    const periodo = cmp.periodo();
    httpMock
      .match((r) => r.url === '/contador/produtores/p1/apuracao')
      .forEach((r) => r.flush(apuracao(r.request.params.get('periodo')!, 'FECHADO')));
    httpMock.match(() => true).forEach((r) => r.flush([]));
    expect(cmp.fechada()).toBe(true);

    cmp.reabrir();
    const req = httpMock.expectOne(`/contador/produtores/p1/apuracao/${periodo}/reabrir`);
    expect(req.request.method).toBe('POST');
    req.flush(apuracao(periodo, 'ABERTO'));

    expect(cmp.fechada()).toBe(false);
  });

  it('o 403 do assistente diz que a funcao dele nao reabre', () => {
    const erro = vi.spyOn(TestBed.inject(ToastService), 'error');
    const fixture = abrir();
    const cmp = fixture.componentInstance;
    cmp.aoTrocarCliente(cliente('p1', 'Ana Produtora'));
    httpMock.match(() => true).forEach((r) => r.flush([]));

    cmp.reabrir();
    httpMock
      .expectOne((r) => r.url.endsWith('/reabrir'))
      .flush({}, { status: 403, statusText: 'Forbidden' });

    expect(erro).toHaveBeenCalledWith(expect.stringContaining('não reabre apuração'));
  });

  it('resposta de um cliente antigo nao entra na tela do novo', () => {
    const fixture = abrir();
    const cmp = fixture.componentInstance;
    cmp.aoTrocarCliente(cliente('p1', 'Ana Produtora'));
    const doP1 = httpMock.match(() => true);

    cmp.aoTrocarCliente(cliente('p2', 'Bruno'));
    const responder = (saldo: number) => (r: (typeof doP1)[number]) =>
      r.request.url.endsWith('/apuracao')
        ? r.flush(apuracao(r.request.params.get('periodo')!, 'ABERTO', saldo))
        : r.flush([]);
    httpMock.match(() => true).forEach(responder(5));
    // As do primeiro cliente chegam por ultimo, atrasadas: nao podem passar por cima.
    doP1.forEach(responder(999));

    expect(cmp.apuracaoDoPeriodo()?.saldoIbs).toBe(5);
  });
});
