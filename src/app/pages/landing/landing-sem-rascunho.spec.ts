import { DADOS_EMPRESA } from './dados-empresa';
import { DATA_REVISAO_LEGAL, PERGUNTAS } from './landing-dados';

/**
 * O que a landing afirma, conferido no dado (#212). A varredura do **template** e do que o build
 * publica fica no `scripts/conferir-build-producao.mjs` (conferência 7), e não aqui: o builder do
 * Angular desvia os `.html` para o próprio processador, então um `import '...html?raw'` não
 * compila — a mesma armadilha do `styles.css` anotada no CLAUDE.md.
 */
describe('dados provisórios da landing', () => {
  it('o CNPJ segue marcado como provisório, que é o que esconde a linha no rodapé', () => {
    // O template tem `@if (!empresa.cnpjProvisorio)`. Se alguém puser o CNPJ real, a linha volta
    // sozinha — e este teste passa a cobrar que o marcador não seja mais usado.
    if (DADOS_EMPRESA.cnpjProvisorio) {
      expect(DADOS_EMPRESA.cnpj).toBe('00.000.000/0000-00');
    } else {
      expect(DADOS_EMPRESA.cnpj).toMatch(/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/);
      expect(DADOS_EMPRESA.cnpj).not.toBe('00.000.000/0000-00');
    }
  });

  it('a data da revisão legal é uma data de verdade, não um marcador', () => {
    expect(DATA_REVISAO_LEGAL).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });
});

describe('o que a landing diz sobre a Ceres bate com o backend', () => {
  // Desde 10/11/2026 o modelo é da Anthropic, por API, fora do Brasil (backend#483). A frase
  // antiga, "o modelo roda no servidor da AgroConIA", virou mentira naquele dia e ficou no ar.
  const faq = PERGUNTAS.map((p) => `${p.pergunta} ${p.resposta}`).join(' ');

  it('nenhuma resposta diz que o modelo roda no servidor da AgroConIA', () => {
    expect(faq).not.toMatch(/modelo roda no servidor|roda no servidor da AgroConIA/i);
  });

  it('a resposta sobre a Ceres diz onde o modelo fica', () => {
    expect(faq).toMatch(/Anthropic/);
    expect(faq).toMatch(/fora do Brasil/i);
  });

  it('não promete que o filtro tira o nome — ele não tira', () => {
    // `/api/politica-dados`: "o filtro não retira um nome escrito por extenso".
    expect(faq).not.toMatch(/tira o nome|remove o nome|mascara o nome/i);
    expect(faq).toMatch(/não retira um nome/i);
  });
});
