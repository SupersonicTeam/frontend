import { etapasDoTema, lerManifesto, urlDoParado, urlDoQuadro } from './manifesto-jornada';

/**
 * O `manifesto.json` da jornada 3D (#174, PR J). Ele vem de fora do bundle, então o que estes
 * testes protegem é a desconfiança: qualquer coisa que não seja o que o player sabe tocar vira
 * `null` (e a seção some), e nenhum caminho do arquivo aponta o `fetch` para fora da pasta.
 *
 * O formato é o do pacote v0.1 (repositório Animation-Agroconia), reduzido ao que o player lê.
 */

function etapaBruta(id: string, ordem: number, extra: Record<string, unknown> = {}) {
  const porCamera = (campo: 'pasta' | 'arquivo', caminho: (c: string, f: string) => string) =>
    Object.fromEntries(
      ['16x9', '9x18'].map((c) => [
        c,
        Object.fromEntries(['avif', 'webp'].map((f) => [f, { [campo]: caminho(c, f), bytes: 1 }])),
      ]),
    );
  return {
    id,
    ordem,
    titulo: `Título de ${id}`,
    alt: `Descrição de ${id}`,
    quadros: 60,
    sequencias: porCamera('pasta', (c, f) => `etapas/${id}/${c}/${f}`),
    parado: porCamera('arquivo', (c, f) => `parados/${c}/${id}.${f}`),
    ...extra,
  };
}

function manifestoBruto(extra: Record<string, unknown> = {}) {
  return {
    versao: '0.1',
    padrao_arquivo: 'quadro_{:04d}',
    primeiro_quadro: 1,
    fusao_entre_etapas: 0.08,
    cameras: {
      '16x9': { uso: 'desktop', largura: 1280, altura: 720 },
      '9x18': { uso: 'celular', largura: 720, altura: 1440 },
    },
    // Fora de ordem de propósito: quem ordena é o leitor.
    etapas: [
      etapaBruta('marca-escuro', 4, { tema: 'escuro' }),
      etapaBruta('nome', 1),
      etapaBruta('nota', 2, { nota_html: { sobre_quadro: 60 } }),
      etapaBruta('marca-claro', 4, { tema: 'claro' }),
      etapaBruta('fechamento', 3),
    ],
    ...extra,
  };
}

/** O manifesto com a etapa `indice` (na ordem bruta) trocada por `mudar(etapa)`. */
function comEtapa(indice: number, mudar: (e: Record<string, unknown>) => unknown) {
  const bruto = manifestoBruto();
  const etapas = bruto.etapas.map((e, i) => (i === indice ? mudar({ ...e }) : e));
  return { ...bruto, etapas };
}

