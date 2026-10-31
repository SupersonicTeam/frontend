import { TestBed } from '@angular/core/testing';
import { SessaoService, type Papel, type Sessao } from './sessao.service';

/**
 * Ajudantes para montar uma sessão nos testes (issue #93).
 *
 * Antes da #93 entrar num papel era `perfilService.entrar('produtor')` — uma string num signal.
 * Agora a sessão é um objeto com token e validade, e repetir esse literal em cada `beforeEach`
 * espalharia pelos specs o formato de uma coisa que muda no `SessaoService`.
 *
 * **Só para testes.** Nada do app importa este arquivo; ele não entra no bundle.
 */

/** Ids fixos: o teste que precisa casar o id da rota com o da sessão tem onde ler. */
export const ID_PRODUTOR_TESTE = '11111111-1111-1111-1111-111111111111';
export const ID_CONTADOR_TESTE = '22222222-2222-2222-2222-222222222222';

/** Uma sessão válida, com token vencendo em 15 min — o mesmo prazo que o backend emite. */
export function sessaoDeTeste(papel: Papel, nome = ''): Sessao {
  return {
    token: `token.de.teste.${papel.toLowerCase()}`,
    expiraEm: new Date(Date.now() + 15 * 60_000).toISOString(),
    usuarioId: papel === 'CONTADOR' ? ID_CONTADOR_TESTE : ID_PRODUTOR_TESTE,
    papel,
    nome,
  };
}

/** Uma sessão cujo token já venceu — para exercitar o caminho da renovação. */
export function sessaoVencida(papel: Papel, nome = ''): Sessao {
  return { ...sessaoDeTeste(papel, nome), expiraEm: new Date(Date.now() - 60_000).toISOString() };
}

/** Abre a sessão no `SessaoService` do `TestBed`. */
export function entrarComo(papel: Papel, nome?: string): Sessao {
  const sessao = sessaoDeTeste(papel, nome);
  TestBed.inject(SessaoService).abrir(sessao);
  return sessao;
}
