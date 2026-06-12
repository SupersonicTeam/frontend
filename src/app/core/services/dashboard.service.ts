import { Injectable, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Observable, of, catchError, map, throwError, timer, switchMap } from 'rxjs';
import { ApiService } from './api.service';
import {
  ApiErrorEnvelope,
  FiscalError,
  FluxoCaixa,
  NotaFiscal,
  Produtor,
  RascunhoNota,
} from '../models/types';

export const LOGGED_PRODUCER_ID = 'c4f29a8c-1559-4e6c-b0fd-05ce55753c4f';

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
  { nome: 'FUNRURAL', valor: 1500 },
];

/**
 * Validações fiscais simples usadas pelo mock de `gerarXmlNota` enquanto o backend
 * Spring não responde. Espelham regras do contrato (CFOP ausente, total divergente).
 */
export function validarNotaFiscal(nota: NotaFiscal): FiscalError[] {
  const errors: FiscalError[] = [];
  (nota.itens ?? []).forEach((item, i) => {
    if (!item.cfop) {
      errors.push({
        code: 'CFOP_AUSENTE',
        field: `itens[${i}].cfop`,
        message: 'CFOP não informado para o item.',
        suggestion: 'Preencha o CFOP correspondente à operação.',
      });
    }
  });
  const somaItens = (nota.itens ?? []).reduce((s, it) => s + (it.valorTotal ?? 0), 0);
  if (nota.itens?.length && Math.abs(somaItens - (nota.valorTotal ?? 0)) > 0.01) {
    errors.push({
      code: 'TOTAL_DIVERGENTE',
      field: 'total.valorNota',
      message: 'O total da nota não confere com a soma dos itens.',
      suggestion: 'Revise os valores dos itens ou o total da nota.',
      rejectedValue: (nota.valorTotal ?? 0).toFixed(2),
      expectedValue: somaItens.toFixed(2),
    });
  }
  return errors;
}

function montarEnvelopeErro(nota: NotaFiscal, errors: FiscalError[]): ApiErrorEnvelope {
  return {
    timestamp: new Date().toISOString(),
    status: 422,
    error: 'Unprocessable Entity',
    message: 'A nota fiscal possui inconsistências fiscais',
    path: `/api/notas/${nota.id}/gerar-xml`,
    errors,
  };
}

