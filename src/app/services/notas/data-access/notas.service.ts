import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ApiService } from '@core/services/api.service';
import { NotaFiscal } from '@models/nota-fiscal.model';
import { NotaFiscalRequest } from '@dtos/notas/nota-fiscal.request';
import { Page } from '@dtos/shared/responses/page.response';
import { SefazRetorno, NotaValidacaoResponse } from '@dtos/notas/sefaz.response';

/** Uma entrada do histórico de revisão de uma nota (backend#178). */
export interface RevisaoNota {
  id: string;
  /** `ENVIADA`, `RETIRADA`, `APROVADA`, `DEVOLVIDA` ou `APROVACAO_CADUCADA`. */
  acao: string;
  /** Só na devolução: o que o produtor precisa corrigir. */
  motivo: string | null;
  usuarioId: string;
  /** `PRODUTOR` ou `CONTADOR`. */
  papel: string;
  ocorridoEm: string;
}

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

  /**
   * `POST /api/notas/{id}/enviar-para-revisao` — manda a nota para o escritório (backend#178).
   *
   * Passa pela validação fiscal **antes** de mudar o status: se ela falhar, o servidor responde
   * 422 e a nota vai para `COM_INCONSISTENCIAS` — ou seja, o produtor não consegue empurrar para o
   * contador uma nota que o fisco já recusaria.
   *
   * Produtor **sem** escritório vinculado recebe 409 `TRANSICAO_REVISAO_INVALIDA`: para ele a
   * emissão segue direta.
   */
  enviarParaRevisao(id: string): Observable<NotaFiscal> {
    return this.api.post<NotaFiscal>(`/notas/${id}/enviar-para-revisao`);
  }

  /** `POST /api/notas/{id}/retirar-da-revisao` — volta a nota a `RASCUNHO`. */
  retirarDaRevisao(id: string): Observable<NotaFiscal> {
    return this.api.post<NotaFiscal>(`/notas/${id}/retirar-da-revisao`);
  }

  /**
   * `GET /api/notas/{id}/revisoes` — o histórico da revisão.
   *
   * Ações: `ENVIADA`, `RETIRADA`, `APROVADA`, `DEVOLVIDA` e `APROVACAO_CADUCADA` (esta última
   * aparece quando a geração do XML de uma nota aprovada falha). É onde mora o **motivo** da
   * devolução, que é o texto que diz ao produtor o que corrigir.
   */
  revisoes(id: string): Observable<RevisaoNota[]> {
    return this.api.get<RevisaoNota[]>(`/notas/${id}/revisoes`);
  }

  /** POST /api/notas/{id}/gerar-xml — gera/assina/valida; retorna a nota atualizada. */
  gerarXml(id: string): Observable<NotaFiscal> {
    return this.api.post<NotaFiscal>(`/notas/${id}/gerar-xml`);
  }

  /**
   * GET /api/notas/{id}/xml — XML assinado (application/xml). Resposta completa (`observe:'response'`)
   * para o chamador ler o nome do arquivo em `Content-Disposition`.
   */
  obterXml(id: string): Observable<HttpResponse<string>> {
    return this.http.get(`/notas/${id}/xml`, { responseType: 'text', observe: 'response' });
  }

  /** POST /api/notas/{id}/enviar-sefaz — transmite à SEFAZ. */
  enviarSefaz(id: string): Observable<SefazRetorno> {
    return this.api.post<SefazRetorno>(`/notas/${id}/enviar-sefaz`);
  }

  /** GET /api/notas/{id}/status-sefaz — consulta e sincroniza o status. */
  consultarStatus(id: string): Observable<SefazRetorno> {
    return this.api.get<SefazRetorno>(`/notas/${id}/status-sefaz`);
  }

  /**
   * GET /api/notas/{id}/pdf — DANFE (application/pdf, attachment). Resposta completa
   * (`observe:'response'`) para o chamador ler o nome do arquivo em `Content-Disposition`.
   */
  baixarPdf(id: string): Observable<HttpResponse<Blob>> {
    return this.http.get(`/notas/${id}/pdf`, { responseType: 'blob', observe: 'response' });
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
