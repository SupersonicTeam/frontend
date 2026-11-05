import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { PrivacidadeConta } from './privacidade-conta';
import { EncerramentoService } from '@core/services/encerramento.service';
import { ID_PRODUTOR_TESTE, entrarComo } from '@core/services/sessao.testing';

/** Excluir a conta (#137, LGPD): duas etapas, a guarda fiscal explicada, e o Sair depois do 204. */
describe('PrivacidadeConta', () => {
  let httpMock: HttpTestingController;
  let encerrou: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [PrivacidadeConta],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    httpMock = TestBed.inject(HttpTestingController);
    entrarComo('PRODUTOR');
    encerrou = vi
      .spyOn(TestBed.inject(EncerramentoService), 'encerrar')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  function abrir() {
    const fixture = TestBed.createComponent(PrivacidadeConta);
    fixture.detectChanges();
    return fixture;
  }

  const texto = (f: { nativeElement: unknown }) => (f.nativeElement as HTMLElement).textContent;

  it('a primeira etapa explica o que fica guardado por 5 anos, sem campo de senha', () => {
    const f = abrir();
    f.componentInstance.etapa.set(1);
    f.detectChanges();
    expect(texto(f)).toContain('CPF/CNPJ, inscrição estadual e UF ficam guardados por 5 anos');
    expect((f.nativeElement as HTMLElement).querySelector('input[type=password]')).toBeNull();
  });

  it('com a senha, apaga pelo id da sessao e encerra como o "sair de todos"', () => {
    const f = abrir();
    const cmp = f.componentInstance;
    cmp.etapa.set(2);
    cmp.senha.set('minha-senha-longa');
    cmp.excluir();

    const req = httpMock.expectOne(`/usuarios/${ID_PRODUTOR_TESTE}/dados`);
    expect(req.request.method).toBe('DELETE');
    expect(req.request.body).toEqual({ senha: 'minha-senha-longa' });
    req.flush(null, { status: 204, statusText: 'No Content' });

    expect(encerrou).toHaveBeenCalled();
  });

  it('senha errada diz isso e nao encerra nada', () => {
    const f = abrir();
    const cmp = f.componentInstance;
    cmp.etapa.set(2);
    cmp.senha.set('errada');
    cmp.excluir();
    httpMock
      .expectOne(`/usuarios/${ID_PRODUTOR_TESTE}/dados`)
      .flush(
        { errors: [{ code: 'SENHA_ATUAL_INCORRETA', message: 'x' }] },
        { status: 400, statusText: 'Bad Request' },
      );

    expect(cmp.erro()).toContain('Senha incorreta');
    expect(cmp.senha()).toBe('');
    expect(encerrou).not.toHaveBeenCalled();
  });

  it('404 pede para entrar de novo', () => {
    const cmp = abrir().componentInstance;
    cmp.etapa.set(2);
    cmp.senha.set('qualquer');
    cmp.excluir();
    httpMock
      .expectOne(`/usuarios/${ID_PRODUTOR_TESTE}/dados`)
      .flush({}, { status: 404, statusText: 'Not Found' });
    expect(cmp.erro()).toContain('entre de novo');
  });
});