/** Monta um XML representativo de NF-e a partir da nota (não é o layout SEFAZ 4.00 completo). */
export function buildNotaFiscalXml(nota: NotaFiscal): string {
  const esc = (v: unknown): string => {
    const map: Record<string, string> = {
      '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;',
    };
    return String(v ?? '').replace(/[<>&'"]/g, c => map[c]);
  };
  const det = (nota.itens ?? [])
    .map(
      (it, i) => `
    <det nItem="${i + 1}">
      <prod>
        <cProd>${esc(it.codigoProduto)}</cProd>
        <xProd>${esc(it.descricao)}</xProd>
        <NCM>${esc(it.ncm)}</NCM>
        <CFOP>${esc(it.cfop)}</CFOP>
        <uCom>${esc(it.unidade)}</uCom>
        <qCom>${it.quantidade ?? 0}</qCom>
        <vUnCom>${(it.valorUnitario ?? 0).toFixed(2)}</vUnCom>
        <vProd>${(it.valorTotal ?? 0).toFixed(2)}</vProd>
      </prod>
    </det>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<NFe xmlns="http://www.portalfiscal.inf.br/nfe">
  <infNFe Id="NFe${esc(nota.chaveAcesso)}" versao="4.00">
    <ide>
      <nNF>${esc(nota.numero)}</nNF>
      <serie>${esc(nota.serie)}</serie>
      <natOp>${esc(nota.naturezaOperacao)}</natOp>
      <CFOP>${esc(nota.cfop)}</CFOP>
      <dhEmi>${esc(nota.dataEmissao)}</dhEmi>
      <tpNF>${nota.tipo === 'entrada' ? 0 : 1}</tpNF>
    </ide>
    <emit>
      <xNome>${esc(nota.nomeEmitente)}</xNome>
      <CNPJ>${esc(nota.cpfCnpjEmitente)}</CNPJ>
    </emit>${det}
    <total>
      <ICMSTot>
        <vProd>${(nota.valorProdutos ?? 0).toFixed(2)}</vProd>
        <vFrete>${(nota.valorFrete ?? 0).toFixed(2)}</vFrete>
        <vSeg>${(nota.valorSeguro ?? 0).toFixed(2)}</vSeg>
        <vDesc>${(nota.valorDesconto ?? 0).toFixed(2)}</vDesc>
        <vNF>${(nota.valorTotal ?? 0).toFixed(2)}</vNF>
      </ICMSTot>
    </total>
  </infNFe>
</NFe>`;
}

// Notas de exemplo enquanto o backend (/dashboard/notas) não responde.
// A nota 2 tem um item SEM CFOP de propósito → exercita o painel de 422 ao gerar XML.
function mockNotas(): NotaFiscal[] {
  return [
    {
      id: 'mock-nota-1',
      produtorId: LOGGED_PRODUCER_ID,
      chaveAcesso: '35260612345678000190550010000010231000000017',
      tipo: 'saida',
      numero: '1023',
      serie: '1',
      cfop: '5102',
      naturezaOperacao: 'Venda de produção do estabelecimento',
      nomeEmitente: 'Fazenda Boa Vista LTDA',
      cpfCnpjEmitente: '12.345.678/0001-90',
      dataEmissao: '2026-05-20T00:00:00.000Z',
      valorProdutos: 12000,
      valorTotal: 12000,
      valorCbs: 420,
      valorIbs: 860,
      valorFunrural: 180,
      status: 'validada',
      itens: [
        {
          id: 'mi1', numeroItem: 1, descricao: 'Soja em grão', codigoProduto: 'SOJA01',
          ncm: '12019000', cfop: '5102', unidade: 'KG', quantidade: 1000,
          valorUnitario: 12, valorTotal: 12000,
        },
      ],
    },
    {
      id: 'mock-nota-2',
      produtorId: LOGGED_PRODUCER_ID,
      chaveAcesso: '35260687654321000110550010000010241000000028',
      tipo: 'saida',
      numero: '1024',
      serie: '1',
      naturezaOperacao: 'Venda de milho',
      nomeEmitente: 'Fazenda Boa Vista LTDA',
      cpfCnpjEmitente: '12.345.678/0001-90',
      dataEmissao: '2026-05-28T00:00:00.000Z',
      valorProdutos: 8000,
      valorTotal: 8000,
      status: 'pendente',
      itens: [
        {
          id: 'mi2', numeroItem: 1, descricao: 'Milho em grão', codigoProduto: 'MILHO01',
          ncm: '10059010', unidade: 'KG', quantidade: 800, valorUnitario: 10, valorTotal: 8000,
        },
      ],
    },
  ];
}

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
    return this.api.get<NotaFiscal[]>('/dashboard/notas', { produtorId }).pipe(
      map(res => (res?.length ? res : mockNotas())),
      catchError(() => of(mockNotas())),
    );
  }

  getNota(id: string): Observable<NotaFiscal | null> {
    if (!id) return of(null);
    return this.api.get<NotaFiscal>(`/dashboard/notas/${id}`).pipe(catchError(() => of(null)));
  }

  uploadNota(file: File): Observable<NotaFiscal | null> {
    return this.api.uploadFile<NotaFiscal>('/dashboard/notas/upload', file).pipe(catchError(() => of(null)));
  }

  /**
   * Gera o XML da nota via backend Spring (`POST /notas/:id/gerar-xml`).
   * Enquanto o backend não responde, cai no mock local — que também simula o 422
   * de inconsistências fiscais. Resolve com a string XML em caso de sucesso; em erro
   * fiscal, o stream lança um `ApiErrorEnvelope` (tratado no componente).
   */
  gerarXmlNota(nota: NotaFiscal): Observable<string> {
    return this.api.post<{ xml: string }>(`/notas/${nota.id}/gerar-xml`).pipe(
      map(res => res.xml),
      catchError((err: HttpErrorResponse) => {
        // Backend já existe e recusou por inconsistências → propaga o envelope real.
        if (err.status === 422 && err.error?.errors) {
          return throwError(() => err.error as ApiErrorEnvelope);
        }
        // Backend ainda indisponível → mock local.
        return this.gerarXmlMock(nota);
      }),
    );
  }

  private gerarXmlMock(nota: NotaFiscal): Observable<string> {
    const erros = validarNotaFiscal(nota);
    return timer(400).pipe(
      switchMap(() =>
        erros.length
          ? throwError(() => montarEnvelopeErro(nota, erros))
          : of(buildNotaFiscalXml(nota)),
      ),
    );
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
