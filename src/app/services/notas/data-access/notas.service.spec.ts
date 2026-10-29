import { TestBed } from '@angular/core/testing';
import { HttpResponse, provideHttpClient } from '@angular/common/http';
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

  /**
   * A revisao do contador (backend#178).
   *
   * Medido em 28/10: com escritorio vinculado, `gerar-xml` num rascunho responde
   * **409 APROVACAO_EXIGIDA** -- a nota nao sai sem passar por aqui.
   */
  it('enviarParaRevisao faz POST e devolve a nota ja em AGUARDANDO_APROVACAO', () => {
    let recebida: { status?: string } | undefined;
    service.enviarParaRevisao('n1').subscribe((n) => (recebida = n));

    const req = httpMock.expectOne((r) => r.url === '/notas/n1/enviar-para-revisao');
    expect(req.request.method).toBe('POST');
    req.flush({ id: 'n1', status: 'AGUARDANDO_APROVACAO' });

    expect(recebida?.status).toBe('AGUARDANDO_APROVACAO');
  });

  it('retirarDaRevisao devolve a nota para rascunho', () => {
    service.retirarDaRevisao('n1').subscribe();
    httpMock.expectOne((r) => r.url === '/notas/n1/retirar-da-revisao').flush({});
  });

  it('revisoes traz o historico, que e como o produtor sabe por que voltou', () => {
    let historico: unknown[] | undefined;
    service.revisoes('n1').subscribe((h) => (historico = h));

    httpMock
      .expectOne((r) => r.url === '/notas/n1/revisoes')
      .flush([
        { id: 'r1', acao: 'DEVOLVIDA', motivo: 'Falta o CFOP', papel: 'CONTADOR', ocorridoEm: 'x' },
      ]);

    expect(historico?.length).toBe(1);
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

  it('INT-13: baixarPdf usa responseType blob + observe:response e expõe o Content-Disposition', () => {
    let resp: HttpResponse<Blob> | undefined;
    service.baixarPdf('abc').subscribe(r => (resp = r));
    const req = httpMock.expectOne('/notas/abc/pdf');
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['%PDF-1.4'], { type: 'application/pdf' }), {
      headers: { 'Content-Disposition': 'attachment; filename="danfe-abc.pdf"' },
    });
    expect(resp?.body).toBeInstanceOf(Blob);
    expect(resp?.headers.get('Content-Disposition')).toBe('attachment; filename="danfe-abc.pdf"');
  });

  it('INT-13: obterXml usa responseType text + observe:response e expõe o Content-Disposition', () => {
    let resp: HttpResponse<string> | undefined;
    service.obterXml('abc').subscribe(r => (resp = r));
    const req = httpMock.expectOne('/notas/abc/xml');
    expect(req.request.method).toBe('GET');
    expect(req.request.responseType).toBe('text');
    req.flush('<nfe/>', { headers: { 'Content-Disposition': 'attachment; filename="nota-abc.xml"' } });
    expect(resp?.body).toBe('<nfe/>');
    expect(resp?.headers.get('Content-Disposition')).toBe('attachment; filename="nota-abc.xml"');
  });

  /**
   * `status` e `busca` passaram a ser do servidor (issue #104).
   *
   * Ate entao a rota so aceitava `Pageable`, e esta tela filtrava em memoria sobre a pagina
   * carregada -- o filtro nao enxergava o que estivesse fora dela. Medido contra a API local em
   * 29/10, com 15 notas na base: `?status=COM_INCONSISTENCIAS` devolve 2 e `?busca=Cafeeira`
   * devolve 1, enquanto `?de=...&ate=...` **continua devolvendo as 15** -- por isso o recorte por
   * data segue em memoria.
   */
  describe('filtros de servidor (#104)', () => {
    it('manda status e busca quando existem', () => {
      service.listar({ page: 0, size: 12, status: 'COM_INCONSISTENCIAS', busca: 'Cafeeira' }).subscribe();
      const req = httpMock.expectOne((r) => r.url === '/notas');
      expect(req.request.params.get('status')).toBe('COM_INCONSISTENCIAS');
      expect(req.request.params.get('busca')).toBe('Cafeeira');
      req.flush({ content: [], totalElements: 0 });
    });

    it('nao manda parametro vazio — ausente e diferente de "qualquer"', () => {
      service.listar({ page: 0, size: 12 }).subscribe();
      const req = httpMock.expectOne((r) => r.url === '/notas');
      expect(req.request.params.has('status')).toBe(false);
      expect(req.request.params.has('busca')).toBe(false);
      req.flush({ content: [], totalElements: 0 });
    });

    it('string vazia tambem nao vira parametro', () => {
      service.listar({ status: '', busca: '' }).subscribe();
      const req = httpMock.expectOne((r) => r.url === '/notas');
      expect(req.request.params.has('status')).toBe(false);
      expect(req.request.params.has('busca')).toBe(false);
      req.flush({ content: [], totalElements: 0 });
    });
  });
});
