import { Component } from '@angular/core';
import { JornadaMilho } from './jornada/jornada-milho';

/**
 * A prévia da landing (#174): por onde as seções são revisadas **antes** de a landing ir para `/`.
 *
 * Só existe fora de produção (a constante de compilação `PREVIA_LANDING`, ver `app.routes.ts`).
 * Hoje hospeda a jornada do milho em 3D; os PRs 4 a 8 acrescentam o cabeçalho, o hero e as outras
 * seções aqui, e o PR 9 troca esta rota pela landing de verdade.
 *
 * O texto acima e abaixo da seção não é o da landing — está aqui para a jornada ser revisada do
 * jeito que o visitante a encontra: rolando, com conteúdo antes e depois.
 *
 * A jornada entra por `@defer (on viewport)`: o chunk dela (e o do Motion) só é pedido quando a
 * seção se aproxima da tela. Abaixo da dobra, ela nunca disputa o primeiro paint.
 */
@Component({
  selector: 'app-previa-landing',
  standalone: true,
  imports: [JornadaMilho],
  template: `
    <main class="bg-background text-foreground">
      <section class="page-container flex min-h-screen flex-col justify-center px-4 py-16 sm:px-6">
        <p class="text-apoio font-semibold text-primary">Prévia da landing</p>
        <h1 class="mt-2 font-heading text-4xl font-semibold">Jornada do milho em 3D</h1>
        <p class="mt-4 max-w-[40rem] text-valor text-muted-foreground">
          Esta página só existe fora de produção. Role para baixo: a cena anda com a rolagem, nos
          dois sentidos. Com "reduzir movimento" ligado no sistema, a seção vira uma lista de
          quadros parados e nenhuma sequência é baixada.
        </p>
      </section>

      @defer (on viewport; prefetch on idle) {
        <app-jornada-milho />
      } @placeholder {
        <div class="min-h-[60vh]"></div>
      }

      <section class="page-container px-4 py-24 sm:px-6">
        <h2 class="font-heading text-2xl font-semibold">Depois da jornada</h2>
        <p class="mt-3 max-w-[40rem] text-valor text-muted-foreground">
          Conteúdo de exemplo abaixo da seção, para ver como o último quadro encosta no fundo da
          página nos dois temas.
        </p>
      </section>
    </main>
  `,
})
export class PreviaLandingPage {}
