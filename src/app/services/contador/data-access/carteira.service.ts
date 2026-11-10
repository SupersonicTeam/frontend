import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams, type HttpResponse } from '@angular/common/http';
import { Observable, map, of, switchMap } from 'rxjs';
import type {
  FiltroCarteira,
  NotaCarteira,
  PaginaCarteira,
  ProdutorCarteira,
  ResumoNotasCarteira,
} from '@models/carteira.model';
import type { Pendencia, StatusPendencia, TipoDocumentoPendencia } from '@models/pendencia.model';
import type { NotaFiscal } from '@models/nota-fiscal.model';
import type { RevisaoNota } from '@services/notas/data-access/notas.service';
import type { GuiaFiscal } from '@models/solicitacao-contador.model';
import { statusDaGuia } from '@core/utils/guias';
import type { StatusNotaFiscal } from '@core/enums/status-nota-fiscal.enum';
import type { NotaValidacaoResponse } from '@dtos/notas/sefaz.response';
import type { Apuracao, CreditoSaldo, RelatorioConformidade } from '@models/tributario.model';
import type { DashboardResponse } from '@dtos/dashboard/dashboard.response';

/**
 * Status de nota que o backend aceita no filtro, incluindo os três que a aprovação
 * (backend#178) acrescentou e que o nosso enum ainda não conhece.
 */
export type StatusNotaFiltro = StatusNotaFiscal | 'AGUARDANDO_APROVACAO' | 'APROVADA' | 'DEVOLVIDA';

/** Corpo de `POST .../pendencias`. */
export interface NovoPedidoDocumento {
  /** Até 120 caracteres. */
  titulo: string;
  /** De 1 a 5 tipos. */
  tiposDocumento: TipoDocumentoPendencia[];
  descricao?: string;
  /** `AAAA-MM-DD`. */
  dataLimite?: string;
  observacoes?: string;
}

/**
 * Filtros de `GET /api/contador/notas` e do `/resumo` (backend#341): as notas da carteira inteira,
 * ou de um cliente com `produtorId`. Só clientes com vínculo ATIVO entram; `produtorId` fora da
 * carteira ativa responde 404.
 */
export interface FiltroNotasCarteira {
  /** Repetível (OU). O `/resumo` aceita e ignora: ele já separa por caixa. */
  status?: StatusNotaFiltro[];
  tipoDocumento?: 'NFE' | 'NFA';
  /** `AAAA-MM-DD`, inclusivos. */
  emitidaDe?: string;
  emitidaAte?: string;
  /** De 3 a 100 caracteres: número, destinatário, natureza, produto e CPF/CNPJ do destinatário. */
  busca?: string;
  produtorId?: string;
  /** `eu`, `nenhum` ou o id de um membro. */
  responsavel?: string;
  page?: number;
  size?: number;
  /** `dataEmissao`, `numero`, `status`, `valorTotal` ou `createdAt`, com `,asc`/`,desc`. */
  sort?: string;
}

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

/** Um convite que o escritório mandou e que ainda espera resposta (`GET /api/contador/convites`). */
export interface ConviteEnviado {
  id: string;
  email: string;
  /** `PENDENTE`, `ACEITO`… — a lista traz os pendentes. */
  situacao: string;
  criadoEm: string;
  expiraEm: string;
}

/** `GET/PATCH /api/contador/produtores/{id}/ficha` — o que o escritório guarda sobre o cliente. */
export interface FichaCliente {
  produtorId: string;
  nomeCompleto: string;
  cpfCnpj: string | null;
  inscricaoEstadual: string | null;
  /** Até 1000 caracteres. **Nunca chega ao produtor.** */
  observacoes: string | null;
  etiquetas: string[];
}

/** Uma etiqueta do catálogo do escritório (`GET /api/contador/etiquetas`). */
export interface EtiquetaEscritorio {
  id: string;
  nome: string;
}

