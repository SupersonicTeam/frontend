import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ContadorApi } from './contador.service';
import { SolicitacaoContador, DocumentoContador } from '@models/solicitacao-contador.model';

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
});
