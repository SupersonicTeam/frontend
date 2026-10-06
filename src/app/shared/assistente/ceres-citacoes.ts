import { Component, input } from '@angular/core';
import { LucideExternalLink, LucideScale } from '@lucide/angular';
import type { CeresCitacao } from '@dtos/assistente/ceres.response';

/**
 * A base legal de uma resposta da Ceres — dispositivo, link oficial do Planalto e
 * o trecho da lei.
 *
 * **Fica visível, não escondida atrás de um ícone.** É o que separa esta tela de
 * um chat genérico: toda afirmação legal da Ceres cita o dispositivo, e o
 * contrato (issue #76, seção 6) manda mostrar. O trecho vem num `<details>`
 * porque é longo — mas o "ver trecho da lei" está logo ali, e a referência com o
 * link nunca está colapsada.
 *
 * `<details>` em vez de um toggle próprio: abre com teclado, aparece na busca da
 * página (Ctrl+F) e não precisa de estado nem de JavaScript.
 */
@Component({
  selector: 'app-ceres-citacoes',
  standalone: true,
  imports: [LucideExternalLink, LucideScale],
  templateUrl: './ceres-citacoes.html',
})
export class CeresCitacoes {
  readonly citacoes = input.required<CeresCitacao[]>();
}
