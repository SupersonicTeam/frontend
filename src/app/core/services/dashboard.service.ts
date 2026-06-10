import { Injectable, inject } from '@angular/core';
import { Observable, of, catchError, map } from 'rxjs';
import { ApiService } from './api.service';
import { FluxoCaixa, NotaFiscal, Produtor, RascunhoNota } from '../models/types';

export const LOGGED_PRODUCER_ID = 'c4f29a8c-1559-4e6c-b0fd-05ce55753c4f';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly api = inject(ApiService);

  getProdutor(id: string): Observable<Produtor | null> {
    return this.api.get<Produtor>(`/dashboard/produtores/${id}`).pipe(catchError(() => of(null)));
  }

  getProdutores(): Observable<Produtor[]> {
    return this.api.get<Produtor[]>('/dashboard/produtores').pipe(catchError(() => of([])));
  }

  getFluxoCaixa(produtorId: string): Observable<FluxoCaixa | null> {
    return this.api.get<FluxoCaixa>(`/dashboard/${produtorId}/fluxo-caixa`).pipe(catchError(() => of(null)));
  }

  getNotas(produtorId: string): Observable<NotaFiscal[]> {
    return this.api.get<NotaFiscal[]>('/dashboard/notas', { produtorId }).pipe(catchError(() => of([])));
  }

  getNota(id: string): Observable<NotaFiscal | null> {
    if (!id) return of(null);
    return this.api.get<NotaFiscal>(`/dashboard/notas/${id}`).pipe(catchError(() => of(null)));
  }

  uploadNota(file: File): Observable<NotaFiscal | null> {
    return this.api.uploadFile<NotaFiscal>('/dashboard/notas/upload', file).pipe(catchError(() => of(null)));
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

  // GET /dashboard/:produtorId/impostos-por-tipo
  getImpostosPorTipo(produtorId: string): Observable<unknown> {
    return this.api.get<unknown>(`/dashboard/${produtorId}/impostos-por-tipo`).pipe(catchError(() => of(null)));
  }
}
