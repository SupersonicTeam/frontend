import { describe, expect, it } from 'vitest';
import { formatarData, mesDeFechamento, hojeEmBrasilia } from './periodo';

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

/**
 * A data que a nota nova já vem preenchida (#115).
 *
 * O campo nascia vazio e cobrava uma digitação por nota. O detalhe que importa é o fuso: em UTC,
 * das 21h às 24h de Brasília já é o dia seguinte — a nota sairia datada de amanhã no fim do
 * expediente, que é exatamente quando se emite.
 */
describe('hojeEmBrasilia', () => {
  it('devolve AAAA-MM-DD', () => {
    expect(hojeEmBrasilia(new Date('2026-10-31T15:00:00Z'))).toBe('2026-10-31');
  });

  it('às 22h de Brasília ainda é hoje, embora em UTC já seja amanhã', () => {
    // 01/11 01:00Z = 31/10 22:00 em Brasília.
    const fimDeExpediente = new Date('2026-11-01T01:00:00Z');

    expect(fimDeExpediente.toISOString().slice(0, 10)).toBe('2026-11-01');
    expect(hojeEmBrasilia(fimDeExpediente)).toBe('2026-10-31');
  });

  it('logo depois da meia-noite em Brasília já é o dia novo', () => {
    expect(hojeEmBrasilia(new Date('2026-11-01T03:30:00Z'))).toBe('2026-11-01');
  });
});

describe('formatarData', () => {
  it('data pura não anda um dia por causa do fuso', () => {
    expect(formatarData('2026-09-10')).toBe('10/09/2026');
  });

  it('instante com fuso é lido como instante', () => {
    expect(formatarData('2026-11-03T12:00:00-03:00')).toBe('03/11/2026');
  });

  it('vazio vira traço; o que não é data volta como veio', () => {
    expect(formatarData(null)).toBe('—');
    expect(formatarData('')).toBe('—');
    expect(formatarData('amanhã')).toBe('amanhã');
  });
});
