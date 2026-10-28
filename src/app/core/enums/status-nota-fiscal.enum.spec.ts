import {
  STATUS_NOTA_META,
  aceitaAcao,
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
  /**
   * Os rótulos saem da tabela da issue #111, não da minha preferência.
   *
   * Eu tinha escrito "Esperando o contador", "Aprovada, pronta para emitir" e "Devolvida para
   * corrigir" — mais explicativos, mas inventados por mim. O contrato dos status é do backend, e
   * quem o escreveu fixou os rótulos; duas telas com nomes diferentes para o mesmo estado é pior
   * do que um rótulo menos didático.
   */
  it('os rótulos são os da tabela do contrato (#111)', () => {
    expect(statusNotaLabel('RASCUNHO')).toBe('Rascunho');
    expect(statusNotaLabel('COM_INCONSISTENCIAS')).toBe('Com inconsistências');
    expect(statusNotaLabel('AGUARDANDO_APROVACAO')).toBe('Aguardando aprovação');
    expect(statusNotaLabel('APROVADA')).toBe('Aprovada');
    expect(statusNotaLabel('DEVOLVIDA')).toBe('Devolvida');
    expect(statusNotaLabel('XML_GERADO')).toBe('XML gerado');
    expect(statusNotaLabel('AUTORIZADA')).toBe('Autorizada');
    expect(statusNotaLabel('REJEITADA')).toBe('Rejeitada');
    expect(statusNotaLabel('PENDENTE_SEFAZ')).toBe('Pendente na SEFAZ');
    expect(statusNotaLabel('CANCELADA')).toBe('Cancelada');
  });

  /**
   * `ENVIANDO` e `CANCELANDO` são **transitórios**: a nota está no meio de uma ida à SEFAZ. Eles
   * estavam na tabela da #111 e não no enum, então caíam em "Em processamento" — o que não é
   * errado, mas perde a informação de que algo está acontecendo agora.
   */
  it('os dois status transitórios têm rótulo próprio', () => {
    expect(statusNotaLabel('ENVIANDO')).toBe('Enviando');
    expect(statusNotaLabel('CANCELANDO')).toBe('Cancelando');
  });

  /**
   * Enquanto a nota está indo ou voltando da SEFAZ, nenhuma ação dela faz sentido: o resultado
   * ainda não existe. A #96 fixou isso para os transitórios, e a #111 estendeu ao desconhecido —
   * se o app não sabe o que é aquele estado, não sabe o que é seguro oferecer nele.
   */
  it('estado transitório ou desconhecido não aceita ação', () => {
    expect(aceitaAcao('ENVIANDO')).toBe(false);
    expect(aceitaAcao('CANCELANDO')).toBe(false);
    expect(aceitaAcao('ALGO_QUE_O_BACKEND_INVENTOU')).toBe(false);
    expect(aceitaAcao(undefined)).toBe(false);
  });

  it('estado conhecido e estável aceita ação', () => {
    expect(aceitaAcao('RASCUNHO')).toBe(true);
    expect(aceitaAcao('AUTORIZADA')).toBe(true);
    expect(aceitaAcao('DEVOLVIDA')).toBe(true);
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
