import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { EquipeEscritorio } from './equipe-escritorio';
import { ToastService } from '@core/services/toast.service';

const membros = [
  { id: 'm1', nomeCompleto: 'Ana Admin', crc: 'PR-1', funcao: 'ADMINISTRADOR' },
  { id: 'm2', nomeCompleto: 'Bia Assistente', crc: null, funcao: 'ASSISTENTE' },
];

/** Escritório e equipe, na aba /equipe (#148, #157): só o administrador gerencia. */
describe('EquipeEscritorio', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [EquipeEscritorio],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function abrir(funcao: string) {
    const fixture = TestBed.createComponent(EquipeEscritorio);
    fixture.detectChanges();
    httpMock
      .expectOne('/escritorio')
      .flush({ id: 'e1', nome: 'Campo Bom', cnpj: null, minhaFuncao: funcao, membros: 2 });
    httpMock.expectOne('/escritorio/membros').flush(membros);
    if (funcao === 'ADMINISTRADOR') {
      httpMock.expectOne('/escritorio/membros/convites').flush([]);
      httpMock.expectOne('/contador/etiquetas').flush([{ id: 'e1', nome: 'Soja' }]);
    }
    fixture.detectChanges();
    return fixture;
  }

  const el = (f: { nativeElement: unknown }) => f.nativeElement as HTMLElement;

  it('o administrador ve os controles de gestao', () => {
    const f = abrir('ADMINISTRADOR');
    expect(el(f).textContent).toContain('Convidar para a equipe');
    expect(el(f).textContent).toContain('Editar dados');
    expect(el(f).querySelectorAll('select').length).toBeGreaterThan(membros.length - 1);
  });

  it('o assistente so le: nem seletor de funcao, nem convite, nem remover', () => {
    const f = abrir('ASSISTENTE');
    expect(el(f).textContent).toContain('Bia Assistente');
    expect(el(f).textContent).not.toContain('Convidar para a equipe');
    expect(el(f).textContent).not.toContain('Remover');
    expect(el(f).querySelector('select')).toBeNull();
  });

  it('ULTIMO_ADMINISTRADOR tem frase propria e o seletor volta a funcao de antes', () => {
    const erro = vi.spyOn(TestBed.inject(ToastService), 'error');
    const f = abrir('ADMINISTRADOR');
    const seletor = document.createElement('select');
    for (const v of ['ADMINISTRADOR', 'CONTADOR']) {
      const o = document.createElement('option');
      o.value = v;
      seletor.appendChild(o);
    }
    seletor.value = 'CONTADOR';

    f.componentInstance.alterarFuncao(f.componentInstance.membros()[0]!, 'CONTADOR', seletor);
    httpMock
      .expectOne('/escritorio/membros/m1')
      .flush(
        { errors: [{ code: 'ULTIMO_ADMINISTRADOR', message: 'x' }] },
        { status: 409, statusText: 'Conflict' },
      );

    expect(erro).toHaveBeenCalledWith(expect.stringContaining('pelo menos um administrador'));
    expect(seletor.value).toBe('ADMINISTRADOR');
  });

  it('remover tira o membro da lista', () => {
    const f = abrir('ADMINISTRADOR');
    const cmp = f.componentInstance;
    cmp.removendo.set(cmp.membros()[1]!);
    cmp.remover();
    httpMock.expectOne('/escritorio/membros/m2').flush(null);
    expect(cmp.membros().map((m) => m.id)).toEqual(['m1']);
    // A funcao de quem esta aqui pode ter mudado: o escritorio e perguntado de novo.
    httpMock
      .expectOne('/escritorio')
      .flush({ id: 'e1', nome: 'Campo Bom', cnpj: null, minhaFuncao: 'ADMINISTRADOR', membros: 1 });
  });

  it('salvar os dados manda o CNPJ so com digitos', () => {
    const f = abrir('ADMINISTRADOR');
    const cmp = f.componentInstance;
    cmp.abrirEdicao();
    cmp.nome.set('Campo Bom Contabil');
    cmp.cnpj.set('11.222.333/0001-81');
    cmp.salvar();
    const req = httpMock.expectOne('/escritorio');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ nome: 'Campo Bom Contabil', cnpj: '11222333000181' });
    req.flush({
      id: 'e1',
      nome: 'Campo Bom Contabil',
      cnpj: '11222333000181',
      minhaFuncao: 'ADMINISTRADOR',
      membros: 2,
    });
    expect(cmp.editando()).toBe(false);
    f.detectChanges();
    // Grava só dígitos, mostra com máscara: "48315276000195" era o que a Equipe exibia.
    expect(el(f).textContent).toContain('CNPJ 11.222.333/0001-81');
  });

  it('o administrador exclui etiqueta do catalogo', () => {
    const cmp = abrir('ADMINISTRADOR').componentInstance;
    cmp.excluirEtiqueta(cmp.etiquetas()[0]!);
    // O primeiro clique so pede confirmacao.
    httpMock.expectNone('/contador/etiquetas/e1');
    cmp.excluirEtiqueta(cmp.etiquetas()[0]!);
    expect(httpMock.expectOne('/contador/etiquetas/e1').request.method).toBe('DELETE');
  });

  it('apagar o CNPJ com endereço próprio explica que o endereço sai antes (#175)', () => {
    const erro = vi.spyOn(TestBed.inject(ToastService), 'error');
    const cmp = abrir('ADMINISTRADOR').componentInstance;
    cmp.abrirEdicao();
    cmp.cnpj.set('');
    cmp.salvar();
    httpMock
      .expectOne('/escritorio')
      .flush(
        { errors: [{ code: 'ENDERECO_EXIGE_CNPJ', message: 'x' }] },
        { status: 422, statusText: 'Unprocessable' },
      );

    expect(erro).toHaveBeenCalledWith('Remova o endereço do escritório antes de apagar o CNPJ.');
  });
});
