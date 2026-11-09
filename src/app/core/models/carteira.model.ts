/**
 * A carteira do escritório — os clientes que o contador atende (backend#177).
 *
 * O vínculo entre produtor e escritório nasce de um convite por e-mail **aceito pelo produtor**;
 * o escritório não se vincula sozinho. Por isso `situacaoVinculo` é propriedade do vínculo, não do
 * produtor: o mesmo produtor pode ter vários vínculos encerrados com o mesmo escritório.
 */

import type { StatusNotaFiscal } from '@core/enums/status-nota-fiscal.enum';
import type { OrigemNota } from '@models/nota-fiscal.model';

/** Situação do vínculo entre o produtor e o escritório. */
export type SituacaoVinculo = 'ATIVO' | 'SUSPENSO' | 'ENCERRADO';

/** Regime tributário do produtor, como o backend devolve. */
export type RegimeTributario = 'SIMPLES' | 'PRESUMIDO' | 'REAL' | 'MEI';

/** Pessoa física ou jurídica. */
export type TipoProdutor = 'PESSOA_FISICA' | 'PESSOA_JURIDICA';

/**
 * O que pede atenção num cliente, já agregado pelo servidor.
 *
 * Cada campo é uma **contagem**, e cada contagem tem um lugar onde o trabalho acontece — é o que
 * transforma a lista num plano de trabalho em vez de um relatório.
 */
export interface AtencaoCarteira {
  /** Notas em `COM_INCONSISTENCIAS`: o fisco recusou algo e o produtor precisa corrigir. */
  notasComInconsistencia: number;
  /** Notas que o produtor mandou para a aprovação do escritório (backend#178). */
  notasAguardandoAprovacao: number;
  /** Guias vencidas e não pagas, de qualquer mês. */
  guiasVencidas: number;
  /** Guias pendentes que vencem de hoje a sete dias. */
  vencimentosProximos7Dias: number;
  /** Pedidos de documento com anexo esperando conferência do escritório (backend#180). */
  pendenciasEnviadas: number;
}

/** Um cliente na lista da carteira. */
export interface ProdutorCarteira {
  /** Id do vínculo. **Não** é o id do produtor: serve para distinguir vínculos encerrados. */
  vinculoId: string;
  /** Id do produtor — é este o `produtorId` das rotas `/api/contador/produtores/{produtorId}/...`. */
  id: string;
  nomeCompleto: string;
  /**
   * Documento completo, sem máscara garantida. Vem só em vínculo não encerrado: o backend omite os
   * dados atuais de quem não é mais cliente.
   */
  cpfCnpj: string | null;
  tipoProdutor: TipoProdutor | null;
  regime: RegimeTributario | null;
  uf: string | null;
  situacaoVinculo: SituacaoVinculo;
  inicioVinculo: string;
  /** Só em vínculo encerrado. */
  fimVinculo: string | null;
  /** Membro do escritório responsável pelo cliente (backend#228); nulo = sem responsável. */
  responsavelId: string | null;
  responsavelNome: string | null;
  etiquetas: string[];
  /**
   * **Nulo fora de `ATIVO`.** Suspenso ou encerrado, o escritório não alcança os dados do produtor,
   * então não há o que contar — e a tela não pode exibir zero, que diria "está tudo em dia".
   */
  atencao: AtencaoCarteira | null;
}

/** Ordenação aceita pelo servidor. Outro valor devolve 400 `FILTRO_CARTEIRA_INVALIDO`. */
export type OrdemCarteira = 'nome' | 'urgencia';

/** Filtros de `GET /api/contador/produtores`. Campo ausente = o servidor decide o padrão. */
export interface FiltroCarteira {
  /**
   * Trecho do nome (3+ caracteres, sem acento nem caixa) **ou** CPF/CNPJ completo. Por documento a
   * busca é só por igualdade: ele é cifrado de forma determinística no banco, então não há "começa
   * com".
   */
  busca?: string;
  regime?: RegimeTributario;
  tipoProdutor?: TipoProdutor;
  uf?: string;
  /** Repetível; o servidor usa OU entre elas. */
  etiqueta?: string[];
  /** Padrão do servidor: `ATIVO`. */
  situacao?: SituacaoVinculo;
  precisaAtencao?: boolean;
  /** `eu`, `nenhum` ou o id de um membro do escritório. */
  responsavel?: string;
  sort?: OrdemCarteira;
  page?: number;
  /** Padrão do servidor 50, máximo 200. */
  size?: number;
}

/**
 * Uma página da carteira.
 *
 * O backend devolve **array** no corpo e o total no header `X-Total-Count` — não é o `Page<T>`
 * envelopado do Spring Data que o resto dos nossos clientes consome. Esta interface existe para
 * essa diferença não vazar para a tela.
 */
export interface PaginaCarteira {
  itens: ProdutorCarteira[];
  total: number;
}

/**
 * Os pedidos de documento vivem em `@models/pendencia.model` — o mesmo tipo que a tela do produtor
 * usa. Eram dois (`PendenciaCliente` aqui, `Pendencia` la) descrevendo o mesmo recurso; um deles
 * ia envelhecer sozinho.
 */

/** Soma dos indicadores de um cliente; 0 quando o vínculo não é ativo. */
export function totalDeAtencao(atencao: AtencaoCarteira | null): number {
  if (!atencao) return 0;
  return (
    atencao.notasComInconsistencia +
    atencao.notasAguardandoAprovacao +
    atencao.guiasVencidas +
    atencao.vencimentosProximos7Dias +
    atencao.pendenciasEnviadas
  );
}

/**
 * Uma nota na lista da carteira inteira (`GET /api/contador/notas`, backend#341). É um **resumo**:
 * não traz `itens`, XML nem documento do destinatário. Detalhe, prévia da DANFE, aprovar e
 * devolver continuam nas rotas por cliente, com o `produtorId` da própria nota.
 */
export interface NotaCarteira {
  id: string;
  produtorId: string;
  produtorNome: string;
  numero?: number | null;
  serie?: number | null;
  naturezaOperacao?: string | null;
  status: StatusNotaFiscal;
  tipoDocumento?: 'NFE' | 'NFA' | null;
  /**
   * `PROPRIA` ou `IMPORTADA` (backend#451). Na compra importada o cliente é o destinatário, e a
   * contraparte é `emitenteNome`. O documento do emitente **não** vem na lista (minimização de dado
   * pessoal); está no detalhe da nota, nas rotas por cliente.
   */
  origem?: OrigemNota | null;
  emitenteNome?: string | null;
  dataEmissao?: string | null;
  destinatarioNome?: string | null;
  valorTotalProdutos?: number | null;
  valorTotalNota?: number | null;
  valorTotalIbs?: number | null;
  valorTotalCbs?: number | null;
  chaveAcesso?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

/**
 * `GET /api/contador/notas/resumo`: quantas notas há em cada caixa da triagem, numa consulta só.
 * `todas` conta também os status que nenhuma caixa mostra (`APROVADA`, `XML_GERADO`...).
 */
export interface ResumoNotasCarteira {
  revisao: number;
  travadas: number;
  rascunhos: number;
  devolvidas: number;
  autorizadas: number;
  canceladas: number;
  todas: number;
}
