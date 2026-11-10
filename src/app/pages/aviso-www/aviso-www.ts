import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  DOMINIO_BASE,
  LOCALIZACAO_ATUAL,
  semProtocolo,
  urlDoHost,
} from '@core/utils/host-escritorio';

/**
 * No endereço do escritório (#175), `/cadastro` e `/equipe/convite` são de www: o cadastro de
 * produtor e de escritório é feito lá, e o link do e-mail de convite aponta para lá. Esta página
 * diz isso e leva ao mesmo caminho em www — com o `#token=...` do convite junto, que não sai do
 * nosso domínio nem vai ao servidor.
 *
 * As rotas escolhem por `canMatch` (`app.routes.ts`): no subdomínio, o chunk do cadastro nem baixa.
 */
@Component({
  selector: 'app-aviso-www',
  standalone: true,
  template: `
    <main class="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div
        class="w-full max-w-md space-y-4 rounded-card border border-border bg-card p-6 text-center shadow-suave"
      >
        <h1 class="font-heading text-xl font-semibold text-foreground">{{ titulo }}</h1>
        <p class="text-apoio text-muted-foreground">
          {{ frase }}
          <a [href]="destino" class="font-medium text-primary underline">{{ hostWww }}</a
          >.
        </p>
      </div>
    </main>
  `,
})
export class AvisoWwwPage {
  private readonly localizacao = inject(LOCALIZACAO_ATUAL);
  /** `cadastro` ou `convite`, do `data` da rota. Fixo enquanto a página existe: nada a observar. */
  private readonly convite = inject(ActivatedRoute).snapshot.data['aviso'] === 'convite';
  private readonly www = urlDoHost(null, inject(DOMINIO_BASE), this.localizacao);

  readonly hostWww = semProtocolo(this.www);
  readonly titulo = this.convite
    ? 'O convite abre em outro endereço'
    : 'O cadastro é feito em outro endereço';
  readonly frase = this.convite
    ? 'O convite de equipe se aceita no endereço principal. Abra por'
    : 'O cadastro de produtor e de escritório é feito em';
  /** O mesmo caminho em www; no convite, com o fragmento (o `#token=`). */
  readonly destino = this.convite
    ? `${this.www}/equipe/convite${this.localizacao.fragmento}`
    : `${this.www}/cadastro`;
}
