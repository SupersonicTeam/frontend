import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiService } from '@core/services/api.service';
import { NotaFiscal } from '@models/nota-fiscal.model';
import { NotaFiscalRequest } from '@dtos/notas/nota-fiscal.request';
import { Page } from '@dtos/shared/responses/page.response';
import { SefazRetorno, NotaValidacaoResponse } from '@dtos/notas/sefaz.response';

/** Parâmetros de paginação/ordenação do Spring Data (`Pageable`). */
export interface Pageable {
  page?: number;
  size?: number;
  /** Ex.: 'dataEmissao,desc'. */
  sort?: string;
}

/**
 * Cliente da API real de notas fiscais (`/api/notas`) do backend Spring
 * (`br.com.agrocontabil`). Cobre o CRUD, o ciclo de emissão (XML/SEFAZ/DANFE) e o
 * histórico de validações. Endpoints binários/texto (XML, PDF) usam `HttpClient`
 * direto para controlar o `responseType`; o `apiInterceptor` prefixa `/api`.
 */
@Injectable({ providedIn: 'root' })
export class NotasApi {
  private readonly api = inject(ApiService);
  private readonly http = inject(HttpClient);

  /** GET /api/notas — listagem paginada (`Page<NotaFiscalResponse>`). */
  listar(pageable: Pageable = {}): Observable<Page<NotaFiscal>> {
    const params: Record<string, string | number> = {};
    if (pageable.page != null) params['page'] = pageable.page;
    if (pageable.size != null) params['size'] = pageable.size;
    if (pageable.sort) params['sort'] = pageable.sort;
    return this.api.get<Page<NotaFiscal>>('/notas', params);
  }

  /** GET /api/notas/{id}. */
  obter(id: string): Observable<NotaFiscal> {
    return this.api.get<NotaFiscal>(`/notas/${id}`);
  }

  /** POST /api/notas — cria a nota (status RASCUNHO). */
  criar(req: NotaFiscalRequest): Observable<NotaFiscal> {
    return this.api.post<NotaFiscal>('/notas', req);
  }

  /** PUT /api/notas/{id} — edita (só RASCUNHO/COM_INCONSISTENCIAS; 409 fora disso). */
  atualizar(id: string, req: NotaFiscalRequest): Observable<NotaFiscal> {
    return this.api.put<NotaFiscal>(`/notas/${id}`, req);
  }

  /** DELETE /api/notas/{id} — exclui (só RASCUNHO/COM_INCONSISTENCIAS; 409 fora disso). */
  excluir(id: string): Observable<void> {
    return this.api.delete<void>(`/notas/${id}`);
  }

  /** POST /api/notas/{id}/gerar-xml — gera/assina/valida; retorna a nota atualizada. */
  gerarXml(id: string): Observable<NotaFiscal> {
    return this.api.post<NotaFiscal>(`/notas/${id}/gerar-xml`);
  }

  /** GET /api/notas/{id}/xml — XML assinado (application/xml). */
  obterXml(id: string): Observable<string> {
    return this.http.get(`/notas/${id}/xml`, { responseType: 'text' });
  }

  /** POST /api/notas/{id}/enviar-sefaz — transmite à SEFAZ. */
  enviarSefaz(id: string): Observable<SefazRetorno> {
    return this.api.post<SefazRetorno>(`/notas/${id}/enviar-sefaz`);
  }

  /** GET /api/notas/{id}/status-sefaz — consulta e sincroniza o status. */
  consultarStatus(id: string): Observable<SefazRetorno> {
    return this.api.get<SefazRetorno>(`/notas/${id}/status-sefaz`);
  }

  /** GET /api/notas/{id}/pdf — DANFE (application/pdf, attachment). */
  baixarPdf(id: string): Observable<Blob> {
    return this.http.get(`/notas/${id}/pdf`, { responseType: 'blob' });
  }

  /** POST /api/notas/{id}/cancelar — cancela nota AUTORIZADA (motivo 15–255 chars). */
  cancelar(id: string, motivo: string): Observable<unknown> {
    return this.api.post<unknown>(`/notas/${id}/cancelar`, { motivo });
  }

  /** GET /api/notas/{id}/validacoes — histórico de inconsistências (mais recente primeiro). */
  listarValidacoes(id: string): Observable<NotaValidacaoResponse[]> {
    return this.api.get<NotaValidacaoResponse[]>(`/notas/${id}/validacoes`);
  }

  /** POST /api/notas/importar — importa notas a partir de arquivos XML (multipart). */
  importar(arquivos: File[]): Observable<unknown[]> {
    const form = new FormData();
    arquivos.forEach((f) => form.append('arquivos', f));
    return this.http.post<unknown[]>('/notas/importar', form);
  }

  /** Helper: parâmetros HTTP a partir de um `Pageable` (para chamadas ad-hoc). */
  static toParams(pageable: Pageable): HttpParams {
    let p = new HttpParams();
    if (pageable.page != null) p = p.set('page', pageable.page);
    if (pageable.size != null) p = p.set('size', pageable.size);
    if (pageable.sort) p = p.set('sort', pageable.sort);
    return p;
  }
}
