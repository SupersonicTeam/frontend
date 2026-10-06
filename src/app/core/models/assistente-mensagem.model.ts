import type { CeresCitacao, CeresFonteDado, RotaCeres } from '@dtos/assistente/ceres.response';
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
export interface AssistenteMensagem {
  autor: 'produtor' | 'ceres';
  /** Texto puro, com `\n`. Nunca HTML — renderizar com interpolação. */
  texto: string;
  rota?: RotaCeres;
  citacoes?: CeresCitacao[];
  fontesDados?: CeresFonteDado[];
  /** Resposta montada só com texto de lei, sem geração (Sprint 7 do backend). */
  modoFallback?: boolean;
  /** Quando preenchido, a mensagem é um estado de falha — não uma resposta. */
  falha?: CodigoCeres | 'CANCELADA';
}
