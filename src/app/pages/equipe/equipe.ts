import { Component } from '@angular/core';
import { EquipeEscritorio } from './equipe-escritorio';

/**
 * Equipe (#157): o escritório e quem trabalha nele, numa aba própria do menu do contador.
 *
 * Até a #157 isto era uma seção de Configurações (#148), escolhida por ser "configuração consultada
 * de vez em quando". No uso ela ficou escondida: quem procura a equipe não pensa em Configurações,
 * e a seção dividia a página com aparência, senha, privacidade e o catálogo de obrigações.
 *
 * A página só dá o cabeçalho e a largura; a tela em si continua sendo o `EquipeEscritorio`, que não
 * mudou de comportamento: todo membro vê, e só o administrador edita, troca função, remove e
 * convida.
 */
@Component({
  selector: 'app-equipe',
  standalone: true,
  imports: [EquipeEscritorio],
  template: `
    <div class="page-container space-y-6 py-6">
      <header>
        <h1 class="font-heading text-2xl font-semibold text-foreground">Equipe</h1>
        <p class="mt-1 text-apoio text-muted-foreground">
          os dados do escritório, quem trabalha nele e os convites para a equipe
        </p>
      </header>
      <app-equipe-escritorio />
    </div>
  `,
})
export class EquipePage {}
