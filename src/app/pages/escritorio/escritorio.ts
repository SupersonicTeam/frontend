import { Component } from '@angular/core';
import { EscritorioProdutor } from './escritorio-produtor';

/**
 * Meu escritório: o escritório de contabilidade que atende o produtor, numa aba própria do menu.
 *
 * Até aqui isto era uma seção de Configurações (#147). Para o produtor, "quem cuida da minha
 * contabilidade" não é configuração de conta, é uma relação que ele acompanha — e no meio de
 * aparência, senha e privacidade ela ficava escondida. É o mesmo caminho da equipe do contador
 * (#157). A página só dá o cabeçalho e a largura; a tela é o `EscritorioProdutor`.
 */
@Component({
  selector: 'app-escritorio',
  standalone: true,
  imports: [EscritorioProdutor],
  template: `
    <div class="page-container space-y-6 py-6">
      <header>
        <h1 class="font-heading text-2xl font-semibold text-foreground">Meu escritório</h1>
        <p class="mt-1 text-apoio text-muted-foreground">
          quem cuida da sua contabilidade, o que o escritório vê e o que ele pediu
        </p>
      </header>
      <app-escritorio-produtor />
    </div>
  `,
})
export class EscritorioPage {}
