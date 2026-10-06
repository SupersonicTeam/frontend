import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CalendarioApi } from './calendario.service';
import { VencimentoFiscal } from '@models/vencimento-fiscal.model';

describe('CalendarioApi', () => {
  let service: CalendarioApi;
  let httpMock: HttpTestingController;

  /** Um item como o `VencimentoFiscalResponse` do backend o envia. */
  const resposta = (over: Record<string, unknown> = {}) => ({
    id: 'v1',
    evento: 'Guia ICMS',
    descricao: 'Referente a agosto/2026',
    dataVencimento: '2026-09-30',
    tipo: 'imposto',
    status: 'pendente',
    valor: 500,
    ...over,
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CalendarioApi, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CalendarioApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('mapeia a resposta real do backend', () => {
    let resultado: VencimentoFiscal[] | undefined;
    service.getVencimentos('produtor-1').subscribe((res) => (resultado = res));

    httpMock
      .expectOne((r) => r.url === '/calendario-fiscal/produtor-1/vencimentos')
      .flush([resposta()]);

    expect(resultado).toEqual([
      {
        id: 'v1',
        titulo: 'Guia ICMS',
        descricao: 'Referente a agosto/2026',
        dataVencimento: '2026-09-30',
        tipo: 'imposto',
        status: 'pendente',
        valor: 500,
      },
    ]);
  });

  it('preserva pago e vencido — o status do servidor chega inteiro à tela', () => {
    // O mapeamento anterior reconhecia só "vencido" e empurrava todo o resto para "pendente":
    // guia **paga** aparecia como pendente. O DTO do backend registra esse bug como nosso.
    let resultado: VencimentoFiscal[] | undefined;
    service.getVencimentos('p1').subscribe((res) => (resultado = res));

    httpMock
      .expectOne((r) => r.url.includes('/vencimentos'))
      .flush([
        resposta({ id: 'a', status: 'pago' }),
        resposta({ id: 'b', status: 'vencido' }),
        resposta({ id: 'c', status: 'pendente' }),
      ]);

    expect(resultado?.map((v) => v.status)).toEqual(['pago', 'vencido', 'pendente']);
  });

  it('status fora do contrato vira pendente, não quebra a tela', () => {
    let resultado: VencimentoFiscal[] | undefined;
    service.getVencimentos('p1').subscribe((res) => (resultado = res));

    httpMock.expectOne((r) => r.url.includes('/vencimentos')).flush([resposta({ status: 'normal' })]);

    expect(resultado?.[0].status).toBe('pendente');
  });

  it('descarta item sem id ou sem data em vez de inventar', () => {
    // Antes: `id` virava `Math.random()` e data ausente virava **hoje** — um prazo fiscal que o
    // servidor nunca informou, na tela de quem precisa pagar imposto no dia certo.
    let resultado: VencimentoFiscal[] | undefined;
    service.getVencimentos('p1').subscribe((res) => (resultado = res));

    httpMock
      .expectOne((r) => r.url.includes('/vencimentos'))
      .flush([
        resposta({ id: '' }),
        resposta({ id: 'sem-data', dataVencimento: '' }),
        resposta({ id: 'bom' }),
      ]);

    expect(resultado?.map((v) => v.id)).toEqual(['bom']);
  });

  it('não deduz o tipo pelo valor — usa o que o backend declara', () => {
    // A heurística antiga ("tem valor > 0 logo é imposto") classificava pelo campo errado.
    let resultado: VencimentoFiscal[] | undefined;
    service.getVencimentos('p1').subscribe((res) => (resultado = res));

    httpMock
      .expectOne((r) => r.url.includes('/vencimentos'))
      .flush([
        resposta({ id: 'a', tipo: 'obrigacao', valor: 900 }),
        resposta({ id: 'b', tipo: 'imposto', valor: null }),
      ]);

    expect(resultado?.map((v) => v.tipo)).toEqual(['obrigacao', 'imposto']);
    expect(resultado?.[1].valor).toBeUndefined();
  });

  it('manda a janela na query — recortar é trabalho do servidor', () => {
    service.getVencimentos('p1', { de: '2026-09-01', ate: '2026-09-30' }).subscribe();

    const req = httpMock.expectOne((r) => r.url.includes('/vencimentos'));
    expect(req.request.params.get('de')).toBe('2026-09-01');
    expect(req.request.params.get('ate')).toBe('2026-09-30');
    req.flush([]);
  });

  it('em falha do backend, o erro propaga — sem fallback com dado falso', () => {
    let erro: unknown;
    let resultado: VencimentoFiscal[] | undefined;
    service.getVencimentos('produtor-1').subscribe({
      next: (res) => (resultado = res),
      error: (e) => (erro = e),
    });

    httpMock
      .expectOne((r) => r.url === '/calendario-fiscal/produtor-1/vencimentos')
      .flush('erro', { status: 500, statusText: 'Server Error' });

    expect(erro).toBeTruthy();
    expect(resultado).toBeUndefined();
  });
});
