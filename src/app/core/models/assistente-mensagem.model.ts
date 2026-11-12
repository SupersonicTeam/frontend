import type {
  CeresCitacao,
  CeresFonteDado,
  CeresTurno,
  RotaCeres,
} from '@dtos/assistente/ceres.response';
import type { CodigoCeres } from '@services/assistente/data-access/ceres.service';

/**
 * Uma mensagem da conversa com a Ceres.
 *
 * A mensagem da assistente guarda o que **fundamenta** a resposta — `citacoes` e
 * `fontesDados` — e não só o texto. Isso é de propósito: o contrato (issue #76)
 * exige mostrar o dispositivo legal e a origem dos números, e guardar no texto
 * perderia a estrutura que o link do Planalto e o selo "calculado a partir das
 * suas notas" precisam.
 *
 * Falha não vira texto de assistente: vai em `falha`, com o código do backend, e
 * a tela escolhe o que dizer. Assistente nenhuma "responde" que está fora do ar.
 */
/** Um atalho de tela sugerido pela Ceres, já traduzido do código do backend. */
export interface AtalhoCeres {
  rota: string;
  rotulo: string;
}

export interface AssistenteMensagem {
  autor: 'produtor' | 'ceres';
  /** Texto puro, com `\n`. Nunca HTML — renderizar com interpolação. */
  texto: string;
  rota?: RotaCeres;
  citacoes?: CeresCitacao[];
  fontesDados?: CeresFonteDado[];
  /** Resposta montada sem o modelo: texto de lei e/ou atalhos (Sprint 7 do backend). */
  modoFallback?: boolean;
  /** Telas que a Ceres sugere quando não pôde interpretar. Já resolvidas em rota e rótulo. */
  atalhos?: AtalhoCeres[];
  /** Quando preenchido, a mensagem é um estado de falha — não uma resposta. */
  falha?: CodigoCeres | 'CANCELADA';
  /**
   * O par desta resposta, guardado **como veio** para voltar ao backend na pergunta
   * seguinte (#183). Só nas mensagens da Ceres, e só nas que o trouxeram — mensagem de
   * falha, de cancelamento, de recusa e de conversa leve ficam sem ele, e é isso que as
   * mantém fora do histórico. Nunca aparece na tela e nunca sai da memória.
   */
  turno?: CeresTurno;
}
