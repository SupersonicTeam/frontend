import { Component, computed, input } from '@angular/core';

type Natureza = 'atencao' | 'sugestao' | 'explicacao';

/**
 * Superfície do assistente — a resposta visual à crítica da banca (#45).
 *
 * A banca apontou que o design não comunica que existe IA na solução. Este é o
 * componente que corrige isso: é o **único** lugar que veste o acento violeta
 * (`--color-assistente`), reservado para quando o sistema **interpreta, sugere ou
 * explica** algo — nunca decoração. Com o tempo o usuário aprende a reconhecer:
 * onde tem violeta, o sistema está pensando por ele.
 *
 * Regra de honestidade, e ela é séria: só use com conteúdo derivado de dado real.
 * Hoje há material de sobra vindo do backend — `/notas/{id}/validacoes` devolve
 * `code`, `field` e `message` verdadeiros, a apuração devolve saldo e os
 * vencimentos devolvem prazo. Nada aqui pode ser texto inventado só para parecer
 * inteligente; se não houver dado que sustente a frase, o componente não entra.
 *
 * ```html
 * <ui-insight natureza="atencao" titulo="2 notas precisam de correção">
 *   A nota 7 está sem endereço do destinatário, exigido para emitir a NF-e.
 *   <div acoes><ui-button variant="assistente">Corrigir agora</ui-button></div>
 * </ui-insight>
 * ```
 */
@Component({
  selector: 'ui-insight',
  standalone: true,
  template: `
    <section [class]="classesCaixa()">
      <div class="flex items-start gap-3">
        <span [class]="classesSelo()" aria-hidden="true">
          <ng-content select="[icone]" />
        </span>

        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 class="font-heading font-semibold text-foreground">{{ titulo() }}</h3>
            <span [class]="classesEtiqueta()">{{ etiqueta() }}</span>
          </div>

          <div class="mt-1.5 text-apoio leading-relaxed text-muted-foreground">
            <ng-content />
          </div>

          <div class="mt-3 flex flex-wrap gap-2 empty:mt-0">
            <ng-content select="[acoes]" />
          </div>
        </div>
      </div>
    </section>
  `,
})
export class UiInsight {
  readonly titulo = input.required<string>();
  /** `atencao` = exige ação · `sugestao` = oportunidade · `explicacao` = didático. */
  readonly natureza = input<Natureza>('explicacao');

  protected readonly etiqueta = computed(
    () =>
      ({
        atencao: 'Precisa de atenção',
        sugestao: 'Sugestão do assistente',
        explicacao: 'Assistente explica',
      })[this.natureza()],
  );

  protected readonly classesCaixa = computed(() => {
    const bordas: Record<Natureza, string> = {
      atencao: 'border-aviso/40 bg-aviso-soft',
      sugestao: 'border-assistente-borda bg-assistente-soft shadow-assistente',
      explicacao: 'border-assistente-borda bg-assistente-soft',
    };
    return `rounded-card border p-4 sm:p-5 ${bordas[this.natureza()]}`;
  });

  protected readonly classesSelo = computed(() => {
    const cores: Record<Natureza, string> = {
      atencao: 'bg-aviso text-white',
      sugestao: 'bg-assistente text-assistente-foreground',
      explicacao: 'bg-assistente text-assistente-foreground',
    };
    return `flex size-9 shrink-0 items-center justify-center rounded-full ${cores[this.natureza()]}`;
  });

  protected readonly classesEtiqueta = computed(() => {
    const cores: Record<Natureza, string> = {
      atencao: 'bg-aviso/15 text-aviso-ink',
      sugestao: 'bg-assistente/15 text-assistente-ink',
      explicacao: 'bg-assistente/15 text-assistente-ink',
    };
    return `rounded-full px-2 py-0.5 text-apoio font-medium ${cores[this.natureza()]}`;
  });
}
