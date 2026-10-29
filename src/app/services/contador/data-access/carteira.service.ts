import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import type { FiltroCarteira, PaginaCarteira, ProdutorCarteira } from '@models/carteira.model';
import type { PendenciaCliente, StatusPendencia } from '@models/carteira.model';
import type { NotaFiscal } from '@models/nota-fiscal.model';
import type { GuiaFiscal } from '@models/solicitacao-contador.model';
import { statusDaGuia } from '@core/utils/guias';
import type { StatusNotaFiscal } from '@core/enums/status-nota-fiscal.enum';
import type { NotaValidacaoResponse } from '@dtos/notas/sefaz.response';

/**
 * Status de nota que o backend aceita no filtro, incluindo os três que a aprovação
 * (backend#178) acrescentou e que o nosso enum ainda não conhece.
 */
export type StatusNotaFiltro =
  | StatusNotaFiscal
  | 'AGUARDANDO_APROVACAO'
  | 'APROVADA'
  | 'DEVOLVIDA';

/** Filtros de `GET /api/contador/produtores/{produtorId}/notas` (os mesmos de `/api/notas`). */
export interface FiltroNotasCliente {
  /** Repetível: o backend aceita mais de um status por consulta. */
  status?: StatusNotaFiltro[];
  de?: string;
  ate?: string;
  busca?: string;
  page?: number;
  size?: number;
  /** Ex.: `dataEmissao,desc`. */
  sort?: string;
}

/**
 * Cliente da **carteira do escritório** (backend#177) e do que o contador alcança de um cliente
 * dela: notas, validações e pendências.
 *
 * Mora separado do `ContadorApi` de propósito. O `ContadorApi` nasceu antes de existir escopo de
 * contador no backend e carrega o jeito antigo — `?produtorId=` na query e `catchError(() => of([]))`
 * engolindo o 404 das rotas que não existiam. Aqui o padrão é o novo:
 *
 * - **produtor no path**, `/api/contador/produtores/{produtorId}/...`, como a #177 fixou;
 * - **nada de fallback silencioso**: o 404 (fora da carteira) e o 403 (papel errado) sobem para a
 *   tela decidir o que dizer. Eram justamente os fallbacks que faziam a tela do contador parecer
 *   cheia enquanto não havia backend;
 * - **lista é array + `X-Total-Count`**, não o `Page<T>` do Spring Data.
 */
@Injectable({ providedIn: 'root' })
export class CarteiraApi {
  private readonly http = inject(HttpClient);

  /** Página máxima que o servidor aceita; é o que `obterCliente` usa para varrer a carteira. */
  private static readonly TAMANHO_MAXIMO = 200;

  /**
   * `GET /api/contador/produtores` — a carteira.
   *
   * O total vem no header, não no corpo. Sem o header (proxy que filtra, mock antigo) cai para o
   * tamanho do array: é melhor um total subestimado do que `undefined` chegando na paginação.
   */
  listar(filtro: FiltroCarteira = {}): Observable<PaginaCarteira> {
    return this.http
      .get<ProdutorCarteira[]>('/contador/produtores', {
        params: this.paramsDaCarteira(filtro),
        observe: 'response',
      })
      .pipe(
        map((resposta) => {
          const itens = resposta.body ?? [];
          const header = resposta.headers.get('X-Total-Count');
          const total = header === null ? itens.length : Number(header);
          return { itens, total: Number.isFinite(total) ? total : itens.length };
        }),
      );
  }

  /**
   * Um cliente da carteira pelo id do produtor, ou `null` se ele não estiver nela.
   *
   * A #177 não tem `GET /contador/produtores/{id}`: a ficha é outro recurso e não traz os
   * indicadores de atenção. Então a tela de um cliente lê a carteira e acha o seu — pedindo a
   * página máxima, porque um cliente na segunda página voltaria como "não é seu cliente".
   *
   * Vale notar o que **não** é feito aqui: filtrar por `situacao`. Sem o parâmetro o servidor usa
   * `ATIVO`, e é o que queremos — num vínculo suspenso ou encerrado o escritório não alcança os
   * dados do produtor, então não há tela de trabalho para abrir.
   */
  obterCliente(produtorId: string): Observable<ProdutorCarteira | null> {
    return this.listar({ size: CarteiraApi.TAMANHO_MAXIMO }).pipe(
      map((pagina) => pagina.itens.find((c) => c.id === produtorId) ?? null),
    );
  }

