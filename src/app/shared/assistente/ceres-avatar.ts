import { Component, computed, input } from '@angular/core';

/** Tamanhos usados hoje: na mensagem, no cabeçalho da gaveta e no topo da página. */
type Tamanho = 'sm' | 'md' | 'lg';

/**
 * O rosto da Ceres — o símbolo da marca, não um ícone genérico.
 *
 * Existe como componente porque ela aparece em **quatro** lugares (botão flutuante, cabeçalho da
 * gaveta, topo da página `/chat` e cada mensagem dela na conversa). Com o ícone solto em cada um,
 * bastava mexer em três para a assistente ficar com duas caras.
 *
 * **O símbolo é verde e a camada de IA é violeta** — e isso é de propósito. O violeta (#45) marca
 * onde o sistema interpreta, sugere ou explica; o verde é a marca. Aqui os dois convivem: o
 * símbolo fica sobre um disco claro, que o mantém legível, e o anel violeta diz de que camada
 * aquilo é. Trocar o disco pelo violeta apagaria a folha; trocar o anel pelo verde apagaria a
 * distinção que a remodelação criou.
 */
@Component({
  selector: 'app-ceres-avatar',
  standalone: true,
  template: `
    <span [class]="classes()">
      <img
        src="/agrocontabil-simbolo.svg"
        [attr.width]="pixels()"
        [attr.height]="pixels()"
        alt=""
        aria-hidden="true"
        [class]="classeImagem()"
      />
    </span>
  `,
})
export class CeresAvatar {
  readonly tamanho = input<Tamanho>('md');

  private static readonly MOLDURA: Record<Tamanho, string> = {
    sm: 'size-8',
    md: 'size-9',
    lg: 'size-11',
  };

  private static readonly IMAGEM: Record<Tamanho, string> = {
    sm: 'size-5',
    md: 'size-6',
    lg: 'size-7',
  };

  private static readonly PIXELS: Record<Tamanho, number> = { sm: 20, md: 24, lg: 28 };

  protected readonly classes = computed(
    () =>
      'inline-flex shrink-0 items-center justify-center rounded-full border border-assistente-borda bg-surface shadow-suave ' +
      CeresAvatar.MOLDURA[this.tamanho()],
  );

  protected readonly classeImagem = computed(
    () => 'object-contain ' + CeresAvatar.IMAGEM[this.tamanho()],
  );

  protected readonly pixels = computed(() => CeresAvatar.PIXELS[this.tamanho()]);
}
