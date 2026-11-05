import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { EscritorioProdutor } from './escritorio-produtor';

const convite = {
  id: 'c1',
  escritorio: 'Contabilidade Campo Bom',
  convidadoPor: 'Ana',
  crc: 'PR-123',
  situacao: 'PENDENTE',
  criadoEm: '2026-11-01T10:00:00-03:00',
  expiraEm: '2026-11-08T10:00:00-03:00',
};

const vinculo = (situacao: string) => ({
  id: 'v1',
  escritorioId: 'e1',
  escritorio: 'Contabilidade Campo Bom',
  responsavel: null,
  crc: null,
  situacao,
  inicio: '2026-10-01T10:00:00-03:00',
  fim: null,
});

/** O escritório do produtor em Configurações (#147): aceitar, recusar e encerrar. */
describe('EscritorioProdutor', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [EscritorioProdutor],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function abrir(convites: unknown[], vinculos: unknown[]) {
    const fixture = TestBed.createComponent(EscritorioProdutor);
    fixture.detectChanges();
    httpMock.expectOne('/convites').flush(convites);
    httpMock.expectOne('/vinculos').flush(vinculos);
    fixture.detectChanges();
    return fixture;
  }

  const texto = (f: { nativeElement: unknown }) => (f.nativeElement as HTMLElement).textContent;

  it('mostra o convite pendente com quem mandou', () => {
    const f = abrir([convite], []);
    expect(texto(f)).toContain('Contabilidade Campo Bom');
    expect(texto(f)).toContain('convite de Ana, CRC PR-123');
  });

  it('aceitar chama a rota e recarrega convites e vinculos', () => {
    const f = abrir([convite], []);
    f.componentInstance.responder(f.componentInstance.convites()[0]!, 'aceitar');
    const req = httpMock.expectOne('/convites/c1/aceitar');
    expect(req.request.method).toBe('POST');
    req.flush({ ...convite, situacao: 'ACEITO' });
    httpMock.expectOne('/convites').flush([]);
    httpMock.expectOne('/vinculos').flush([vinculo('ATIVO')]);
    f.detectChanges();

    expect(texto(f)).toContain('Encerrar vínculo');
  });

  it('recusar chama a rota de recusa', () => {
    const f = abrir([convite], []);
    f.componentInstance.responder(f.componentInstance.convites()[0]!, 'recusar');
    httpMock.expectOne('/convites/c1/recusar').flush({ ...convite, situacao: 'RECUSADO' });
    httpMock.expectOne('/convites').flush([]);
    httpMock.expectOne('/vinculos').flush([]);
  });

  it('encerrar pede confirmacao e so entao chama a rota', () => {
    const f = abrir([], [vinculo('ATIVO'), vinculo('ENCERRADO')]);
    const cmp = f.componentInstance;
    expect(cmp.vinculosAtuais()).toHaveLength(1);

    cmp.encerrando.set(cmp.vinculosAtuais()[0]!);
    httpMock.expectNone('/vinculos/v1/encerrar');
    cmp.encerrar();
    httpMock.expectOne('/vinculos/v1/encerrar').flush(vinculo('ENCERRADO'));
    httpMock.expectOne('/convites').flush([]);
    httpMock.expectOne('/vinculos').flush([vinculo('ENCERRADO')]);
    f.detectChanges();

    expect(texto(f)).toContain('Nenhum escritório atende você agora');
  });
});
