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

  /**
   * `GET /api/apuracao?de=&ate=` — a apuração de **uma faixa de meses**, numa requisição.
   *
   * A tela de Impostos pedia os cinco meses do histórico **um a um**, e havia um comentário dizendo
   * que era assim porque "não existe endpoint de histórico". Existe: conferido no OpenAPI do
   * backend (`http://localhost:8080/v3/api-docs`) e medido contra a API em 29/10 —
   * `?de=2026-05&ate=2026-10` devolve os seis meses em ordem crescente.
   *
   * **Vem sem buraco**, por contrato: mês sem nota chega zerado, com `totalNotas: 0`. Isso muda o
   * sentido da falha — antes um mês podia faltar sozinho; agora ou a faixa inteira responde, ou
   * nenhuma parte dela.
   *
   * A faixa aceita até 60 meses. O contrato ainda oferece `ultimos` (6/12/36/60) e `agrupamento`
   * (TRIMESTRE/SEMESTRE/ANO), que esta tela não usa porque o mês dela é escolhido à mão — `ultimos`
   * conta sempre a partir do corrente.
   */
  apuracaoFaixa(de: string, ate: string): Observable<Apuracao[]> {
    return this.api.get<Apuracao[]>('/apuracao', { de, ate });
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
