import {
  STATUS_NOTA_META,
  editavel,
  esperaOEscritorio,
  statusNotaBadge,
  statusNotaLabel,
} from './status-nota-fiscal.enum';

/**
 * Os três status da aprovação (backend#178) e o fallback que os obrigou a existir.
 *
 * `statusNotaLabel` devolvia **o código cru** quando não conhecia o status. Com a #178 no ar,
 * uma nota enviada para revisão apareceria na tela escrita `AGUARDANDO_APROVACAO`, em caixa alta,
 * no meio de rótulos em português. O combinado é que status desconhecido vira "Em processamento":
 * é honesto (o app não sabe o que é) e não vaza vocabulário de banco para o produtor.
 */
describe('status da nota fiscal', () => {
  it('os três status da aprovação têm rótulo em português', () => {
    expect(statusNotaLabel('AGUARDANDO_APROVACAO')).toBe('Esperando o contador');
    expect(statusNotaLabel('APROVADA')).toBe('Aprovada, pronta para emitir');
    expect(statusNotaLabel('DEVOLVIDA')).toBe('Devolvida para corrigir');
  });

  it('status que o app não conhece vira "Em processamento", nunca o código cru', () => {
    expect(statusNotaLabel('ALGO_QUE_O_BACKEND_INVENTOU')).toBe('Em processamento');
    expect(statusNotaLabel(undefined)).toBe('Em processamento');
  });

  it('status desconhecido também ganha um badge, em vez de ficar sem cor', () => {
    expect(statusNotaBadge('ALGO_NOVO')).toBe(statusNotaBadge('RASCUNHO'));
  });

  it('todo status conhecido tem rótulo e badge preenchidos', () => {
    for (const [codigo, meta] of Object.entries(STATUS_NOTA_META)) {
      expect(meta.label.length, codigo).toBeGreaterThan(0);
      expect(meta.badge.length, codigo).toBeGreaterThan(0);
    }
  });

  /**
   * Quem pode ser editado é regra do servidor, e a tela tem de concordar com ela:
   * `AGUARDANDO_APROVACAO` e `APROVADA` **não** são editáveis — a nota está na mão do contador ou
   * já foi aprovada, e mudá-la invalidaria a aprovação. `DEVOLVIDA` é editável como rascunho,
   * porque é exatamente o que o produtor precisa fazer com ela.
   */
  it('nota na mão do contador ou já aprovada não é editável', () => {
    expect(editavel('AGUARDANDO_APROVACAO')).toBe(false);
    expect(editavel('APROVADA')).toBe(false);
  });

  it('devolvida é editável, como rascunho', () => {
    expect(editavel('DEVOLVIDA')).toBe(true);
    expect(editavel('RASCUNHO')).toBe(true);
    expect(editavel('COM_INCONSISTENCIAS')).toBe(true);
  });

  it('autorizada e cancelada seguem fora de edição', () => {
    expect(editavel('AUTORIZADA')).toBe(false);
    expect(editavel('CANCELADA')).toBe(false);
  });

  it('só AGUARDANDO_APROVACAO está esperando o escritório', () => {
    expect(esperaOEscritorio('AGUARDANDO_APROVACAO')).toBe(true);
    expect(esperaOEscritorio('APROVADA')).toBe(false);
    expect(esperaOEscritorio('DEVOLVIDA')).toBe(false);
  });
});
