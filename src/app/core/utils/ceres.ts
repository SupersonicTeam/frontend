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

/** Rótulo do selo de rota. `FORA_DE_ESCOPO` não ganha selo — não respondeu nada do domínio. */
export function rotuloRota(rota: RotaCeres): string | null {
  switch (rota) {
    case 'DADOS':
      return 'das suas notas';
    case 'LEGISLACAO':
      return 'da legislação';
    case 'MISTO':
      return 'das suas notas e da legislação';
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

/** Consultas documentadas na seção 6 do contrato. */
const ROTULO_FONTE: Record<string, string> = {
  totalComprasPorInsumo: 'Compras de insumo',
  consultarApuracao: 'Apuração de IBS/CBS',
  consultarCreditos: 'Créditos de IBS/CBS',
  listarNotas: 'Notas fiscais',
  proximosVencimentos: 'Guias a vencer',
};

/** Parâmetros que essas consultas aceitam. */
const ROTULO_PARAMETRO: Record<string, string> = {
  descricaoOuNcm: 'insumo',
  dataInicio: 'de',
  dataFim: 'até',
  mes: 'mês',
  tipo: 'tipo',
  situacao: 'situação',
  limite: 'limite',
  dias: 'próximos dias',
};

export function rotuloFonte(funcao: string): string {
  return ROTULO_FONTE[funcao] ?? funcao;
}

export function rotuloParametro(chave: string): string {
  return ROTULO_PARAMETRO[chave] ?? chave;
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
    .map(([chave, valor]) => `${rotuloParametro(chave)}: ${valorDeParametro(valor)}`)
    .join(' · ');
}
