/**
 * A identidade semeada pelo `DataLoader` do backend, usada enquanto não há login de verdade.
 *
 * ## O produtor saiu daqui (issue #106)
 *
 * Havia também um `LOGGED_PRODUCER_ID`, passado por quatro telas para rotas por id. Ele **não era
 * necessário**: medido em 29/10, `GET /api/auth/me` já existe e devolve o id do autenticado — era
 * o mesmo UUID que estava cravado. Agora o id vem de lá (ver `AuthApi`), e nenhum id de produtor
 * mora no código do cliente.
 *
 * O do contador **não pode** sair pelo mesmo caminho: é ele que **estabelece** a identidade no
 * header `X-Usuario-Id`. Sem o header, `/auth/me` responde o produtor semente — não há como
 * perguntar ao servidor quem eu sou antes de dizer quem eu sou. Esse só morre com a frontend#93,
 * quando o token passar a carregar isso.
 *
 * Ele é cravado porque o `DataLoader` gera os ids com `gen_random_uuid()` **uma vez** e depois é
 * idempotente: o id só muda se o banco for recriado. Quando isso acontecer, confira com
 * `SELECT id, nome FROM contadores;` antes de culpar o código — e lembre que um UUID que não
 * existe no banco faz o backend responder `401 NAO_AUTENTICADO` em **toda** chamada.
 */

/**
 * `Escritorio Contabil Campo Certo`, o contador semente — e o dono da carteira semeada.
 *
 * Precisou existir na #95: a carteira (`GET /api/contador/produtores`) é a primeira rota **do
 * contador** que o app chama, e sem identidade o `MockIdentidadeFilter` resolve o *produtor*
 * semente, de modo que a tela de Acompanhamento recebia `403 PAPEL_NAO_AUTORIZADO`.
 */
export const LOGGED_ACCOUNTANT_ID = 'e57e0c42-c018-4a30-96c6-2c59b8a79498';
