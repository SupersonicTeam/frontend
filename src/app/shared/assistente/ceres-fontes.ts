import { Component, computed, input } from '@angular/core';
import { LucideDatabase, LucideLandmark } from '@lucide/angular';
import { descreverFonte, ehFonteOficial, rotuloFonte } from '@core/utils/ceres';
import type { CeresFonteDado } from '@dtos/assistente/ceres.response';

/**
 * De onde veio cada número da resposta: "Calculado a partir das suas notas", com
 * as consultas que a Ceres fez aos dados do produtor.
 *
 * O backend garante que **todo número vem de uma consulta** — resposta com número
 * sem fonte é descartada antes de chegar aqui. Mostrar as consultas é o que torna
 * essa garantia visível para quem lê (contrato da issue #76, seção 6); sem isso o
 * produtor não tem como distinguir um valor apurado de um valor inventado.
 *
 * A tabela oficial do IBS/CBS (`consultarTratamentoProduto`) não é dado do produtor
 * e vai num bloco à parte, com o próprio título (#132). Com fontes mistas, os dois
 * blocos aparecem.
 *
 * Os `parametros` já vêm mascarados pelo backend (CPF, CNPJ viram `[CPF]`), então
 * aparecem como vieram — só com rótulo em português.
 */
@Component({
  selector: 'app-ceres-fontes',
  standalone: true,
  imports: [LucideDatabase, LucideLandmark],
  templateUrl: './ceres-fontes.html',
})
export class CeresFontes {
  readonly fontes = input.required<CeresFonteDado[]>();

  /** Os dados do produtor primeiro, a tabela oficial depois; grupo vazio não aparece. */
  protected readonly grupos = computed(() =>
    [
      {
        origem: 'produtor',
        titulo: 'Calculado a partir das suas notas',
        rotulo: 'Origem dos números da resposta',
        fontes: this.fontes().filter((f) => !ehFonteOficial(f.funcao)),
      },
      {
        origem: 'oficial',
        titulo: 'Consultado na tabela oficial do IBS/CBS',
        rotulo: 'Tabela oficial consultada',
        fontes: this.fontes().filter((f) => ehFonteOficial(f.funcao)),
      },
    ].filter((g) => g.fontes.length > 0),
  );

  protected readonly rotulo = rotuloFonte;
  protected readonly detalhe = descreverFonte;
}
