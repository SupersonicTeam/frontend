import type { ImportacaoNotaResultado } from '@dtos/notas/importacao.response';
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

/** Parâmetros de paginação/ordenação do Spring Data (`Pageable`), mais os filtros da rota. */
/**
 * Paginação, ordenação e **os filtros** de `GET /api/notas` (contrato da #116).
 *
 * Todos opcionais e combináveis. O `totalElements` da resposta reflete o filtro.
 */
export interface Pageable {
  page?: number;
  size?: number;
  /** Só `dataEmissao`, `numero`, `status`, `valorTotal` e `createdAt`. Ex.: 'dataEmissao,desc'. */
  sort?: string;
  /**
   * Um status ou **vários**: repetido na query, valem como **OU**
   * (`?status=RASCUNHO&status=DEVOLVIDA`). É o que permite mandar ao servidor as composições da
   * tela, como "esperando você" — na #104 elas ficavam em memória por eu supor que só cabia um.
   */
  status?: string | readonly string[];
  /** `NFE` ou `NFA`. */
  tipoDocumento?: string;
  /** `YYYY-MM-DD`, em Brasília. O dia de `emitidaAte` entra inteiro. */
  emitidaDe?: string;
  emitidaAte?: string;
  /**
   * Número, destinatário ou natureza — parcial, sem diferenciar maiúscula nem acento.
   *
   * Até 100 caracteres (acima disso o servidor responde `400 VALIDATION_ERROR`). Com menos de 3
   * é **ignorada**, salvo termo só de dígitos, que casa o número da nota por prefixo. Ainda não
   * acha por produto nem por CPF/CNPJ (backend#271).
   */
  busca?: string;
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

  /**
   * `GET /api/notas` — listagem paginada (`Page<NotaFiscalResponse>`).
   *
   * **Os filtros sao do servidor** (issues #104 e #116). Ate entao a tela filtrava em memoria
   * sobre a pagina carregada, com o efeito de o filtro "nao enxergar" o que estivesse fora dela.
   *
   * Correcao de rota registrada: na #104 eu testei `?de=&ate=`, vi serem ignorados e **reportei
   * como lacuna do backend**. Os parametros existiam com outro nome -- `emitidaDe`/`emitidaAte` --
   * e estao no corpo da #116, que eu nao conseguia ler na epoca. Medido contra a API local:
   *
   *     ?emitidaDe=2026-09-01&emitidaAte=2026-09-30          -> 2   (de 15)
   *     ?de=2026-09-01&ate=2026-09-30                        -> 15  (nome inexistente, ignorado)
   *     ?status=COM_INCONSISTENCIAS&status=AGUARDANDO_APROVACAO -> 3 (OU, repetido)
   *     ?busca=ab                                            -> 15  (menos de 3 letras, ignorada)
   *     ?busca=101                                           -> 1   (digitos casam por prefixo)
   */
  listar(pageable: Pageable = {}): Observable<Page<NotaFiscal>> {
    const params: Record<string, string | number | readonly string[]> = {};
    if (pageable.page != null) params['page'] = pageable.page;
    if (pageable.size != null) params['size'] = pageable.size;
    if (pageable.sort) params['sort'] = pageable.sort;
    if (pageable.status?.length) params['status'] = pageable.status;
    if (pageable.tipoDocumento) params['tipoDocumento'] = pageable.tipoDocumento;
    if (pageable.emitidaDe) params['emitidaDe'] = pageable.emitidaDe;
    if (pageable.emitidaAte) params['emitidaAte'] = pageable.emitidaAte;
    if (pageable.busca) params['busca'] = pageable.busca;
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

  /**
   * `GET /api/notas/{id}/danfe-preview` — a **prévia** da DANFE, enquanto o documento fiscal não
   * existe (issue #101).
   *
   * É o espelho exato do `baixarPdf`: medido contra a API local em 29/10, a prévia responde **200
   * application/pdf** numa nota `COM_INCONSISTENCIAS` e **409 "Preview da DANFE indisponivel"**
   * numa `AUTORIZADA` — onde o `pdf` oficial é que responde. Os dois nunca servem a mesma nota, e
   * é por isso que a tela oferece um ou outro, nunca os dois (`temArquivosFiscais`).
   */
  previewDanfe(id: string): Observable<HttpResponse<Blob>> {
    return this.http.get(`/notas/${id}/danfe-preview`, {
      responseType: 'blob',
      observe: 'response',
    });
  }

  /** POST /api/notas/{id}/cancelar — cancela nota AUTORIZADA (motivo 15–255 chars). */
  cancelar(id: string, motivo: string): Observable<unknown> {
    return this.api.post<unknown>(`/notas/${id}/cancelar`, { motivo });
  }

  /** GET /api/notas/{id}/validacoes — histórico de inconsistências (mais recente primeiro). */
  listarValidacoes(id: string): Observable<NotaValidacaoResponse[]> {
    return this.api.get<NotaValidacaoResponse[]>(`/notas/${id}/validacoes`);
  }

  /**
   * `POST /api/notas/importar` — importa notas a partir de arquivos XML (multipart).
   *
   * Devolve **um resultado por arquivo** (issue #117). Era `unknown[]`, e a tela descartava a
   * resposta: dizia "Importação processada" mesmo quando o arquivo tinha sido **recusado**.
   * Agora o tipo obriga a olhar.
   */
  importar(arquivos: File[]): Observable<ImportacaoNotaResultado[]> {
    const form = new FormData();
    arquivos.forEach((f) => form.append('arquivos', f));
    return this.http.post<ImportacaoNotaResultado[]>('/notas/importar', form);
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
