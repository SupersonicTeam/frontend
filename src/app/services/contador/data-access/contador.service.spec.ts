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
    it('CTD-01: em erro do backend, retorna pendências de exemplo (fixture), não uma lista vazia', () => {
      let resultado: SolicitacaoContador[] | undefined;
      service.getPendencias('produtor-1').subscribe(res => (resultado = res));

      httpMock
        .expectOne(r => r.url === '/contador/pendencias')
        .flush('erro', { status: 500, statusText: 'Server Error' });

      expect(resultado).toBeDefined();
      expect(resultado!.length).toBeGreaterThan(0);
      expect(resultado!.every(s => s.produtorId === 'produtor-1')).toBe(true);
    });

    it('CTD-05: em sucesso do backend (mesmo vazio), retorna a resposta real sem sobrepor com fixture', () => {
      let resultado: SolicitacaoContador[] | undefined;
      service.getPendencias('produtor-1').subscribe(res => (resultado = res));

      httpMock.expectOne(r => r.url === '/contador/pendencias').flush([]);

      expect(resultado).toEqual([]);
    });
  });

  describe('getRecebidos', () => {
    it('CTD-02: em erro do backend, retorna documentos recebidos de exemplo, não uma lista vazia', () => {
      let resultado: SolicitacaoContador[] | undefined;
      service.getRecebidos('produtor-1').subscribe(res => (resultado = res));

      httpMock
        .expectOne(r => r.url === '/contador/pendencias-recebidos')
        .flush('erro', { status: 500, statusText: 'Server Error' });

      expect(resultado).toBeDefined();
      expect(resultado!.length).toBeGreaterThan(0);
      expect(resultado!.every(s => s.status === 'enviado')).toBe(true);
    });

    it('CTD-05: em sucesso do backend (mesmo vazio), retorna a resposta real sem sobrepor com fixture', () => {
      let resultado: SolicitacaoContador[] | undefined;
      service.getRecebidos('produtor-1').subscribe(res => (resultado = res));

      httpMock.expectOne(r => r.url === '/contador/pendencias-recebidos').flush([]);

      expect(resultado).toEqual([]);
    });
  });

  describe('getDocumentos', () => {
    it('CTD-03: em erro do backend, retorna anexos de exemplo coerentes com a pendência', () => {
      let resultado: DocumentoContador[] | undefined;
      service.getDocumentos('fx-pend-2').subscribe(res => (resultado = res));

      httpMock
        .expectOne(r => r.url === '/contador/pendencias/fx-pend-2/documentos')
        .flush('erro', { status: 500, statusText: 'Server Error' });

      expect(resultado).toBeDefined();
      expect(resultado!.length).toBeGreaterThan(0);
      expect(resultado!.every(d => d.solicitacaoId === 'fx-pend-2')).toBe(true);
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

  describe('anexarDocumento', () => {
    it('CTD-13/15: em erro do backend, retorna um documento de exemplo (nunca null)', () => {
      const file = new File(['conteudo'], 'balancete.pdf', { type: 'application/pdf' });
      let resultado: DocumentoContador | null | undefined;
      service.anexarDocumento('fx-pend-2', file, 'Balancete').subscribe(res => (resultado = res));

      flushErro(httpMock, '/contador/documentos/anexar');

      expect(resultado).toBeTruthy();
      expect(resultado!.solicitacaoId).toBe('fx-pend-2');
      expect(resultado!.nomeArquivo).toBe('balancete.pdf');
      expect(resultado!.tipo).toBe('Balancete');
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
