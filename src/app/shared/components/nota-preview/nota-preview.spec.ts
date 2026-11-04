import { TestBed } from '@angular/core/testing';
import { NotaPreview } from './nota-preview';
import type { ItemNotaFiscal, NotaFiscal } from '@models/nota-fiscal.model';

/**
 * O stepper e os três status da revisão (backend#178).
 *
 * Os status novos caíam no `default`, que pinta tudo como "ainda não aconteceu" — uma nota já
 * **aprovada** aparecia no modal como se o produtor nem tivesse começado. Não há etapa própria
 * para a revisão de propósito: acrescentar uma quinta bolinha mudaria o stepper também para quem
 * não tem contador, que é a maioria. Ela aparece como estado da primeira etapa, o que é verdade —
 * a nota ainda não virou XML.
 */
describe('NotaPreview — stepper', () => {
  let componente: NotaPreview;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [NotaPreview] });
    componente = TestBed.createComponent(NotaPreview).componentInstance;
  });

  /** Estado das quatro etapas, do rascunho à autorização. */
  const etapas = (status: string) =>
    [0, 1, 2, 3].map((i) =>
      componente.stepperEstado(status as Parameters<NotaPreview['stepperEstado']>[0], i),
    );

  /**
   * O stepper passou a ser o da #111: **rascunho → em revisão → aprovada → emitida**.
   *
   * Antes eram "Rascunho · XML gerado · Enviada · Autorizada", e a revisão do contador não tinha
   * etapa: ela aparecia como estado da primeira bolinha. Com o fluxo da #178 valendo para todo
   * produtor com escritório, a revisão é uma etapa de verdade — e o "XML gerado", que é detalhe
   * técnico, sai do caminho que o produtor acompanha.
   */
  it('as etapas são as do contrato, não as do XML', () => {
    expect(componente.STEPPER_STEPS).toEqual(['Rascunho', 'Em revisão', 'Aprovada', 'Emitida']);
  });

  it('aguardando aprovação é a etapa 2, em andamento', () => {
    expect(etapas('AGUARDANDO_APROVACAO')).toEqual(['done', 'current', 'todo', 'todo']);
  });

  it('aprovada fecha a etapa 2 e a vez é de emitir', () => {
    expect(etapas('APROVADA')).toEqual(['done', 'done', 'current', 'todo']);
  });

  it('devolvida volta para o rascunho, e marca a revisão como problema', () => {
    expect(etapas('DEVOLVIDA')).toEqual(['current', 'error', 'todo', 'todo']);
  });

  it('nenhum dos três cai no "não aconteceu nada"', () => {
    for (const status of ['AGUARDANDO_APROVACAO', 'APROVADA', 'DEVOLVIDA']) {
      expect(etapas(status), status).not.toEqual(['todo', 'todo', 'todo', 'todo']);
    }
  });

  it('o começo e o fim continuam onde estavam', () => {
    expect(etapas('RASCUNHO')).toEqual(['current', 'todo', 'todo', 'todo']);
    expect(etapas('AUTORIZADA')).toEqual(['done', 'done', 'done', 'done']);
  });

  it('o XML gerado é caminho de quem não tem contador: pula a revisão', () => {
    expect(etapas('XML_GERADO')).toEqual(['done', 'todo', 'todo', 'current']);
  });
});

/**
 * Os itens mostram o que o cálculo **aplicou** (#116, backend#272).
 *
 * `percentualReducao` e `cClassTrib` são o que veio na entrada, e ficam nulos quando o item não
 * informa: aí quem decide é a tabela oficial pelo NCM. Mostrar a entrada diria "sem redução" para
 * a soja que o servidor calculou com 60%.
 */
describe('NotaPreview — itens', () => {
  /** As células da linha do item: [descrição, NCM, CFOP, cClassTrib, redução, ...]. */
  function renderizar(item: Partial<ItemNotaFiscal>): string[] {
    TestBed.configureTestingModule({ imports: [NotaPreview] });
    const f = TestBed.createComponent(NotaPreview);
    f.componentRef.setInput('nota', {
      id: 'n1',
      numero: 1,
      naturezaOperacao: 'Venda',
      status: 'RASCUNHO',
      dataEmissao: '2026-10-01',
      destinatarioNome: 'Cooperativa',
      destinatarioCpfCnpj: '12345678000195',
      itens: [
        {
          numeroItem: 1,
          descricao: 'Soja em grãos',
          ncm: '12019000',
          cfop: '5101',
          unidade: 'KG',
          quantidade: 500,
          valorUnitario: 2.5,
          ...item,
        },
      ],
    } satisfies NotaFiscal);
    f.detectChanges();
    const linha = (f.nativeElement as HTMLElement).querySelector('tbody tr');
    return [...(linha?.querySelectorAll('td') ?? [])].map((td) => td.textContent?.trim() ?? '');
  }

  it('mostra a redução e o cClassTrib aplicados, não os da entrada', () => {
    const celulas = renderizar({
      percentualReducao: null,
      percentualReducaoAplicado: 60,
      cClassTrib: null,
      cClassTribAplicado: '200036',
    });
    expect(celulas[3]).toBe('200036');
    expect(celulas[4]).toBe('60%');
  });

  it('aplicado manda sobre a entrada quando os dois vêm', () => {
    const celulas = renderizar({
      percentualReducao: 0,
      percentualReducaoAplicado: 60,
      cClassTrib: '000001',
      cClassTribAplicado: '200036',
    });
    expect(celulas[3]).toBe('200036');
    expect(celulas[4]).toBe('60%');
  });

  it('nota anterior ao campo aplicado usa a entrada, que antes era o aplicado', () => {
    const celulas = renderizar({ percentualReducao: 60, cClassTrib: '200036' });
    expect(celulas[3]).toBe('200036');
    expect(celulas[4]).toBe('60%');
  });

  it('sem nenhum dos dois, diz que não sabe em vez de "sem redução"', () => {
    const celulas = renderizar({});
    expect(celulas[3]).toBe('—');
    expect(celulas[4]).toBe('—');
  });

  it('100% de redução é alíquota zero, e zero é sem redução', () => {
    const c = TestBed.configureTestingModule({ imports: [NotaPreview] }).createComponent(
      NotaPreview,
    ).componentInstance;
    expect(c.formatReducao(100)).toBe('alíquota zero');
    expect(c.formatReducao(0)).toBe('sem redução');
    expect(c.formatReducao(null)).toBe('—');
    expect(c.formatReducao(12.5)).toBe('12,5%');
  });
});
