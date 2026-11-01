import {
  booleanAttribute,
  Component,
  DOCUMENT,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';

let sequenciaId = 0;

/** Elementos que podem receber foco dentro do diálogo. */
const FOCAVEIS =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Diálogo modal acessível — substitui os 14 modais montados à mão nas telas (#45).
 *
 * Cada um daqueles era uma `div` fixa com overlay próprio: sem foco preso, sem
 * fechar no Esc, sem devolver o foco ao gatilho e sem travar a rolagem do fundo.
 * Aqui isso está resolvido:
 *
 * - o foco entra no diálogo ao abrir e **volta para o elemento que o abriu** ao fechar;
 * - Tab e Shift+Tab circulam dentro do diálogo, sem escapar para o fundo;
 * - Esc fecha, a menos que `travado` (operação em andamento que não pode ser abandonada);
 * - a rolagem do documento trava enquanto está aberto.
 *
 * **Por que não o `cdkTrapFocus` do CDK:** foi a primeira implementação. Com ela
 * apareceu `NG0203: The _HighContrastModeDetector token injected...` em runtime
 * (Angular 21 zoneless); com esta versão, em aba limpa, o console fica sem erro.
 * Não cheguei a isolar a causa raiz no CDK, então fica registrado como
 * observação, não como veredito. O que é medido: sem `@angular/cdk/a11y` o
 * bundle caiu de 522,65 kB para 515,40 kB, e a armadilha são ~30 linhas cobertas
 * por teste.
 *
 * No celular ele sobe como folha inferior (mais perto do polegar); do `sm:` para
 * cima, vira diálogo centralizado.
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
  template: `
    @if (aberto()) {
      <!-- O animate.leave segura o overlay no DOM ate a saida terminar: sem ele o
           diálogo pisca para fora e a tela de baixo aparece no corte (#90). -->
      <div
        class="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
        animate.leave="animate-sai"
      >
        <!-- Fundo: clicar fecha, salvo quando travado. aria-hidden porque o botão
             de fechar do cabeçalho já é a saída anunciada ao leitor de tela. -->
        <div
          class="animate-entra absolute inset-0 bg-foreground/40 backdrop-blur-[2px]"
          aria-hidden="true"
          (click)="solicitarFechar()"
        ></div>

        <!-- No celular o diálogo e uma folha que sobe do rodape; no desktop ele cresce
             do centro. Duas animacoes porque sao dois objetos diferentes. -->
        <div
          #caixa
          role="dialog"
          aria-modal="true"
          tabindex="-1"
          class="animate-entra-subindo sm:animate-entra-escala"
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

          <!-- O gap-2 vale para os filhos DIRETOS do rodape, e o div[rodape] e UM filho so: os
               botoes dentro dele ficavam encostados (#115). Acontecia em quatro modais, porque
               cada autor tinha de lembrar de repor o layout na propria div. Entao o rodape veste
               o slot tambem; quem ja declarava a propria classe segue valendo. -->
          <footer
            class="flex flex-col-reverse gap-2 border-t border-border px-5 py-4 sm:flex-row sm:justify-end sm:px-6 [&>[rodape]]:flex [&>[rodape]]:flex-col-reverse [&>[rodape]]:gap-2 sm:[&>[rodape]]:flex-row sm:[&>[rodape]]:justify-end"
          >
            <ng-content select="[rodape]" />
          </footer>
        </div>
      </div>
    }
  `,
})
export class UiModal {
  private readonly doc = inject(DOCUMENT);
  private readonly caixa = viewChild<ElementRef<HTMLElement>>('caixa');

  readonly aberto = input.required<boolean>();
  readonly titulo = input.required<string>();
  readonly descricao = input<string>();
  /** `sm` para confirmações, `lg` para formulários. */
  readonly tamanho = input<'sm' | 'md' | 'lg'>('md');
  /** Impede fechar por Esc, clique no fundo e botão — para operação em andamento. */
  readonly travado = input(false, { transform: booleanAttribute });

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
    effect((onCleanup) => {
      if (!this.aberto()) return;

      // Quem abriu o diálogo: é para cá que o foco volta ao fechar.
      const gatilho = this.doc.activeElement as HTMLElement | null;

      const anterior = this.doc.body.style.overflow;
      this.doc.body.style.overflow = 'hidden';

      // O @if só materializa a caixa no ciclo seguinte; daí o adiamento.
      const tarefa = setTimeout(() => this.focarPrimeiro(), 0);

      onCleanup(() => {
        clearTimeout(tarefa);
        this.doc.body.style.overflow = anterior;
        gatilho?.focus?.();
      });
    });
  }

  @HostListener('document:keydown.escape')
  protected aoPressionarEsc(): void {
    if (this.aberto()) this.solicitarFechar();
  }

  /** Mantém Tab e Shift+Tab circulando dentro do diálogo. */
  @HostListener('document:keydown.tab', ['$event'])
  @HostListener('document:keydown.shift.tab', ['$event'])
  protected aoPressionarTab(bruto: Event): void {
    if (!this.aberto()) return;
    const evento = bruto as KeyboardEvent;
    const alvos = this.focaveis();
    if (!alvos.length) return;

    const primeiro = alvos[0];
    const ultimo = alvos[alvos.length - 1];
    const atual = this.doc.activeElement;

    if (evento.shiftKey && (atual === primeiro || !this.caixa()?.nativeElement.contains(atual))) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && atual === ultimo) {
      evento.preventDefault();
      primeiro.focus();
    }
  }

  private focaveis(): HTMLElement[] {
    const raiz = this.caixa()?.nativeElement;
    return raiz ? Array.from(raiz.querySelectorAll<HTMLElement>(FOCAVEIS)) : [];
  }

  private focarPrimeiro(): void {
    const alvos = this.focaveis();
    (alvos[0] ?? this.caixa()?.nativeElement)?.focus();
  }

  protected solicitarFechar(): void {
    if (!this.travado()) this.fechar.emit();
  }
}
