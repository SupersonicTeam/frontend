import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { ApiService } from '@core/services/api.service';
import { skipErrorNotify } from '@core/interceptors/error-notify.context';

/** Situação de um vínculo, como `GET /api/vinculos?situacao=` aceita (backend#353). */
export type SituacaoVinculoProdutor = 'ATIVO' | 'SUSPENSO' | 'ENCERRADO';

/** O escritório que atende este produtor, visto do lado dele (backend#177). */
export interface VinculoDoProdutor {
  id: string;
  escritorioId: string;
  /** Nome do escritório. */
  escritorio: string;
  /** Membro responsável pelo cliente. */
  responsavel: string | null;
  crc: string | null;
  situacao: SituacaoVinculoProdutor;
  inicio: string;
  /** Preenchido só no encerrado. */
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
  private readonly http = inject(HttpClient);

  /**
   * `GET /api/vinculos` — os vínculos do produtor.
   *
   * Sem `situacoes`, `ATIVO` e `SUSPENSO`, como sempre foi (quem só quer saber se há escritório
   * atendendo, como a tela de notas, chama assim). Com `ENCERRADO` (backend#353) vem também o
   * histórico, com `fim` preenchido: primeiro os sem `fim`, depois os encerrados, do mais recente ao
   * mais antigo. O parâmetro vai repetido.
   */
  listar(situacoes: readonly SituacaoVinculoProdutor[] = []): Observable<VinculoDoProdutor[]> {
    return this.api.get<VinculoDoProdutor[]>(
      '/vinculos',
      situacoes.length ? { situacao: situacoes } : undefined,
    );
  }

  /**
   * `GET /api/convites` — os convites pendentes para o e-mail da conta (#147).
   *
   * **Rota do produtor**: com sessão de contador responde 403. Quem chama confere o papel.
   */
  convites(): Observable<ConviteRecebido[]> {
    // Sem toast global: o sino chama isto em toda tela, e o sino falha em silencio.
    return this.http.get<ConviteRecebido[]>('/convites', { context: skipErrorNotify() });
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
