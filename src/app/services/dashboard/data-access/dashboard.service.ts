import { Injectable, inject, signal } from '@angular/core';
import { Observable, of, catchError, map, tap } from 'rxjs';
import { ApiService } from '@core/services/api.service';
import { RascunhoNota } from '@models/rascunho-nota.model';
import { DashboardResponse } from '@dtos/dashboard/dashboard.response';

@Injectable({ providedIn: 'root' })
export class DashboardApi {
  private readonly api = inject(ApiService);

  private readonly dashboardSignal = signal<DashboardResponse | null>(null);
  /** Último `DashboardResponse` carregado (cache local — sobrevive à re-navegação). */
  readonly dashboard = this.dashboardSignal.asReadonly();

  /**
   * GET /api/dashboard — endpoint agregador (KPIs IBS/CBS, notas por mês, distribuição
   * de impostos e últimas notas do produtor logado). `periodo` opcional (YYYY-MM);
   * omitido usa o mês corrente no backend. Não trata erro aqui — o chamador decide o
   * estado de erro/retry (sem fallback mock).
   */
  carregar(periodo?: string): Observable<DashboardResponse> {
    const params = periodo ? { periodo } : undefined;
    return this.api
      .get<DashboardResponse>('/dashboard', params)
      .pipe(tap(res => this.dashboardSignal.set(res)));
  }

  // GET /dashboard/rascunhos/:produtorId  → { rascunhos, total, message }
  getRascunhos(produtorId: string): Observable<RascunhoNota[]> {
    return this.api.get<{ rascunhos: RascunhoNota[] }>(`/dashboard/rascunhos/${produtorId}`).pipe(
      map(res => res?.rascunhos ?? []),
      catchError(() => of([]))
    );
  }

  // POST /dashboard/rascunhos
  criarRascunho(dto: unknown): Observable<RascunhoNota | null> {
    return this.api.post<RascunhoNota>('/dashboard/rascunhos', dto).pipe(catchError(() => of(null)));
  }

  // PUT /dashboard/rascunhos/:id
  atualizarRascunho(id: string, dto: unknown): Observable<RascunhoNota | null> {
    return this.api.put<RascunhoNota>(`/dashboard/rascunhos/${id}`, dto).pipe(catchError(() => of(null)));
  }

  // POST /dashboard/rascunhos/:id/enviar-contador
  enviarRascunhoContador(id: string): Observable<RascunhoNota | null> {
    return this.api.post<RascunhoNota>(`/dashboard/rascunhos/${id}/enviar-contador`).pipe(catchError(() => of(null)));
  }

  // POST /dashboard/rascunhos/:id/feedback
  feedbackRascunho(id: string, dto: { status: string; feedback: string }): Observable<RascunhoNota | null> {
    return this.api.post<RascunhoNota>(`/dashboard/rascunhos/${id}/feedback`, dto).pipe(catchError(() => of(null)));
  }

  // DELETE /dashboard/rascunhos/:id
  excluirRascunho(id: string): Observable<void> {
    return this.api.delete<void>(`/dashboard/rascunhos/${id}`).pipe(catchError(() => of(undefined)));
  }
}
