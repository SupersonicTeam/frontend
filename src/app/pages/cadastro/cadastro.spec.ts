import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { SessaoService } from '@core/services/sessao.service';
import { CadastroPage } from './cadastro';

/**
 * Criar conta (#131).
 *
 * Até esta tela, conta só nascia por `curl`: o login da #93 deixava entrar quem já tinha uma, e
 * mais ninguém. Com o basic auth do Caddy removido, é por aqui que chega quem não tem conta.
 */
describe('CadastroPage', () => {
  let httpMock: HttpTestingController;
  let sessao: SessaoService;
  let navegouPara: string[];

  function montar() {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [CadastroPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    httpMock = TestBed.inject(HttpTestingController);
    sessao = TestBed.inject(SessaoService);

    navegouPara = [];
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockImplementation((d) => {
      navegouPara.push(String(d));
      return Promise.resolve(true);
    });

    const fixture = TestBed.createComponent(CadastroPage);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  /** Preenche tudo com dados válidos, deixando a senha por conta do teste. */
  function preencher(cmp: CadastroPage, senha = 'UmaSenhaBoa2026!') {
    cmp.nome.set('Maria Agricultora');
    cmp.cpfCnpj.set('529.982.247-25');
    cmp.email.set('maria@exemplo.com.br');
    cmp.senha.set(senha);
  }

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('o documento', () => {
    it.each([
      ['52998224725', 11, true],
      ['11222333000181', 14, true],
      ['5299822472', 10, false],
      ['123', 3, false],
    ])('%s (%i dígitos) é válido: %s', (valor, _n, esperado) => {
      const cmp = montar();
      cmp.cpfCnpj.set(valor);

      expect(cmp.documentoValido()).toBe(esperado);
    });

    it('a máscara não atrapalha a contagem', () => {
      const cmp = montar();
      cmp.cpfCnpj.set('529.982.247-25');

      expect(cmp.documentoValido()).toBe(true);
    });
  });

  it('o botão só libera com tudo preenchido e o documento no tamanho certo', () => {
    const cmp = montar();
    expect(cmp.podeEnviar()).toBe(false);

    preencher(cmp);
    expect(cmp.podeEnviar()).toBe(true);

    cmp.cpfCnpj.set('529');
    expect(cmp.podeEnviar()).toBe(false);
  });

  /**
   * A força da senha **não** é checada aqui de propósito: quem conhece a lista de senhas comuns, e
   * sabe se ela contém o e-mail ou o documento, é o servidor. Duas verdades sobre a mesma regra
   * seria uma a mais, e a do cliente envelheceria primeiro.
   */
  it('senha curta não é barrada no cliente — quem decide é o servidor', () => {
    const cmp = montar();
    preencher(cmp, 'abc');

    expect(cmp.podeEnviar()).toBe(true);
  });

  it('criando a conta, vai para o login — o cadastro não devolve token', () => {
    const cmp = montar();
    preencher(cmp);

    cmp.criar();
    expect(cmp.enviando()).toBe(true);

    httpMock.expectOne('/auth/cadastro').flush(null, { status: 201, statusText: 'Created' });

    expect(cmp.enviando()).toBe(false);
    expect(sessao.logado()).toBe(false);
    expect(navegouPara).toEqual(['/login']);
  });

  describe('os erros caem onde a pessoa pode agir', () => {
    function falhar(cmp: CadastroPage, code: string, status: number, field?: string, msg = 'erro') {
      cmp.criar();
      httpMock
        .expectOne('/auth/cadastro')
        .flush({ errors: [{ code, field, message: msg }] }, { status, statusText: 'erro' });
    }

    it('SENHA_FRACA aparece no campo da senha, com o texto do servidor', () => {
      const cmp = montar();
      preencher(cmp);

      falhar(cmp, 'SENHA_FRACA', 400, 'senha', 'A senha precisa ter pelo menos 10 caracteres.');

      expect(cmp.erroSenha()).toBe('A senha precisa ter pelo menos 10 caracteres.');
      expect(cmp.erro()).toBeNull();
    });

    /**
     * O conflito **não diz qual** dos dois repetiu — responder "este e-mail já existe" contaria a
     * um estranho quem tem conta aqui. A tela também não tenta adivinhar.
     */
    it('CADASTRO_CONFLITO vira erro geral, sem apontar e-mail nem documento', () => {
      const cmp = montar();
      preencher(cmp);

      falhar(cmp, 'CADASTRO_CONFLITO', 409, undefined, 'Nao foi possivel concluir o cadastro.');

      expect(cmp.erro()).toBe('Nao foi possivel concluir o cadastro.');
      expect(cmp.erro()).not.toMatch(/e-?mail|CPF|CNPJ/i);
      expect(cmp.erroSenha()).toBeNull();
    });

    it('o 429 diz quando tentar de novo', () => {
      const cmp = montar();
      preencher(cmp);

      cmp.criar();
      httpMock
        .expectOne('/auth/cadastro')
        .flush(
          { errors: [{ code: 'MUITAS_TENTATIVAS', message: 'Muitas tentativas.' }] },
          { status: 429, statusText: 'Too Many Requests', headers: { 'Retry-After': '120' } },
        );

      expect(cmp.erro()).toContain('2 min');
    });

    it('uma nova tentativa limpa os erros anteriores', () => {
      const cmp = montar();
      preencher(cmp);
      falhar(cmp, 'SENHA_FRACA', 400, 'senha');
      expect(cmp.erroSenha()).toBeTruthy();

      cmp.criar();
      expect(cmp.erroSenha()).toBeNull();
      httpMock.expectOne('/auth/cadastro').flush(null, { status: 201, statusText: 'Created' });
    });

    it('falhando, não navega nem abre sessão', () => {
      const cmp = montar();
      preencher(cmp);

      falhar(cmp, 'CADASTRO_CONFLITO', 409);

      expect(navegouPara).toEqual([]);
      expect(sessao.logado()).toBe(false);
    });
  });
});
