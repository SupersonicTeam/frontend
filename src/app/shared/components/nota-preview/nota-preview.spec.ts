import { TestBed } from '@angular/core/testing';
import { NotaPreview } from './nota-preview';

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

  it('esperando o contador é espera, não erro', () => {
    expect(etapas('AGUARDANDO_APROVACAO')).toEqual(['warn', 'todo', 'todo', 'todo']);
  });

  it('aprovada: o rascunho está pronto e a vez é do XML', () => {
    expect(etapas('APROVADA')).toEqual(['done', 'current', 'todo', 'todo']);
  });

  it('devolvida se parece com a nota que tem inconsistência: voltou para o produtor', () => {
    expect(etapas('DEVOLVIDA')).toEqual(etapas('COM_INCONSISTENCIAS'));
  });

  it('nenhum dos três cai no "não aconteceu nada"', () => {
    for (const status of ['AGUARDANDO_APROVACAO', 'APROVADA', 'DEVOLVIDA']) {
      expect(etapas(status), status).not.toEqual(['todo', 'todo', 'todo', 'todo']);
    }
  });

  it('o fluxo antigo continua como estava', () => {
    expect(etapas('RASCUNHO')).toEqual(['current', 'todo', 'todo', 'todo']);
    expect(etapas('AUTORIZADA')).toEqual(['done', 'done', 'done', 'done']);
  });
});
