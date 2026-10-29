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

  /**
   * Obrigacao nao e guia (backend#181).
   *
   * O calendario passou a devolver tres coisas: guia (`imposto`, com status e valor), pedido de
   * documento (`solicitacao`) e **obrigacao** -- que vem com `status: null` e `valor: null`,
   * mais `periodicidade` e `origem`. Medido em 28/10.
   *
   * O mapeamento jogava qualquer status desconhecido em `pendente`, inclusive o `null` da
   * obrigacao. Dai a data no passado a transformava em "atrasada", e a tela do produtor mostrava
   * o **Fechamento da apuracao** com o aviso "guia atrasada costuma ter multa e juros" -- um
   * conselho de pagamento para algo que nao se paga.
   */
  describe('obrigacoes (#181)', () => {
    const obrigacao = {
      id: '00000000-0000-4000-8181-000000000007:2026-11-20',
      evento: 'Funrural (recolhimento)',
      descricao: 'Contribuicao do produtor rural sobre a comercializacao',
      dataVencimento: '2026-11-20',
      tipo: 'obrigacao',
      status: null,
      valor: null,
      periodicidade: 'MENSAL',
      origem: 'Lei 8.212/1991, art. 30',
    };

    function pedir() {
      let recebidos: VencimentoFiscal[] | undefined;
      service.getVencimentos('p1').subscribe((v) => (recebidos = v));
      return () => recebidos;
    }

    it('obrigacao chega SEM status: ela nao se paga, entao nao esta pendente', () => {
      const ler = pedir();
      httpMock.expectOne((r) => r.url.includes('/vencimentos')).flush([obrigacao]);

      expect(ler()![0]!.status).toBeNull();
    });

    it('obrigacao chega sem valor', () => {
      const ler = pedir();
      httpMock.expectOne((r) => r.url.includes('/vencimentos')).flush([obrigacao]);

      expect(ler()![0]!.valor).toBeUndefined();
    });

    it('a periodicidade e a origem chegam: e a procedencia do prazo', () => {
      const ler = pedir();
      httpMock.expectOne((r) => r.url.includes('/vencimentos')).flush([obrigacao]);

      expect(ler()![0]!.periodicidade).toBe('MENSAL');
      expect(ler()![0]!.origem).toBe('Lei 8.212/1991, art. 30');
    });

    it('o id composto passa inteiro: nao e UUID nem numero', () => {
      const ler = pedir();
      httpMock.expectOne((r) => r.url.includes('/vencimentos')).flush([obrigacao]);

      expect(ler()![0]!.id).toBe('00000000-0000-4000-8181-000000000007:2026-11-20');
    });

    it('a guia continua com status e valor', () => {
      const ler = pedir();
      httpMock
        .expectOne((r) => r.url.includes('/vencimentos'))
        .flush([
          {
            id: 'g1',
            evento: 'Guia DARF',
            dataVencimento: '2026-10-31',
            tipo: 'imposto',
            status: 'pendente',
            valor: 640.9,
          },
        ]);

      expect(ler()![0]!.status).toBe('pendente');
      expect(ler()![0]!.valor).toBe(640.9);
    });

    it('status desconhecido numa GUIA continua virando pendente', () => {
      const ler = pedir();
      httpMock
        .expectOne((r) => r.url.includes('/vencimentos'))
        .flush([
          { id: 'g1', evento: 'Guia', dataVencimento: '2026-10-31', tipo: 'imposto', status: 'ALGO' },
        ]);

      // O `null` da obrigacao e informacao; um status que nao reconhecemos numa guia e ruido,
      // e supor "pendente" ali e o que mantem a guia visivel.
      expect(ler()![0]!.status).toBe('pendente');
    });
  });
});
