import { Injectable, inject } from '@angular/core';
import { Observable, of, catchError, map } from 'rxjs';
import { ApiService } from '@core/services/api.service';
import { FluxoCaixa } from '@models/fluxo-caixa.model';
import { NotaFiscal } from '@models/nota-fiscal.model';
import { Produtor } from '@models/produtor.model';
import { RascunhoNota } from '@models/rascunho-nota.model';
import { LOGGED_PRODUCER_ID } from '@core/config/produtor-logado';

export interface ResumoMensalNotas {
  mes: string;
  entradas: number;
  saidas: number;
}

const MESES_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
// Amostra ilustrativa [entradas, saidas] usada enquanto o backend nao expoe /notas-por-mes.
const AMOSTRA_MENSAL: readonly (readonly [number, number])[] = [
  [4, 6], [7, 5], [5, 9], [8, 7], [6, 11], [9, 8],
];

function mockNotasPorMes(): ResumoMensalNotas[] {
  const hoje = new Date();
  return AMOSTRA_MENSAL.map(([entradas, saidas], i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - (5 - i), 1);
    return { mes: MESES_PT[d.getMonth()], entradas, saidas };
  });
}

export interface DistribuicaoImposto {
  nome: string;
  valor: number;
}

// Mock enquanto o backend nao expoe /distribuicao-impostos (valores ilustrativos em R$).
const MOCK_DISTRIBUICAO: DistribuicaoImposto[] = [
  { nome: 'CBS', valor: 3500 },
  { nome: 'IBS', valor: 7100 },
];

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

  getProdutor(id: string): Observable<Produtor | null> {
    return this.api.get<Produtor>(`/dashboard/produtores/${id}`).pipe(catchError(() => of(null)));
  }

  getProdutores(): Observable<Produtor[]> {
    return this.api.get<Produtor[]>('/dashboard/produtores').pipe(catchError(() => of([])));
  }

  getFluxoCaixa(produtorId: string): Observable<FluxoCaixa | null> {
    return this.api.get<FluxoCaixa>(`/dashboard/${produtorId}/fluxo-caixa`).pipe(catchError(() => of(null)));
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

  // GET /dashboard/:produtorId/notas-por-mes  → fallback mock enquanto backend pendente
  getNotasPorMes(produtorId: string): Observable<ResumoMensalNotas[]> {
    return this.api.get<ResumoMensalNotas[]>(`/dashboard/${produtorId}/notas-por-mes`).pipe(
      map(res => (res?.length ? res : mockNotasPorMes())),
      catchError(() => of(mockNotasPorMes()))
    );
  }

  // GET /dashboard/:produtorId/distribuicao-impostos  → fallback mock enquanto backend pendente
  getDistribuicaoImpostos(produtorId: string): Observable<DistribuicaoImposto[]> {
    return this.api.get<DistribuicaoImposto[]>(`/dashboard/${produtorId}/distribuicao-impostos`).pipe(
      map(res => (res?.length ? res : MOCK_DISTRIBUICAO)),
      catchError(() => of(MOCK_DISTRIBUICAO))
    );
  }
}
