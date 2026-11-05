import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { EditarPedido } from './editar-pedido';
import { ToastService } from '@core/services/toast.service';
import type { Pendencia } from '@models/pendencia.model';

const pedido = {
  id: 'pe1',
  produtorId: 'p1',
  escritorioId: 'e1',
  titulo: 'Notas de setembro',
  descricao: 'As de venda de soja',
  observacoes: 'Interno: cobrar ate sexta',
  dataLimite: '2026-11-20',
  tiposDocumento: ['NOTA_FISCAL'],
  status: 'PENDENTE',
  motivo: null,
  quantidadeAnexos: 0,
  anexos: [],
  createdAt: 'x',
  updatedAt: 'x',
} as unknown as Pendencia;

/** Editar o pedido de documento enquanto pendente (#150). */
describe('EditarPedido', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [EditarPedido],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function abrir() {
    const fixture = TestBed.createComponent(EditarPedido);
    fixture.componentRef.setInput('produtorId', 'p1');
    fixture.componentRef.setInput('pendencia', pedido);
    const salvos: Pendencia[] = [];
    fixture.componentInstance.salvo.subscribe((p) => salvos.push(p));
    fixture.detectChanges();
    return { cmp: fixture.componentInstance, salvos };
  }

  it('nasce com o pedido e manda tudo no PUT, inclusive as observacoes que nao aparecem', () => {
    const { cmp, salvos } = abrir();
    expect(cmp.titulo()).toBe('Notas de setembro');
    cmp.titulo.set('Notas de setembro e outubro');
    cmp.alternarTipo('EXTRATO');
    cmp.salvar();

    const req = httpMock.expectOne('/contador/produtores/p1/pendencias/pe1');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({
      titulo: 'Notas de setembro e outubro',
      tiposDocumento: ['NOTA_FISCAL', 'EXTRATO'],
      dataLimite: '2026-11-20',
      descricao: 'As de venda de soja',
      observacoes: 'Interno: cobrar ate sexta',
    });
    req.flush({ ...pedido, titulo: 'Notas de setembro e outubro' });
    expect(salvos.map((p) => p.titulo)).toEqual(['Notas de setembro e outubro']);
  });

  it('sem tipo de documento nao salva', () => {
    const { cmp } = abrir();
    cmp.alternarTipo('NOTA_FISCAL');
    expect(cmp.valido()).toBe(false);
    cmp.salvar();
    httpMock.expectNone('/contador/produtores/p1/pendencias/pe1');
  });

  it('409 diz que o produtor ja respondeu', () => {
    const erro = vi.spyOn(TestBed.inject(ToastService), 'error');
    const { cmp, salvos } = abrir();
    cmp.salvar();
    httpMock
      .expectOne('/contador/produtores/p1/pendencias/pe1')
      .flush({}, { status: 409, statusText: 'Conflict' });
    expect(salvos).toEqual([]);
    expect(erro).toHaveBeenCalledWith(expect.stringContaining('já respondeu'));
  });
});
