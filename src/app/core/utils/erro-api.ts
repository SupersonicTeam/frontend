import type { HttpErrorResponse } from '@angular/common/http';
import type { ApiErrorEnvelope } from '@dtos/shared/responses/api-error.response';

/**
 * Uma falha da API, já traduzida para o que a tela precisa decidir.
 *
 * Não é só o texto: é também **se faz sentido oferecer "tentar de novo"**. Um botão de repetir num
 * 403 é uma promessa falsa — repetir não muda o papel de quem está logado.
 */
export interface FalhaDaApi {
  /** Código do envelope (`errors[0].code`), quando veio. */
  codigo?: string;
  status: number;
  /** O que a tela mostra. */
  mensagem: string;
  /** Repetir a chamada pode dar outro resultado. */
  podeTentarDeNovo: boolean;
  /** Segundos do `Retry-After`, quando o servidor pediu espera. */
  esperarSegundos?: number;
}

/** Frase por status, usada só quando o servidor não mandou mensagem própria. */
function fraseParaStatus(status: number, esperarSegundos?: number): string {
  if (status === 0) return 'Sem conexão com o servidor. Verifique a sua rede.';
  if (status === 401) return 'A sua sessão expirou. Entre de novo para continuar.';
  if (status === 403) return 'Você não tem permissão para ver isto.';
  if (status === 404) return 'Não encontrado.';
  if (status === 429) {
    return esperarSegundos
      ? `Muitas tentativas. Espere ${esperarSegundos} segundos e tente de novo.`
      : 'Muitas tentativas. Espere um pouco e tente de novo.';
  }
  if (status >= 500) return 'Erro no servidor. Tente novamente em instantes.';
  return `Não foi possível completar a operação (${status}).`;
}

/**
 * Repetir pode dar outro resultado?
 *
 * `401`, `403` e `404` não: a sessão, o papel e a existência do recurso não mudam por insistência.
 * Oferecer "tentar de novo" neles faz o usuário clicar até desistir, achando que é instabilidade.
 */
function vaiAdiantarRepetir(status: number): boolean {
  if (status === 401 || status === 403 || status === 404) return false;
  return true;
}

/**
 * Traduz o erro HTTP numa falha que a tela sabe mostrar (issue #107).
 *
 * **A mensagem do servidor ganha da nossa** quando existe: "Produtor nao encontrado." diz mais do
 * que qualquer frase genérica por status. A nossa frase entra só quando o envelope não trouxe
 * nada — e o `status` continua decidindo se vale repetir.
 *
 * Isto existe porque os services engoliam o erro com `catchError(() => of([]))`, e a tela mostrava
 * **lista vazia**, indistinguível de "não há nada". Foi assim que o produtor errado da issue #106
 * passou despercebido: a tela dizia "Nenhum vencimento nos próximos dias" enquanto a API
 * respondia 404.
 */
export function falhaDaApi(err: HttpErrorResponse): FalhaDaApi {
  const envelope = err.error as ApiErrorEnvelope | null | undefined;
  const primeiro = envelope?.errors?.[0];

  const retryAfter = Number(err.headers?.get?.('Retry-After') ?? '');
  const esperarSegundos = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined;

  const doServidor = primeiro?.message || envelope?.message;
  // Duas exceções à regra "o servidor manda no texto", e as duas pelo mesmo motivo: nelas o que
  // importa é **o que fazer**, e isso só nós sabemos dizer.
  //  - 401: o backend responde "Nao autenticado.", que descreve o estado e não a saída; a pessoa
  //    precisa ler que a sessão expirou e que é para entrar de novo.
  //  - 429: a espera vem no header `Retry-After`, não no texto dele.
  const nossaFraseGanha = err.status === 401 || err.status === 429;
  const mensagem =
    nossaFraseGanha || !doServidor ? fraseParaStatus(err.status, esperarSegundos) : doServidor;

  return {
    codigo: primeiro?.code,
    status: err.status,
    mensagem,
    podeTentarDeNovo: vaiAdiantarRepetir(err.status),
    esperarSegundos,
  };
}
