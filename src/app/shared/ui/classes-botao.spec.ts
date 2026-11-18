import { classesBotao } from './classes-botao';

/** As classes compartilhadas pelo `<ui-button>`, pelo `a[uiLinkBotao]` e pelos controles nativos. */
describe('classesBotao', () => {
  /** As duas garantias que vieram da crítica da banca (#45) valem em qualquer variante. */
  it('garante 44x44 e rótulo de no mínimo 14px em todas as variantes', () => {
    for (const variante of ['primary', 'ghost', 'perigo', 'assistente', 'sutil', 'lima'] as const) {
      const classes = classesBotao(variante);
      expect(classes).toContain('tap-target');
      expect(classes).toContain('text-apoio');
    }
  });

  it('o padrão é a variante primary no tamanho md', () => {
    expect(classesBotao()).toBe(classesBotao('primary', 'md'));
    expect(classesBotao()).toContain('bg-primary');
    expect(classesBotao()).toContain('px-4 py-2');
  });

  it('o tamanho lg troca o padding e não some com o resto', () => {
    const lg = classesBotao('primary', 'lg');
    expect(lg).toContain('px-6 py-3');
    expect(lg).not.toContain('px-4 py-2');
    expect(lg).toContain('rounded-controle');
  });

  it('blocoCompleto acrescenta w-full e sem ele a classe não aparece', () => {
    expect(classesBotao('primary', 'md', { blocoCompleto: true })).toContain('w-full');
    expect(classesBotao('primary', 'md')).not.toContain('w-full');
  });

  /**
   * A `lima` é a variante da faixa profunda da landing (#174, item 4.1). O par
   * `marca-lima` + `marca-lima-ink` dá 6,80:1 no claro e 10,84:1 no escuro; trocar o
   * texto por `primary-foreground` (quase branco) cairia para 2,29:1 e reprovaria.
   */
  it('a variante lima usa o par de tokens da marca', () => {
    const lima = classesBotao('lima');
    expect(lima).toContain('bg-marca-lima');
    expect(lima).toContain('text-marca-lima-ink');
    expect(lima).not.toContain('text-white');
  });

  it('não repete classe nem deixa espaço duplo', () => {
    const classes = classesBotao('ghost', 'lg', { blocoCompleto: true });
    const lista = classes.split(' ');
    expect(classes).not.toContain('  ');
    expect(new Set(lista).size).toBe(lista.length);
  });
});
