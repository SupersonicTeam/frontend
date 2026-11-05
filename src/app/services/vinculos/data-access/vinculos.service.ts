import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { ApiService } from '@core/services/api.service';

/** O escritório que atende este produtor, visto do lado dele (backend#177). */
export interface VinculoDoProdutor {
  id: string;
  escritorioId: string;
  /** Nome do escritório. */
  escritorio: string;
  /** Membro responsável pelo cliente. */
  responsavel: string | null;
  crc: string | null;
  situacao: 'ATIVO' | 'SUSPENSO' | 'ENCERRADO';
  inicio: string;
  fim: string | null;
}

/**
 * Os vínculos do produtor com escritórios de contabilidade.
 *
 * Pequeno de propósito, mas não é detalhe: é esta resposta que diz à tela de notas se a emissão
 * passa pela revisão do contador (backend#178). Com vínculo **ativo**, `gerar-xml` num rascunho
 * responde 409 `APROVACAO_EXIGIDA`; sem vínculo, é o `enviar-para-revisao` que responde 409. Os
 * dois fluxos existem e só um vale para cada produtor — perguntar antes evita oferecer o botão
 * que vai falhar.
 */
/** Um convite de escritório para o produtor (`GET /api/convites`, só os pendentes). */
export interface ConviteRecebido {
  id: string;
  /** Nome do escritório que convidou. */
  escritorio: string;
  /** Quem do escritório mandou. */
  convidadoPor: string | null;
  crc: string | null;
  situacao: string;
  criadoEm: string;
  expiraEm: string;
}

@Injectable({ providedIn: 'root' })
export class VinculosApi {
  private readonly api = inject(ApiService);

  /** `GET /api/vinculos` — todos os vínculos, inclusive os encerrados. */
  listar(): Observable<VinculoDoProdutor[]> {
    return this.api.get<VinculoDoProdutor[]>('/vinculos');
  }

  /**
   * `GET /api/convites` — os convites pendentes para o e-mail da conta (#147).
   *
   * **Rota do produtor**: com sessão de contador responde 403. Quem chama confere o papel.
   */
  convites(): Observable<ConviteRecebido[]> {
    return this.api.get<ConviteRecebido[]>('/convites');
  }

  /** `POST /api/convites/{id}/aceitar` — nasce o vínculo: o escritório passa a ver os dados. */
  aceitarConvite(id: string): Observable<ConviteRecebido> {
    return this.api.post<ConviteRecebido>(`/convites/${id}/aceitar`);
  }

  /** `POST /api/convites/{id}/recusar`. */
  recusarConvite(id: string): Observable<ConviteRecebido> {
    return this.api.post<ConviteRecebido>(`/convites/${id}/recusar`);
  }

  /** `POST /api/vinculos/{id}/encerrar` — o produtor corta o acesso do escritório na hora. */
  encerrar(id: string): Observable<VinculoDoProdutor> {
    return this.api.post<VinculoDoProdutor>(`/vinculos/${id}/encerrar`);
  }
}
