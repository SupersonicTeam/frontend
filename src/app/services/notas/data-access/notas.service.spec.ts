import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NotasApi } from './notas.service';
import { NotaFiscalRequest } from '@dtos/notas/nota-fiscal.request';
import { emptyPage } from '@dtos/shared/responses/page.response';

describe('NotasApi', () => {
  let service: NotasApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [NotasApi, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(NotasApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('listar envia page/size/sort e devolve o Page<T>', () => {
    const page = emptyPage(10);
    let recebido: unknown;
    service.listar({ page: 0, size: 10, sort: 'dataEmissao,desc' }).subscribe(r => (recebido = r));

    const req = httpMock.expectOne(r => r.url === '/notas');
    expect(req.request.params.get('page')).toBe('0');
    expect(req.request.params.get('size')).toBe('10');
    expect(req.request.params.get('sort')).toBe('dataEmissao,desc');
    req.flush(page);
    expect(recebido).toEqual(page);
  });

  it('criar faz POST em /notas com o request', () => {
    const req: NotaFiscalRequest = {
      numero: 1,
      naturezaOperacao: 'Venda',
      dataEmissao: '2026-06-10T10:00:00-03:00',
      destinatarioNome: 'José',
      destinatarioCpfCnpj: '11144477735',
      itens: [
        { numeroItem: 1, descricao: 'Soja', ncm: '12010090', cfop: '5101', unidade: 'KG', quantidade: 1, valorUnitario: 2.5 },
      ],
    };
    service.criar(req).subscribe();
    const httpReq = httpMock.expectOne('/notas');
    expect(httpReq.request.method).toBe('POST');
    expect(httpReq.request.body).toEqual(req);
    httpReq.flush({});
  });

  it('gerarXml faz POST em /notas/{id}/gerar-xml', () => {
    service.gerarXml('abc').subscribe();
    const req = httpMock.expectOne('/notas/abc/gerar-xml');
    expect(req.request.method).toBe('POST');
    req.flush({});
  });
});
