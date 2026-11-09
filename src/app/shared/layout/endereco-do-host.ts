import { DOCUMENT } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { EscritorioDoHostService } from '@core/services/escritorio-do-host.service';
import { DOMINIO_BASE, LOCALIZACAO_ATUAL, urlDoHost } from '@core/utils/host-escritorio';

/**
 * A tela de um endereço de escritório que não abriu (#175): "não encontrado" ou "indisponível".
 *
 * Não é a `NaoEncontradaPage` (`**`), que é de **caminho**: esta é de **host**, e aparece no lugar
 * do app inteiro, sem nada do shell (não há sessão a supor). Entra no bundle inicial, então fica
 * pequena: texto, a logo e o link para www.
 */
@Component({
  selector: 'app-endereco-do-host',
  standalone: true,
  template: `
    <main class="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div class="w-full max-w-md space-y-5 text-center">
        <!-- As duas artes, alternadas pela classe .dark do app, como no login: a <picture> com
             media query seguiria o tema do sistema, e não o tema escolhido no app. -->
        <img
          src="/agroconia-horizontal.svg"
          width="1617"
          height="400"
          alt="AgroConIA"
          class="mx-auto block h-12 w-auto dark:hidden"
        />
        <img
          src="/agroconia-horizontal-negativo.svg"
          width="1617"
          height="400"
          alt=""
          aria-hidden="true"
          class="mx-auto hidden h-12 w-auto dark:block"
        />
        @if (variante() === 'nao-encontrado') {
          <h1 class="font-heading text-xl font-semibold text-foreground">
            Endereço não encontrado
          </h1>
          <p class="text-apoio text-muted-foreground">
            Este endereço não é de nenhum escritório na AgroConIA. Confira com o seu escritório ou
            entre por
            <a [href]="www()" class="font-medium text-primary underline">{{ hostWww() }}</a
            >.
          </p>
        } @else {
          <h1 class="font-heading text-xl font-semibold text-foreground">
            Não foi possível abrir este endereço
          </h1>
          <p class="text-apoio text-muted-foreground" role="alert">
            @if (esperar(); as segundos) {
              Muitas tentativas. Tente de novo em {{ segundos }} segundos.
            } @else {
              O servidor não respondeu. Tente de novo em instantes.
            }
          </p>
          <div class="flex flex-col items-center gap-3">
            <button
              type="button"
              class="tap-target inline-flex items-center rounded-controle bg-primary px-5 text-apoio font-medium text-primary-foreground hover:bg-primary/90"
              (click)="tentarDeNovo()"
            >
              Tentar de novo
            </button>
            <p class="text-apoio text-muted-foreground">
              Ou entre por
              <a [href]="www()" class="font-medium text-primary underline">{{ hostWww() }}</a
              >.
            </p>
          </div>
        }
      </div>
    </main>
  `,
})
export class EnderecoDoHost {
  private readonly documento = inject(DOCUMENT);
  private readonly localizacao = inject(LOCALIZACAO_ATUAL);
  private readonly base = inject(DOMINIO_BASE);
  private readonly host = inject(EscritorioDoHostService);

  readonly variante = input.required<'nao-encontrado' | 'indisponivel'>();

  readonly esperar = this.host.esperarSegundos;
  /** O endereço principal, montado como qualquer outro host (nunca escrito à mão). */
  readonly www = computed(() =>
    urlDoHost(null, this.base, {
      protocolo: this.localizacao.protocolo,
      porta: this.localizacao.porta,
    }),
  );
  readonly hostWww = computed(() => this.www().replace(/^[a-z]+:\/\//, ''));

  tentarDeNovo(): void {
    this.documento.defaultView?.location.reload();
  }
}
