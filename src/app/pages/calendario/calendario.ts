import { Component, inject } from '@angular/core';
import { SessaoService } from '@core/services/sessao.service';
import { PrazosProdutor } from './prazos-produtor';
import { PrazosContador } from './prazos-contador';

/**
 * `/calendario` — uma rota, **duas telas**.
 *
 * O produtor pergunta *o que eu devo e quando*; o contador pergunta *de quem eu cobro hoje*. É o
 * mesmo balcão visto dos dois lados, e não dá para servir os dois com textos trocados: a versão do
 * produtor termina em "procure o seu escritório de contabilidade", e o escritório é quem lê a outra.
 */
@Component({
  selector: 'app-calendario',
  standalone: true,
  imports: [PrazosProdutor, PrazosContador],
  template: `
    @if (sessao.ehContador()) {
      <app-prazos-contador />
    } @else {
      <app-prazos-produtor />
    }
  `,
})
export class CalendarioPage {
  protected readonly sessao = inject(SessaoService);
}
