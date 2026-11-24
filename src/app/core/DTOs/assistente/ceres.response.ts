/**
 * Contrato do chat com a **Ceres**, a assistente fiscal do backend (issue #76 e
 * `docs/contrato-frontend-ceres.md` no repo do backend; conferido contra
 * `AssistenteChatResponse.java`).
 *
 * Os campos não são detalhe de transporte: `citacoes` e `fontesDados` **são a
 * garantia do produto** — todo número vem de uma consulta aos dados do produtor e
 * toda afirmação legal cita o dispositivo. O contrato manda mostrá-los, não
 * esconder, e é isso que a tela faz (ver `shared/assistente/ceres-citacoes` e
 * `ceres-fontes`).
 */

/** Camada que respondeu a pergunta. Vem em toda resposta. */
export type RotaCeres = 'DADOS' | 'LEGISLACAO' | 'MISTO' | 'FORA_DE_ESCOPO';

/**
 * Um par pergunta/resposta já fechado, como o backend o entregou (#183, backend#499).
 *
 * **É opaco: guarde e devolva exatamente como veio.** Nada de `trim`, troca de quebra de
 * linha, reformatação ou cópia parcial — a `assinatura` vale para os bytes exatos, e
 * qualquer mudança faz o backend **ignorar o histórico em silêncio**, sem erro nenhum para
 * avisar. Pelo mesmo motivo, nunca monte um `CeresTurno` com o texto da tela: a
 * `resposta` daqui passou por corte e troca de caracteres de controle no servidor, e a
 * `pergunta` pode ser a interpretada, não a digitada.
 *
 * Carrega valores, datas e textos do escritório: vive **só na memória** do
 * `AssistenteStore` (nada de storage, nada de `console.log`) e nunca aparece na tela.
 */
export interface CeresTurno {
  pergunta: string;
  resposta: string;
  assinatura: string;
}

/** Corpo de `POST /api/assistente/chat` (e da variante SSE). */
export interface CeresPergunta {
  /** 1 a 1000 caracteres — acima disso o backend responde 400 `VALIDATION_ERROR`. */
  pergunta: string;
  /**
   * Os `turno` das últimas respostas que os trouxeram, **do mais antigo para o mais
   * recente** e no máximo `MAX_TURNOS_HISTORICO` (#183). É o que faz "tem certeza?" e
   * "e a segunda?" terem sentido: cada pergunta chega isolada ao backend. A pergunta nova
   * não entra na lista, e a primeira da conversa vai sem o campo.
   */
  historico?: CeresTurno[];
  /**
   * `true` quando a última mensagem da Ceres na tela **não** tem `turno` (recusa, conversa
   * leve, falha, "Pergunta cancelada"). Impede que um "tem certeza?" depois de uma recusa
   * refaça a consulta de uma resposta antiga. Omitido quando é falso.
   */
  ultimaRespostaSemTurno?: boolean;
}

/**
 * Trecho de lei que fundamenta a resposta. A referência é montada pelo backend a
 * partir dos metadados do trecho — o modelo nunca a escreve.
 */
export interface CeresCitacao {
  /** Ex.: `LC 214/2025`. */
  norma: string;
  /** Ex.: `art. 138, § 1º` ou `Anexo IX, item 1`. */
  dispositivo: string;
  /** Link oficial no Planalto. */
  url: string;
  /** Texto do dispositivo. */
  trecho: string;
}

/**
 * Consulta aos dados do produtor que gerou os números da resposta. Os valores de
 * `parametros` já vêm mascarados pelo backend (CPF, CNPJ etc. viram `[CPF]`),
 * então podem ser exibidos como estão.
 */
export interface CeresFonteDado {
  /** Nome da função consultada (ex.: `proximosVencimentos`). Rótulo em `@core/utils/ceres`. */
  funcao: string;
  parametros: Record<string, string>;
  /**
   * De onde veio o dado (backend#342): `PRODUTOR` (as notas, guias e apurações dele) ou
   * `TABELA_OFICIAL` (a tabela do IBS/CBS, igual para todos). Vem sempre, também no SSE; o tipo
   * aceita qualquer texto porque um valor novo do backend não pode quebrar a tela, e cai num selo
   * neutro (`origemDaFonte`).
   */
  origem?: OrigemFonteCeres | (string & {});
}

/** Os valores de `CeresFonteDado.origem` que o contrato documenta hoje. */
export type OrigemFonteCeres = 'PRODUTOR' | 'TABELA_OFICIAL';

