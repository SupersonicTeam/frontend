import type { EtapaJornada } from './manifesto-jornada';
import {
  DURACAO_DA_NOTA,
  encaixeCobrindo,
  escolherCamera,
  faseDaNota,
  maisProximo,
  montarPercurso,
  opacidadeDaNota,
  ordemDeCarga,
  posicaoDoPercurso,
} from './percurso';

/**
 * A matemática da jornada 3D (#174, PR J): da rolagem ao quadro. O que estes testes protegem é o
 * que a conferência no navegador mostrou e que é fácil de quebrar sem ver: a cena depende **só**
 * do ponto da rolagem (os dois sentidos dão a mesma imagem), a fusão mistura duas etapas, e a nota
 * fiscal segura o último quadro da etapa do carimbo.
 */

const FUSAO = 0.08;

function etapa(id: string, opcoes: { quadros?: number; segura?: boolean } = {}): EtapaJornada {
  const caminhos = {
    '16x9': { avif: `etapas/${id}/16x9/avif`, webp: `etapas/${id}/16x9/webp` },
    '9x18': { avif: `etapas/${id}/9x18/avif`, webp: `etapas/${id}/9x18/webp` },
  };
  return {
    id,
    ordem: 1,
    titulo: id,
    alt: id,
    quadros: opcoes.quadros ?? 60,
    seguraUltimoQuadro: opcoes.segura ?? false,
    sequencias: caminhos,
    parado: caminhos,
  };
}

const TRES = [etapa('nome'), etapa('plantio'), etapa('colheita')];
/** A do meio é a do carimbo: depois dela vem o trecho da nota. */
const COM_NOTA = [etapa('armazem'), etapa('nota', { segura: true }), etapa('fechamento')];

describe('montarPercurso', () => {
  it('encadeia as etapas, cada uma começando antes de a anterior acabar (a fusão)', () => {
    const { trechos, comprimento } = montarPercurso(TRES, FUSAO);
    expect(trechos.map((t) => t.tipo)).toEqual(['seq', 'seq', 'seq']);
    expect(trechos.map((t) => t.ini)).toEqual([
      0,
      expect.closeTo(0.92, 10),
      expect.closeTo(1.84, 10),
    ]);
    expect(comprimento).toBeCloseTo(2.84, 10);
  });

  it('põe o trecho da nota logo depois da etapa que segura o último quadro, sem fusão na entrada', () => {
    const { trechos, comprimento } = montarPercurso(COM_NOTA, FUSAO);
    expect(trechos.map((t) => [t.tipo, t.etapa])).toEqual([
      ['seq', 0],
      ['seq', 1],
      ['nota', 1],
      ['seq', 2],
    ]);
    // A nota começa quando a etapa do carimbo acaba; a seguinte se funde com o fim da nota.
    expect(trechos[2]?.ini).toBeCloseTo(1.92, 10);
    expect(trechos[2]?.dur).toBe(DURACAO_DA_NOTA);
    expect(trechos[3]?.ini).toBeCloseTo(1.92 + DURACAO_DA_NOTA - FUSAO, 10);
    expect(comprimento).toBeCloseTo(1.92 + DURACAO_DA_NOTA - FUSAO + 1, 10);
  });

  it('não põe a nota se a etapa do carimbo for a última: no fim não há para onde seguir', () => {
    const { trechos } = montarPercurso([etapa('armazem'), etapa('nota', { segura: true })], FUSAO);
    expect(trechos.some((t) => t.tipo === 'nota')).toBe(false);
  });

  it('sem etapas, percurso vazio', () => {
    expect(montarPercurso([], FUSAO)).toEqual({ trechos: [], comprimento: 0 });
  });
});

