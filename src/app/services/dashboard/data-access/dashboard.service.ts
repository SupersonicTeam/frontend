import { Injectable, inject, signal } from '@angular/core';
import { Observable, of, catchError, map, tap } from 'rxjs';
import { ApiService } from '@core/services/api.service';
import { NotaFiscal } from '@models/nota-fiscal.model';
import { RascunhoNota } from '@models/rascunho-nota.model';
import { DashboardResponse } from '@dtos/dashboard/dashboard.response';
import { LOGGED_PRODUCER_ID } from '@core/config/produtor-logado';

/**
 * Notas de exemplo usadas como fallback de demonstração quando `GET /api/notas`
 * falha (backend offline). Espelham o `NotaFiscalResponse` do backend Spring: uma
 * nota AUTORIZADA e uma COM_INCONSISTENCIAS (exercita o badge de desvio e o painel
 * de validações). Exibidas junto ao banner "dados de exemplo" (issue #11/#15).
 */
export function mockNotas(): NotaFiscal[] {
  return [
    {
      id: 'mock-nota-1',
      produtorId: LOGGED_PRODUCER_ID,
      chaveAcesso: '35260612345678000190550010000010231000000017',
      numero: 1023,
      serie: 1,
      modelo: '55',
      naturezaOperacao: 'Venda de produção do estabelecimento',
      status: 'AUTORIZADA',
      tipoDocumento: 'NFE',
      dataEmissao: '2026-05-20T10:00:00-03:00',
      destinatarioNome: 'Cerealista Boa Safra LTDA',
      destinatarioCpfCnpj: '12345678000190',
      valorTotalProdutos: 12000,
      valorTotalNota: 12000,
      valorTotalIbs: 860,
      valorTotalCbs: 420,
      createdAt: '2026-05-20T10:00:00-03:00',
      itens: [
        {
          id: 'mi1', numeroItem: 1, descricao: 'Soja em grão', codigoProduto: 'SOJA01',
          ncm: '12019000', cfop: '5101', unidade: 'KG', quantidade: 1000,
          valorUnitario: 12, valorTotal: 12000,
        },
      ],
    },
    {
      id: 'mock-nota-2',
      produtorId: LOGGED_PRODUCER_ID,
      numero: 1024,
      serie: 1,
      modelo: '55',
      naturezaOperacao: 'Venda de milho',
      status: 'COM_INCONSISTENCIAS',
      tipoDocumento: 'NFE',
      dataEmissao: '2026-05-28T10:00:00-03:00',
      destinatarioNome: 'José Comprador',
      destinatarioCpfCnpj: '11144477735',
      valorTotalProdutos: 8000,
      valorTotalNota: 8000,
      createdAt: '2026-05-28T10:00:00-03:00',
      itens: [
        {
          id: 'mi2', numeroItem: 1, descricao: 'Milho em grão', codigoProduto: 'MILHO01',
          ncm: '10059010', cfop: '6101', unidade: 'KG', quantidade: 800,
          valorUnitario: 10, valorTotal: 8000,
        },
      ],
    },
  ];
}

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