/** Resposta de `PATCH .../responsavel`. */
export interface ResponsavelDoCliente {
  produtorId: string;
  responsavelId: string | null;
  responsavelNome: string | null;
}

/** Um registro da trilha de auditoria de um cliente (`GET /api/auditoria`, #137). */
export interface RegistroAuditoria {
  id: string;
  ocorridoEm: string;
  /** `NOTA_CRIADA`, `GUIA_PAGA`, `APURACAO_REABERTA`… */
  acao: string;
  /** `NOTA_FISCAL`, `GUIA_FISCAL`, `APURACAO`, `CONTA`… */
  recurso: string;
  recursoId: string | null;
  usuarioId: string | null;
  /** `PRODUTOR` ou `CONTADOR`. */
  papel: string;
  sucesso: boolean;
  /** Só na falha: o código do erro, nunca dado pessoal. */
  codigoErro: string | null;
  estadoAntes: string | null;
  estadoDepois: string | null;
}

/** O que o administrador pode fazer com o vínculo de um cliente. */
export type AcaoVinculo = 'suspender' | 'reativar' | 'encerrar';

/** Resposta das ações do vínculo. */
export interface SituacaoDoVinculo {
  produtorId: string;
  situacao: 'ATIVO' | 'SUSPENSO' | 'ENCERRADO';
  inicio: string;
  fim: string | null;
}

/** Uma página das notas da carteira (ou de um cliente): o total vem do `X-Total-Count`. */
export interface PaginaNotasCarteira {
  itens: NotaCarteira[];
  total: number;
}