  /** `GET /api/contador/produtores/{produtorId}/notas` — as notas do cliente, só leitura. */
  notasDoCliente(produtorId: string, filtro: FiltroNotasCliente = {}): Observable<NotaFiscal[]> {
    let params = new HttpParams();
    for (const status of filtro.status ?? []) {
      params = params.append('status', status);
    }
    params = this.anexar(params, {
      de: filtro.de,
      ate: filtro.ate,
      busca: filtro.busca,
      page: filtro.page,
      size: filtro.size,
      sort: filtro.sort,
    });
    return this.http.get<NotaFiscal[]>(`/contador/produtores/${produtorId}/notas`, { params });
  }

  /** `GET /api/contador/produtores/{produtorId}/notas/{notaId}/validacoes` — o que o fisco apontou. */
  validacoesDaNota(produtorId: string, notaId: string): Observable<NotaValidacaoResponse[]> {
    return this.http.get<NotaValidacaoResponse[]>(
      `/contador/produtores/${produtorId}/notas/${notaId}/validacoes`,
    );
  }

  /**
   * `GET /api/contador/produtores/{produtorId}/pendencias` — os pedidos de documento (backend#180).
   *
   * É a rota que substitui o `/api/contador/pendencias?produtorId=` que o `ContadorApi` ainda
   * chama e que responde **404 desde sempre** — o cliente antigo foi escrito contra um contrato
   * que nunca existiu.
   */
  pendenciasDoCliente(
    produtorId: string,
    status: StatusPendencia[] = [],
  ): Observable<PendenciaCliente[]> {
    let params = new HttpParams();
    for (const s of status) {
      params = params.append('status', s);
    }
    return this.http.get<PendenciaCliente[]>(`/contador/produtores/${produtorId}/pendencias`, {
      params,
    });
  }

  /**
   * `GET /api/contador/guias?produtorId=` — as guias que o escritório lançou para o cliente.
   *
   * **É a única rota do contador aqui que leva o produtor na query, e não no path.** Ela é anterior
   * à carteira (nasceu na #74, quando não havia escopo de contador nenhum) e o backend a manteve
   * assim; a autorização, essa sim, já é a nova — o `ProdutorEmContextoResolver` responde 404 para
   * produtor fora da carteira ativa.
   *
   * Lançar guia e dar baixa continuam morando em Prazos e cobrança: aqui é só leitura, para a
   * triagem saber o que cobrar.
   */
  guiasDoCliente(produtorId: string): Observable<GuiaFiscal[]> {
    return this.http
      .get<(Omit<GuiaFiscal, 'status'> & { status: string })[]>('/contador/guias', {
        params: new HttpParams().set('produtorId', produtorId),
      })
      .pipe(
        map((lista) =>
          (lista ?? []).map((g) => ({
            ...g,
            status: statusDaGuia(g.status, g.dataVencimento),
          })),
        ),
      );
  }

  /** Monta os parâmetros da carteira, com `etiqueta` repetido em vez de juntado por vírgula. */
  private paramsDaCarteira(filtro: FiltroCarteira): HttpParams {
    let params = new HttpParams();
    for (const etiqueta of filtro.etiqueta ?? []) {
      params = params.append('etiqueta', etiqueta);
    }
    return this.anexar(params, {
      busca: filtro.busca,
      regime: filtro.regime,
      tipoProdutor: filtro.tipoProdutor,
      uf: filtro.uf,
      situacao: filtro.situacao,
      precisaAtencao: filtro.precisaAtencao,
      responsavel: filtro.responsavel,
      sort: filtro.sort,
      page: filtro.page,
      size: filtro.size,
    });
  }

  /**
   * Acrescenta só o que tem valor.
   *
   * String vazia é descartada junto com `undefined`: um campo de busca que o contador limpou não
   * pode virar `busca=`, que o servidor recusaria com 400 por ter menos de três caracteres.
   * `false` **passa** — é o valor que desliga o filtro `precisaAtencao`, não a ausência dele.
   */
  private anexar(
    params: HttpParams,
    valores: Record<string, string | number | boolean | undefined>,
  ): HttpParams {
    for (const [chave, valor] of Object.entries(valores)) {
      if (valor === undefined || valor === null || valor === '') continue;
      params = params.set(chave, String(valor));
    }
    return params;
  }
}
