import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { EsqueciSenhaPage } from './esqueci-senha';
import { RedefinirSenhaPage } from './redefinir-senha';

/**
 * As duas telas de recuperação de senha (#131).
 *
 * Elas carregam dois cuidados do contrato que é fácil desfazer sem perceber: a resposta que não
 * revela quem tem conta, e o token que viaja no fragmento.
 */
describe('recuperação de senha', () => {
  let httpMock: HttpTestingController;
  let navegouPara: string[];

  function preparar(imports: unknown[]) {
    TestBed.configureTestingModule({
      imports: imports as never[],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    httpMock = TestBed.inject(HttpTestingController);
    navegouPara = [];
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockImplementation((d) => {
      navegouPara.push(String(d));
      return Promise.resolve(true);
    });
  }

  afterEach(() => {
    httpMock.verify();
    vi.restoreAllMocks();
  });

  describe('EsqueciSenhaPage', () => {
    function montar() {
      preparar([EsqueciSenhaPage]);
      const fixture = TestBed.createComponent(EsqueciSenhaPage);
      fixture.detectChanges();
      return fixture.componentInstance;
    }

    it('o botão só libera com e-mail', () => {
      const cmp = montar();
      expect(cmp.podeEnviar()).toBe(false);

      cmp.email.set('alguem@exemplo.com.br');
      expect(cmp.podeEnviar()).toBe(true);
    });

    /**
     * **A mesma resposta exista a conta ou não.** Medido: o servidor devolve 202 nos dois casos,
     * para não contar a um estranho quais e-mails têm conta aqui. A tela não pode desfazer isso
     * mostrando um estado diferente para cada.
     */
    it('o 202 vira o mesmo aviso, sem dizer se a conta existe', () => {
      const cmp = montar();
      cmp.email.set('naoexiste@exemplo.com.br');

      cmp.pedir();
      httpMock
        .expectOne('/auth/senha/esqueci')
        .flush(null, { status: 202, statusText: 'Accepted' });

      expect(cmp.pedido()).toBe(true);
      expect(cmp.erro()).toBeNull();
    });

    it('servidor fora do ar não é "e-mail não existe"', () => {
      const cmp = montar();
      cmp.email.set('a@b.com.br');

      cmp.pedir();
      httpMock.expectOne('/auth/senha/esqueci').error(new ProgressEvent('error'));

      expect(cmp.pedido()).toBe(false);
      expect(cmp.erro()).toContain('Sem conexão');
    });
  });

  describe('RedefinirSenhaPage', () => {
    /** A página lê o token de `location.hash` na construção. */
    function montarCom(hash: string) {
      window.location.hash = hash;
      preparar([RedefinirSenhaPage]);
      const fixture = TestBed.createComponent(RedefinirSenhaPage);
      fixture.detectChanges();
      return fixture.componentInstance;
    }

    afterEach(() => {
      window.location.hash = '';
    });

    /**
     * **O token vem no fragmento, não em query.** O fragmento não é enviado ao servidor, não entra
     * em log de acesso nem no `Referer` — um token de redefinição em `?token=` vazaria por
     * qualquer um desses caminhos. Este teste existe para que trocar `location.hash` por
     * `queryParams` custe uma reprovação.
     */
    it('lê o token do fragmento', () => {
      expect(montarCom('#token=abc-123').temToken()).toBe(true);
    });

    it('aceita o fragmento com mais de um par', () => {
      const cmp = montarCom('#origem=email&token=abc-123');
      cmp.senha.set('UmaSenhaBoa2026!');

      cmp.redefinir();
      const req = httpMock.expectOne('/auth/senha/redefinir');
      expect(req.request.body).toEqual({ token: 'abc-123', novaSenha: 'UmaSenhaBoa2026!' });
      req.flush(null, { status: 204, statusText: 'No Content' });
    });

    it('sem fragmento, nem oferece o formulário', () => {
      const cmp = montarCom('');

      expect(cmp.temToken()).toBe(false);
      expect(cmp.podeEnviar()).toBe(false);
    });

    it('redefinindo, vai para o login', () => {
      const cmp = montarCom('#token=abc-123');
      cmp.senha.set('UmaSenhaBoa2026!');

      cmp.redefinir();
      httpMock
        .expectOne('/auth/senha/redefinir')
        .flush(null, { status: 204, statusText: 'No Content' });

      expect(navegouPara).toEqual(['/login']);
    });

    /** Link morto: insistir com a mesma senha não muda nada, então o formulário sai de cena. */
    it('TOKEN_REDEFINICAO_INVALIDO troca o formulário por "peça outro link"', () => {
      const cmp = montarCom('#token=velho');
      cmp.senha.set('UmaSenhaBoa2026!');

      cmp.redefinir();
      httpMock
        .expectOne('/auth/senha/redefinir')
        .flush(
          { errors: [{ code: 'TOKEN_REDEFINICAO_INVALIDO', field: 'token', message: 'expirado' }] },
          { status: 400, statusText: 'Bad Request' },
        );

      expect(cmp.linkInvalido()).toBe(true);
      expect(cmp.podeEnviar()).toBe(false);
      expect(navegouPara).toEqual([]);
    });

    /** Senha fraca é outra história: **o link continua valendo**, é só tentar outra senha. */
    it('SENHA_FRACA mantém o formulário de pé', () => {
      const cmp = montarCom('#token=abc-123');
      cmp.senha.set('curta');

      cmp.redefinir();
      httpMock
        .expectOne('/auth/senha/redefinir')
        .flush(
          {
            errors: [{ code: 'SENHA_FRACA', field: 'senha', message: 'pelo menos 10 caracteres' }],
          },
          { status: 400, statusText: 'Bad Request' },
        );

      expect(cmp.erroSenha()).toContain('10 caracteres');
      expect(cmp.linkInvalido()).toBe(false);
      expect(cmp.podeEnviar()).toBe(true);
    });
  });
});
