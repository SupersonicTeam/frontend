import { Injectable, computed, signal } from '@angular/core';

/**
 * Quem está fazendo as requisições — o valor do header `X-Usuario-Id`.
 *
 * Ponto **único** da identidade porque há dois transportes: o `HttpClient` (via
 * `apiInterceptor`) e o `fetch` do streaming da Ceres, que o interceptor não
 * alcança. O contrato da Ceres (issue #76) pede o header nos dois.
 *
 * Hoje ela é **vazia de propósito**, e isso é o comportamento correto:
 *
 * - Não há login de verdade ainda (JWT é Sprint 8 do backend). O `PerfilService`
 *   escolhe produtor/contador para a demonstração, mas não produz UUID nenhum.
 * - O backend, **sem** o header, resolve a identidade para o produtor semente
 *   (`MockIdentidadeFilter`) — é por isso que o app funciona hoje.
 * - Com um UUID que **não existe** no banco ele responde `401 NAO_AUTENTICADO`
 *   em *toda* chamada. E o seed regenera o UUID do produtor a cada recriação do
 *   banco (`gen_random_uuid()`), então cravar um id no código volta a quebrar na
 *   próxima vez. Mandar header errado é pior que não mandar.
 *
 * Para apontar para um usuário específico sem recompilar — por exemplo para ver
 * o `403 PAPEL_NAO_AUTORIZADO` da Ceres com o UUID do contador que o `DataLoader`
 * registra no log do backend:
 *
 * ```js
 * localStorage.setItem('agrocontabil.usuario-id', '<uuid>'); // e recarregue
 * ```
 */
@Injectable({ providedIn: 'root' })
export class IdentidadeService {
  private static readonly KEY = 'agrocontabil.usuario-id';

  private readonly bruto = signal<string>(this.carregar());

  /** UUID do usuário, ou `null` quando não há identidade declarada. */
  readonly usuarioId = computed<string | null>(() => this.bruto().trim() || null);

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