/**
 * Cliente da **carteira do escritório** (backend#177) e do que o contador alcança de um cliente
 * dela: notas, validações, pendências e, desde a backend#255, os números do cliente (apuração,
 * relatório de conformidade, créditos e painel).
 *
 * **As rotas do produtor não servem ao contador.** `/api/notas`, `/api/apuracao`,
 * `/api/relatorios/conformidade`, `/api/creditos` e `/api/dashboard` derivam o produtor do token e
 * respondem 403 `PAPEL_NAO_AUTORIZADO` para quem é do escritório (issue #136). Cada uma tem aqui a
 * versão por cliente, com o **mesmo response**: só muda o caminho.
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

  /**
   * Página máxima que o servidor aceita; é o que `obterCliente` e o `SeletorCliente` usam para
   * varrer a carteira inteira.
   */
  static readonly TAMANHO_MAXIMO = 200;

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
      .pipe(map((resposta) => CarteiraApi.comTotal(resposta)));
  }

  /** Array no corpo, total no `X-Total-Count` — o formato de lista das rotas do escritório. */
  private static comTotal<T>(resposta: HttpResponse<T[]>): { itens: T[]; total: number } {
    const itens = resposta.body ?? [];
    const header = resposta.headers.get('X-Total-Count');
    const total = header === null ? itens.length : Number(header);
    return { itens, total: Number.isFinite(total) ? total : itens.length };
  }

  /**
   * Um cliente da carteira pelo id do produtor, ou `null` se ele não estiver nela.
   *
   * A #177 não tem `GET /contador/produtores/{id}`: a ficha é outro recurso e não traz os
   * indicadores de atenção. Então a tela de um cliente lê a carteira e acha o seu — pedindo a
   * página máxima, porque um cliente na segunda página voltaria como "não é seu cliente".
   *
   * Procura primeiro entre os **ativos** (o padrão do servidor) e, se não achar, entre os
   * **suspensos** (#147): a ficha é onde o vínculo suspenso é reativado ou encerrado, então ela
   * precisa abrir para ele também — só sem a tela de trabalho, porque num vínculo suspenso o
   * escritório não alcança os dados do produtor. Encerrado não volta: vira "não é cliente".
   */
  obterCliente(produtorId: string): Observable<ProdutorCarteira | null> {
    const procurar = (situacao: 'ATIVO' | 'SUSPENSO') =>
      this.listar({ size: CarteiraApi.TAMANHO_MAXIMO, situacao }).pipe(
        map((pagina) => pagina.itens.find((c) => c.id === produtorId) ?? null),
      );
    return procurar('ATIVO').pipe(switchMap((ativo) => (ativo ? of(ativo) : procurar('SUSPENSO'))));
  }

  /**
   * `GET /api/auditoria?produtorId=` — a trilha das operações críticas do cliente (#137, RNF012).
   *
   * Só contador (produtor 403) e só cliente da carteira (fora → 404). Array + `X-Total-Count`;
   * padrão 50, máximo 200 por página. Sem dado pessoal: ids, papel, ação e estados.
   */
  auditoriaDoCliente(
    produtorId: string,
    page: number,
    size: number,
  ): Observable<{ itens: RegistroAuditoria[]; total: number }> {
    return this.http
      .get<RegistroAuditoria[]>('/auditoria', {
        params: new HttpParams()
          .set('produtorId', produtorId)
          .set('page', String(page))
          .set('size', String(size)),
        observe: 'response',
      })
      .pipe(map((resposta) => CarteiraApi.comTotal(resposta)));
  }

  /** `GET .../ficha` — observações internas e etiquetas do cliente (#149). */
  ficha(produtorId: string): Observable<FichaCliente> {
    return this.http.get<FichaCliente>(`/contador/produtores/${produtorId}/ficha`);
  }

  /** `PATCH .../ficha` — as observações internas (até 1000; vazio apaga). Nunca chegam ao produtor. */
  salvarObservacoes(produtorId: string, observacoes: string): Observable<FichaCliente> {
    return this.http.patch<FichaCliente>(`/contador/produtores/${produtorId}/ficha`, {
      observacoes,
    });
  }

  /**
   * `PUT .../etiquetas` — **substitui** as etiquetas do cliente (até 10, de 1 a 30 caracteres; lista
   * vazia tira todas). Nome novo entra no catálogo do escritório.
   */
  definirEtiquetas(produtorId: string, etiquetas: string[]): Observable<FichaCliente> {
    return this.http.put<FichaCliente>(`/contador/produtores/${produtorId}/etiquetas`, {
      etiquetas,
    });
  }

  /**
   * `PATCH .../responsavel` — o membro que cuida do cliente (`null` = sem responsável). Só o
   * administrador ou o responsável atual trocam; os outros recebem 403.
   */
  alterarResponsavel(
    produtorId: string,
    responsavelId: string | null,
  ): Observable<ResponsavelDoCliente> {
    return this.http.patch<ResponsavelDoCliente>(`/contador/produtores/${produtorId}/responsavel`, {
      responsavelId,
    });
  }

  /** `GET /api/contador/etiquetas` — o catálogo de etiquetas do escritório. */
  etiquetasDoEscritorio(): Observable<EtiquetaEscritorio[]> {
    return this.http.get<EtiquetaEscritorio[]>('/contador/etiquetas');
  }

  /** `DELETE /api/contador/etiquetas/{id}` — tira a etiqueta do catálogo do escritório. */
  excluirEtiqueta(etiquetaId: string): Observable<void> {
    return this.http.delete<void>(`/contador/etiquetas/${etiquetaId}`);
  }

  /**
   * `POST /api/contador/convites` — convida um produtor por e-mail (backend#177).
   *
   * Responde **sempre 202**, exista ou não conta com aquele e-mail: a resposta não pode revelar
   * quem tem conta. A tela diz "se houver conta, o convite chega", nunca "convite entregue".
   * Mais de 30 por dia → 429 `LIMITE_CONVITES` com `Retry-After`. Só o administrador convida.
   */
  convidar(email: string): Observable<void> {
    return this.http.post<void>('/contador/convites', { email: email.trim() });
  }

  /** `GET /api/contador/convites` — os convites do escritório que ainda esperam resposta. */
  convitesEnviados(): Observable<ConviteEnviado[]> {
    return this.http.get<ConviteEnviado[]>('/contador/convites');
  }

  /**
   * O ciclo do vínculo (`POST .../{produtorId}/suspender|reativar|encerrar`), só do administrador.
   *
   * Suspender corta o acesso do escritório aos dados do produtor até reativar; **encerrar não
   * volta** — atender de novo exige convite novo. Transição fora da ordem → 409
   * `VINCULO_SITUACAO_INVALIDA`.
   */
  mudarVinculo(produtorId: string, acao: AcaoVinculo): Observable<SituacaoDoVinculo> {
    return this.http.post<SituacaoDoVinculo>(`/contador/produtores/${produtorId}/${acao}`, null);
  }

  /** `GET /api/contador/produtores/{produtorId}/notas` — as notas do cliente, só leitura. */
  notasDoCliente(produtorId: string, filtro: FiltroNotasCliente = {}): Observable<NotaFiscal[]> {
    return this.http.get<NotaFiscal[]>(`/contador/produtores/${produtorId}/notas`, {
      params: this.paramsDasNotas(filtro),
    });
  }

  /**
   * `GET /api/contador/notas` — as notas da **carteira inteira** (backend#341), ou de um cliente
   * com `produtorId`. Array + `X-Total-Count`, como a carteira; sem `sort`, mais recente primeiro.
   * O item é um resumo (`NotaCarteira`), sem `itens`.
   */
  notasDaCarteira(filtro: FiltroNotasCarteira = {}): Observable<PaginaNotasCarteira> {
    return this.http
      .get<NotaCarteira[]>('/contador/notas', {
        params: this.paramsDaCarteiraDeNotas(filtro),
        observe: 'response',
      })
      .pipe(map((resposta) => CarteiraApi.comTotal(resposta)));
  }

  /**
   * `GET /api/contador/notas/resumo` — a contagem de cada caixa da triagem numa consulta só, com os
   * mesmos filtros da lista (o `status` não vai: a contagem já separa por caixa). Substitui as sete
   * consultas de uma nota só que liam o `X-Total-Count` de cada caixa.
   */
  resumoDasNotas(filtro: Omit<FiltroNotasCarteira, 'status' | 'page' | 'size' | 'sort'> = {}) {
    return this.http.get<ResumoNotasCarteira>('/contador/notas/resumo', {
      params: this.paramsDaCarteiraDeNotas(filtro),
    });
  }

  /** `GET /api/contador/produtores/{produtorId}/notas/{notaId}` — uma nota do cliente. */
  notaDoCliente(produtorId: string, notaId: string): Observable<NotaFiscal> {
    return this.http.get<NotaFiscal>(`/contador/produtores/${produtorId}/notas/${notaId}`);
  }

  /**
   * `GET /api/contador/produtores/{produtorId}/apuracao?periodo=` — a apuração de um mês do
   * cliente (`AAAA-MM`). Mesmo response de `GET /api/apuracao?periodo=`.
   */
  apuracaoDoCliente(produtorId: string, periodo: string): Observable<Apuracao> {
    return this.http.get<Apuracao>(`/contador/produtores/${produtorId}/apuracao`, {
      params: new HttpParams().set('periodo', periodo),
    });
  }

  /**
   * `GET .../apuracao?de=&ate=` — uma faixa de meses do cliente, em ordem crescente e **sem
   * buraco** (mês sem nota vem zerado). Até 60 meses.
   */
  apuracaoFaixaDoCliente(produtorId: string, de: string, ate: string): Observable<Apuracao[]> {
    return this.http.get<Apuracao[]>(`/contador/produtores/${produtorId}/apuracao`, {
      params: new HttpParams().set('de', de).set('ate', ate),
    });
  }

  /** `GET .../relatorios/conformidade?periodo=` — débitos × créditos × saldo do mês do cliente. */
  relatorioConformidadeDoCliente(
    produtorId: string,
    periodo: string,
  ): Observable<RelatorioConformidade> {
    return this.http.get<RelatorioConformidade>(
      `/contador/produtores/${produtorId}/relatorios/conformidade`,
      { params: new HttpParams().set('periodo', periodo) },
    );
  }

  /**
   * `GET .../relatorios/conformidade/pdf?periodo=` — o mesmo relatório em PDF.
   *
   * Resposta inteira para o chamador ler o nome em `Content-Disposition`. Sem `Accept` declarado,
   * pela mesma razão da prévia da DANFE: o caminho de erro devolve JSON.
   */
  relatorioConformidadePdfDoCliente(
    produtorId: string,
    periodo: string,
  ): Observable<HttpResponse<Blob>> {
    return this.http.get(`/contador/produtores/${produtorId}/relatorios/conformidade/pdf`, {
      params: new HttpParams().set('periodo', periodo),
      responseType: 'blob',
      observe: 'response',
    });
  }

  /** `GET .../creditos?periodo=` — o saldo de crédito de IBS/CBS do cliente no mês. */
  creditosDoCliente(produtorId: string, periodo: string): Observable<CreditoSaldo> {
    return this.http.get<CreditoSaldo>(`/contador/produtores/${produtorId}/creditos`, {
      params: new HttpParams().set('periodo', periodo),
    });
  }

  /**
   * `GET .../dashboard` — o painel do cliente. Sem `periodo`, o mês corrente.
   *
   * Não passa pelo `DashboardApi`: aquele guarda **o** painel da sessão num signal `root`, e o
   * contador alterna entre clientes — o cache de um viraria o número do outro.
   */
  dashboardDoCliente(produtorId: string, periodo?: string): Observable<DashboardResponse> {
    return this.http.get<DashboardResponse>(`/contador/produtores/${produtorId}/dashboard`, {
      params: this.anexar(new HttpParams(), { periodo }),
    });
  }

  /**
   * `POST /api/contador/produtores/{produtorId}/apuracao/{periodo}/reabrir` — reabre o mês
   * fechado de um cliente (RN005, issue #117). `periodo` em `AAAA-MM`; **sem corpo**.
   *
   * A reabertura **passou a ser do escritório**. A rota antiga (`POST /apuracao/{id}/reabrir`)
   * está marcada como *deprecated* no OpenAPI e responde **403 a todos** — e ela pedia um `id`
   * que o `ApuracaoResponse` nunca expôs, que era a razão escrita na tela para o botão viver
   * desabilitado nos dois lados. Esta não pede id nenhum.
   *
   * O que o servidor recusa, por código:
   *
   * - `403 PAPEL_NAO_AUTORIZADO` — assistente do escritório (administrador e contador podem);
   * - `404` — mês sem apuração, ou produtor fora da carteira;
   * - `409` — o período não está `FECHADO`;
   * - `422` — mais de 3 meses para trás;
   * - `400` — `periodo` fora de `AAAA-MM`.
   */
  reabrirApuracao(produtorId: string, periodo: string): Observable<Apuracao> {
    return this.http.post<Apuracao>(
      `/contador/produtores/${produtorId}/apuracao/${periodo}/reabrir`,
      null,
    );
  }

  /** `GET /api/contador/produtores/{produtorId}/notas/{notaId}/validacoes` — o que o fisco apontou. */
  validacoesDaNota(produtorId: string, notaId: string): Observable<NotaValidacaoResponse[]> {
    return this.http.get<NotaValidacaoResponse[]>(
      `/contador/produtores/${produtorId}/notas/${notaId}/validacoes`,
    );
  }

  /**
   * `POST .../notas/{id}/aprovar` — libera a nota para o produtor emitir (backend#178).
   *
   * Sem corpo: aprovar não pede justificativa. Devolver, sim.
   */
  aprovarNota(produtorId: string, notaId: string): Observable<NotaFiscal> {
    return this.http.post<NotaFiscal>(
      `/contador/produtores/${produtorId}/notas/${notaId}/aprovar`,
      null,
    );
  }

  /**
   * `POST .../notas/{id}/devolver` — devolve a nota ao produtor, com motivo de 5 a 500.
   *
   * O motivo entra no histórico de revisão e é o texto que o produtor lê para saber o que
   * corrigir. Sem ele o servidor responde 400 (medido em 28/10).
   */
  devolverNota(produtorId: string, notaId: string, motivo: string): Observable<NotaFiscal> {
    return this.http.post<NotaFiscal>(
      `/contador/produtores/${produtorId}/notas/${notaId}/devolver`,
      { motivo },
    );
  }

  /**
   * `GET .../notas/{id}/danfe-preview` — a DANFE do rascunho, com marca d'água (backend#89).
   *
   * É o que permite conferir a nota **antes** de aprovar, em vez de decidir pelos números da
   * listagem. Sem `Accept` declarado: o caminho de erro devolve JSON e só aceitar qualquer tipo
   * serve para os dois (ver `apiInterceptor`, issue #99).
   */
  previewDanfe(produtorId: string, notaId: string): Observable<HttpResponse<Blob>> {
    return this.http.get(`/contador/produtores/${produtorId}/notas/${notaId}/danfe-preview`, {
      responseType: 'blob',
      observe: 'response',
    });
  }

  /**
   * `GET /api/contador/produtores/{produtorId}/pendencias` — os pedidos de documento (backend#180).
   *
   * É a rota que substitui o `/api/contador/pendencias?produtorId=` que o `ContadorApi` ainda
   * chama e que responde **404 desde sempre** — o cliente antigo foi escrito contra um contrato
   * que nunca existiu.
   */
  pendenciasDoCliente(produtorId: string, status: StatusPendencia[] = []): Observable<Pendencia[]> {
    let params = new HttpParams();
    for (const s of status) {
      params = params.append('status', s);
    }
    return this.http.get<Pendencia[]>(`/contador/produtores/${produtorId}/pendencias`, {
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

  /**
   * `GET /api/contador/produtores/{produtorId}/pendencias/{id}` — o pedido **com os anexos**.
   *
   * A listagem devolve `anexos: []` e só o `quantidadeAnexos`; quem precisa dos arquivos vem aqui.
   */
  detalharPendencia(produtorId: string, pendenciaId: string): Observable<Pendencia> {
    return this.http.get<Pendencia>(`/contador/produtores/${produtorId}/pendencias/${pendenciaId}`);
  }

  /**
   * `GET .../notas/{id}/revisoes` — o histórico de revisão da nota no lado do escritório (#150):
   * `ENVIADA`, `RETIRADA`, `APROVADA`, `DEVOLVIDA` (com o motivo) e `APROVACAO_CADUCADA`.
   */
  revisoesDaNota(produtorId: string, notaId: string): Observable<RevisaoNota[]> {
    return this.http.get<RevisaoNota[]>(
      `/contador/produtores/${produtorId}/notas/${notaId}/revisoes`,
    );
  }

  /**
   * `PUT .../pendencias/{id}` — edita o pedido **enquanto `PENDENTE`** (#150). Mesmo corpo da
   * criação; depois que o produtor mandou arquivo, o servidor recusa.
   */
  editarPendencia(
    produtorId: string,
    pendenciaId: string,
    pedido: NovoPedidoDocumento,
  ): Observable<Pendencia> {
    return this.http.put<Pendencia>(
      `/contador/produtores/${produtorId}/pendencias/${pendenciaId}`,
      pedido,
    );
  }

  /**
   * `POST /api/contador/produtores/{produtorId}/pendencias` — pede um documento ao produtor.
   *
   * `titulo` até 120, `descricao` e `observacoes` até 1000, `tiposDocumento` de 1 a 5.
   */
  criarPendencia(produtorId: string, pedido: NovoPedidoDocumento): Observable<Pendencia> {
    return this.http.post<Pendencia>(`/contador/produtores/${produtorId}/pendencias`, pedido);
  }

  /**
   * Aceita o que o produtor mandou (`ENVIADA` → `CONCLUIDA`).
   *
   * Sem corpo: aceitar não pede justificativa. Recusar, sim — por isso só o `rejeitar` leva motivo.
   */
  concluirPendencia(produtorId: string, pendenciaId: string): Observable<Pendencia> {
    return this.acao(produtorId, pendenciaId, 'concluir');
  }

  /**
   * Recusa o que veio e devolve o pedido ao produtor (`ENVIADA` → `PENDENTE`).
   *
   * O `motivo` tem de 5 a 500 caracteres e **não é burocracia**: é o único texto que o produtor vê
   * para saber o que refazer. Ele aparece no cartão dele, em `motivo`.
   */
  rejeitarPendencia(
    produtorId: string,
    pendenciaId: string,
    motivo: string,
  ): Observable<Pendencia> {
    return this.acao(produtorId, pendenciaId, 'rejeitar', { motivo });
  }

  /** Cancela o pedido, com motivo (5 a 500). */
  cancelarPendencia(
    produtorId: string,
    pendenciaId: string,
    motivo: string,
  ): Observable<Pendencia> {
    return this.acao(produtorId, pendenciaId, 'cancelar', { motivo });
  }

  /** Reabre um pedido concluído ou cancelado. */
  reabrirPendencia(produtorId: string, pendenciaId: string): Observable<Pendencia> {
    return this.acao(produtorId, pendenciaId, 'reabrir');
  }

  /**
   * Baixa um anexo do cliente.
   *
   * Só sai anexo `LIMPO`; em verificação o servidor responde 409 `ANEXO_EM_VERIFICACAO`. Resposta
   * inteira para o chamador ler o nome em `Content-Disposition`.
   */
  baixarAnexoDoCliente(
    produtorId: string,
    pendenciaId: string,
    anexoId: string,
  ): Observable<HttpResponse<Blob>> {
    return this.http.get(
      `/contador/produtores/${produtorId}/pendencias/${pendenciaId}/anexos/${anexoId}`,
      { responseType: 'blob', observe: 'response' },
    );
  }

  /**
   * Os quatro verbos do ciclo.
   *
   * Transição fora de ordem é **409 `TRANSICAO_PENDENCIA_INVALIDA`**, e o erro sobe: quem oferece
   * o botão é a tela, que conhece o status; se ela errar, o contador precisa ver o porquê.
   */
  private acao(
    produtorId: string,
    pendenciaId: string,
    verbo: 'concluir' | 'rejeitar' | 'cancelar' | 'reabrir',
    corpo?: { motivo: string },
  ): Observable<Pendencia> {
    return this.http.post<Pendencia>(
      `/contador/produtores/${produtorId}/pendencias/${pendenciaId}/${verbo}`,
      corpo ?? null,
    );
  }

  /** Os filtros de notas, com `status` repetido (o backend aceita mais de um por consulta). */
  private paramsDasNotas(filtro: FiltroNotasCliente): HttpParams {
    return this.anexar(this.statusRepetido(filtro.status), {
      de: filtro.de,
      ate: filtro.ate,
      busca: filtro.busca,
      page: filtro.page,
      size: filtro.size,
      sort: filtro.sort,
    });
  }

  private paramsDaCarteiraDeNotas(filtro: FiltroNotasCarteira): HttpParams {
    return this.anexar(this.statusRepetido(filtro.status), {
      tipoDocumento: filtro.tipoDocumento,
      emitidaDe: filtro.emitidaDe,
      emitidaAte: filtro.emitidaAte,
      busca: filtro.busca,
      produtorId: filtro.produtorId,
      responsavel: filtro.responsavel,
      page: filtro.page,
      size: filtro.size,
      sort: filtro.sort,
    });
  }

  /** `status` repetido (o servidor lê como OU), nunca juntado por vírgula. */
  private statusRepetido(status: readonly StatusNotaFiltro[] = []): HttpParams {
    return status.reduce((params, s) => params.append('status', s), new HttpParams());
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
