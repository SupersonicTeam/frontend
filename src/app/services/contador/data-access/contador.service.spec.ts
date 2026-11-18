import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ContadorApi } from './contador.service';
import { GuiaFiscal } from '@models/solicitacao-contador.model';

function flushErro(httpMock: HttpTestingController, urlPart: string): void {
  httpMock
    .expectOne((r) => r.url.includes(urlPart))
    .flush('erro', {
      status: 500,
      statusText: 'Server Error',
    });
}

describe('ContadorApi', () => {
  let service: ContadorApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ContadorApi, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ContadorApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('guias fiscais (#50 — endpoints reais, sem estado mock)', () => {
    // Os tres endpoints de guia existem e respondem (GET/POST /contador/guias e
    // PATCH /contador/guias/:id/pagar). O service mantinha um estado mock local que
    // entrava em cena quando a chamada falhava: a tela exibia guias inexistentes e
    // dava "baixa" em pagamento que nunca aconteceu. Esse estado foi removido.

    it('CTD-10: getGuias traduz o status do backend (MAIUSCULO) para o do modelo', () => {
      // O backend manda `PENDENTE`/`PAGA`/`VENCIDA`; o `GuiaFiscal` declara
      // `pendente`/`pago`/`vencido`. O fixture antigo deste teste usava minusculo e por isso
      // escondia a divergencia: na tela, guia paga entrava no total a pagar e guia vencida
      // nunca acendia o alerta. Conferido contra o backend real em 05/10/2026.
      // As datas aqui sao propositalmente inequivocas (uma bem no futuro, as outras bem no
      // passado), porque desde a carteira (#95) o atraso e **derivado da data** em
      // `@core/utils/guias`: a versao anterior deste fixture usava 20/10/2026 como "pendente" e
      // passava so enquanto aquela data nao tinha chegado. O teste nao deve depender do calendario
      // de quem roda a suite.
      const doBackend = [
        {
          id: 'g1',
          produtorId: 'p1',
          tipoGuia: 'ICMS',
          dataVencimento: '2099-12-31',
          valor: 990,
          status: 'PENDENTE',
          createdAt: '2026-09-01T10:00:00Z',
        },
        {
          id: 'g2',
          produtorId: 'p1',
          tipoGuia: 'FUNRURAL',
          dataVencimento: '2020-09-20',
          valor: 1840.55,
          status: 'PAGA',
          createdAt: '2026-09-01T10:00:00Z',
        },
        {
          id: 'g3',
          produtorId: 'p1',
          tipoGuia: 'GPS',
          dataVencimento: '2020-09-10',
          valor: 890,
          status: 'VENCIDA',
          createdAt: '2026-09-01T10:00:00Z',
        },
        // O caso que o backend nao resolve: venceu e ele ainda diz PENDENTE.
        {
          id: 'g4',
          produtorId: 'p1',
          tipoGuia: 'DARF',
          dataVencimento: '2020-01-10',
          valor: 310,
          status: 'PENDENTE',
          createdAt: '2026-09-01T10:00:00Z',
        },
      ];
      let resultado: GuiaFiscal[] | undefined;
      service.getGuias('p1').subscribe((res) => (resultado = res));

      httpMock.expectOne((r) => r.url === '/contador/guias').flush(doBackend);

      expect(resultado?.map((g) => g.status)).toEqual(['pendente', 'pago', 'vencido', 'vencido']);
      // O resto do payload passa intacto.
      expect(resultado?.[1]).toMatchObject({ id: 'g2', tipoGuia: 'FUNRURAL', valor: 1840.55 });
    });

    it('CTD-10b: status desconhecido vira pendente em vez de vazar cru para a tela', () => {
      let resultado: GuiaFiscal[] | undefined;
      service.getGuias('p1').subscribe((res) => (resultado = res));

      // Data **bem** no futuro, pela mesma razao do fixture acima: o atraso e derivado da data, e
      // este caso e sobre o STATUS desconhecido, nao sobre vencimento. Estava `2026-11-01` e a
      // suite virou vermelha sozinha em 03/11, quando aquela data passou -- o teste vizinho ja
      // tinha aprendido isso e usado 2099, mas este ficou para tras.
      httpMock
        .expectOne((r) => r.url === '/contador/guias')
        .flush([
          {
            id: 'g9',
            produtorId: 'p1',
            tipoGuia: 'OUTRO',
            dataVencimento: '2099-12-31',
            valor: 10,
            status: 'EM_ANALISE',
            createdAt: '2026-09-01T10:00:00Z',
          },
        ]);

      expect(resultado?.[0].status).toBe('pendente');
    });

    it('CTD-10c: a guia recem-criada volta com o status ja traduzido', () => {
      let criada: GuiaFiscal | null | undefined;
      // **Terceira vez** que esta data apodrece (ver o CTD-10b): o `2026-11-10` passou em
      // 11/11/2026 e a suite ficou vermelha sozinha. Este caso e sobre a TRADUCAO do status,
      // e o atraso e derivado da data, entao vai para 2099 como os vizinhos.
      service
        .anexarGuia({
          produtorId: 'p1',
          tipoGuia: 'DARF',
          dataVencimento: '2099-12-31',
          valor: 500,
        })
        .subscribe((res) => (criada = res));

      httpMock
        .expectOne((r) => r.url === '/contador/guias' && r.method === 'POST')
        .flush({
          id: 'nova',
          produtorId: 'p1',
          tipoGuia: 'DARF',
          dataVencimento: '2099-12-31',
          valor: 500,
          status: 'PENDENTE',
          createdAt: '2026-10-05T10:00:00Z',
        });

      expect(criada?.status).toBe('pendente');
    });

    /**
     * O CTD-06 afirmava o contrario: "em erro, getGuias devolve VAZIO". A intencao era boa --
     * nao cair para guias de exemplo --, mas a alternativa escolhida foi a errada. Lista vazia
     * e "nao ha guia"; erro e outra coisa. Com a API respondendo 404 a tela dizia "Nenhuma guia
     * lancada" enquanto havia oito guias reais, uma de ICMS de R$ 3.420 vencida (issues #106 e
     * #107). Agora o erro sobe e a pagina mostra estado de erro com "Tentar novamente".
     */
    it('CTD-06 (#107): em erro, getGuias PROPAGA — vazio e "nao ha guia", nao "deu errado"', () => {
      let falhou = false;
      let resultado: GuiaFiscal[] | undefined;
      service.getGuias('p1').subscribe({
        next: (res) => (resultado = res),
        error: () => (falhou = true),
      });

      flushErro(httpMock, '/contador/guias');

      expect(falhou).toBe(true);
      expect(resultado).toBeUndefined();
    });

    it('CTD-07 (#107): em erro, anexarGuia propaga em vez de devolver null', () => {
      let falhou = false;
      service
        .anexarGuia({
          produtorId: 'p1',
          tipoGuia: 'DARF',
          dataVencimento: '2026-10-30',
          valor: 120,
        })
        .subscribe({ next: () => undefined, error: () => (falhou = true) });

      flushErro(httpMock, '/contador/guias');

      expect(falhou).toBe(true);
    });

    it('CTD-09 (#50): em erro, marcarGuiaPaga propaga a falha em vez de engolir', () => {
      let deuErro = false;
      service.marcarGuiaPaga('g1').subscribe({ error: () => (deuErro = true) });

      flushErro(httpMock, '/contador/guias/g1/pagar');

      expect(deuErro).toBe(true);
    });
  });
});