describe('posicaoDoPercurso', () => {
  const percurso = montarPercurso(TRES, FUSAO);
  /** O progresso (0 a 1) de um ponto `x` do percurso, na unidade dos trechos. */
  const em = (x: number) => x / percurso.comprimento;

  it('no começo, só o primeiro quadro da primeira etapa', () => {
    expect(posicaoDoPercurso(percurso, TRES, 0)).toEqual({
      camadas: [{ etapa: 0, quadro: 0, alfa: 1 }],
      etapaAtiva: 0,
      nota: null,
    });
  });

  it('no fim, o último quadro da última etapa', () => {
    const { camadas, etapaAtiva } = posicaoDoPercurso(percurso, TRES, 1);
    expect(etapaAtiva).toBe(2);
    expect(camadas.at(-1)).toEqual({ etapa: 2, quadro: 59, alfa: 1 });
  });

  it('fora de 0 a 1 fica nas pontas, sem estourar', () => {
    expect(posicaoDoPercurso(percurso, TRES, -0.5)).toEqual(posicaoDoPercurso(percurso, TRES, 0));
    expect(posicaoDoPercurso(percurso, TRES, 7)).toEqual(posicaoDoPercurso(percurso, TRES, 1));
  });

  it('no meio de uma etapa, uma camada só, no quadro proporcional', () => {
    const { camadas, etapaAtiva } = posicaoDoPercurso(percurso, TRES, em(0.92 + 0.25));
    expect(etapaAtiva).toBe(1);
    expect(camadas).toEqual([{ etapa: 1, quadro: 15, alfa: 1 }]);
  });

  it('na fusão, as duas etapas: a anterior por baixo, inteira, e a seguinte entrando', () => {
    const { camadas, etapaAtiva } = posicaoDoPercurso(percurso, TRES, em(0.96));
    expect(etapaAtiva).toBe(1);
    expect(camadas).toHaveLength(2);
    expect(camadas[0]).toMatchObject({ etapa: 0, alfa: 1 });
    expect(camadas[0]?.quadro).toBeGreaterThan(55);
    // A seguinte já anda: metade da fusão (0,04 de 1) é o quadro 2 de 60.
    expect(camadas[1]).toMatchObject({ etapa: 1, quadro: 2 });
    // Metade da fusão, com a curva suave: metade da opacidade.
    expect(camadas[1]?.alfa).toBeCloseTo(0.5, 5);
  });

  it('a opacidade da que entra cresce ao longo da fusão', () => {
    const alfas = [0.925, 0.94, 0.96, 0.98, 0.995].map(
      (x) => posicaoDoPercurso(percurso, TRES, em(x)).camadas.at(-1)?.alfa ?? -1,
    );
    expect([...alfas].sort((a, b) => a - b)).toEqual(alfas);
    expect(alfas[0]).toBeGreaterThan(0);
    expect(alfas.at(-1)).toBeLessThan(1);
  });

  it('depende só do ponto: descendo ou subindo, a mesma cena', () => {
    const pontos = [0, 0.1, 0.33, 0.34, 0.5, 0.66, 0.9, 1];
    const descendo = pontos.map((p) => posicaoDoPercurso(percurso, TRES, p));
    const subindo = [...pontos].reverse().map((p) => posicaoDoPercurso(percurso, TRES, p));
    expect(subindo.reverse()).toEqual(descendo);
  });

  it('o quadro nunca anda para trás quando a rolagem anda para a frente', () => {
    let anterior = -1;
    for (let i = 0; i <= 200; i++) {
      const topo = posicaoDoPercurso(percurso, TRES, i / 200).camadas.at(-1);
      const global = (topo?.etapa ?? 0) * 60 + (topo?.quadro ?? 0);
      expect(global).toBeGreaterThanOrEqual(anterior);
      anterior = global;
    }
  });

  describe('com a nota fiscal', () => {
    const comNota = montarPercurso(COM_NOTA, FUSAO);
    const naNota = (u: number) => {
      const trecho = comNota.trechos[2];
      const x = (trecho?.ini ?? 0) + u * (trecho?.dur ?? 0);
      return posicaoDoPercurso(comNota, COM_NOTA, x / comNota.comprimento);
    };

    it('segura o último quadro da etapa do carimbo enquanto a nota está em cena', () => {
      for (const u of [0.05, 0.3, 0.6, 0.8]) {
        const { camadas, etapaAtiva, nota } = naNota(u);
        expect(etapaAtiva).toBe(1);
        expect(camadas.at(-1)).toMatchObject({ etapa: 1, quadro: 59 });
        expect(nota).toBeCloseTo(u, 5);
      }
    });

    it('fora do trecho da nota, `nota` é null', () => {
      expect(posicaoDoPercurso(comNota, COM_NOTA, 0).nota).toBeNull();
      expect(posicaoDoPercurso(comNota, COM_NOTA, 1).nota).toBeNull();
    });

    it('no fim da nota, a etapa seguinte entra por cima do quadro segurado', () => {
      const { camadas, etapaAtiva, nota } = naNota(0.99);
      expect(etapaAtiva).toBe(2);
      expect(camadas[0]).toMatchObject({ etapa: 1, quadro: 59, alfa: 1 });
      expect(camadas[1]?.etapa).toBe(2);
      expect(camadas[1]?.alfa).toBeLessThan(1);
      expect(nota).not.toBeNull();
    });
  });
});

