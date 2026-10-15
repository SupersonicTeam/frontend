import { describe, expect, it } from 'vitest';
import { mesDeFechamento } from './periodo';

describe('mesDeFechamento', () => {
  it('devolve o mês anterior — é o que o contador fecha', () => {
    expect(mesDeFechamento(new Date(2026, 9, 13))).toEqual({ mes: 9, ano: 2026 });
  });

  it('em janeiro volta para dezembro do ano passado', () => {
    // O caso que uma subtração ingênua (mes - 1) quebraria: mês 0 e ano errado.
    expect(mesDeFechamento(new Date(2026, 0, 5))).toEqual({ mes: 12, ano: 2025 });
  });

  it('não depende do dia do mês', () => {
    expect(mesDeFechamento(new Date(2026, 4, 1))).toEqual(mesDeFechamento(new Date(2026, 4, 31)));
  });
});
