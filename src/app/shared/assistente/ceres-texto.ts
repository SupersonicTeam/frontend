import { Component, computed, input } from '@angular/core';
import { paragrafosDoTexto } from '@core/utils/ceres';

/**
 * O texto da resposta da Ceres, em parágrafos e listas (#132).
 *
 * Na rota de dados o backend monta a resposta por template: um parágrafo por assunto e itens
 * em linhas `- `. Num bloco único com `whitespace-pre-line`, o resumo do produtor virava uma
 * parede de linhas. Aqui cada parágrafo ganha espaço e cada lista vira `<ul>`.
 *
 * **Continua texto puro.** Tudo entra por interpolação: o texto vem de um modelo de linguagem
 * e o contrato proíbe `innerHTML`. Um `<b>` na resposta aparece como `<b>`, não em negrito.
 */
@Component({
  selector: 'app-ceres-texto',
  standalone: true,
  host: { class: 'flex flex-col gap-3 text-apoio leading-relaxed text-foreground' },
  template: `
    @for (paragrafo of paragrafos(); track $index) {
      <div class="flex flex-col gap-1">
        @for (trecho of paragrafo; track $index) {
          @if (trecho.tipo === 'lista') {
            <ul class="flex list-disc flex-col gap-1 pl-5">
              @for (item of trecho.itens; track $index) {
                <li>{{ item }}</li>
              }
            </ul>
          } @else {
            <p class="whitespace-pre-line">{{ trecho.texto }}</p>
          }
        }
      </div>
    }
  `,
})
export class CeresTexto {
  readonly texto = input.required<string>();

  protected readonly paragrafos = computed(() => paragrafosDoTexto(this.texto()));
}
