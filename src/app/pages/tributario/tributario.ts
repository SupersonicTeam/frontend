import { Component, inject } from '@angular/core';
import { SessaoService } from '@core/services/sessao.service';
import { ImpostosProdutor } from './impostos-produtor';
import { ImpostosContador } from './impostos-contador';

/**
 * `/tributario` — uma rota, **duas telas**.
 *
 * Produtor e contador perguntam coisas diferentes ao mesmo dado: um quer saber *quanto paga e de onde
 * saiu*, o outro quer *conferir e fechar*. A tentativa de servir os dois com um componente e textos
 * trocados já falhou uma vez — o contador lia "você tem a pagar neste período" — então aqui são dois
 * componentes de verdade, com template e lógica próprios, e este arquivo só escolhe qual.
 */
@Component({
  selector: 'app-tributario',
  standalone: true,
  imports: [ImpostosProdutor, ImpostosContador],
  template: `
    @if (sessao.ehContador()) {
      <app-impostos-contador />
    } @else {
      <app-impostos-produtor />
    }
  `,
})
export class TributarioPage {
  protected readonly sessao = inject(SessaoService);
}