describe('faseDaNota', () => {
  it('passa por conferindo, transmitindo e autorizada, em degraus', () => {
    expect(faseDaNota(null)).toBe('oculta');
    expect(faseDaNota(0)).toBe('conferindo');
    expect(faseDaNota(0.59)).toBe('conferindo');
    expect(faseDaNota(0.6)).toBe('transmitindo');
    expect(faseDaNota(0.73)).toBe('transmitindo');
    expect(faseDaNota(0.74)).toBe('autorizada');
    expect(faseDaNota(1)).toBe('autorizada');
  });
});

describe('opacidadeDaNota', () => {
  it('entra nos primeiros 12%, fica inteira no meio e sai nos últimos 12%', () => {
    expect(opacidadeDaNota(null)).toBe(0);
    expect(opacidadeDaNota(0)).toBe(0);
    expect(opacidadeDaNota(0.06)).toBeCloseTo(0.5, 5);
    expect(opacidadeDaNota(0.12)).toBe(1);
    expect(opacidadeDaNota(0.5)).toBe(1);
    expect(opacidadeDaNota(0.84)).toBe(1);
    expect(opacidadeDaNota(0.9)).toBeCloseTo(0.5, 5);
    expect(opacidadeDaNota(0.96)).toBe(0);
    expect(opacidadeDaNota(1)).toBe(0);
  });
});

describe('ordemDeCarga', () => {
  it('pede o primeiro, um a cada oito e o último antes do resto', () => {
    const ordem = ordemDeCarga(60);
    expect(ordem.slice(0, 9)).toEqual([0, 8, 16, 24, 32, 40, 48, 56, 59]);
    expect(ordem[9]).toBe(1);
  });

  it('pede cada quadro uma vez só, todos eles', () => {
    const ordem = ordemDeCarga(60);
    expect(ordem).toHaveLength(60);
    expect(new Set(ordem).size).toBe(60);
    expect([...ordem].sort((a, b) => a - b)).toEqual([...Array(60).keys()]);
  });

  it('aguenta etapas curtas', () => {
    expect(ordemDeCarga(0)).toEqual([]);
    expect(ordemDeCarga(1)).toEqual([0]);
    expect(ordemDeCarga(3)).toEqual([0, 2, 1]);
  });
});

describe('maisProximo', () => {
  const so =
    (...indices: number[]) =>
    (i: number) =>
      indices.includes(i);

  it('o próprio alvo, quando ele está carregado', () => {
    expect(maisProximo(60, 30, so(10, 30, 50))).toBe(30);
  });

  it('procura para os dois lados e, no empate, fica com o de trás', () => {
    expect(maisProximo(60, 30, so(27, 32))).toBe(32);
    expect(maisProximo(60, 30, so(28, 32))).toBe(28);
  });

  it('não sai dos limites da etapa', () => {
    expect(maisProximo(60, 0, so(5))).toBe(5);
    expect(maisProximo(60, 59, so(40))).toBe(40);
  });

  it('-1 quando não há nada carregado', () => {
    expect(maisProximo(60, 30, () => false)).toBe(-1);
  });
});

describe('escolherCamera', () => {
  it('em pé usa a 9x18; deitada ou quadrada, a 16x9', () => {
    expect(escolherCamera(375, 812)).toBe('9x18');
    expect(escolherCamera(1280, 720)).toBe('16x9');
    expect(escolherCamera(800, 800)).toBe('16x9');
  });
});

describe('encaixeCobrindo', () => {
  it('cobre a área inteira e centraliza, cortando o que sobra', () => {
    // Câmera 16x9 numa tela de celular: sobra largura, e ela é cortada dos dois lados.
    const { x, y, w, h } = encaixeCobrindo(1280, 720, 375, 812);
    expect(h).toBeCloseTo(812, 5);
    expect(w).toBeGreaterThan(375);
    expect(y).toBeCloseTo(0, 5);
    expect(x).toBeCloseTo((375 - w) / 2, 5);
  });

  it('na mesma proporção, ocupa exatamente a área', () => {
    expect(encaixeCobrindo(720, 1440, 360, 720)).toEqual({ x: 0, y: 0, w: 360, h: 720 });
  });
});
