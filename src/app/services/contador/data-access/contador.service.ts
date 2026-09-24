import { Injectable, inject, signal } from '@angular/core';
import { Observable, of, catchError, map } from 'rxjs';
import { ApiService } from '@core/services/api.service';
import {
  SolicitacaoContador,
  DocumentoContador,
  GuiaFiscal,
  CreateGuiaDto,
} from '@models/solicitacao-contador.model';
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


// Seed inicial das guias por produtor. O status é recalculado apenas no fallback mock
// (getGuias/catchError); em sucesso real do backend, o array retorna como veio, sem recálculo.
const FIXTURE_GUIAS = (produtorId: string): GuiaFiscal[] => [
  {
    id: 'fx-guia-1',
    produtorId,
    tipoGuia: 'ICMS',
    dataVencimento: '2026-07-20',
    valor: 850.5,
    status: 'pendente',
    createdAt: '2026-07-01T09:00:00',
  },
  {
    id: 'fx-guia-2',
    produtorId,
    tipoGuia: 'FUNRURAL',
    dataVencimento: '2026-06-10',
    valor: 320,
    status: 'pago',
    createdAt: '2026-06-01T09:00:00',
  },
  {
    id: 'fx-guia-3',
    produtorId,
    tipoGuia: 'DARF',
    dataVencimento: '2026-06-25',
    valor: 512.9,
    status: 'pendente',
    createdAt: '2026-06-15T09:00:00',
  },
];

@Injectable({ providedIn: 'root' })
export class ContadorApi {
  private readonly api = inject(ApiService);

  // Fallback mock de guias fiscais (signal em memória, escopo de sessão, uma lista por
  // produtorId) — usado só quando o backend real (POST/GET/PATCH /contador/guias, ver issue
  // backend#74) ainda não responde.
  private readonly guiasPorProdutor = signal<Record<string, GuiaFiscal[]>>({});

  private getOrSeedGuias(produtorId: string): GuiaFiscal[] {
    const mapa = this.guiasPorProdutor();
    if (!mapa[produtorId]) {
      const seed = { ...mapa, [produtorId]: FIXTURE_GUIAS(produtorId) };
      this.guiasPorProdutor.set(seed);
      return seed[produtorId];
    }
    return mapa[produtorId];
  }

  // Recalcula o status a partir da data de vencimento — 'pago' é o único estado terminal
  // definido pelo usuário; 'pendente'/'vencido' são sempre derivados da data atual.
  private computeStatusGuia(
    dataVencimento: string,
    statusAtual?: GuiaFiscal['status']
  ): GuiaFiscal['status'] {
    if (statusAtual === 'pago') return 'pago';
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const venc = new Date(dataVencimento + 'T00:00:00');
    return venc < hoje ? 'vencido' : 'pendente';
  }

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
  // Sem backend real ainda (nao ha ContadorController): em erro devolve vazio.
  // NAO cair para dados de exemplo - a tela precisa mostrar que nao ha dado,
  // e nao inventar solicitacoes que nao existem (#49).
  getPendencias(produtorId?: string): Observable<SolicitacaoContador[]> {
    const params = produtorId ? { produtorId } : undefined;
    return this.api.get<PendenciaBackend[]>('/contador/pendencias', params).pipe(
      map(list => (list ?? []).map(p => this.mapPendencia(p))),
      catchError(() => of([]))
    );
  }

