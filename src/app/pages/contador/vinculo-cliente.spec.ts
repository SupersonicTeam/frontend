import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { VinculoCliente } from './vinculo-cliente';
import { ToastService } from '@core/services/toast.service';
import type { ProdutorCarteira } from '@models/carteira.model';
import type { SituacaoDoVinculo } from '@services/contador/data-access/carteira.service';

const cliente = (situacaoVinculo: string) =>
  ({ id: 'p1', nomeCompleto: 'Ana Produtora', situacaoVinculo }) as ProdutorCarteira;

/** O ciclo do vínculo na ficha (#147): só o administrador vê os botões. */
describe('VinculoCliente', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [VinculoCliente],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function abrir(situacao: string, funcao = 'ADMINISTRADOR') {
    const fixture = TestBed.createComponent(VinculoCliente);
    fixture.componentRef.setInput('cliente', cliente(situacao));
    const emitidos: SituacaoDoVinculo[] = [];
    fixture.componentInstance.mudou.subscribe((s) => emitidos.push(s));
    fixture.detectChanges();
    httpMock.expectOne('/escritorio').flush({ minhaFuncao: funcao });
    fixture.detectChanges();
    return { fixture, emitidos, texto: () => (fixture.nativeElement as HTMLElement).textContent };
  }

  it('ativo: suspender e encerrar; suspenso: reativar e encerrar', () => {
    const ativo = abrir('ATIVO');
    expect(ativo.texto()).toContain('Suspender vínculo');
    expect(ativo.texto()).not.toContain('Reativar vínculo');
    ativo.fixture.componentRef.setInput('cliente', cliente('SUSPENSO'));
    ativo.fixture.detectChanges();
    expect(ativo.texto()).toContain('Reativar vínculo');
    expect(ativo.texto()).toContain('Encerrar vínculo');
  });

  it('quem nao e administrador nao ve botao nenhum', () => {
    const { texto } = abrir('ATIVO', 'CONTADOR');
    expect(texto()).not.toContain('Suspender vínculo');
    expect(texto()).not.toContain('Encerrar vínculo');
  });

  it('suspender chama a rota do cliente e emite a situacao nova', () => {
    const { fixture, emitidos } = abrir('ATIVO');
    fixture.componentInstance.executar('suspender');
    const req = httpMock.expectOne('/contador/produtores/p1/suspender');
    expect(req.request.method).toBe('POST');
    req.flush({ produtorId: 'p1', situacao: 'SUSPENSO', inicio: 'x', fim: null });

    expect(emitidos.map((s) => s.situacao)).toEqual(['SUSPENSO']);
  });

  it('encerrar leva o motivo e avisa que o cliente o vê (#173)', () => {
    const { fixture } = abrir('ATIVO');
    const cmp = fixture.componentInstance;
    cmp.pedirEncerramento();
    fixture.detectChanges();
    expect(document.body.textContent).toContain('O cliente vê este motivo');

    cmp.motivo.set('Cliente pediu para encerrar');
    cmp.executar('encerrar');
    const req = httpMock.expectOne('/contador/produtores/p1/encerrar');
    expect(req.request.body).toEqual({ motivo: 'Cliente pediu para encerrar' });
    req.flush({ produtorId: 'p1', situacao: 'ENCERRADO', inicio: 'x', fim: 'y' });
  });

  it('suspender não leva motivo, mesmo com texto no campo', () => {
    const { fixture } = abrir('ATIVO');
    fixture.componentInstance.motivo.set('qualquer coisa');
    fixture.componentInstance.executar('suspender');
    const req = httpMock.expectOne('/contador/produtores/p1/suspender');
    expect(req.request.body).toBeNull();
    req.flush({ produtorId: 'p1', situacao: 'SUSPENSO', inicio: 'x', fim: null });
  });

  it('409 diz que a situacao mudou, sem emitir nada', () => {
    const erro = vi.spyOn(TestBed.inject(ToastService), 'error');
    const { fixture, emitidos } = abrir('ATIVO');
    fixture.componentInstance.executar('encerrar');
    httpMock
      .expectOne('/contador/produtores/p1/encerrar')
      .flush(
        { errors: [{ code: 'VINCULO_SITUACAO_INVALIDA', message: 'x' }] },
        { status: 409, statusText: 'Conflict' },
      );

    expect(emitidos).toEqual([]);
    expect(erro).toHaveBeenCalledWith(expect.stringContaining('mudou'));
  });
});
