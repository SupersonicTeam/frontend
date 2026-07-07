/**
 * Estado do ciclo de vida da apuração mensal de IBS/CBS — espelha `status` de
 * `br.com.agrocontabil.dto.ApuracaoResponse` (RN004/RN005).
 *
 * ABERTO (projeção ao vivo, não persistida) → EM_PROCESSAMENTO → FECHADO (persistida,
 * pode ser reaberta dentro de 3 meses retroativos).
 */
export type StatusApuracao = 'ABERTO' | 'EM_PROCESSAMENTO' | 'FECHADO';
