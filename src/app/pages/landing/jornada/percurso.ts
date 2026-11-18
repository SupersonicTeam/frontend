import type { CameraJornada, EtapaJornada } from './manifesto-jornada';

/**
 * A matemática da jornada (#174): da posição da rolagem ao quadro que vai para o canvas.
 *
 * Tudo aqui é função pura — é o miolo do player, e é o que dá para testar sem canvas, sem rede e
 * sem navegador. A referência é o `player/index.html` do repositório dos quadros, que foi por onde
 * o movimento de cada etapa foi revisado.
 */

/**
 * Um pedaço da rolagem. `seq` toca os quadros de uma etapa; `nota` **segura o último quadro** da
 * etapa do carimbo enquanto a nota fiscal em HTML entra por cima.
 */
export interface Trecho {
  tipo: 'seq' | 'nota';
  /** Índice da etapa na lista que está tocando. */
  etapa: number;
  /** Onde começa, em "etapas" de rolagem. */
  ini: number;
  /** Quanto dura, na mesma unidade. */
  dur: number;
}

export interface Percurso {
  trechos: Trecho[];
  /** A soma, descontadas as sobreposições das fusões. */
  comprimento: number;
}

/** Quanto de rolagem a nota fiscal ocupa, em etapas. Um pouco mais que uma: ela tem o que ler. */
export const DURACAO_DA_NOTA = 1.1;

/**
 * Monta os trechos. Cada etapa ocupa um trecho igual; a seguinte **começa antes de a anterior
 * acabar** (a `fusao`, 8% no pacote), e nesse intervalo as duas aparecem misturadas — não há
 * quadros de transição no pacote.
 */
export function montarPercurso(etapas: readonly EtapaJornada[], fusao: number): Percurso {
  const trechos: Trecho[] = [];
  etapas.forEach((etapa, indice) => {
    trechos.push({ tipo: 'seq', etapa: indice, ini: 0, dur: 1 });
    // A nota só entra se houver etapa depois dela: no fim da jornada não há para onde seguir.
    if (etapa.seguraUltimoQuadro && indice < etapas.length - 1) {
      trechos.push({ tipo: 'nota', etapa: indice, ini: 0, dur: DURACAO_DA_NOTA });
    }
  });

  let pos = 0;
  trechos.forEach((trecho, k) => {
    const anterior = trechos[k - 1];
    if (anterior) pos += anterior.dur - (trecho.tipo === 'seq' ? fusao : 0);
    trecho.ini = pos;
  });
  const ultimo = trechos.at(-1);
  return { trechos, comprimento: ultimo ? ultimo.ini + ultimo.dur : 0 };
}

/** Uma camada a desenhar: o quadro `quadro` da etapa `etapa`, com opacidade `alfa`. */
export interface Camada {
  etapa: number;
  quadro: number;
  alfa: number;
}

export interface Posicao {
  /** De baixo para cima: no meio de uma fusão são duas; fora dela, uma. */
  camadas: Camada[];
  /** A etapa cujo texto está em destaque. */
  etapaAtiva: number;
  /** De 0 a 1 enquanto a nota fiscal está em cena; `null` fora dela. */
  nota: number | null;
}

const limitar = (t: number) => Math.min(1, Math.max(0, t));
/** Entra e sai devagar: a mistura linear deixa ver o instante em que a segunda imagem aparece. */
const suave = (t: number) => {
  const x = limitar(t);
  return x * x * (3 - 2 * x);
};

function quadroDoTrecho(trecho: Trecho, u: number, quadros: number): number {
  if (trecho.tipo === 'nota') return quadros - 1;
  return Math.round(limitar(u) * (quadros - 1));
}

/**
 * O que desenhar no ponto `progresso` (0 a 1) da rolagem. Funciona nos dois sentidos: depende só
 * do número, nunca do quadro anterior.
 */
