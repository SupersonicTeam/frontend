/**
 * O `manifesto.json` do pacote de quadros da jornada do milho (#174), lido e conferido.
 *
 * O manifesto é **a fonte da verdade** do pacote (repositório Animation-Agroconia,
 * `scripts/empacotar.py`): etapas, câmeras, formatos, pastas, quadro parado e texto alternativo.
 * O player não monta caminho na mão — pergunta a este arquivo.
 *
 * Ele vem de **outro lugar** (um caminho servido fora do bundle), então nada aqui confia no
 * formato: `lerManifesto` devolve `null` para qualquer coisa que não seja o que o player sabe
 * tocar, e a seção simplesmente não aparece. Um canvas vazio no meio da landing seria pior do que
 * seção nenhuma.
 */

export const CAMERAS = ['16x9', '9x18'] as const;
/** `16x9` para tela deitada (1280x720) e `9x18` para tela em pé (720x1440). */
export type CameraJornada = (typeof CAMERAS)[number];

export const FORMATOS = ['avif', 'webp'] as const;
/** AVIF onde o navegador decodifica; WebP de reserva. */
export type FormatoJornada = (typeof FORMATOS)[number];

export type TemaJornada = 'claro' | 'escuro';

export interface EtapaJornada {
  /** `nome`, `plantio`… e `marca-claro`/`marca-escuro`, que dividem a mesma `ordem`. */
  id: string;
  ordem: number;
  titulo: string;
  /** Sugestão de texto alternativo do quadro parado. */
  alt: string;
  quadros: number;
  /** Só na marca: a versão que casa com o fundo da página naquele tema. */
  tema?: TemaJornada;
  /**
   * A etapa `nota`: depois dela o player **segura o último quadro** enquanto a nota fiscal em HTML
   * entra por cima (campo `nota_html` do manifesto).
   */
  seguraUltimoQuadro: boolean;
  /** A pasta dos quadros, por câmera e formato. */
  sequencias: Record<CameraJornada, Record<FormatoJornada, string>>;
  /** O arquivo do quadro parado, por câmera e formato. */
  parado: Record<CameraJornada, Record<FormatoJornada, string>>;
}

export interface ManifestoJornada {
  versao: string;
  /** `quadro_{:04d}` — o nome do arquivo, sem a extensão. */
  padraoArquivo: string;
  primeiroQuadro: number;
  /** A fração do fim de cada etapa em que ela se mistura com a seguinte (0,08). */
  fusao: number;
  cameras: Record<CameraJornada, { largura: number; altura: number }>;
  etapas: EtapaJornada[];
}

const texto = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const inteiroPositivo = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v > 0;
const objeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Caminho **relativo e sem volta**: o manifesto vem de fora, e um `../` ou um `https://` ali
 * apontaria o `fetch` para onde o autor do arquivo quisesse.
 */
function caminhoSeguro(v: unknown): v is string {
  return texto(v) && /^[a-z0-9][a-z0-9._/-]*$/i.test(v) && !v.includes('..') && !v.includes('//');
}

/** As quatro combinações de câmera e formato, tiradas de `fonte` pelo campo `campo`. */
function porCameraEFormato(
  fonte: unknown,
  campo: 'pasta' | 'arquivo',
): Record<CameraJornada, Record<FormatoJornada, string>> | null {
  if (!objeto(fonte)) return null;
  const saida = {} as Record<CameraJornada, Record<FormatoJornada, string>>;
  for (const camera of CAMERAS) {
    const daCamera = fonte[camera];
    if (!objeto(daCamera)) return null;
    const formatos = {} as Record<FormatoJornada, string>;
    for (const formato of FORMATOS) {
      const item = daCamera[formato];
      const caminho = objeto(item) ? item[campo] : undefined;
      if (!caminhoSeguro(caminho)) return null;
      formatos[formato] = caminho;
    }
    saida[camera] = formatos;
  }
  return saida;
}

function lerEtapa(bruta: unknown): EtapaJornada | null {
  if (!objeto(bruta)) return null;
  const { id, ordem, titulo, alt, quadros, tema } = bruta;
  if (!texto(id) || !inteiroPositivo(ordem) || !texto(titulo) || !inteiroPositivo(quadros)) {
    return null;
  }
  if (tema !== undefined && tema !== 'claro' && tema !== 'escuro') return null;
  const sequencias = porCameraEFormato(bruta['sequencias'], 'pasta');
  const parado = porCameraEFormato(bruta['parado'], 'arquivo');
  if (!sequencias || !parado) return null;

  return {
    id,
    ordem,
    titulo,
    alt: texto(alt) ? alt : titulo,
    quadros,
    ...(tema ? { tema } : {}),
    seguraUltimoQuadro: objeto(bruta['nota_html']),
    sequencias,
    parado,
  };
}

/** O manifesto conferido, ou `null` se algo nele não é o que o player sabe tocar. */
export function lerManifesto(bruto: unknown): ManifestoJornada | null {
  if (!objeto(bruto)) return null;
  const { versao, padrao_arquivo, primeiro_quadro, fusao_entre_etapas, cameras, etapas } = bruto;

  if (!texto(versao) || !texto(padrao_arquivo) || !padrao_arquivo.includes('{:04d}')) return null;
  if (typeof primeiro_quadro !== 'number' || !Number.isInteger(primeiro_quadro)) return null;
  if (typeof fusao_entre_etapas !== 'number' || fusao_entre_etapas < 0 || fusao_entre_etapas >= 1) {
    return null;
  }
  if (!objeto(cameras) || !Array.isArray(etapas) || etapas.length === 0) return null;

  const medidas = {} as ManifestoJornada['cameras'];
  for (const camera of CAMERAS) {
    const c = cameras[camera];
    if (!objeto(c) || !inteiroPositivo(c['largura']) || !inteiroPositivo(c['altura'])) return null;
    medidas[camera] = { largura: c['largura'], altura: c['altura'] };
  }

  const lidas: EtapaJornada[] = [];
  for (const bruta of etapas) {
    const etapa = lerEtapa(bruta);
    if (!etapa) return null;
    lidas.push(etapa);
  }
  lidas.sort((a, b) => a.ordem - b.ordem);

  return {
    versao,
    padraoArquivo: padrao_arquivo,
    primeiroQuadro: primeiro_quadro,
    fusao: fusao_entre_etapas,
    cameras: medidas,
    etapas: lidas,
  };
}

/**
 * As etapas que tocam num tema: todas as que não têm tema, mais a versão da marca daquele tema. A
 * marca existe em `marca-claro` e `marca-escuro`, com o fundo na cor exata da página; quem visita
 * baixa só uma.
 */
export function etapasDoTema(manifesto: ManifestoJornada, tema: TemaJornada): EtapaJornada[] {
  return manifesto.etapas.filter((e) => !e.tema || e.tema === tema);
}

/** O endereço de um quadro (`indice` a partir de zero). */
export function urlDoQuadro(
  base: string,
  manifesto: ManifestoJornada,
  etapa: EtapaJornada,
  camera: CameraJornada,
  formato: FormatoJornada,
  indice: number,
): string {
  const numero = String(indice + manifesto.primeiroQuadro).padStart(4, '0');
  const nome = manifesto.padraoArquivo.replace('{:04d}', numero);
  return `${base}${etapa.sequencias[camera][formato]}/${nome}.${formato}`;
}

/** O endereço do quadro parado de uma etapa. */
export function urlDoParado(
  base: string,
  etapa: EtapaJornada,
  camera: CameraJornada,
  formato: FormatoJornada,
): string {
  return `${base}${etapa.parado[camera][formato]}`;
}
