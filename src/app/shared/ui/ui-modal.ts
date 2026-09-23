import { A11yModule } from '@angular/cdk/a11y';
import {
  Component,
  DOCUMENT,
  HostListener,
  computed,
  effect,
  inject,
  input,
  output,
} from '@angular/core';

let sequenciaId = 0;

/**
 * Diálogo modal acessível — substitui os 14 modais montados à mão nas telas (#45).
 *
 * Cada um daqueles era uma `div` fixa com overlay próprio: sem foco preso, sem
 * fechar no Esc, sem devolver o foco ao gatilho e sem travar a rolagem do fundo.
 * Aqui isso vem de graça:
 *
 * - `cdkTrapFocus` + `cdkTrapFocusAutoCapture` prendem o foco no diálogo, levam o
 *   foco para dentro ao abrir e **devolvem ao elemento que abriu** ao fechar.
 * - Esc fecha (a menos que `travado`, para operações que não podem ser abandonadas
 *   no meio, como um envio em andamento).
 * - A rolagem do documento é travada enquanto está aberto.
 *
 * No celular ele sobe como folha inferior (mais perto do polegar); do `sm:` para
 * cima, vira diálogo centralizado.
 *
 * Uso — o conteúdo vai por projeção, e o rodapé de ações pelo slot `[rodape]`:
 *
 * ```html
 * <ui-modal [aberto]="showConfirmacao()" titulo="Cancelar nota" (fechar)="showConfirmacao.set(false)">
 *   <p>Esta ação não pode ser desfeita.</p>
 *   <div rodape>
 *     <ui-button variant="ghost" (click)="showConfirmacao.set(false)">Voltar</ui-button>
 *     <ui-button variant="perigo" (click)="cancelar()">Cancelar nota</ui-button>
 *   </div>
 * </ui-modal>
 * ```
 */
@Component({
  selector: 'ui-modal',
  standalone: true,
  imports: [A11yModule],
  template: `
    @if (aberto()) {
      <div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
        <!-- Fundo: clicar fecha, salvo quando travado. aria-hidden porque o botão
             de fechar do cabeçalho já é a saída anunciada ao leitor de tela. -->
        <div
          class="absolute inset-0 bg-foreground/40 backdrop-blur-[2px]"
          aria-hidden="true"
          (click)="solicitarFechar()"
        ></div>

        <div
          cdkTrapFocus
          cdkTrapFocusAutoCapture
          role="dialog"
          aria-modal="true"
          [attr.aria-labelledby]="idTitulo"
          [class]="classesCaixa()"
        >
          <header class="flex items-start gap-3 px-5 pt-5 pb-3 sm:px-6 sm:pt-6">
            <div class="min-w-0 flex-1">
              <h2 [id]="idTitulo" class="font-heading text-lg font-semibold text-foreground">
                {{ titulo() }}
              </h2>
              @if (descricao()) {
                <p class="mt-1 text-apoio text-muted-foreground">{{ descricao() }}</p>
              }
            </div>
            @if (!travado()) {
              <button
                type="button"
                class="tap-target -mr-2 -mt-2 flex shrink-0 items-center justify-center rounded-controle text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Fechar"
                (click)="solicitarFechar()"
              >
                <span aria-hidden="true" class="text-xl leading-none">&times;</span>
              </button>
            }
          </header>

          <div class="overflow-y-auto px-5 pb-5 sm:px-6 sm:pb-6">
            <ng-content />
          </div>

          <footer class="flex flex-col-reverse gap-2 border-t border-border px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
            <ng-content select="[rodape]" />
          </footer>
        </div>
      </div>
    }
  `,
})
export class UiModal {
  private readonly doc = inject(DOCUMENT);

  readonly aberto = input.required<boolean>();
  readonly titulo = input.required<string>();
  readonly descricao = input<string>();
  /** `sm` para confirmações, `lg` para formulários. */
  readonly tamanho = input<'sm' | 'md' | 'lg'>('md');
  /** Impede fechar por Esc, clique no fundo e botão — para operação em andamento. */
  readonly travado = input(false);

  readonly fechar = output<void>();

  protected readonly idTitulo = `ui-modal-titulo-${sequenciaId++}`;

  protected readonly classesCaixa = computed(() => {
    const larguras: Record<'sm' | 'md' | 'lg', string> = {
      sm: 'sm:max-w-sm',
      md: 'sm:max-w-lg',
      lg: 'sm:max-w-2xl',
    };
    return [
      'relative flex max-h-[92vh] w-full flex-col bg-card text-card-foreground shadow-alta',
      'rounded-t-destaque sm:rounded-destaque border border-border',
      larguras[this.tamanho()],
    ].join(' ');
  });

  constructor() {
    // Trava a rolagem do fundo enquanto o diálogo está aberto. O cleanup do effect
    // devolve o valor anterior, então fechar (ou destruir o componente) restaura.
    effect((onCleanup) => {
      if (!this.aberto()) return;
      const anterior = this.doc.body.style.overflow;
      this.doc.body.style.overflow = 'hidden';
      onCleanup(() => {
        this.doc.body.style.overflow = anterior;
      });
    });
  }

  @HostListener('document:keydown.escape')
  protected aoPressionarEsc(): void {
    if (this.aberto()) this.solicitarFechar();
  }

  protected solicitarFechar(): void {
    if (!this.travado()) this.fechar.emit();
  }
}
