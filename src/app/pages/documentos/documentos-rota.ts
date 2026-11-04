import { Component, inject } from '@angular/core';
import { SessaoService } from '@core/services/sessao.service';
import { DocumentosPage } from './documentos';
import { NotasContador } from './notas-contador';

/**
 * `/documentos` — uma rota, **duas telas** (issue #136).
 *
 * O contador abria a `DocumentosPage` do produtor, com outro título, e ela chamava `/api/notas`,
 * `/api/vinculos` e `/api/pendencias`: rotas que derivam o produtor do token e respondem 403 para o
 * escritório. O escritório não tem "as minhas notas"; tem as notas de cada cliente da carteira.
 * Mesma decisão de `/tributario` e `/calendario`: este arquivo só escolhe o componente, e cada papel
 * tem o seu, com template e chamadas próprios.
 */
@Component({
  selector: 'app-documentos-rota',
  standalone: true,
  imports: [DocumentosPage, NotasContador],
  template: `
    @if (sessao.ehContador()) {
      <app-notas-contador />
    } @else {
      <app-documentos />
    }
  `,
})
export class DocumentosRotaPage {
  protected readonly sessao = inject(SessaoService);
}