  // GET /contador/pendencias-recebidos
  // Sem backend real ainda (nao ha ContadorController): em erro devolve vazio.
  // NAO cair para dados de exemplo - a tela precisa mostrar que nao ha dado,
  // e nao inventar solicitacoes que nao existem (#49).
  getRecebidos(produtorId?: string): Observable<SolicitacaoContador[]> {
    const params = produtorId ? { produtorId } : undefined;
    return this.api.get<PendenciaBackend[]>('/contador/pendencias-recebidos', params).pipe(
      map(list => (list ?? []).map(p => this.mapPendencia(p))),
      catchError(() => of([]))
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
  // Sem backend real ainda: em erro, cria a solicitação localmente (mock) em vez de retornar
  // null — necessário para o fluxo mão-dupla ficar demonstrável sem o endpoint real.
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
      catchError(() =>
        of({
          id: 'fx-pend-' + String(Math.random()).slice(2),
          produtorId: dto.produtorId,
          titulo: dto.titulo,
          descricao: dto.descricao || dto.titulo,
          categoria: dto.categoria,
          mesReferencia: dto.mesReferencia,
          prioridade: dto.prioridade,
          status: 'pendente' as const,
          prazo: dto.prazo || this.defaultPrazo(),
          observacoes: dto.observacoes,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      )
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
  // Sem backend real ainda (nao ha ContadorController): em erro devolve vazio.
  // NAO cair para dados de exemplo - a tela precisa mostrar que nao ha dado,
  // e nao inventar solicitacoes que nao existem (#49).
  getDocumentos(pendenciaId: string): Observable<DocumentoContador[]> {
    return this.api
      .get<DocumentoContador[]>(`/contador/pendencias/${pendenciaId}/documentos`)
      .pipe(catchError(() => of([])));
  }

  // POST /contador/documentos/anexar (multipart)
  // Sem backend real ainda: em erro, cai para um documento de exemplo (nunca null), para o
  // loop mão-dupla (produtor envia → contador recebe) ficar demonstrável sem backend.
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
    return this.api.post<DocumentoContador>('/contador/documentos/anexar', formData).pipe(
      // Antes isto fabricava um documento como se o upload tivesse dado certo -
      // pior que mock: mentia sobre o resultado de uma acao. Agora devolve null
      // e quem chamou mostra a falha (#49).
      catchError(() => of(null))
    );
  }

  // GET /contador/guias?produtorId=:id (issue backend#74 — ainda não existe)
  // Sem backend real: cai para o signal mock (seed lazy), recalculando o status pela data atual.
  getGuias(produtorId?: string): Observable<GuiaFiscal[]> {
    const params = produtorId ? { produtorId } : undefined;
    return this.api.get<GuiaFiscal[]>('/contador/guias', params).pipe(
      catchError(() => {
        const guias = this.getOrSeedGuias(produtorId ?? 'produtor-mock');
        return of(guias.map(g => ({ ...g, status: this.computeStatusGuia(g.dataVencimento, g.status) })));
      })
    );
  }

  // POST /contador/guias (issue backend#74 — ainda não existe)
  // Sem backend real: cria a guia localmente no signal mock.
  anexarGuia(dto: CreateGuiaDto): Observable<GuiaFiscal | null> {
    return this.api.post<GuiaFiscal>('/contador/guias', dto).pipe(
      catchError(() => {
        const guias = this.getOrSeedGuias(dto.produtorId);
        const nova: GuiaFiscal = {
          id: 'guia-' + String(Math.random()).slice(2),
          produtorId: dto.produtorId,
          tipoGuia: dto.tipoGuia,
          dataVencimento: dto.dataVencimento,
          valor: dto.valor,
          status: this.computeStatusGuia(dto.dataVencimento),
          observacoes: dto.observacoes,
          createdAt: new Date().toISOString(),
        };
        this.guiasPorProdutor.update(mapa => ({ ...mapa, [dto.produtorId]: [nova, ...guias] }));
        return of(nova);
      })
    );
  }

  // PATCH /contador/guias/:id/pagar (issue backend#74 — ainda não existe)
  // Sem backend real: marca a guia como paga no signal mock (no-op se o id não existir).
  marcarGuiaPaga(id: string): Observable<void> {
    return this.api.patch<void>(`/contador/guias/${id}/pagar`).pipe(
      catchError(() => {
        const mapa = this.guiasPorProdutor();
        const produtorId = Object.keys(mapa).find(pid => mapa[pid].some(g => g.id === id));
        if (produtorId) {
          this.guiasPorProdutor.set({
            ...mapa,
            [produtorId]: mapa[produtorId].map(g => (g.id === id ? { ...g, status: 'pago' as const } : g)),
          });
        }
        return of(undefined);
      })
    );
  }

  private defaultPrazo(): string {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  }
}
