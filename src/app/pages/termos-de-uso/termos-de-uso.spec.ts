import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { versaoEmDataBr } from '@services/termos/data-access/termos.service';
import { TermosDeUsoPage } from './termos-de-uso';

/**
 * Os termos de uso públicos (#211). O que esta suíte guarda: o texto é **do backend**, inteiro e
 * na ordem recebida, e a página não inventa nenhum parágrafo.
 */
describe('TermosDeUsoPage', () => {
  let httpMock: HttpTestingController;

  const termos = {
    versao: '2026-11-24',
    controlador: 'GWNext',
    contato: 'contato@gwnext.com.br',
    secoes: [
      {
        id: 'quem-somos',
        titulo: 'Quem oferece o AgroConIA',
        paragrafos: ['O AgroConIA é oferecido pela GWNext.'],
        itens: [],
      },
      {
        id: 'demonstracao',
        titulo: 'Fase de demonstração',
        paragrafos: ['O sistema está em demonstração.'],
        itens: ['A autorização na SEFAZ é simulada.', 'Os dados podem ser apagados.'],
      },
    ],
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [TermosDeUsoPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function montar(corpo: Record<string, unknown>) {
    const f = TestBed.createComponent(TermosDeUsoPage);
    f.detectChanges();
    httpMock.expectOne('/termos-de-uso').flush(corpo);
    f.detectChanges();
    return f;
  }

  const raiz = (f: { nativeElement: unknown }) => f.nativeElement as HTMLElement;
  const texto = (f: { nativeElement: unknown }) => raiz(f).textContent ?? '';

  it('mostra a versão em dd/MM/aaaa no topo, como a seção "Mudanças" promete', () => {
    expect(texto(montar(termos))).toContain('Versão de 24/11/2026');
  });

  it('numera as seções pela ordem recebida e põe a âncora de cada uma', () => {
    const f = montar(termos);
    const titulos = [...raiz(f).querySelectorAll('h2')].map((h) => h.textContent?.trim());

    expect(titulos).toEqual(['1. Quem oferece o AgroConIA', '2. Fase de demonstração']);
    expect(raiz(f).querySelector('#quem-somos')).toBeTruthy();
    expect(raiz(f).querySelector('#demonstracao')).toBeTruthy();
  });

  it('mostra os parágrafos e, depois deles, a lista da seção', () => {
    const f = montar(termos);
    const demonstracao = raiz(f).querySelector('#demonstracao')!;
    const paragrafo = demonstracao.querySelector('p');
    const itens = [...demonstracao.querySelectorAll('li')].map((li) => li.textContent?.trim());

    expect(paragrafo?.textContent?.trim()).toBe('O sistema está em demonstração.');
    expect(itens).toEqual(['A autorização na SEFAZ é simulada.', 'Os dados podem ser apagados.']);
    // A lista vem depois do parágrafo que a introduz, não antes.
    expect(paragrafo!.compareDocumentPosition(demonstracao.querySelector('ul')!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('seção sem lista não desenha uma lista vazia', () => {
    const f = montar(termos);
    expect(raiz(f).querySelector('#quem-somos')!.querySelector('ul')).toBeNull();
  });

  it('leva ao contato por e-mail e à política de privacidade, que o texto cita pelo nome', () => {
    const f = montar(termos);
    const links = [...raiz(f).querySelectorAll('a')].map((a) => a.getAttribute('href'));

    expect(links).toContain('mailto:contato@gwnext.com.br');
    expect(links).toContain('/politica-dados');
  });

  it('quem não entrou tem o caminho para o login e para o cadastro', () => {
    const f = montar(termos);
    expect(texto(f)).toContain('Ir para o login');
    expect(texto(f)).toContain('Criar conta');
  });

  it('sem resposta do backend, mostra a falha e deixa tentar de novo — e nunca um texto local', () => {
    const f = TestBed.createComponent(TermosDeUsoPage);
    f.detectChanges();
    httpMock.expectOne('/termos-de-uso').flush('fora do ar', { status: 503, statusText: 'oops' });
    f.detectChanges();

    expect(texto(f)).toContain('Não foi possível carregar os termos agora.');
    expect(texto(f)).toContain('Tentar de novo');
    // O documento não pode ter uma cópia embutida que apareça quando a API falha.
    expect(raiz(f).querySelectorAll('h2')).toHaveLength(0);
  });

  it('o "Tentar de novo" pede os termos outra vez', () => {
    const f = TestBed.createComponent(TermosDeUsoPage);
    f.detectChanges();
    httpMock.expectOne('/termos-de-uso').flush(null, { status: 503, statusText: 'oops' });
    f.detectChanges();

    raiz(f).querySelector('button')!.click();
    f.detectChanges();
    httpMock.expectOne('/termos-de-uso').flush(termos);
    f.detectChanges();

    expect(texto(f)).toContain('1. Quem oferece o AgroConIA');
  });
});

describe('versaoEmDataBr', () => {
  it('troca AAAA-MM-DD por dd/MM/aaaa', () => {
    expect(versaoEmDataBr('2026-11-24')).toBe('24/11/2026');
    // Dia 1: sem `new Date`, o fuso do Brasil não puxa a data para o dia anterior.
    expect(versaoEmDataBr('2026-01-01')).toBe('01/01/2026');
  });

  it('o que não tem a forma esperada é mostrado como veio', () => {
    expect(versaoEmDataBr('v2')).toBe('v2');
    expect(versaoEmDataBr('')).toBe('');
  });
});
