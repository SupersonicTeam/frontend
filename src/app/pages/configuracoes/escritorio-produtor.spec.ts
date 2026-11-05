import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
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

  /**
   * O sino leva a `/configuracoes#escritorio` (#156). Sem isso a página abria no topo e o convite
   * ficava abaixo da dobra. A rolagem espera o vínculo carregar, porque antes a seção não tem altura.
   */
  describe('chegando pelo sino', () => {
    const scrollOriginal = Element.prototype.scrollIntoView;
    afterEach(() => {
      Element.prototype.scrollIntoView = scrollOriginal;
    });

    async function abrirEm(url: string) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [EscritorioProdutor],
        providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
      });
      httpMock = TestBed.inject(HttpTestingController);
      const router = TestBed.inject(Router);
      await router.navigateByUrl(url);
      const rolou = vi.fn();
      Element.prototype.scrollIntoView = rolou;
      const f = abrir([convite], []);
      await new Promise((r) => setTimeout(r));
      return { f, rolou, router };
    }

    /** O mesmo que o sino faz (`AppLayout.handleNotificacaoClick`). */
    async function clicarNoSino(router: Router) {
      await router.navigateByUrl('/#escritorio', { onSameUrlNavigation: 'reload' });
      await new Promise((r) => setTimeout(r));
    }

    it('com #escritorio, rola até a seção e põe o foco no título', async () => {
      const { f, rolou } = await abrirEm('/#escritorio');

      expect(rolou).toHaveBeenCalledTimes(1);
      const titulo = (f.nativeElement as HTMLElement).querySelector('#escritorio h2');
      expect(document.activeElement).toBe(titulo);
    });

    it('sem fragmento, a página fica onde está', async () => {
      const { rolou } = await abrirEm('/');

      expect(rolou).not.toHaveBeenCalled();
    });

    it('o sino clicado já em Configurações também leva à seção', async () => {
      const { rolou, router } = await abrirEm('/');
      await clicarNoSino(router);

      expect(rolou).toHaveBeenCalledTimes(1);
    });

    /** Achado do review: na mesma URL o roteador ignorava a navegação, e o fragmento não mudava. */
    it('o sino clicado de novo na mesma URL rola outra vez', async () => {
      const { rolou, router } = await abrirEm('/#escritorio');
      await clicarNoSino(router);

      expect(rolou).toHaveBeenCalledTimes(2);
    });
  });
});
