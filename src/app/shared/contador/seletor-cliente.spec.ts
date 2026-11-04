import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import {
  ActivatedRoute,
  Router,
  convertToParamMap,
  provideRouter,
  type ParamMap,
} from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { vi, type MockInstance } from 'vitest';
import { SeletorCliente } from './seletor-cliente';
import { ClienteEmFocoService } from '@core/services/cliente-em-foco.service';
import type { ProdutorCarteira } from '@models/carteira.model';

const cliente = (id: string, nomeCompleto: string) =>
  ({ id, nomeCompleto, vinculoId: `v-${id}`, situacaoVinculo: 'ATIVO' }) as ProdutorCarteira;

/**
 * O seletor de cliente das telas do contador (issue #136).
 *
 * O que ele guarda: só escolhe cliente **da carteira** de quem está logado, avisa a tela depois de
 * a carteira responder, e mantém a escolha no endereço e entre telas.
 */
describe('SeletorCliente', () => {
  let httpMock: HttpTestingController;
  let navegou: MockInstance<Router['navigate']>;

  /** O que a rota emite depois de montada — é por aqui que o teste simula voltar no histórico. */
  let mudancas: BehaviorSubject<ParamMap>;

  function montar(queryCliente?: string, lembrado?: string) {
    const params = convertToParamMap(queryCliente ? { cliente: queryCliente } : {});
    mudancas = new BehaviorSubject<ParamMap>(params);
    TestBed.configureTestingModule({
      imports: [SeletorCliente],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParamMap: params },
            queryParamMap: mudancas,
          },
        },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    navegou = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    if (lembrado) TestBed.inject(ClienteEmFocoService).escolher(lembrado);

    const fixture = TestBed.createComponent(SeletorCliente);
    const emitidos: (ProdutorCarteira | null)[] = [];
    fixture.componentInstance.clienteChange.subscribe((c) => emitidos.push(c));
    fixture.detectChanges();
    return { fixture, emitidos };
  }

  afterEach(() => httpMock.verify());

  it('pede a carteira inteira e so avisa a tela depois que ela responde', () => {
    const { emitidos } = montar();
    expect(emitidos).toEqual([]);

    const req = httpMock.expectOne((r) => r.url === '/contador/produtores');
    expect(req.request.params.get('size')).toBe('200');
    req.flush([cliente('p1', 'Ana'), cliente('p2', 'Bruno')]);

    // Dois clientes e nenhum pedido: a tela orienta a escolher.
    expect(emitidos).toEqual([null]);
  });

  it('o cliente do endereco vale, se estiver na carteira', () => {
    const { emitidos } = montar('p2');
    httpMock
      .expectOne((r) => r.url === '/contador/produtores')
      .flush([cliente('p1', 'Ana'), cliente('p2', 'Bruno')]);

    expect(emitidos.map((c) => c?.id)).toEqual(['p2']);
    expect(TestBed.inject(ClienteEmFocoService).produtorId()).toBe('p2');
  });

  it('um id que nao esta na carteira vira "nenhum cliente", e sai do endereco', () => {
    const { emitidos } = montar('de-outro-escritorio');
    httpMock
      .expectOne((r) => r.url === '/contador/produtores')
      .flush([cliente('p1', 'Ana'), cliente('p2', 'Bruno')]);

    expect(emitidos).toEqual([null]);
    expect(navegou).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParams: { cliente: null }, replaceUrl: true }),
    );
  });

  it('sem pedido no endereco, usa o cliente lembrado de outra tela', () => {
    const { emitidos } = montar(undefined, 'p1');
    httpMock
      .expectOne((r) => r.url === '/contador/produtores')
      .flush([cliente('p1', 'Ana'), cliente('p2', 'Bruno')]);

    expect(emitidos.map((c) => c?.id)).toEqual(['p1']);
  });

  it('com um cliente so, ele ja vem escolhido', () => {
    const { emitidos } = montar();
    httpMock.expectOne((r) => r.url === '/contador/produtores').flush([cliente('p1', 'Ana')]);

    expect(emitidos.map((c) => c?.id)).toEqual(['p1']);
  });

  it('trocar no seletor avisa a tela, lembra e escreve no endereco', () => {
    const { fixture, emitidos } = montar();
    httpMock
      .expectOne((r) => r.url === '/contador/produtores')
      .flush([cliente('p1', 'Ana'), cliente('p2', 'Bruno')]);
    fixture.detectChanges();

    const select = (fixture.nativeElement as HTMLElement).querySelector('select')!;
    select.value = 'p2';
    select.dispatchEvent(new Event('change'));

    expect(emitidos.map((c) => c?.id ?? null)).toEqual([null, 'p2']);
    expect(TestBed.inject(ClienteEmFocoService).produtorId()).toBe('p2');
    expect(navegou).toHaveBeenLastCalledWith(
      [],
      expect.objectContaining({ queryParams: { cliente: 'p2' } }),
    );
  });

  it('carteira fora do ar mostra o erro com "tentar de novo", e nao avisa cliente nenhum', () => {
    const { fixture, emitidos } = montar();
    httpMock
      .expectOne((r) => r.url === '/contador/produtores')
      .flush('x', { status: 500, statusText: 'erro' });
    fixture.detectChanges();

    expect(emitidos).toEqual([]);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Não foi possível carregar a carteira',
    );
  });

  it('o endereco mudar na mesma tela troca o cliente: a tela nao fica num e o endereco no outro', () => {
    const { emitidos } = montar('p1');
    httpMock
      .expectOne((r) => r.url === '/contador/produtores')
      .flush([cliente('p1', 'Ana'), cliente('p2', 'Bruno')]);

    mudancas.next(convertToParamMap({ cliente: 'p2' }));
    // A propria escrita do seletor volta pela rota e nao re-emite.
    mudancas.next(convertToParamMap({ cliente: 'p2' }));

    expect(emitidos.map((c) => c?.id)).toEqual(['p1', 'p2']);
  });
});
