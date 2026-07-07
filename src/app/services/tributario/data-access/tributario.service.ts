import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiService } from '@core/services/api.service';
import { Apuracao, CreditoSaldo, RelatorioConformidade } from '@models/tributario.model';

/**
 * Cliente da API real de Tributário do backend Spring (`br.com.agrocontabil`): apuração
 * mensal de IBS/CBS (`/api/apuracao`), saldo de crédito (`/api/creditos`) e relatório de
 * conformidade (`/api/relatorios/conformidade`, JSON e PDF). Todo endpoint exige `periodo`
 * (`YYYY-MM`) — recorte por produtor é feito no backend a partir da autenticação. O PDF usa
 * `HttpClient` direto para controlar o `responseType`; o `apiInterceptor` prefixa `/api`.
 */
@Injectable({ providedIn: 'root' })
export class TributarioApi {
  private readonly api = inject(ApiService);
  private readonly http = inject(HttpClient);

  /** GET /api/apuracao?periodo=YYYY-MM. */
  apuracao(periodo: string): Observable<Apuracao> {
    return this.api.get<Apuracao>('/apuracao', { periodo });
  }

  /** POST /api/apuracao/{id}/reabrir — reabre uma apuração FECHADA (RN005). */
  reabrirApuracao(id: string): Observable<Apuracao> {
    return this.api.post<Apuracao>(`/apuracao/${id}/reabrir`);
  }

  /** GET /api/creditos?periodo=YYYY-MM. */
  saldoCredito(periodo: string): Observable<CreditoSaldo> {
    return this.api.get<CreditoSaldo>('/creditos', { periodo });
  }

  /** GET /api/relatorios/conformidade?periodo=YYYY-MM. */
  relatorioConformidade(periodo: string): Observable<RelatorioConformidade> {
    return this.api.get<RelatorioConformidade>('/relatorios/conformidade', { periodo });
  }

  /**
   * GET /api/relatorios/conformidade/pdf?periodo=YYYY-MM — binário (application/pdf). Resposta
   * completa (`observe:'response'`) para o chamador ler o nome do arquivo em `Content-Disposition`.
   */
  relatorioConformidadePdf(periodo: string): Observable<HttpResponse<Blob>> {
    return this.http.get('/relatorios/conformidade/pdf', {
      params: { periodo },
      responseType: 'blob',
      observe: 'response',
    });
  }
}
