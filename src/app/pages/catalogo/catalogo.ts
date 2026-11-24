import { Component } from '@angular/core';
import { ModelosPedido } from './modelos-pedido';
import { ObrigacoesCatalogo } from './obrigacoes-catalogo';

/**
 * Modelos e obrigações (#185): o que o escritório configura para **cobrar e pedir** coisas ao
 * produtor, numa aba própria do menu do contador.
 *
 * É o terceiro caso do mesmo desenho: o escritório e a equipe (#157) e o "Meu escritório" do
 * produtor (#147) também moravam em Configurações, entre o tema e a senha, e ninguém os achava.
 * Quem procura "o que eu cobro dos meus clientes" não pensa na engrenagem.
 *
 * A página só dá o cabeçalho e a largura. As duas seções são componentes próprios porque têm
 * contratos e ciclos de vida diferentes: as obrigações alimentam o calendário dos clientes
 * (backend#181); os modelos de pedido só preenchem o formulário de pedir documento
 * (backend#517) e nunca mudam um pedido já enviado.
 */
@Component({
  selector: 'app-catalogo',
  standalone: true,
  imports: [ModelosPedido, ObrigacoesCatalogo],
  template: `
    <div class="page-container space-y-6 py-6">
      <header>
        <h1 class="font-heading text-2xl font-semibold text-foreground">Modelos e obrigações</h1>
        <p class="mt-1 text-apoio text-muted-foreground">
          o que o escritório cobra e pede dos clientes: os prazos do calendário e os pedidos de
          documento que se repetem
        </p>
      </header>
      <app-obrigacoes-catalogo />
      <app-modelos-pedido />
    </div>
  `,
})
export class CatalogoPage {}
