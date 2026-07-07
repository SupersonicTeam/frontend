import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { TokenService } from '@core/services/token.service';

/**
 * Anexa `Authorization: Bearer <token>` às requisições quando há um token disponível.
 *
 * **Inócuo hoje** (contrato #27, Seção 2 / checklist Seção 10): sem sessão real, o `TokenService`
 * devolve `null` e a requisição segue inalterada — nenhuma chamada atual quebra. Estruturado agora
 * para que a ativação do JWT na Sprint 8 não exija mudar rotas nem DTOs, apenas o `TokenService`.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(TokenService).getToken();
  if (!token) {
    return next(req);
  }
  return next(
    req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }),
  );
};
