import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ContadorApi } from './contador.service';
import {
  SolicitacaoContador,
  DocumentoContador,
  GuiaFiscal,
} from '@models/solicitacao-contador.model';

function flushErro(httpMock: HttpTestingController, urlPart: string): void {
  httpMock.expectOne(r => r.url.includes(urlPart)).flush('erro', {
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

  describe('getPendencias', () => {
    it('CTD-01 (#49): em erro do backend, retorna lista VAZIA — nunca dados de exemplo', () => {
      // Comportamento invertido de proposito. Antes caia para fixture, e como
      // /contador/pendencias responde 404 (nao existe ContadorController), as telas
      // exibiam solicitacoes inventadas como se fossem do produtor.
      let resultado: SolicitacaoContador[] | undefined;
      service.getPendencias('produtor-1').subscribe(res => (resultado = res));

      httpMock
        .expectOne(r => r.url === '/contador/pendencias')
        .flush('erro', { status: 500, statusText: 'Server Error' });

      expect(resultado).toEqual([]);
    });

    it('CTD-05: em sucesso do backend (mesmo vazio), retorna a resposta real sem sobrepor com fixture', () => {
      let resultado: SolicitacaoContador[] | undefined;
      service.getPendencias('produtor-1').subscribe(res => (resultado = res));

      httpMock.expectOne(r => r.url === '/contador/pendencias').flush([]);

      expect(resultado).toEqual([]);
    });
  });

  describe('getRecebidos', () => {
    it('CTD-02 (#49): em erro do backend, retorna lista VAZIA — nunca dados de exemplo', () => {
      let resultado: SolicitacaoContador[] | undefined;
      service.getRecebidos('produtor-1').subscribe(res => (resultado = res));

      httpMock
        .expectOne(r => r.url === '/contador/pendencias-recebidos')
        .flush('erro', { status: 500, statusText: 'Server Error' });

      expect(resultado).toEqual([]);
    });

    it('CTD-05: em sucesso do backend (mesmo vazio), retorna a resposta real sem sobrepor com fixture', () => {
      let resultado: SolicitacaoContador[] | undefined;
      service.getRecebidos('produtor-1').subscribe(res => (resultado = res));

      httpMock.expectOne(r => r.url === '/contador/pendencias-recebidos').flush([]);

      expect(resultado).toEqual([]);
    });
  });

  describe('getDocumentos', () => {
    it('CTD-03 (#49): em erro do backend, retorna lista VAZIA — nunca anexos de exemplo', () => {
      let resultado: DocumentoContador[] | undefined;
      service.getDocumentos('fx-pend-2').subscribe(res => (resultado = res));

      httpMock
        .expectOne(r => r.url === '/contador/pendencias/fx-pend-2/documentos')
        .flush('erro', { status: 500, statusText: 'Server Error' });

      expect(resultado).toEqual([]);
    });

    it('CTD-05: em sucesso do backend (mesmo vazio), retorna a resposta real sem sobrepor com fixture', () => {
      let resultado: DocumentoContador[] | undefined;
      service.getDocumentos('fx-pend-2').subscribe(res => (resultado = res));

      httpMock.expectOne(r => r.url === '/contador/pendencias/fx-pend-2/documentos').flush([]);

      expect(resultado).toEqual([]);
    });
  });

  describe('guias fiscais (#50 — endpoints reais, sem estado mock)', () => {
    // Os tres endpoints de guia existem e respondem (GET/POST /contador/guias e
    // PATCH /contador/guias/:id/pagar). O service mantinha um estado mock local que
    // entrava em cena quando a chamada falhava: a tela exibia guias inexistentes e
    // dava "baixa" em pagamento que nunca aconteceu. Esse estado foi removido.

    it('CTD-10: getGuias devolve a resposta do backend tal como veio', () => {
      const doBackend = [
        {
          id: 'real-1',
          produtorId: 'p1',
          tipoGuia: 'ICMS',
          dataVencimento: '2026-10-20',
          valor: 990,
          status: 'pendente',
          createdAt: '2026-09-01T10:00:00Z',
        },
      ];
      let resultado: GuiaFiscal[] | undefined;
      service.getGuias('p1').subscribe(res => (resultado = res));

      httpMock.expectOne(r => r.url === '/contador/guias').flush(doBackend);

      expect(resultado).toEqual(doBackend);
    });

    it('CTD-06 (#50): em erro, getGuias devolve VAZIO — nunca guias de exemplo', () => {
      let resultado: GuiaFiscal[] | undefined;
      service.getGuias('p1').subscribe(res => (resultado = res));

      flushErro(httpMock, '/contador/guias');

      expect(resultado).toEqual([]);
    });

    it('CTD-07 (#50): em erro, anexarGuia devolve null — nunca finge que criou', () => {
      let resultado: GuiaFiscal | null | undefined;
      service
        .anexarGuia({ produtorId: 'p1', tipoGuia: 'DARF', dataVencimento: '2026-10-30', valor: 120 })
        .subscribe(res => (resultado = res));

      flushErro(httpMock, '/contador/guias');

      expect(resultado).toBeNull();
    });

    it('CTD-09 (#50): em erro, marcarGuiaPaga propaga a falha em vez de engolir', () => {
      let deuErro = false;
      service.marcarGuiaPaga('g1').subscribe({ error: () => (deuErro = true) });

      flushErro(httpMock, '/contador/guias/g1/pagar');

      expect(deuErro).toBe(true);
    });
  });

  describe('criarSolicitacao', () => {
    it('SPEC_DEVIATION (necessário p/ CTD-24): em erro do backend, cria a solicitação localmente (mock) em vez de retornar null', () => {
      let resultado: SolicitacaoContador | null | undefined;
      service
        .criarSolicitacao({
          produtorId: 'produtor-1',
          titulo: 'Notas de agosto',
          descricao: 'Notas do mês',
          categoria: 'Guia de imposto',
          prioridade: 'media',
        })
        .subscribe(res => (resultado = res));

      httpMock
        .expectOne(r => r.url === '/contador/pendencias' && r.method === 'POST')
        .flush('erro', { status: 500, statusText: 'Server Error' });

      expect(resultado).toBeTruthy();
      expect(resultado!.titulo).toBe('Notas de agosto');
      expect(resultado!.categoria).toBe('Guia de imposto');
      expect(resultado!.status).toBe('pendente');
    });
  });

  describe('anexarDocumento', () => {
    it('CTD-13/15 (#49): em erro no upload, devolve null — nunca finge que anexou', () => {
      const file = new File(['conteudo'], 'balancete.pdf', { type: 'application/pdf' });
      let resultado: DocumentoContador | null | undefined;
      service.anexarDocumento('fx-pend-2', file, 'Balancete').subscribe(res => (resultado = res));

      flushErro(httpMock, '/contador/documentos/anexar');

      // Fingir sucesso num upload que falhou e pior que mock: mente sobre o
      // resultado de uma acao do usuario.
      expect(resultado).toBeNull();
    });

    it('CTD-13: em sucesso do backend real, retorna o documento tal como veio (sem fixture)', () => {
      const file = new File(['conteudo'], 'balancete.pdf', { type: 'application/pdf' });
      const docBackend: DocumentoContador = {
        id: 'real-doc-1',
        solicitacaoId: 'fx-pend-2',
        nomeArquivo: 'balancete.pdf',
        arquivoUrl: '/files/real-doc-1',
        tipo: 'Balancete',
        createdAt: '2026-07-07T00:00:00',
      };
      let resultado: DocumentoContador | null | undefined;
      service.anexarDocumento('fx-pend-2', file, 'Balancete').subscribe(res => (resultado = res));

      httpMock.expectOne(r => r.url === '/contador/documentos/anexar').flush(docBackend);

      expect(resultado).toEqual(docBackend);
    });
  });
});
