import { Component, computed, input } from '@angular/core';
import { LucideDatabase, LucideLandmark, LucideSearch } from '@lucide/angular';
import { descreverFonte, origemDaFonte, rotuloFonte } from '@core/utils/ceres';
import type { CeresFonteDado } from '@dtos/assistente/ceres.response';

/** Um bloco por origem do dado, nesta ordem. */
const GRUPOS = [
  {
    origem: 'produtor',
    titulo: 'Calculado a partir das suas notas',
    rotulo: 'Origem dos números da resposta',
  },
  {
    origem: 'oficial',
    titulo: 'Consultado na tabela oficial do IBS/CBS',
    rotulo: 'Tabela oficial consultada',
  },
  {
    origem: 'neutra',
    titulo: 'Consultado pelo AgroConIA',
    rotulo: 'Consultas feitas pelo assistente',
  },
] as const;

/**
 * De onde veio cada número da resposta: "Calculado a partir das suas notas", com
 * as consultas que a Ceres fez aos dados do produtor.
 *
 * O backend garante que **todo número vem de uma consulta** — resposta com número
 * sem fonte é descartada antes de chegar aqui. Mostrar as consultas é o que torna
 * essa garantia visível para quem lê (contrato da issue #76, seção 6); sem isso o
 * produtor não tem como distinguir um valor apurado de um valor inventado.
 *
 * A tabela oficial do IBS/CBS não é dado do produtor e vai num bloco à parte, com o próprio
 * título (#132). Quem diz de onde veio cada consulta é o campo `origem` do backend (backend#342);
 * valor que a tela não conhece vai para um terceiro bloco, neutro ("Consultado pelo AgroConIA"),
 * e nunca para "Calculado a partir das suas notas". Com fontes mistas, os blocos aparecem juntos.
 *
 * Os `parametros` já vêm mascarados pelo backend (CPF, CNPJ viram `[CPF]`), então
 * aparecem como vieram — só com rótulo em português.
 */
@Component({
  selector: 'app-ceres-fontes',
  standalone: true,
  imports: [LucideDatabase, LucideLandmark, LucideSearch],
  templateUrl: './ceres-fontes.html',
})
export class CeresFontes {
  readonly fontes = input.required<CeresFonteDado[]>();

  /** Os dados do produtor primeiro, a tabela oficial depois, o resto no fim; vazio não aparece. */
  protected readonly grupos = computed(() =>
    GRUPOS.map((g) => ({
      ...g,
      fontes: this.fontes().filter((f) => origemDaFonte(f) === g.origem),
    })).filter((g) => g.fontes.length > 0),
  );

  protected readonly rotulo = rotuloFonte;
  protected readonly detalhe = descreverFonte;
}
