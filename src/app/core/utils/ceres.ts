import type { CeresFonteDado, RotaCeres } from '@dtos/assistente/ceres.response';

/**
 * Tradução do vocabulário da Ceres para o que o produtor lê na tela (issue #76,
 * seção 6 do contrato).
 *
 * Nada aqui inventa conteúdo: os rótulos são de **campos do contrato**
 * (`funcao`, `parametros`, `rota`). Quando aparecer uma `funcao` que o contrato
 * ainda não documenta, a tela mostra o nome cru em vez de adivinhar um rótulo —
 * é melhor ver `consultarAlgoNovo` do que uma descrição errada do que a
 * assistente consultou.
 */

/** Limite da pergunta no backend (`AssistenteChatRequest.TAMANHO_MAXIMO`). */
export const TAMANHO_MAXIMO_PERGUNTA = 1000;

/**
 * As 13 consultas que a Ceres faz, conferidas contra os `@Tool` de
 * `FerramentasDadosProdutor.java` no backend (#132). A lista dá origem ao tipo
 * `FuncaoCeres`, e o `Record` de rótulos abaixo exige uma entrada para cada uma:
 * função nova entra aqui e o compilador cobra o rótulo.
 */
export const FUNCOES_CERES = [
  'totalComprasPorInsumo',
  'totalVendasPorProduto',
  'consultarApuracao',
  'consultarCreditos',
  'consultarRetencoes',
  'listarNotas',
  'consultarNota',
  'proximosVencimentos',
  'guiasEmAtraso',
  'vencimentosDoMes',
  'listarAlertas',
  'resumoDoProdutor',
  'consultarTratamentoProduto',
] as const;

export type FuncaoCeres = (typeof FUNCOES_CERES)[number];

const ROTULO_FONTE: Record<FuncaoCeres, string> = {
  totalComprasPorInsumo: 'Compras de insumo',
  totalVendasPorProduto: 'Vendas de produto',
  consultarApuracao: 'Apuração de IBS/CBS',
  consultarCreditos: 'Créditos de IBS/CBS',
  consultarRetencoes: 'Retenções nas vendas (Funrural e split payment)',
  listarNotas: 'Notas fiscais',
  consultarNota: 'Nota fiscal',
  proximosVencimentos: 'Guias a vencer',
  guiasEmAtraso: 'Guias em atraso',
  vencimentosDoMes: 'Guias do mês',
  listarAlertas: 'Prazos dos próximos dias',
  resumoDoProdutor: 'Resumo dos seus pontos de atenção',
  consultarTratamentoProduto: 'Tabela oficial do IBS/CBS',
};

/**
 * Consultas que **não** leem dado do produtor. A tabela oficial de classificação
 * tributária (IT 2025.002) vale para qualquer venda do produto: a tela não pode
 * dizer que ela foi "calculada a partir das suas notas".
 */
const FONTES_OFICIAIS: ReadonlySet<string> = new Set<FuncaoCeres>(['consultarTratamentoProduto']);

export function ehFonteOficial(funcao: string): boolean {
  return FONTES_OFICIAIS.has(funcao);
}

/** Parâmetros que essas consultas aceitam. */
const ROTULO_PARAMETRO: Record<string, string> = {
  descricaoOuNcm: 'insumo',
  produtoOuNcm: 'produto',
  numero: 'número da nota',
  dataInicio: 'de',
  dataFim: 'até',
  mes: 'mês',
  tipo: 'tipo',
  situacao: 'situação',
  limite: 'limite',
  dias: 'próximos dias',
};

/**
 * O mesmo parâmetro quer dizer coisas diferentes em funções diferentes:
 * `descricaoOuNcm` é o insumo nas compras e o produto nas vendas.
 */
const ROTULO_PARAMETRO_POR_FUNCAO: Record<string, Record<string, string> | undefined> = {
  totalVendasPorProduto: { descricaoOuNcm: 'produto' },
};

/**
 * Rótulo do selo de rota. `FORA_DE_ESCOPO` não ganha selo — não respondeu nada do domínio.
 *
 * Com `fontes`, o selo diz de onde veio a parte de dados. Resposta que só consultou a
 * tabela oficial não é "das suas notas": ela não olhou dado nenhum do produtor (#132).
 */