describe('lerManifesto', () => {
  it('lê o manifesto do pacote, com as etapas em ordem', () => {
    const m = lerManifesto(manifestoBruto());
    expect(m).not.toBeNull();
    expect(m?.versao).toBe('0.1');
    expect(m?.padraoArquivo).toBe('quadro_{:04d}');
    expect(m?.primeiroQuadro).toBe(1);
    expect(m?.fusao).toBe(0.08);
    expect(m?.cameras).toEqual({
      '16x9': { largura: 1280, altura: 720 },
      '9x18': { largura: 720, altura: 1440 },
    });
    expect(m?.etapas.map((e) => e.id)).toEqual([
      'nome',
      'nota',
      'fechamento',
      'marca-escuro',
      'marca-claro',
    ]);
  });

  it('traz pastas e parados por câmera e formato, e o tema só na marca', () => {
    const m = lerManifesto(manifestoBruto());
    const nome = m?.etapas.find((e) => e.id === 'nome');
    expect(nome?.sequencias['9x18'].webp).toBe('etapas/nome/9x18/webp');
    expect(nome?.parado['16x9'].avif).toBe('parados/16x9/nome.avif');
    expect(nome).not.toHaveProperty('tema');
    expect(m?.etapas.find((e) => e.id === 'marca-claro')?.tema).toBe('claro');
  });

  it('a etapa com `nota_html` é a que segura o último quadro', () => {
    const m = lerManifesto(manifestoBruto());
    expect(m?.etapas.filter((e) => e.seguraUltimoQuadro).map((e) => e.id)).toEqual(['nota']);
  });

  it('sem `alt`, o texto alternativo é o título', () => {
    const m = lerManifesto(comEtapa(1, (e) => ({ ...e, alt: '' })));
    expect(m?.etapas.find((e) => e.id === 'nome')?.alt).toBe('Título de nome');
  });

  it.each<[string, unknown]>([
    ['não é objeto', 'manifesto'],
    ['é lista', []],
    ['é null', null],
  ])('recusa o que não é manifesto (%s)', (_, bruto) => {
    expect(lerManifesto(bruto)).toBeNull();
  });

  it.each<[string, Record<string, unknown>]>([
    ['sem versão', { versao: '' }],
    ['padrão de arquivo sem o número', { padrao_arquivo: 'quadro' }],
    ['primeiro quadro fracionado', { primeiro_quadro: 1.5 }],
    ['fusão negativa', { fusao_entre_etapas: -0.1 }],
    ['fusão de uma etapa inteira', { fusao_entre_etapas: 1 }],
    ['fusão em texto', { fusao_entre_etapas: '0.08' }],
    ['sem a câmera do celular', { cameras: { '16x9': { largura: 1280, altura: 720 } } }],
    [
      'câmera com medida zerada',
      { cameras: { '16x9': { largura: 1280, altura: 0 }, '9x18': { largura: 720, altura: 1440 } } },
    ],
    ['sem etapas', { etapas: [] }],
    ['etapas que não são lista', { etapas: {} }],
  ])('recusa o manifesto inteiro: %s', (_, extra) => {
    expect(lerManifesto(manifestoBruto(extra))).toBeNull();
  });

  it.each<[string, (e: Record<string, unknown>) => unknown]>([
    ['sem id', (e) => ({ ...e, id: '' })],
    ['ordem zero', (e) => ({ ...e, ordem: 0 })],
    ['sem quadros', (e) => ({ ...e, quadros: 0 })],
    ['sem título', (e) => ({ ...e, titulo: undefined })],
    ['tema desconhecido', (e) => ({ ...e, tema: 'sepia' })],
    ['sem sequências', (e) => ({ ...e, sequencias: undefined })],
    ['etapa que não é objeto', () => 'nome'],
  ])('uma etapa ruim derruba o manifesto: %s', (_, mudar) => {
    expect(lerManifesto(comEtapa(1, mudar))).toBeNull();
  });

  it.each([
    ['subindo de pasta', '../../segredo'],
    ['no meio do caminho', 'etapas/../../segredo'],
    ['absoluto', '/etc/quadros'],
    ['outro host', 'https://exemplo.invalid/quadros'],
    ['sem protocolo', '//exemplo.invalid/quadros'],
    ['barra dupla', 'etapas//nome'],
    ['com espaço', 'etapas/nome com espaço'],
  ])('recusa caminho que sai da pasta dos quadros (%s)', (_, caminho) => {
    const pasta = lerManifesto(
      comEtapa(1, (e) => {
        const sequencias = structuredClone(e['sequencias']) as Record<
          string,
          Record<string, { pasta: string }>
        >;
        (sequencias['16x9'] as Record<string, { pasta: string }>)['avif'] = { pasta: caminho };
        return { ...e, sequencias };
      }),
    );
    expect(pasta).toBeNull();

    const parado = lerManifesto(
      comEtapa(1, (e) => {
        const parados = structuredClone(e['parado']) as Record<
          string,
          Record<string, { arquivo: string }>
        >;
        (parados['9x18'] as Record<string, { arquivo: string }>)['webp'] = { arquivo: caminho };
        return { ...e, parado: parados };
      }),
    );
    expect(parado).toBeNull();
  });
});

describe('etapasDoTema', () => {
  const m = lerManifesto(manifestoBruto());
  if (!m) throw new Error('o manifesto de exemplo deveria ser válido');

  it('no claro, todas as etapas sem tema mais a marca clara', () => {
    expect(etapasDoTema(m, 'claro').map((e) => e.id)).toEqual([
      'nome',
      'nota',
      'fechamento',
      'marca-claro',
    ]);
  });

  it('no escuro, a marca escura no lugar da clara', () => {
    expect(etapasDoTema(m, 'escuro').map((e) => e.id)).toEqual([
      'nome',
      'nota',
      'fechamento',
      'marca-escuro',
    ]);
  });
});

describe('urlDoQuadro e urlDoParado', () => {
  const m = lerManifesto(manifestoBruto());
  if (!m) throw new Error('o manifesto de exemplo deveria ser válido');
  const nome = m.etapas[0];
  if (!nome) throw new Error('falta a primeira etapa');
  const base = '/jornada/v0.1/';

  it('numera a partir do `primeiro_quadro`, com quatro dígitos', () => {
    expect(urlDoQuadro(base, m, nome, '16x9', 'avif', 0)).toBe(
      '/jornada/v0.1/etapas/nome/16x9/avif/quadro_0001.avif',
    );
    expect(urlDoQuadro(base, m, nome, '9x18', 'webp', 59)).toBe(
      '/jornada/v0.1/etapas/nome/9x18/webp/quadro_0060.webp',
    );
  });

  it('respeita um pacote que comece do zero', () => {
    const doZero = lerManifesto(manifestoBruto({ primeiro_quadro: 0 }));
    const etapa = doZero?.etapas[0];
    if (!doZero || !etapa) throw new Error('o manifesto de exemplo deveria ser válido');
    expect(urlDoQuadro(base, doZero, etapa, '16x9', 'webp', 0)).toBe(
      '/jornada/v0.1/etapas/nome/16x9/webp/quadro_0000.webp',
    );
  });

  it('o parado é o arquivo do manifesto, sob a base', () => {
    expect(urlDoParado(base, nome, '9x18', 'avif')).toBe('/jornada/v0.1/parados/9x18/nome.avif');
  });
});
