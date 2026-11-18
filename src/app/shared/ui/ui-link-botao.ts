import { Directive, booleanAttribute, computed, input } from '@angular/core';
import { classesBotao, type TamanhoBotao, type VarianteBotao } from './classes-botao';

/**
 * Link com cara de botão (#174, item 4.4). **CTA de navegação é sempre `<a>`** — com
 * `routerLink`, `href` ou `mailto` —, e um `<button>` dentro de um `<a>` é HTML inválido:
 * o leitor de tela anuncia dois controles e o teclado para em dois lugares.
 *
 * A diretiva só veste as classes; quem navega é o próprio `<a>`. Não há variante
 * "desabilitada": link que não leva a lugar nenhum não é link.
 *
 * ```html
 * <a routerLink="/cadastro" uiLinkBotao tamanho="lg">Testar grátis por 15 dias</a>
 * <a href="#planos" uiLinkBotao variant="ghost">Ver os planos</a>
 * ```
 *
 * As classes estáticas escritas no elemento continuam valendo (o Angular junta as duas
 * fontes), então `class="mt-4"` ao lado da diretiva funciona.
 */
@Directive({
  selector: 'a[uiLinkBotao]',
  host: { '[class]': 'classes()' },
})
export class UiLinkBotao {
  readonly variant = input<VarianteBotao>('primary');
  readonly tamanho = input<TamanhoBotao>('md');
  readonly blocoCompleto = input(false, { transform: booleanAttribute });

  protected readonly classes = computed(() =>
    classesBotao(this.variant(), this.tamanho(), { blocoCompleto: this.blocoCompleto() }),
  );
}