export function rotuloRota(rota: RotaCeres, fontes: readonly CeresFonteDado[] = []): string | null {
  const soTabelaOficial = fontes.length > 0 && fontes.every((f) => ehFonteOficial(f.funcao));
  switch (rota) {
    case 'DADOS':
      return soTabelaOficial ? 'da tabela oficial' : 'das suas notas';
    case 'LEGISLACAO':
      return 'da legislação';
    case 'MISTO':
      return soTabelaOficial
        ? 'da tabela oficial e da legislação'
        : 'das suas notas e da legislação';
    case 'FORA_DE_ESCOPO':
      return null;
  }
}

/** O que a tela diz enquanto a Ceres trabalha, depois do evento `rota` do SSE. */
export function etapaDaRota(rota: RotaCeres): string {
  switch (rota) {
    case 'DADOS':
      return 'Consultando as suas notas…';
    case 'LEGISLACAO':
      return 'Consultando a legislação…';
    case 'MISTO':
      return 'Consultando as suas notas e a legislação…';
    case 'FORA_DE_ESCOPO':
      return 'Escrevendo a resposta…';
  }
}

export function rotuloFonte(funcao: string): string {
  return (ROTULO_FONTE as Record<string, string>)[funcao] ?? funcao;
}

export function rotuloParametro(chave: string, funcao?: string): string {
  const daFuncao = funcao ? ROTULO_PARAMETRO_POR_FUNCAO[funcao] : undefined;
  return daFuncao?.[chave] ?? ROTULO_PARAMETRO[chave] ?? chave;
}

/**
 * Datas do contrato vêm em `AAAA-MM-DD` (e `mes` em `AAAA-MM`). Na tela elas
 * aparecem como quem fala português. Qualquer outro formato passa intacto — os
 * valores já vêm mascarados pelo backend e não é papel da tela reescrevê-los.
 */
export function valorDeParametro(valor: string): string {
  const dia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (dia) return `${dia[3]}/${dia[2]}/${dia[1]}`;

  const mes = /^(\d{4})-(\d{2})$/.exec(valor);
  if (mes) {
    const data = new Date(Number(mes[1]), Number(mes[2]) - 1, 1);
    if (!Number.isNaN(data.getTime())) {
      return data.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    }
  }

  return valor;
}

/** `{ dias: "30" }` → `próximos dias: 30`, já na ordem em que o backend mandou. */
export function descreverFonte(fonte: CeresFonteDado): string {
  return Object.entries(fonte.parametros ?? {})
    .map(([chave, valor]) => `${rotuloParametro(chave, fonte.funcao)}: ${valorDeParametro(valor)}`)
    .join(' · ');
}

/** Um pedaço de parágrafo: texto corrido ou uma lista de itens `- `. */
export type TrechoDoTexto = { tipo: 'texto'; texto: string } | { tipo: 'lista'; itens: string[] };

/**
 * Divide a resposta em parágrafos e listas para a tela (#132).
 *
 * Na rota de dados o backend monta o texto por template: parágrafos separados por linha em
 * branco e itens começando por `- `. Isto só **reparte** o texto; ele continua indo para a tela
 * por interpolação, nunca como HTML. Linha que não começa por `- ` fica como veio, com as
 * quebras simples preservadas.
 */
export function paragrafosDoTexto(texto: string): TrechoDoTexto[][] {
  return texto
    .replace(/\r\n?/g, '\n')
    .split(/\n[ \t]*\n/)
    .map((paragrafo) => {
      const trechos: TrechoDoTexto[] = [];
      for (const linha of paragrafo.split('\n')) {
        const item = /^\s*- (.*)$/.exec(linha);
        const ultimo = trechos.at(-1);
        if (item) {
          if (ultimo?.tipo === 'lista') ultimo.itens.push(item[1]);
          else trechos.push({ tipo: 'lista', itens: [item[1]] });
        } else if (linha.trim()) {
          if (ultimo?.tipo === 'texto') ultimo.texto += '\n' + linha;
          else trechos.push({ tipo: 'texto', texto: linha });
        }
      }
      return trechos;
    })
    .filter((trechos) => trechos.length > 0);
}
