import { Injectable, inject, signal } from '@angular/core';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs';
import { ApiService } from '@core/services/api.service';
import type { DashboardResponse } from '@dtos/dashboard/dashboard.response';

/**
 * O painel do produtor (`GET /api/dashboard`).
 *
 * ## Por que os rascunhos saíram (issue #107)
 *
 * Havia seis métodos para `/dashboard/rascunhos/*`, cada um com `catchError(() => of(null))` ou
 * `of([])`. Conferido em 28/10: **a rota não existe no backend** — não há nada em
 * `br.com.agrocontabil` que a sirva, e o servidor responde 404. Nenhum deles tinha chamador.
 *
 * Eram fallbacks escondendo um 404 permanente: a tela nunca saberia que pediu algo inexistente.
 * Apagar é melhor do que consertar o tratamento de erro de uma chamada que não deveria acontecer.
 */
@Injectable({ providedIn: 'root' })
export class DashboardApi {
  private readonly api = inject(ApiService);

  private readonly dashboardSignal = signal<DashboardResponse | null>(null);
  /** Último `DashboardResponse` carregado (cache local — sobrevive à re-navegação). */
  readonly dashboard = this.dashboardSignal.asReadonly();

  /**
   * `GET /api/dashboard` — o agregador (KPIs IBS/CBS, notas por mês, distribuição de impostos e
   * últimas notas do produtor autenticado). `periodo` opcional (`AAAA-MM`); omitido, o backend usa
   * o mês corrente.
   *
   * **Sem tratamento de erro aqui, de propósito:** quem chama decide o estado de erro e o retry.
   * Nunca houve fallback mock neste método, e é o modelo que o resto do service passou a seguir.
   */
  carregar(periodo?: string): Observable<DashboardResponse> {
    const params = periodo ? { periodo } : undefined;
    return this.api
      .get<DashboardResponse>('/dashboard', params)
      .pipe(tap((res) => this.dashboardSignal.set(res)));
  }
}
