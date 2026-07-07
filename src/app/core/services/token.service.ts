import { Injectable } from '@angular/core';

/**
 * Fonte única do token de acesso do produtor. Ponto de injeção para o `authInterceptor`.
 *
 * **Stand-by até a Sprint 8** (contrato #27, Seção 2): a autenticação real (JWT) ainda não existe;
 * hoje `getToken()` sempre retorna `null` — nenhum header `Authorization` é enviado e nenhuma chamada
 * atual muda. Quando o JWT entrar, esta é a única classe a alterar (ler o token da sessão real); nem
 * o interceptor nem as rotas/DTOs precisam mudar.
 */
@Injectable({ providedIn: 'root' })
export class TokenService {
  /** Token de acesso atual, ou `null` quando não há sessão autenticada (estado atual). */
  getToken(): string | null {
    return null;
  }
}
