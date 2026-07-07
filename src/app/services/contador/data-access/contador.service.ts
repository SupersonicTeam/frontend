import { Injectable, inject } from '@angular/core';
import { Observable, of, catchError, map } from 'rxjs';
import { ApiService } from '@core/services/api.service';
import { SolicitacaoContador, DocumentoContador } from '@models/solicitacao-contador.model';
import { RascunhoNota } from '@models/rascunho-nota.model';

export interface CreateSolicitacaoDto {
  produtorId: string;
  titulo: string;
  descricao: string;
  categoria: string;
  mesReferencia?: string;
  prioridade: 'baixa' | 'media' | 'alta' | 'urgente';
  prazo?: string;
  observacoes?: string;
}

// Formato cru retornado pelo backend (PendenciaContador)
interface PendenciaBackend {
  id: string;
  produtorId: string;
  titulo: string;
  descricao?: string;
  dataLimite?: string;
  prioridade: 'baixa' | 'media' | 'alta' | 'urgente';
  status: string; // pendente | concluida | cancelada | enviado
  tiposDocumentos?: string; // JSON string
  observacoes?: string;
  motivoRejeicao?: string;
  motivoCancelamento?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Fixtures de exemplo (fallback quando /contador/* ainda não existe no backend) ──
const FIXTURE_PENDENCIAS = (produtorId: string): SolicitacaoContador[] => [
  {
    id: 'fx-pend-1',
    produtorId,
    titulo: 'Notas de venda – Julho',
    descricao: 'Notas fiscais de venda do mês corrente',
    categoria: 'Nota de venda',
    mesReferencia: 'Julho',
    prioridade: 'media',
    status: 'pendente',
    prazo: '2026-07-15',
    createdAt: '2026-07-01T09:00:00',
    updatedAt: '2026-07-01T09:00:00',
  },
  {
    id: 'fx-pend-2',
    produtorId,
    titulo: 'Extrato bancário – Junho',
    descricao: 'Extrato da conta corrente para conciliação',
    categoria: 'Extrato bancário',
    mesReferencia: 'Junho',
    prioridade: 'alta',
    status: 'enviado',
    prazo: '2026-07-05',
    createdAt: '2026-06-25T09:00:00',
    updatedAt: '2026-07-03T14:00:00',
  },
  {
    id: 'fx-pend-3',
    produtorId,
    titulo: 'Balancete – 1º semestre',
    descricao: 'Balancete contábil do semestre para fechamento',
    categoria: 'Balancete',
    prioridade: 'media',
    status: 'concluido',
    prazo: '2026-06-30',
    createdAt: '2026-06-01T09:00:00',
    updatedAt: '2026-06-28T09:00:00',
  },
  {
    id: 'fx-pend-4',
    produtorId,
    titulo: 'Guia de imposto – FUNRURAL',
    descricao: 'Comprovante da guia FUNRURAL do mês anterior',
    categoria: 'Guia de imposto',
    prioridade: 'baixa',
    status: 'cancelado',
    prazo: '2026-06-20',
    motivoCancelamento: 'Produtor já havia enviado por e-mail',
    createdAt: '2026-06-05T09:00:00',
    updatedAt: '2026-06-18T09:00:00',
  },
];

const FIXTURE_RECEBIDOS = (produtorId: string): SolicitacaoContador[] =>
  FIXTURE_PENDENCIAS(produtorId).filter(p => p.status === 'enviado');

const FIXTURE_DOCUMENTOS = (pendenciaId: string): DocumentoContador[] => [
  {
    id: `fx-doc-${pendenciaId}-1`,
    solicitacaoId: pendenciaId,
    nomeArquivo: 'extrato-junho.pdf',
    arquivoUrl: '',
    tipo: 'application/pdf',
    createdAt: '2026-07-03T14:00:00',
  },
];

@Injectable({ providedIn: 'root' })
export class ContadorApi {
  private readonly api = inject(ApiService);

  // ── Helpers de codificação (igual ao React) ──
  private parseTipos(raw?: string): string[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(v => String(v)) : [];
    } catch {
      return [];
    }
  }

  private decodeCategoriaMes(raw?: string): { categoria: string; mesReferencia: string } {
    const tipos = this.parseTipos(raw);
    const mesToken = tipos.find(t => t.startsWith('mes:')) || '';
    const mesReferencia = mesToken.replace('mes:', '').trim();
    const categoria = tipos.find(t => t !== mesToken) || 'Documento';
    return { categoria, mesReferencia };
  }

  private buildTipos(categoria: string, mesReferencia?: string): string[] {
    return [categoria, mesReferencia ? `mes:${mesReferencia}` : ''].filter(Boolean);
  }

  // Mapeia o status do backend para o frontend
  private mapStatus(p: PendenciaBackend): SolicitacaoContador['status'] {
    if (p.status === 'concluida' || p.status === 'atendida') return 'concluido';
    if (p.status === 'cancelada') return 'cancelado';
    if (p.status === 'enviado') return 'enviado';
    if (p.status === 'pendente' && p.motivoRejeicao) return 'rejeitado';
    return 'pendente';
  }

  // Converte registro do backend para o modelo do frontend
  private mapPendencia(p: PendenciaBackend): SolicitacaoContador {
    const { categoria, mesReferencia } = this.decodeCategoriaMes(p.tiposDocumentos);
    return {
      id: p.id,
      produtorId: p.produtorId,
      titulo: p.titulo,
      descricao: p.descricao || p.titulo,
      categoria,
      mesReferencia,
      prioridade: p.prioridade,
      status: this.mapStatus(p),
      prazo: p.dataLimite,
      observacoes: p.observacoes,
      motivoRejeicao: p.motivoRejeicao,
      motivoCancelamento: p.motivoCancelamento,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }

  // ── Endpoints ──

  // GET /contador/pendencias?produtorId=:id
  // Sem backend real ainda: em erro, cai para dados de exemplo (nunca sobrepõe sucesso, mesmo vazio).
  getPendencias(produtorId?: string): Observable<SolicitacaoContador[]> {
    const params = produtorId ? { produtorId } : undefined;
    return this.api.get<PendenciaBackend[]>('/contador/pendencias', params).pipe(
      map(list => (list ?? []).map(p => this.mapPendencia(p))),
      catchError(() => of(FIXTURE_PENDENCIAS(produtorId ?? 'produtor-mock')))
    );
  }

  // GET /contador/pendencias-recebidos
  // Sem backend real ainda: em erro, cai para dados de exemplo (nunca sobrepõe sucesso, mesmo vazio).
  getRecebidos(produtorId?: string): Observable<SolicitacaoContador[]> {
    const params = produtorId ? { produtorId } : undefined;
    return this.api.get<PendenciaBackend[]>('/contador/pendencias-recebidos', params).pipe(
      map(list => (list ?? []).map(p => this.mapPendencia(p))),
      catchError(() => of(FIXTURE_RECEBIDOS(produtorId ?? 'produtor-mock')))
    );
  }

  // GET /dashboard/rascunhos/:produtorId  → { rascunhos, total, message }
  getRascunhos(produtorId: string): Observable<RascunhoNota[]> {
    return this.api.get<{ rascunhos: RascunhoNota[] }>(`/dashboard/rascunhos/${produtorId}`).pipe(
      map(res => res?.rascunhos ?? []),
      catchError(() => of([]))
    );
  }

  // POST /contador/pendencias
  criarSolicitacao(dto: CreateSolicitacaoDto): Observable<SolicitacaoContador | null> {
    const payload = {
      produtorId: dto.produtorId,
      titulo: dto.titulo,
      descricao: dto.descricao || dto.titulo,
      dataLimite: dto.prazo || this.defaultPrazo(),
      prioridade: dto.prioridade,
      tiposDocumentos: this.buildTipos(dto.categoria, dto.mesReferencia),
      observacoes: dto.observacoes || undefined,
    };
    return this.api.post<PendenciaBackend>('/contador/pendencias', payload).pipe(
      map(p => this.mapPendencia(p)),
      catchError(() => of(null))
    );
  }

  // PUT /contador/pendencias/:id
  atualizarSolicitacao(
    id: string,
    dto: Partial<CreateSolicitacaoDto>
  ): Observable<SolicitacaoContador | null> {
    const payload: Record<string, unknown> = {};
    if (dto.titulo !== undefined) payload['titulo'] = dto.titulo;
    if (dto.descricao !== undefined) payload['descricao'] = dto.descricao;
    if (dto.prazo) payload['dataLimite'] = dto.prazo;
    if (dto.prioridade) payload['prioridade'] = dto.prioridade;
    if (dto.categoria) payload['tiposDocumentos'] = this.buildTipos(dto.categoria, dto.mesReferencia);
    if (dto.observacoes !== undefined) payload['observacoes'] = dto.observacoes;
    return this.api.put<PendenciaBackend>(`/contador/pendencias/${id}`, payload).pipe(
      map(p => this.mapPendencia(p)),
      catchError(() => of(null))
    );
  }

  // PATCH /contador/pendencias/:id/concluir
  concluirSolicitacao(id: string): Observable<void> {
    return this.api
      .patch<void>(`/contador/pendencias/${id}/concluir`)
      .pipe(catchError(() => of(undefined)));
  }

  // PATCH /contador/pendencias/:id/cancelar
  cancelarSolicitacao(id: string, motivo: string): Observable<void> {
    return this.api
      .patch<void>(`/contador/pendencias/${id}/cancelar`, { motivo })
      .pipe(catchError(() => of(undefined)));
  }

  // PATCH /contador/pendencias/:id/rejeitar
  rejeitarSolicitacao(id: string, motivo: string): Observable<void> {
    return this.api
      .patch<void>(`/contador/pendencias/${id}/rejeitar`, { motivo })
      .pipe(catchError(() => of(undefined)));
  }

  // PATCH /contador/pendencias/:id/reabrir
  reabrirSolicitacao(id: string): Observable<void> {
    return this.api
      .patch<void>(`/contador/pendencias/${id}/reabrir`)
      .pipe(catchError(() => of(undefined)));
  }

  // GET /contador/pendencias/:id/documentos
  // Sem backend real ainda: em erro, cai para dados de exemplo (nunca sobrepõe sucesso, mesmo vazio).
  getDocumentos(pendenciaId: string): Observable<DocumentoContador[]> {
    return this.api
      .get<DocumentoContador[]>(`/contador/pendencias/${pendenciaId}/documentos`)
      .pipe(catchError(() => of(FIXTURE_DOCUMENTOS(pendenciaId))));
  }

  // POST /contador/documentos/anexar (multipart)
  anexarDocumento(
    pendenciaId: string,
    file: File,
    tipoDocumento: string
  ): Observable<DocumentoContador | null> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('pendenciaId', pendenciaId);
    formData.append('nomeArquivo', file.name);
    formData.append('tipoDocumento', tipoDocumento);
    formData.append('tamanho', String(file.size));
    return this.api
      .post<DocumentoContador>('/contador/documentos/anexar', formData)
      .pipe(catchError(() => of(null)));
  }

  private defaultPrazo(): string {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  }
}
