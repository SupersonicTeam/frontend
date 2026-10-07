import { Component, computed, input } from '@angular/core';

/** Tamanhos usados hoje: na mensagem, no cabeçalho da gaveta e no topo da página. */
type Tamanho = 'sm' | 'md' | 'lg';

/**
 * O rosto da Ceres — a marca **dela**, que não é a do produto.
 *
 * Existe como componente porque ela aparece em **quatro** lugares (botão flutuante, cabeçalho da
 * gaveta, topo da página `/chat` e cada mensagem dela na conversa). Com o ícone solto em cada um,
 * bastava mexer em três para a assistente ficar com duas caras.
 *
 * A primeira versão usava o símbolo do AgroContábil: era a marca do produto no lugar do rosto da
 * assistente, e isso apagava a diferença entre quem fala (a Ceres) e onde ela fala (o
 * AgroContábil). O arquivo certo é `ceres-avatar.svg` — a folha com os nós da rede, que é a marca
 * dela.
 *
 * **O disco teal vem dentro do arquivo; o anel violeta é nosso.** O violeta (#45) marca onde o
 * sistema interpreta, sugere ou explica — e como a marca da Ceres já traz o próprio fundo, ela
 * fica legível igual no tema claro e no escuro, sem precisar de uma segunda arte. Resta ao anel
 * dizer de que camada aquilo é. Trocar o anel pelo verde apagaria a distinção que a remodelação
 * criou.
 */
@Component({
  selector: 'app-ceres-avatar',
  standalone: true,
  template: `
    <img
      src="/ceres-avatar.svg"
      [attr.width]="pixels()"
      [attr.height]="pixels()"
      alt=""
      aria-hidden="true"
      [class]="classes()"
    />
  `,
})
export class CeresAvatar {
  readonly tamanho = input<Tamanho>('md');

  private static readonly MOLDURA: Record<Tamanho, string> = {
    sm: 'size-8',
    md: 'size-9',
    lg: 'size-11',
  };

  private static readonly PIXELS: Record<Tamanho, number> = { sm: 32, md: 36, lg: 44 };

  protected readonly classes = computed(
    () =>
      'block shrink-0 rounded-full border border-assistente-borda shadow-suave ' +
      CeresAvatar.MOLDURA[this.tamanho()],
  );

  protected readonly pixels = computed(() => CeresAvatar.PIXELS[this.tamanho()]);
}
