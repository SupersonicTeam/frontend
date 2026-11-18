import {
  EMAIL_CONTATO,
  PERGUNTAS,
  PLANOS_ESCRITORIO,
  PLANOS_PRODUTOR,
  mailtoDoPlano,
  rotuloDoPlano,
} from './landing-dados';

/**
 * Os planos e as perguntas da landing (#174). O que importa aqui: enquanto os preços são proposta
 * do Murillo, nada na página promete valor, e cada botão de plano abre um e-mail com o assunto
 * certo.
 */
describe('dados da landing', () => {
  it('cada público tem três planos, um deles indicado', () => {
    for (const planos of [PLANOS_PRODUTOR, PLANOS_ESCRITORIO]) {
      expect(planos).toHaveLength(3);
      expect(planos.filter((p) => p.indicado)).toHaveLength(1);
    }
  });

  it('o botão do plano é "Tenho interesse", e o do Rede é uma conversa', () => {
    expect(rotuloDoPlano(PLANOS_PRODUTOR[0]!)).toBe('Tenho interesse no plano Essencial');
    expect(rotuloDoPlano(PLANOS_ESCRITORIO[2]!)).toBe('Falar sobre o plano Rede');
  });

  it('o e-mail do plano leva o assunto codificado e diz quando é para escritório', () => {
    const produtor = mailtoDoPlano(PLANOS_PRODUTOR[1]!, 'produtor');
    expect(produtor.startsWith(`mailto:${EMAIL_CONTATO}?subject=`)).toBe(true);
    expect(decodeURIComponent(produtor.split('subject=')[1]!)).toBe(
      'Interesse no plano Profissional - AgroConIA',
    );
    const escritorio = mailtoDoPlano(PLANOS_ESCRITORIO[0]!, 'escritorio');
    expect(decodeURIComponent(escritorio.split('subject=')[1]!)).toBe(
      'Interesse no plano Essencial - AgroConIA para escritório',
    );
  });

  it('nenhuma pergunta promete preço nem fala do plano mensal ou anual', () => {
    const texto = PERGUNTAS.map((p) => `${p.pergunta} ${p.resposta}`).join(' ');
    expect(texto).not.toMatch(/R\$ \d+,\d{2}|mensal|anual/i);
    expect(new Set(PERGUNTAS.map((p) => p.pergunta)).size).toBe(PERGUNTAS.length);
  });
});
