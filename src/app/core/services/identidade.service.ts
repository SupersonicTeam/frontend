import { Injectable, computed, inject, signal } from '@angular/core';
import { PerfilService } from './perfil.service';
import { LOGGED_ACCOUNTANT_ID } from '@core/config/produtor-logado';

/**
 * Quem está fazendo as requisições — o valor do header `X-Usuario-Id`.
 *
 * Ponto **único** da identidade porque há dois transportes: o `HttpClient` (via
 * `apiInterceptor`) e o `fetch` do streaming da Ceres, que o interceptor não
 * alcança. O contrato da Ceres (issue #76) pede o header nos dois.
 *
 * ## Por que ela deixou de ser sempre vazia (#95)
 *
 * Até a carteira, **não mandar header era o certo**: o `MockIdentidadeFilter` resolve o produtor
 * semente, e todas as telas — inclusive as do contador — consultavam rotas do produtor
 * (`/notas`, `/apuracao`, `/dashboard`). O contador da demonstração consultava a API *como se
 * fosse o produtor*, e era só por isso que a tela mostrava números.
 *
 * `GET /api/contador/produtores` (backend#177) é a primeira rota **do contador** que o app chama.
 * Aí o mock resolver o produtor passou a significar `403 PAPEL_NAO_AUTORIZADO`: a tela de
 * Acompanhamento não carregava nada. Então em desenvolvimento a identidade segue o perfil
 * escolhido na tela de entrada.
 *
 * ## O que isto não é
 *
 * Não é autenticação. O perfil vem de um `localStorage` que qualquer um edita, e o UUID do
 * contador está cravado no código. Serve para a demonstração funcionar nos dois papéis contra o
 * backend de desenvolvimento, e **morre com a frontend#93**: com JWT o papel vem do
 * `/api/auth/me` e o header `X-Usuario-Id` deixa de ser enviado.
 *
 * Para apontar para um usuário específico sem recompilar — outro contador, ou um UUID inexistente
 * para ver o `401`:
 *
 * ```js
 * localStorage.setItem('agrocontabil.usuario-id', '<uuid>'); // e recarregue
 * ```
 *
 * Esse valor **vence** o perfil: é a escotilha de depuração, e quem a usou quis aquele id.
 */
@Injectable({ providedIn: 'root' })
export class IdentidadeService {
  private static readonly KEY = 'agrocontabil.usuario-id';

  private readonly perfis = inject(PerfilService);

  private readonly bruto = signal<string>(this.carregar());

  /**
   * UUID do usuário, ou `null` quando não há identidade declarada.
   *
   * Produtor devolve `null` de propósito: o mock resolve o produtor semente, que é exatamente a
   * identidade que as telas dele esperam. Cravar `LOGGED_PRODUCER_ID` aqui daria no mesmo com o
   * banco atual e quebraria com qualquer outro.
   */
  readonly usuarioId = computed<string | null>(() => {
    const declarado = this.bruto().trim();
    if (declarado) return declarado;
    return this.perfis.ehContador() ? LOGGED_ACCOUNTANT_ID : null;
  });

  /**
   * A identidade que deve ir **nesta** requisição — e normalmente é só aqui que o interceptor olha.
   *
   * ## Por que a identidade é por rota, e não global
   *
   * Mandar o UUID do contador em toda chamada resolve a carteira e **quebra as outras três abas**.
   * Medido em 27/10 com o contador semente: `/api/dashboard`, `/api/notas`, `/api/apuracao` e
   * `/api/relatorios/conformidade` derivam o produtor da identidade e respondem
   * `403 PAPEL_NAO_AUTORIZADO` para contador. E não há para onde apontá-las: a leitura por cliente
   * não existe (`/api/contador/produtores/{id}/apuracao` responde 404 — só o `reabrir` mora lá),
   * pedida em SupersonicTeam/backend#255. O Fechamento pararia de carregar sem substituto.
   *
   * Então o header vai só nas rotas **do contador**, onde ele é a diferença entre 200 e 403; nas do
   * produtor seguimos sem header, resolvendo o produtor semente como sempre.
   *
   * **Isto é um remendo de desenvolvimento, e é mentira:** o app se apresenta como duas pessoas
   * diferentes conforme a rota, e por isso o Fechamento mostra os números do produtor semente, não
   * os do cliente escolhido na carteira — o que as duas telas dizem em texto. Morre em duas
   * frentes: a frontend#93 (o papel passa a vir do token) e a backend#255 (as leituras ganham
   * escopo de cliente).
   */
  paraRota(url: string): string | null {
    const declarado = this.bruto().trim();
    // Quem usou a escotilha do localStorage quis aquele id em tudo, inclusive para provocar o 401.
    if (declarado) return declarado;
    if (!this.perfis.ehContador()) return null;
    return IdentidadeService.ehRotaDoContador(url) ? LOGGED_ACCOUNTANT_ID : null;
  }

  /** A URL pode chegar relativa (`/contador/...`) ou já com a baseURL (`/api/contador/...`). */
  private static ehRotaDoContador(url: string): boolean {
    const caminho = url.split('?')[0] ?? '';
    return caminho.startsWith('/contador/') || caminho.startsWith('/api/contador/');
  }

  private carregar(): string {
    if (typeof localStorage === 'undefined') return '';
    try {
      return localStorage.getItem(IdentidadeService.KEY) ?? '';
    } catch {
      // Navegação privada pode recusar o acesso; sem identidade o backend usa a semente.
      return '';
    }
  }
}