/** Resposta de `POST /api/assistente/chat`, e do evento `resposta` no streaming. */
export interface CeresResposta {
  /** Texto **puro** com quebras de linha. Nunca HTML: renderizar com interpolação. */
  resposta: string;
  rota: RotaCeres;
  /** Vazio fora de `LEGISLACAO`/`MISTO`. */
  citacoes: CeresCitacao[];
  /** Vazio quando a resposta não derivou de consulta: sem selo "calculado a partir das suas notas". */
  fontesDados: CeresFonteDado[];
  /**
   * Resposta montada **sem o modelo**: trechos de lei verbatim e/ou atalhos para as telas.
   *
   * Deixou de ser "sempre false" na Sprint 7 do backend (#146): quando o modelo cai, a Ceres
   * ainda responde o que dá — e diz que não interpretou nada.
   */
  modoFallback: boolean;
  /**
   * Telas sugeridas no modo fallback. Vazio fora dele.
   *
   * O backend manda o código da tela, não a rota (`NOTAS`, `APURACAO`, `CREDITOS`,
   * `CALENDARIO`): quem sabe para onde cada uma aponta é o frontend. Código desconhecido é
   * ignorado, para uma tela nova do backend não quebrar esta.
   */
  atalhos: string[];
  /**
   * O par desta resposta, para mandar de volta na pergunta seguinte (#183). **Só vem
   * quando a continuidade está ligada no backend e a resposta de fato consultou algo**:
   * conversa leve, recusa, modo fallback, erro, 429, 503 e pergunta cancelada vêm sem ele,
   * e nada disso pode entrar no histórico. Pode repetir o `turno` de uma resposta
   * anterior; o backend junta os repetidos. Vale 30 minutos — passado isso o backend
   * ignora o item, sem erro, e a tela não precisa controlar a validade.
   */
  turno?: CeresTurno | null;
  /**
   * Como o backend entendeu a pergunta depois do histórico ("e algum crédito?" vira
   * "Tenho algum crédito?"). **Sem uso na tela por enquanto** — a linha "Entendi como"
   * é depois da banca (#183, "fora desta issue").
   */
  perguntaInterpretada?: string | null;
  /**
   * A explicação curta do número, gerada pelo modelo e conferida no código (#187,
   * backend#268/#538). **Só no síncrono**: no SSE ela chega num evento próprio, depois da
   * `resposta`, e nunca dentro dela. Vem **ausente** quando não há (e não `null`); os dois
   * querem dizer "sem explicação". Desligada por padrão no backend
   * (`app.assistente.explicacao.enabled=false`).
   */
  explicacao?: string | null;
}

/**
 * Eventos do SSE, nesta ordem: `rota` (em segundos, para a tela trocar "pensando"
 * por "consultando suas notas"), `resposta` (já validada), `explicacao` (opcional, #187)
 * e `fim`. `erro` chega no lugar dos últimos quando a falha acontece depois de o stream
 * abrir — e, se vier depois da `resposta`, **não apaga** a resposta já mostrada.
 *
 * **Não há tokens parciais** e é de propósito: números e citações só saem depois
 * de conferidos. A `explicacao` também: o backend a descarta quando ela não confere com o
 * número, e aí ela simplesmente não vem.
 */
export type CeresEvento =
  | { evento: 'rota'; dado: { rota: RotaCeres } }
  | { evento: 'resposta'; dado: CeresResposta }
  | { evento: 'explicacao'; dado: { explicacao: string } }
  | { evento: 'fim'; dado: Record<string, never> };

/**
 * Cota semanal da Ceres (`GET /api/assistente/uso`, Sprint 7 do backend, #166).
 *
 * O credito e o custo real de cada pergunta (tokens x modelo), nao um contador de perguntas:
 * uma pergunta longa consome mais que uma curta. Por isso a tela mostra o que RESTA, nao o que
 * foi gasto -- o que resta e o que muda a decisao de perguntar.
 */
export interface CeresUso {
  plano: string;
  habilitada: boolean;
  /**
   * Os três números do crédito. **Não vão à tela** desde a #184: o crédito virou 1 token, a cota
   * semanal passou a 1.000.000 e uma pergunta custa uns 6.800 — números que não dizem nada ao
   * produtor. Ficam no contrato porque a tela ainda precisa deles quando o backend é antigo e não
   * manda o `percentualUsado`.
   */
  creditosSemana: number;
  consumidos: number;
  restantes: number;
  /**
   * Quanto da semana já foi usado, inteiro de 0 a 100, calculado pelo backend (#184,
   * backend#511): arredondado **para cima** (qualquer uso é ao menos 1%), no máximo 99 enquanto
   * houver saldo, e 100 só quando acabou. É o único número de uso que a tela mostra. Ausente num
   * backend antigo: a tela cai na conta com os créditos.
   */
  percentualUsado?: number;
  /** ISO com fuso. Quando a cota volta ao cheio. */
  renovaEm: string;
  /**
   * `true` quando a continuidade está ligada e o modelo roda num provedor por API (#183):
   * as últimas perguntas e respostas, com valores e datas, saem do Brasil. É o que liga o
   * aviso fixo na tela da Ceres. **Ausente vale `false`** — backend sem o campo não
   * mostra aviso nenhum.
   */
  conversaVaiAoProvedor?: boolean;
}
