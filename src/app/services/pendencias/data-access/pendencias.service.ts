import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams, type HttpResponse } from '@angular/common/http';
import type { Observable } from 'rxjs';
import type { Pendencia, StatusPendencia } from '@models/pendencia.model';

/**
 * Os pedidos de documento **do lado do produtor** (backend#180).
 *
 * As rotas não levam `produtorId`: o produtor é o autenticado. A família que o antigo `ContadorApi`
 * chamava (`/contador/pendencias?produtorId=`) nunca existiu no backend — respondia 404 desde
 * sempre, e era por isso que a seção "Solicitações do Contador" da tela de Documentos jamais
 * aparecia, mesmo quando havia pedido de verdade.
 *
 * O erro **sobe**. A tela precisa distinguir, pelo código do envelope, arquivo recusado
 * (`ANEXO_INVALIDO`), limite estourado (`LIMITE_ANEXOS`), vírus (`ANEXO_INFECTADO`) e anexo ainda
 * em verificação (`ANEXO_EM_VERIFICACAO`) — um `catchError(() => of(null))` aqui transformaria
 * todos em "não aconteceu nada".
 */
@Injectable({ providedIn: 'root' })
export class PendenciasApi {
  private readonly http = inject(HttpClient);

  /** `GET /api/pendencias` — os pedidos de todos os escritórios que atendem este produtor. */
  listar(status: StatusPendencia[] = []): Observable<Pendencia[]> {
    let params = new HttpParams();
    for (const s of status) {
      params = params.append('status', s);
    }
    return this.http.get<Pendencia[]>('/pendencias', { params });
  }

  /**
   * `GET /api/pendencias/{id}` — o pedido **com os anexos**.
   *
   * A lista devolve `anexos` vazio e só o `quantidadeAnexos`; quem precisa dos arquivos vem aqui.
   */
  detalhar(id: string): Observable<Pendencia> {
    return this.http.get<Pendencia>(`/pendencias/${id}`);
  }

  /**
   * `POST /api/pendencias/{id}/anexos` — multipart com a parte `arquivo`, um arquivo por chamada.
   *
   * **Não declaramos `Content-Type`.** Quem monta o `multipart/form-data` com o `boundary` é o
   * navegador, a partir do `FormData`; cravar o header à mão produz um corpo sem boundary e o
   * servidor recusa.
   *
   * A resposta é a pendência atualizada, e é por ela que a tela descobre o que o antivírus fez: com
   * ele fora do ar vem **201** com o anexo `EM_VERIFICACAO` e a pendência ainda `PENDENTE`.
   */
  anexar(id: string, arquivo: File): Observable<Pendencia> {
    const corpo = new FormData();
    corpo.append('arquivo', arquivo);
    return this.http.post<Pendencia>(`/pendencias/${id}/anexos`, corpo);
  }

  /**
   * `GET /api/pendencias/{id}/anexos/{anexoId}` — baixa o arquivo.
   *
   * Só sai anexo `LIMPO`; em verificação o servidor responde 409 `ANEXO_EM_VERIFICACAO`. A resposta
   * inteira (`observe: 'response'`) é para o chamador ler o nome em `Content-Disposition`, como já
   * fazem a DANFE e o XML.
   */
  baixarAnexo(id: string, anexoId: string): Observable<HttpResponse<Blob>> {
    return this.http.get(`/pendencias/${id}/anexos/${anexoId}`, {
      responseType: 'blob',
      observe: 'response',
    });
  }
}
