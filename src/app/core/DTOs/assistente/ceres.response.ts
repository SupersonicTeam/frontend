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

/** Corpo de `POST /api/assistente/chat` (e da variante SSE). */
export interface CeresPergunta {
  /** 1 a 1000 caracteres — acima disso o backend responde 400 `VALIDATION_ERROR`. */
  pergunta: string;
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
}

/** Resposta de `POST /api/assistente/chat`, e do evento `resposta` no streaming. */
export interface CeresResposta {
  /** Texto **puro** com quebras de linha. Nunca HTML: renderizar com interpolação. */
  resposta: string;
  rota: RotaCeres;
  /** Vazio fora de `LEGISLACAO`/`MISTO`. */
  citacoes: CeresCitacao[];
  /** Vazio quando a resposta não derivou de consulta: sem selo "calculado a partir das suas notas". */
  fontesDados: CeresFonteDado[];
  /** Hoje sempre `false`. Reservado para a Sprint 7: trechos da lei sem geração. */
  modoFallback: boolean;
}

/**
 * Eventos do SSE, nesta ordem: `rota` (em segundos, para a tela trocar "pensando"
 * por "consultando suas notas"), `resposta` (já validada), `fim`. `erro` chega no
 * lugar dos dois últimos quando a falha acontece depois de o stream abrir.
 *
 * **Não há tokens parciais** e é de propósito: números e citações só saem depois
 * de conferidos.
 */
export type CeresEvento =
  | { evento: 'rota'; dado: { rota: RotaCeres } }
  | { evento: 'resposta'; dado: CeresResposta }
  | { evento: 'fim'; dado: Record<string, never> };