export function posicaoDoPercurso(
  percurso: Percurso,
  etapas: readonly EtapaJornada[],
  progresso: number,
): Posicao {
  const { trechos, comprimento } = percurso;
  if (!trechos.length) return { camadas: [], etapaAtiva: 0, nota: null };

  const x = Math.min(comprimento - 1e-6, limitar(progresso) * comprimento);
  // O trecho da vez é o último que já começou.
  let k = trechos.length - 1;
  while (k > 0 && (trechos[k]?.ini ?? 0) > x) k--;
  const atual = trechos[k] as Trecho;
  const anterior = trechos[k - 1];

  const camadas: Camada[] = [];
  let mistura = 1;
  // Se o anterior ainda não acabou, os dois aparecem: ele por baixo e este entrando.
  if (anterior && x < anterior.ini + anterior.dur) {
    const quadros = etapas[anterior.etapa]?.quadros ?? 1;
    camadas.push({
      etapa: anterior.etapa,
      quadro: quadroDoTrecho(anterior, (x - anterior.ini) / anterior.dur, quadros),
      alfa: 1,
    });
    mistura = suave((x - atual.ini) / (anterior.ini + anterior.dur - atual.ini));
  }
  const quadros = etapas[atual.etapa]?.quadros ?? 1;
  camadas.push({
    etapa: atual.etapa,
    quadro: quadroDoTrecho(atual, (x - atual.ini) / atual.dur, quadros),
    alfa: mistura,
  });

  const daNota = trechos.find((t) => t.tipo === 'nota' && x >= t.ini && x <= t.ini + t.dur);
  return {
    camadas,
    etapaAtiva: atual.etapa,
    nota: daNota ? limitar((x - daNota.ini) / daNota.dur) : null,
  };
}

/** Em que fase a nota fiscal está, pelo progresso dela (0 a 1). São mudanças discretas. */
export type FaseDaNota = 'oculta' | 'conferindo' | 'transmitindo' | 'autorizada';

export function faseDaNota(p: number | null): FaseDaNota {
  if (p === null) return 'oculta';
  if (p < 0.6) return 'conferindo';
  if (p < 0.74) return 'transmitindo';
  return 'autorizada';
}

/** A opacidade da nota em cena: entra nos primeiros 12% do trecho e sai nos últimos 12%. */
export function opacidadeDaNota(p: number | null): number {
  if (p === null) return 0;
  return suave(p / 0.12) * (1 - suave((p - 0.84) / 0.12));
}

/**
 * A ordem em que os quadros de **uma etapa** são pedidos: o primeiro, depois um a cada oito (e o
 * último), depois o resto. Assim qualquer ponto da etapa tem um quadro próximo para mostrar bem
 * antes de a sequência inteira chegar.
 */
export function ordemDeCarga(quadros: number): number[] {
  const vistos = new Set<number>();
  const ordem: number[] = [];
  const poe = (i: number) => {
    if (i >= 0 && i < quadros && !vistos.has(i)) {
      vistos.add(i);
      ordem.push(i);
    }
  };
  poe(0);
  for (let i = 8; i < quadros; i += 8) poe(i);
  poe(quadros - 1);
  for (let i = 0; i < quadros; i++) poe(i);
  return ordem;
}

/** O índice mais próximo de `alvo` que `tem(i)` aceita, ou -1. Procura para os dois lados. */
export function maisProximo(quadros: number, alvo: number, tem: (i: number) => boolean): number {
  for (let d = 0; d < quadros; d++) {
    if (alvo - d >= 0 && tem(alvo - d)) return alvo - d;
    if (alvo + d < quadros && tem(alvo + d)) return alvo + d;
  }
  return -1;
}

/** A câmera pela orientação da tela: em pé usa a `9x18`, deitada a `16x9`. */
export function escolherCamera(largura: number, altura: number): CameraJornada {
  return altura > largura ? '9x18' : '16x9';
}

/**
 * Onde desenhar uma imagem `iw`×`ih` para **cobrir** uma área `cw`×`ch` (o `object-fit: cover` do
 * canvas): escala pelo lado que falta e centraliza, cortando o que sobra. A câmera do celular é
 * 9:18 justamente para o corte ficar pequeno entre 9:16 e 9:19,5.
 */
export function encaixeCobrindo(
  iw: number,
  ih: number,
  cw: number,
  ch: number,
): { x: number; y: number; w: number; h: number } {
  const escala = Math.max(cw / iw, ch / ih);
  const w = iw * escala;
  const h = ih * escala;
  return { x: (cw - w) / 2, y: (ch - h) / 2, w, h };
}
