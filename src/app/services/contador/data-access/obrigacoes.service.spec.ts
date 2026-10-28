import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ObrigacoesApi } from './obrigacoes.service';

describe('ObrigacoesApi', () => {
  let service: ObrigacoesApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ObrigacoesApi, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ObrigacoesApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('o catálogo é um só: próprias, versões do escritório e modelos não mexidos', () => {
    service.catalogo().subscribe();
    httpMock.expectOne((r) => r.url === '/contador/obrigacoes').flush([]);
  });

  /**
   * **`DELETE` não apaga: desativa.**
   *
   * O nome do verbo HTTP engana, e o efeito medido é outro — a obrigação sai do calendário dos
   * clientes com `ativa: false` e pode voltar. Num **modelo** do sistema ela nem some da lista: o
   * escritório ganha a *versão dele* daquele modelo, desativada, com id novo. Por isso a tela
   * fala em "tirar do calendário", nunca em excluir.
   */
  it('desativar usa DELETE, que tira do calendário sem apagar', () => {
    service.desativar('o1').subscribe();

    const req = httpMock.expectOne((r) => r.url === '/contador/obrigacoes/o1');
    expect(req.request.method).toBe('DELETE');
    req.flush({});
  });

  it('reativar devolve a obrigação ao calendário', () => {
    service.reativar('o1').subscribe();

    const req = httpMock.expectOne((r) => r.url === '/contador/obrigacoes/o1/reativar');
    expect(req.request.method).toBe('POST');
    req.flush({});
  });

  it('restaurar padrão joga fora a versão do escritório', () => {
    service.restaurarPadrao('o1').subscribe();
    httpMock.expectOne((r) => r.url === '/contador/obrigacoes/o1/restaurar-padrao').flush({});
  });

  it('criar manda a obrigação própria do escritório', () => {
    service
      .criar({ titulo: 'Entrega do LCDPR', periodicidade: 'ANUAL', dia: 31, mes: 5 })
      .subscribe();

    const req = httpMock.expectOne((r) => r.url === '/contador/obrigacoes');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      titulo: 'Entrega do LCDPR',
      periodicidade: 'ANUAL',
      dia: 31,
      mes: 5,
    });
    req.flush({});
  });

  it('editar um modelo é um PUT: o servidor cria a versão do escritório', () => {
    service.atualizar('o1', { titulo: 'Funrural', periodicidade: 'MENSAL', dia: 25 }).subscribe();

    const req = httpMock.expectOne((r) => r.url === '/contador/obrigacoes/o1');
    expect(req.request.method).toBe('PUT');
    req.flush({});
  });
});
