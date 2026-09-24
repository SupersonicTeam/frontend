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

function isoData(diasOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + diasOffset);
  return d.toISOString().split('T')[0];
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

  describe('guias fiscais (fallback mock)', () => {
    it('CTD-06/07: anexarGuia (fallback mock) cria a guia e ela passa a aparecer em getGuias()', () => {
      let criada: GuiaFiscal | null | undefined;
      service
        .anexarGuia({ produtorId: 'produtor-1', tipoGuia: 'ICMS', dataVencimento: isoData(10), valor: 500 })
        .subscribe(res => (criada = res));
      flushErro(httpMock, '/contador/guias');

      expect(criada).toBeTruthy();
      expect(criada!.status).toBe('pendente');
      expect(criada!.valor).toBe(500);

      let lista: GuiaFiscal[] | undefined;
      service.getGuias('produtor-1').subscribe(res => (lista = res));
      flushErro(httpMock, '/contador/guias');

      expect(lista!.some(g => g.id === criada!.id)).toBe(true);
    });

    it('bugfix (Copilot review): guias de um produtor não vazam para outro produtor no fallback mock', () => {
      let criadaP1: GuiaFiscal | null | undefined;
      service
        .anexarGuia({ produtorId: 'produtor-1', tipoGuia: 'ICMS', dataVencimento: isoData(10), valor: 500 })
        .subscribe(res => (criadaP1 = res));
      flushErro(httpMock, '/contador/guias');

      let listaP2: GuiaFiscal[] | undefined;
      service.getGuias('produtor-2').subscribe(res => (listaP2 = res));
      flushErro(httpMock, '/contador/guias');

      expect(listaP2!.some(g => g.id === criadaP1!.id)).toBe(false);
      expect(listaP2!.every(g => g.produtorId === 'produtor-2')).toBe(true);

      let listaP1: GuiaFiscal[] | undefined;
      service.getGuias('produtor-1').subscribe(res => (listaP1 = res));
      flushErro(httpMock, '/contador/guias');

      expect(listaP1!.some(g => g.id === criadaP1!.id)).toBe(true);
    });

    it('CTD-08: guia com data de vencimento no passado e não paga aparece com status vencido', () => {
      let criada: GuiaFiscal | null | undefined;
      service
        .anexarGuia({ produtorId: 'produtor-1', tipoGuia: 'DARF', dataVencimento: isoData(-5), valor: 200 })
        .subscribe(res => (criada = res));
      flushErro(httpMock, '/contador/guias');

      expect(criada!.status).toBe('vencido');
    });

    it('CTD-09: marcarGuiaPaga (fallback mock) reflete status pago na leitura seguinte de getGuias()', () => {
      let criada: GuiaFiscal | null | undefined;
      service
        .anexarGuia({ produtorId: 'produtor-1', tipoGuia: 'GPS', dataVencimento: isoData(10), valor: 150 })
        .subscribe(res => (criada = res));
      flushErro(httpMock, '/contador/guias');

      service.marcarGuiaPaga(criada!.id).subscribe();
      flushErro(httpMock, `/contador/guias/${criada!.id}/pagar`);

      let lista: GuiaFiscal[] | undefined;
      service.getGuias('produtor-1').subscribe(res => (lista = res));
      flushErro(httpMock, '/contador/guias');

      expect(lista!.find(g => g.id === criada!.id)?.status).toBe('pago');
    });

    it('CTD-10: getGuias em sucesso do backend real retorna a resposta tal como veio (sem fixture)', () => {
      let resultado: GuiaFiscal[] | undefined;
      service.getGuias('produtor-1').subscribe(res => (resultado = res));

      httpMock.expectOne(r => r.url === '/contador/guias').flush([]);

      expect(resultado).toEqual([]);
    });

    it('CTD-10: anexarGuia em sucesso do backend real retorna a guia criada pelo backend (não a mock)', () => {
      const guiaBackend: GuiaFiscal = {
        id: 'real-1',
        produtorId: 'produtor-1',
        tipoGuia: 'ICMS',
        dataVencimento: isoData(10),
        valor: 999,
        status: 'pendente',
        createdAt: '2026-07-07T00:00:00',
      };
      let resultado: GuiaFiscal | null | undefined;
      service
        .anexarGuia({ produtorId: 'produtor-1', tipoGuia: 'ICMS', dataVencimento: isoData(10), valor: 999 })
        .subscribe(res => (resultado = res));

      httpMock.expectOne(r => r.url === '/contador/guias').flush(guiaBackend);

      expect(resultado).toEqual(guiaBackend);
    });

    it('edge case: marcarGuiaPaga com id inexistente não quebra a chamada (no-op)', () => {
      let completou = false;
      service.marcarGuiaPaga('id-que-nao-existe').subscribe({ complete: () => (completou = true) });
      flushErro(httpMock, '/contador/guias/id-que-nao-existe/pagar');

      expect(completou).toBe(true);
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
