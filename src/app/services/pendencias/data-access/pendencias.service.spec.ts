import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PendenciasApi } from './pendencias.service';
import type { Pendencia } from '@models/pendencia.model';

function pendencia(over: Partial<Pendencia> = {}): Pendencia {
  return {
    id: 'p1',
    produtorId: 'prod1',
    escritorioId: 'esc1',
    titulo: 'Comprovantes de frete de setembro',
    descricao: 'Preciso dos comprovantes das três cargas.',
    observacoes: null,
    dataLimite: '2026-11-05',
    tiposDocumento: ['NOTA_FISCAL', 'COMPROVANTE_PAGAMENTO'],
    status: 'PENDENTE',
    motivo: null,
    quantidadeAnexos: 0,
    anexos: [],
    createdAt: '2026-10-28T15:55:56Z',
    updatedAt: '2026-10-28T15:55:56Z',
    ...over,
  };
}

describe('PendenciasApi', () => {
  let service: PendenciasApi;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PendenciasApi, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PendenciasApi);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('listar usa a rota do produtor, que não leva produtorId nenhum', () => {
    service.listar().subscribe();

    const req = httpMock.expectOne((r) => r.url === '/pendencias');
    // O produtor é o autenticado. A rota antiga (`/contador/pendencias?produtorId=`) respondia 404.
    expect(req.request.params.keys()).toEqual([]);
    req.flush([]);
  });

  it('listar repete o filtro status, que o backend aceita mais de uma vez', () => {
    service.listar(['PENDENTE', 'ENVIADA']).subscribe();

    const req = httpMock.expectOne((r) => r.url === '/pendencias');
    expect(req.request.params.getAll('status')).toEqual(['PENDENTE', 'ENVIADA']);
    req.flush([]);
  });

  it('detalhar busca a pendência com os anexos', () => {
    let recebida: Pendencia | undefined;
    service.detalhar('p9').subscribe((p) => (recebida = p));

    httpMock
      .expectOne((r) => r.url === '/pendencias/p9')
      .flush(pendencia({ id: 'p9', quantidadeAnexos: 1 }));

    expect(recebida?.id).toBe('p9');
  });

  it('anexar manda multipart com a parte chamada "arquivo"', () => {
    const arquivo = new File(['conteudo'], 'comprovante.pdf', { type: 'application/pdf' });
    service.anexar('p9', arquivo).subscribe();

    const req = httpMock.expectOne((r) => r.url === '/pendencias/p9/anexos');
    expect(req.request.method).toBe('POST');
    const corpo = req.request.body as FormData;
    expect(corpo.get('arquivo')).toBe(arquivo);
    req.flush(pendencia());
  });

  it('anexar NÃO declara Content-Type: quem monta o boundary do multipart é o navegador', () => {
    const arquivo = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    service.anexar('p9', arquivo).subscribe();

    const req = httpMock.expectOne((r) => r.url === '/pendencias/p9/anexos');
    expect(req.request.headers.has('Content-Type')).toBe(false);
    req.flush(pendencia());
  });

  it('anexar devolve a pendência atualizada, que é como a tela sabe do antivírus', () => {
    const arquivo = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    let recebida: Pendencia | undefined;
    service.anexar('p9', arquivo).subscribe((p) => (recebida = p));

    httpMock
      .expectOne((r) => r.url === '/pendencias/p9/anexos')
      .flush(
        pendencia({
          // Antivírus fora do ar: 201, anexo em verificação e a pendência **continua** PENDENTE.
          status: 'PENDENTE',
          quantidadeAnexos: 1,
          anexos: [
            {
              id: 'a1',
              nomeArquivo: 'a.pdf',
              mime: 'application/pdf',
              tamanho: 125,
              sha256: 'abc',
              situacao: 'EM_VERIFICACAO',
              enviadoEm: '2026-10-28T15:56:13Z',
            },
          ],
        }),
        { status: 201, statusText: 'Created' },
      );

    expect(recebida?.status).toBe('PENDENTE');
    expect(recebida?.anexos[0]?.situacao).toBe('EM_VERIFICACAO');
  });

  it('baixarAnexo pede blob e a resposta inteira, para ler o Content-Disposition', () => {
    service.baixarAnexo('p9', 'a1').subscribe();

    const req = httpMock.expectOne((r) => r.url === '/pendencias/p9/anexos/a1');
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob());
  });

  it('o erro sobe: a tela precisa distinguir arquivo recusado de limite estourado', () => {
    const arquivo = new File(['x'], 'a.exe', { type: 'application/octet-stream' });
    let status: number | undefined;
    service.anexar('p9', arquivo).subscribe({ error: (e) => (status = e.status) });

    httpMock
      .expectOne((r) => r.url === '/pendencias/p9/anexos')
      .flush({ errors: [{ code: 'ANEXO_INVALIDO' }] }, { status: 400, statusText: 'Bad Request' });

    expect(status).toBe(400);
  });
});
