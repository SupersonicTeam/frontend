/**
 * O mês em que a área do contador abre.
 *
 * **Não é o mês corrente.** Contador fecha o mês que *acabou*: no dia 13 de outubro ele está
 * conferindo setembro, e a apuração de outubro ainda muda a cada nota que o produtor autoriza —
 * a própria tela de Fechamento diz isso ("ainda aberta; o job diário consolida o período").
 *
 * Abrindo no mês corrente, as telas do contador caíam todas em estado vazio no começo de
 * qualquer mês: nenhum impedimento, nenhum número, nenhuma nota. Era a maior parte da impressão
 * de que a área dele "está fraca" — não faltava conteúdo, faltava estar no mês certo.
 *
 * O produtor continua abrindo no mês corrente: a pergunta dele é "quanto estou devendo agora",
 * não "o que fechou".
 */
export function mesDeFechamento(hoje: Date = new Date()): { mes: number; ano: number } {
  const anterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  return { mes: anterior.getMonth() + 1, ano: anterior.getFullYear() };
}

/**
 * Hoje em **Brasília**, como `AAAA-MM-DD` — o padrão da data de emissão (#115).
 *
 * O campo nascia vazio e a pessoa tinha de preencher a data da nota que está emitindo **agora**,
 * que é hoje em 99% das vezes. Não dava erro; só cobrava uma digitação por nota.
 *
 * Não serve `new Date().toISOString().slice(0,10)`: isso devolve a data em **UTC**, e das 21h às
 * 24h no horário de Brasília o UTC já virou o dia seguinte — a nota nasceria datada de amanhã,
 * justamente no fim do expediente. `Intl` com `en-CA` devolve o formato ISO já no fuso pedido.
 */
export function hojeEmBrasilia(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(agora);
}

/**
 * Data em `dd/mm/aaaa` para as duas formas que o backend manda.
 *
 * - **Data pura** (`dataVencimento`, `2026-09-10`) é lida ao meio-dia local. `new Date('2026-09-10')`
 *   é meia-noite em **UTC**, e no fuso de Brasília vira o dia 9.
 * - **Instante com fuso** (`dataPagamento`, `dataFechamento`) é lido como está. Cortar no `T` pegaria
 *   o dia em UTC: 23h de Brasília já é o dia seguinte lá.
 *
 * Vazio vira `—`; texto que não é data volta como veio, em vez de "Invalid Date".
 */
export function formatarData(iso?: string | null): string {
  if (!iso) return '—';
  const soData = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  const d = new Date(soData ? `${iso}T12:00:00` : iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('pt-BR');
}

/**
 * O período escolhido em Documentos como faixa de emissão de `GET /api/notas` (#116).
 *
 * `AAAA-MM` vira o mês inteiro, `AAAA` o ano, e `ultimos30` os 30 dias até hoje em Brasília.
 * `emitidaAte` entra inteiro no servidor, então o último dia é o próprio dia, sem "+1".
 * `todos`, ou qualquer valor que não se reconheça, não restringe nada.
 */
export function faixaDeEmissao(
  periodo: string,
  hoje: string = hojeEmBrasilia(),
): { emitidaDe?: string; emitidaAte?: string } {
  if (periodo === 'ultimos30') {
    const inicio = new Date(`${hoje}T12:00:00Z`);
    inicio.setUTCDate(inicio.getUTCDate() - 30);
    return { emitidaDe: inicio.toISOString().slice(0, 10), emitidaAte: hoje };
  }
  if (/^\d{4}$/.test(periodo))
    return { emitidaDe: `${periodo}-01-01`, emitidaAte: `${periodo}-12-31` };
  const mes = /^(\d{4})-(\d{2})$/.exec(periodo);
  if (mes) {
    const ultimoDia = new Date(Date.UTC(Number(mes[1]), Number(mes[2]), 0)).getUTCDate();
    return {
      emitidaDe: `${periodo}-01`,
      emitidaAte: `${periodo}-${String(ultimoDia).padStart(2, '0')}`,
    };
  }
  return {};
}
