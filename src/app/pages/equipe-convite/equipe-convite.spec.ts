import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { CHAVE_TOKEN_CONVITE, EquipeConvitePage } from './equipe-convite';
import { entrarComo } from '@core/services/sessao.testing';

/**
 * `/equipe/convite#token=…` (#148): contador logado entra na equipe, quem não tem conta cria uma,
 * produtor logado é orientado a sair. O token vem do fragmento e atravessa o login na aba.
 */
describe('EquipeConvitePage', () => {
  let httpMock: HttpTestingController;
  let navegou: string[];

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    history.replaceState(null, '', '/equipe/convite#token=tok-1');
    TestBed.configureTestingModule({
      imports: [EquipeConvitePage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: '**', children: [] }]),
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const router = TestBed.inject(Router);
    navegou = [];
    vi.spyOn(router, 'navigateByUrl').mockImplementation((url) => {
      navegou.push(String(url));
      return Promise.resolve(true);
    });
    vi.spyOn(router, 'navigate').mockImplementation((comandos) => {
      navegou.push(comandos.join('/'));
      return Promise.resolve(true);
    });
  });

  afterEach(() => {
    httpMock.verify();
    history.replaceState(null, '', '/');
    sessionStorage.clear();
    localStorage.clear();
  });

  function abrir() {
    const fixture = TestBed.createComponent(EquipeConvitePage);
    fixture.detectChanges();
    return fixture;
  }

  const texto = (f: { nativeElement: unknown }) => (f.nativeElement as HTMLElement).textContent;

  it('contador logado entra na equipe com o token do link', () => {
    entrarComo('CONTADOR');
    const f = abrir();
    f.componentInstance.aceitar();
    const req = httpMock.expectOne('/escritorio/membros/convites/aceitar');
    expect(req.request.body).toEqual({ token: 'tok-1' });
    req.flush({ id: 'm1', nomeCompleto: 'Ana', crc: null, funcao: 'CONTADOR' });

    expect(navegou).toContain('/contador');
    expect(sessionStorage.getItem(CHAVE_TOKEN_CONVITE)).toBeNull();
  });

  /**
   * O 409 `ESCRITORIO_ATUAL_EM_USO` tem dois motivos desde a backend#524: o escritório atual tem
   * clientes ou equipe, ou quem aceita é administrador de um empresarial. A frase fixa da tela só
   * servia ao primeiro; agora vale a do servidor, com a sugestão dele.
   */
  it.each([
    [
      'O seu escritório atual ainda tem clientes ou equipe.',
      'Encerre os vínculos e remova a equipe antes.',
    ],
    ['O administrador de um escritório empresarial não entra em outra equipe.', undefined],
  ])(
    'ESCRITORIO_ATUAL_EM_USO mostra a frase do servidor, sem matar o link (%s)',
    (message, suggestion) => {
      entrarComo('CONTADOR');
      const f = abrir();
      f.componentInstance.aceitar();
      httpMock
        .expectOne('/escritorio/membros/convites/aceitar')
        .flush(
          { errors: [{ code: 'ESCRITORIO_ATUAL_EM_USO', message, suggestion }] },
          { status: 409, statusText: 'Conflict' },
        );
      f.detectChanges();

      expect(texto(f)).toContain(message);
      if (suggestion) expect(texto(f)).toContain(suggestion);
      expect(f.componentInstance.linkInvalido()).toBe(false);
    },
  );

  it('link invalido ou vencido vira a tela de "nao vale mais"', () => {
    entrarComo('CONTADOR');
    const f = abrir();
    f.componentInstance.aceitar();
    httpMock
      .expectOne('/escritorio/membros/convites/aceitar')
      .flush(
        { errors: [{ code: 'CONVITE_EQUIPE_INVALIDO', message: 'x' }] },
        { status: 400, statusText: 'Bad Request' },
      );
    f.detectChanges();

    expect(texto(f)).toContain('Este convite não vale mais');
  });

  it('o aceite liga para os Termos de uso e para a Politica, em aba nova (#211)', () => {
    const f = abrir();
    const links = [...(f.nativeElement as HTMLElement).querySelectorAll('a')];
    const termos = links.find((a) => a.textContent?.trim() === 'Termos de uso');
    const politica = links.find((a) => a.textContent?.trim() === 'Política de privacidade');

    expect(termos?.getAttribute('href')).toBe('/termos-de-uso');
    expect(politica?.getAttribute('href')).toBe('/politica-dados');
    for (const link of [termos, politica]) {
      expect(link?.getAttribute('target')).toBe('_blank');
      expect(link?.getAttribute('rel')).toBe('noopener');
    }
  });

  it('sem conta: cria a de contador pelo link, com o documento so em digitos, e vai ao login', () => {
    const f = abrir();
    const cmp = f.componentInstance;
    cmp.nome.set(' Ana Souza ');
    cmp.cpfCnpj.set('529.982.247-25');
    cmp.senha.set('uma-senha-longa');
    cmp.aceiteTermos.set(true);
    cmp.cadastrar();

    const req = httpMock.expectOne('/auth/cadastro/equipe');
    expect(req.request.body).toEqual({
      token: 'tok-1',
      nomeCompleto: 'Ana Souza',
      cpfCnpj: '52998224725',
      senha: 'uma-senha-longa',
      aceiteTermos: true,
    });
    req.flush(null, { status: 201, statusText: 'Created' });
    expect(navegou).toContain('/login');
  });

  it('CPF com digito errado nao vai ao servidor: o campo e marcado (#156)', () => {
    const cmp = abrir().componentInstance;
    cmp.nome.set('Ana Souza');
    cmp.cpfCnpj.set('123.456.789-00');
    cmp.senha.set('uma-senha-longa');
    cmp.aceiteTermos.set(true);
    cmp.cadastrar();

    httpMock.expectNone('/auth/cadastro/equipe');
    expect(cmp.erroDocumento()).toBe('CPF/CNPJ inválido. Confira os dígitos.');
  });

  it('o token sobrevive a ida ao login: fica na aba e volta sem o fragmento', () => {
    abrir().componentInstance.irAoLogin();
    expect(sessionStorage.getItem(CHAVE_TOKEN_CONVITE)).toBe('tok-1');

    history.replaceState(null, '', '/equipe/convite');
    entrarComo('CONTADOR');
    const f = abrir();
    f.componentInstance.aceitar();
    expect(httpMock.expectOne('/escritorio/membros/convites/aceitar').request.body).toEqual({
      token: 'tok-1',
    });
  });

  it('produtor logado e orientado a sair, sem formulario', () => {
    entrarComo('PRODUTOR');
    const f = abrir();
    expect(texto(f)).toContain('conta de produtor');
    expect((f.nativeElement as HTMLElement).querySelector('form')).toBeNull();
  });

  it('sem token nenhum, a tela diz que o link chegou incompleto', () => {
    history.replaceState(null, '', '/equipe/convite');
    expect(texto(abrir())).toContain('O link chegou incompleto');
  });

  it('lido o token, ele sai do endereco', () => {
    abrir();
    expect(location.hash).toBe('');
  });
});
