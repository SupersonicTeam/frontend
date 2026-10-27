/**
 * Identidades semeadas pelo `DataLoader` do backend, usadas enquanto não há login de verdade.
 *
 * **As duas morrem com a frontend#93.** Com JWT o produtor vem do token e o papel vem do
 * `/api/auth/me`; nenhum UUID precisa morar no código do cliente.
 *
 * Elas são cravadas porque o `DataLoader` gera os ids com `gen_random_uuid()` **uma vez** e depois
 * é idempotente: o id só muda se o banco for recriado. Quando isso acontece, confira com
 * `SELECT id, nome_completo FROM produtores;` e `SELECT id, nome FROM contadores;` antes de culpar
 * o código — e lembre que um UUID que não existe no banco faz o backend responder
 * `401 NAO_AUTENTICADO` em **toda** chamada, o que é pior do que não mandar header nenhum.
 */

/** `João da Silva Produtor`, o produtor semente. */
export const LOGGED_PRODUCER_ID = 'aaee3cd4-9e47-41f9-bf0b-26ae5531c8a8';

/**
 * `Escritorio Contabil Campo Certo`, o contador semente — e o dono da carteira semeada.
 *
 * Precisou existir na #95: a carteira (`GET /api/contador/produtores`) é a primeira rota **do
 * contador** que o app chama, e sem identidade o `MockIdentidadeFilter` resolve o *produtor*
 * semente, de modo que a tela de Acompanhamento recebia `403 PAPEL_NAO_AUTORIZADO`.
 */
export const LOGGED_ACCOUNTANT_ID = 'e57e0c42-c018-4a30-96c6-2c59b8a79498';
