import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { FichaEditavel, type MudancaNaFicha } from './ficha-editavel';
import { ToastService } from '@core/services/toast.service';
import { ID_CONTADOR_TESTE, entrarComo } from '@core/services/sessao.testing';
import type { ProdutorCarteira } from '@models/carteira.model';

const cliente = (responsavelId: string | null = null) =>
  ({
    id: 'p1',
    nomeCompleto: 'Ana Produtora',
    situacaoVinculo: 'ATIVO',
    etiquetas: ['Soja'],
    responsavelId,
    responsavelNome: responsavelId ? 'Bia' : null,
  }) as ProdutorCarteira;

/** A ficha editável (#149): observações internas, etiquetas e responsável. */
describe('FichaEditavel', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [FichaEditavel],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
    entrarComo('CONTADOR');
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  function abrir(funcao = 'CONTADOR', responsavelId: string | null = null) {
    const fixture = TestBed.createComponent(FichaEditavel);
    fixture.componentRef.setInput('cliente', cliente(responsavelId));
    const mudancas: MudancaNaFicha[] = [];
    fixture.componentInstance.mudou.subscribe((m) => mudancas.push(m));
    fixture.detectChanges();
    httpMock
      .expectOne('/contador/produtores/p1/ficha')
      .flush({ produtorId: 'p1', observacoes: 'Paga em dia.', etiquetas: ['Soja'] });
    httpMock.expectOne('/contador/etiquetas').flush([
      { id: 'e1', nome: 'Soja' },
      { id: 'e2', nome: 'Prioridade' },
    ]);
    httpMock.expectOne('/escritorio').flush({ minhaFuncao: funcao });
    httpMock.expectOne('/escritorio/membros').flush([
      { id: 'm1', nomeCompleto: 'Ana Admin', crc: null, funcao: 'ADMINISTRADOR' },
      { id: ID_CONTADOR_TESTE, nomeCompleto: 'Bia', crc: null, funcao: 'CONTADOR' },
    ]);
    fixture.detectChanges();
    return { fixture, cmp: fixture.componentInstance, mudancas };
  }

  it('carrega as observacoes e sugere so as etiquetas que o cliente nao tem', () => {
    const { cmp } = abrir();
    expect(cmp.observacoes()).toBe('Paga em dia.');
    expect(cmp.sugestoes().map((s) => s.nome)).toEqual(['Prioridade']);
  });

  it('salvar observacoes manda o texto e so libera quando mudou', () => {
    const { cmp } = abrir();
    expect(cmp.observacoesMudaram()).toBe(false);
    cmp.observacoes.set('Paga em dia. Prefere WhatsApp.');
    cmp.salvarObservacoes();
    const req = httpMock.expectOne('/contador/produtores/p1/ficha');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ observacoes: 'Paga em dia. Prefere WhatsApp.' });
    req.flush({ produtorId: 'p1', observacoes: 'Paga em dia. Prefere WhatsApp.', etiquetas: [] });
    expect(cmp.observacoesMudaram()).toBe(false);
  });

  it('observacoes acima de 1000 nao vao ao servidor', () => {
    const { cmp } = abrir();
    cmp.observacoes.set('x'.repeat(1001));
    cmp.salvarObservacoes();
    httpMock.expectNone('/contador/produtores/p1/ficha');
  });

  it('adicionar etiqueta manda a lista inteira e avisa a ficha', () => {
    const { cmp, mudancas } = abrir();
    cmp.novaEtiqueta.set(' Prioridade ');
    cmp.adicionarEtiqueta();
    const req = httpMock.expectOne('/contador/produtores/p1/etiquetas');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ etiquetas: ['Soja', 'Prioridade'] });
    req.flush({ produtorId: 'p1', observacoes: null, etiquetas: ['Soja', 'Prioridade'] });

    expect(cmp.etiquetas()).toEqual(['Soja', 'Prioridade']);
    expect(cmp.novaEtiqueta()).toBe('');
    expect(mudancas).toEqual([{ etiquetas: ['Soja', 'Prioridade'] }]);
  });

  it('etiqueta repetida nao entra', () => {
    const { cmp } = abrir();
    cmp.novaEtiqueta.set('soja');
    expect(cmp.podeAdicionar()).toBe(false);
  });

  it('o seletor de responsavel aparece para o administrador e para o proprio responsavel', () => {
    expect(abrir('ADMINISTRADOR').cmp.podeTrocarResponsavel()).toBe(true);
  });

  it('o responsavel atual tambem pode trocar; outro contador nao', () => {
    expect(abrir('CONTADOR', ID_CONTADOR_TESTE).cmp.podeTrocarResponsavel()).toBe(true);
  });

  it('contador que nao e o responsavel nao ve o seletor', () => {
    const { fixture, cmp } = abrir('CONTADOR', 'm1');
    expect(cmp.podeTrocarResponsavel()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).querySelector('select')).toBeNull();
  });

  it('trocar o responsavel avisa a ficha; o 403 devolve o seletor', () => {
    const erro = vi.spyOn(TestBed.inject(ToastService), 'error');
    const { cmp, mudancas } = abrir('ADMINISTRADOR');
    cmp.trocarResponsavel(ID_CONTADOR_TESTE);
    httpMock
      .expectOne('/contador/produtores/p1/responsavel')
      .flush({ produtorId: 'p1', responsavelId: ID_CONTADOR_TESTE, responsavelNome: 'Bia' });
    expect(mudancas).toEqual([{ responsavelId: ID_CONTADOR_TESTE, responsavelNome: 'Bia' }]);

    const seletor = document.createElement('select');
    cmp.trocarResponsavel('m1', seletor);
    httpMock
      .expectOne('/contador/produtores/p1/responsavel')
      .flush({}, { status: 403, statusText: 'Forbidden' });
    expect(erro).toHaveBeenCalledWith(expect.stringContaining('administrador ou o responsável'));
  });

  it('quem continua digitando durante o salvamento nao perde o texto', () => {
    const { cmp } = abrir();
    cmp.observacoes.set('Primeira frase.');
    cmp.salvarObservacoes();
    cmp.observacoes.set('Primeira frase. Segunda frase.');
    httpMock
      .expectOne('/contador/produtores/p1/ficha')
      .flush({ produtorId: 'p1', observacoes: 'Primeira frase.', etiquetas: [] });

    expect(cmp.observacoes()).toBe('Primeira frase. Segunda frase.');
    expect(cmp.observacoesMudaram()).toBe(true);
  });

  it('responsavel que nao esta na lista de membros continua aparecendo no seletor', () => {
    const { fixture, cmp } = abrir('ADMINISTRADOR', 'saiu-da-equipe');
    expect(cmp.responsavelForaDaLista()).toBe(true);
    const selecionada = (fixture.nativeElement as HTMLElement).querySelector('select')!;
    expect(selecionada.selectedOptions[0]!.textContent?.trim()).toBe('Bia');
  });
});
