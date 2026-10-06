import { Component, input } from '@angular/core';
import { LucideDatabase } from '@lucide/angular';
import { descreverFonte, rotuloFonte } from '@core/utils/ceres';
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
 * Os `parametros` já vêm mascarados pelo backend (CPF, CNPJ viram `[CPF]`), então
 * aparecem como vieram — só com rótulo em português.
 */
@Component({
  selector: 'app-ceres-fontes',
  standalone: true,
  imports: [LucideDatabase],
  templateUrl: './ceres-fontes.html',
})
export class CeresFontes {
  readonly fontes = input.required<CeresFonteDado[]>();

  protected readonly rotulo = rotuloFonte;
  protected readonly detalhe = descreverFonte;
}
