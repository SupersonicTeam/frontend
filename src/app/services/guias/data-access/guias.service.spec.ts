import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import type { GuiaFiscal } from '@models/solicitacao-contador.model';
import { GuiasApi } from './guias.service';

/**
 * As guias do produtor autenticado (#198, backend#273). Os casos CTD vieram do `ContadorApi`, que
 * servia as duas pontas por `/api/contador/guias?produtorId=` até a migração.
 */
describe('GuiasApi', () => {
  let service: GuiasApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(GuiasApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('minhas() pede GET /guias, sem produtorId: o produtor vem do token', () => {
    service.minhas().subscribe();

    const req = httpMock.expectOne((r) => r.url === '/guias');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.keys()).toEqual([]);
    req.flush([]);
  });

  it('CTD-10: traduz o status do backend (MAIÚSCULO) e deriva o atraso da data', () => {
    // Datas inequívocas (bem no futuro ou bem no passado): o atraso é derivado da data em
    // `@core/utils/guias`, e o teste não pode depender do dia em que a suíte roda. As versões
    // anteriores deste caso apodreceram três vezes por usar datas de 2026.
    const doBackend = [
      { id: 'g1', tipoGuia: 'ICMS', dataVencimento: '2099-12-31', valor: 990, status: 'PENDENTE' },
      {
        id: 'g2',
        tipoGuia: 'FUNRURAL',
        dataVencimento: '2020-09-20',
        valor: 1840.55,
        status: 'PAGA',
      },
      { id: 'g3', tipoGuia: 'GPS', dataVencimento: '2020-09-10', valor: 890, status: 'VENCIDA' },
      // O caso que o backend não resolve: venceu e ele ainda diz PENDENTE.
      { id: 'g4', tipoGuia: 'DARF', dataVencimento: '2020-01-10', valor: 310, status: 'PENDENTE' },
    ];
    let resultado: GuiaFiscal[] | undefined;
    service.minhas().subscribe((res) => (resultado = res));

    httpMock.expectOne((r) => r.url === '/guias').flush(doBackend);

    expect(resultado?.map((g) => g.status)).toEqual(['pendente', 'pago', 'vencido', 'vencido']);
    expect(resultado?.[1]).toMatchObject({ id: 'g2', tipoGuia: 'FUNRURAL', valor: 1840.55 });
  });

  it('CTD-10b: status desconhecido vira pendente em vez de vazar cru para a tela', () => {
    let resultado: GuiaFiscal[] | undefined;
    service.minhas().subscribe((res) => (resultado = res));

    httpMock
      .expectOne((r) => r.url === '/guias')
      .flush([{ id: 'g9', tipoGuia: 'OUTRO', dataVencimento: '2099-12-31', status: 'EM_ANALISE' }]);

    expect(resultado?.[0]?.status).toBe('pendente');
  });

  /** #106/#107: lista vazia é "não há guia"; erro é outra coisa e precisa chegar à tela. */
  it('CTD-06: em erro, minhas() propaga em vez de devolver lista vazia', () => {
    let falhou = false;
    let resultado: GuiaFiscal[] | undefined;
    service.minhas().subscribe({ next: (r) => (resultado = r), error: () => (falhou = true) });

    httpMock
      .expectOne((r) => r.url === '/guias')
      .flush('erro', { status: 500, statusText: 'Server Error' });

    expect(falhou).toBe(true);
    expect(resultado).toBeUndefined();
  });

  it('pagar() manda PATCH /guias/{id}/pagar e devolve a guia traduzida', () => {
    let paga: GuiaFiscal | undefined;
    service.pagar('g1').subscribe((g) => (paga = g));

    const req = httpMock.expectOne((r) => r.url === '/guias/g1/pagar');
    expect(req.request.method).toBe('PATCH');
    req.flush({ id: 'g1', tipoGuia: 'ICMS', dataVencimento: '2020-01-10', status: 'PAGA' });

    // Paga, mesmo com a data no passado: o atraso só vale para quem não pagou.
    expect(paga?.status).toBe('pago');
  });

  it('CTD-09 (#50): em erro, pagar() propaga a falha em vez de engolir', () => {
    let deuErro = false;
    service.pagar('g1').subscribe({ error: () => (deuErro = true) });

    httpMock
      .expectOne((r) => r.url === '/guias/g1/pagar')
      .flush({ errors: [] }, { status: 409, statusText: 'Conflict' });

    expect(deuErro).toBe(true);
  });
});
