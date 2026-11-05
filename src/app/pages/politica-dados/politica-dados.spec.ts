import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { PoliticaDadosPage } from './politica-dados';

/** A política de dados pública (#137): o texto vem do backend, sem login. */
describe('PoliticaDadosPage', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [PoliticaDadosPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('mostra as secoes que vieram da API e o caminho para o login de quem nao entrou', () => {
    const f = TestBed.createComponent(PoliticaDadosPage);
    f.detectChanges();
    httpMock.expectOne('/politica-dados').flush({
      versao: '1.0',
      controlador: 'GWNext',
      contatoEncarregado: 'contato@gwnext.com.br',
      dadosColetados: ['Nome e CPF/CNPJ'],
      finalidades: ['Emitir nota fiscal'],
      basesLegais: [],
      compartilhamento: [],
      retencao: ['Documento fiscal: 5 anos'],
      direitos: ['Excluir a conta'],
      comoExercer: 'Em Configurações.',
    });
    f.detectChanges();

    const texto = (f.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('GWNext');
    expect(texto).toContain('Documento fiscal: 5 anos');
    // Secao vazia nao aparece.
    expect(texto).not.toContain('Com que base legal');
    expect(texto).toContain('Ir para o login');
  });

  it('falha mostra o aviso com "tentar de novo"', () => {
    const f = TestBed.createComponent(PoliticaDadosPage);
    f.detectChanges();
    httpMock.expectOne('/politica-dados').flush('x', { status: 500, statusText: 'erro' });
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).textContent).toContain('Não foi possível carregar');
  });
});
