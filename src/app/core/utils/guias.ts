import type { GuiaFiscal } from '@models/solicitacao-contador.model';

/**
 * Traduz o status de uma guia fiscal para o vocabulário do modelo, **derivando o atraso da data**.
 *
 * Duas coisas acontecem aqui, e as duas são correções de contrato:
 *
 * 1. **Caixa e gênero.** O backend devolve `PENDENTE`/`PAGA`/`VENCIDA` em
 *    `GET /api/contador/guias`, enquanto `/calendario-fiscal/{id}/vencimentos` devolve
 *    `pendente`/`pago` em minúscula. O `GuiaFiscal` declara a forma do calendário, então sem
 *    tradução o tipo mente e nenhuma comparação de status bate.
 * 2. **O atraso.** O backend **não deriva `VENCIDA` da data** nesta rota: uma guia que venceu há
 *    semanas continua voltando `PENDENTE`. Mas a carteira (`atencao.guiasVencidas`, backend#177)
 *    conta essa mesma guia como vencida, porque lá a conta é um agregado no SQL. Se a tela não
 *    derivasse o atraso, a triagem diria "1 guia vencida" e a tela do cliente mostraria a guia como
 *    pendente — duas telas do mesmo app discordando sobre o mesmo dado.
 *
 * `hoje` entra como parâmetro para o teste não depender do calendário de quem roda a suíte.
 *
 * @param status status cru como o backend mandou
 * @param dataVencimento `AAAA-MM-DD`; sem ela não há como afirmar atraso
 * @param hoje `AAAA-MM-DD`; padrão é a data local de hoje
 */
export function statusDaGuia(
  status: string,
  dataVencimento?: string,
  hoje: string = dataLocalDeHoje(),
): GuiaFiscal['status'] {
  switch ((status ?? '').toUpperCase()) {
    case 'PAGA':
    case 'PAGO':
      return 'pago';
    case 'VENCIDA':
    case 'VENCIDO':
      return 'vencido';
    default:
      // Comparação de texto em `AAAA-MM-DD` é ordenação cronológica, e evita o fuso que um
      // `new Date('2026-10-20')` traria (UTC à meia-noite viraria o dia 19 no horário de Brasília).
      return dataVencimento && dataVencimento < hoje ? 'vencido' : 'pendente';
  }
}

/** Hoje em `AAAA-MM-DD`, no fuso de quem está olhando a tela. */
export function dataLocalDeHoje(): string {
  const agora = new Date();
  const mes = String(agora.getMonth() + 1).padStart(2, '0');
  const dia = String(agora.getDate()).padStart(2, '0');
  return `${agora.getFullYear()}-${mes}-${dia}`;
}

/**
 * Quando a guia foi paga, se ela foi e o servidor disse quando (`dataPagamento`, #116).
 *
 * Um lugar só para as telas não discordarem: a regra do atraso já divergiu entre duas telas
 * antes de morar aqui (ver `statusDaGuia`).
 */
export function dataDoPagamento(guia: Pick<GuiaFiscal, 'status' | 'dataPagamento'>): string | null {
  return guia.status === 'pago' && guia.dataPagamento ? guia.dataPagamento : null;
}
