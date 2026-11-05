import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { LucideMailPlus } from '@lucide/angular';
import { CarteiraApi, type ConviteEnviado } from '@services/contador/data-access/carteira.service';
import { EscritorioApi } from '@services/escritorio/data-access/escritorio.service';
import { ToastService } from '@core/services/toast.service';
import { falhaDaApi } from '@core/utils/erro-api';
import { formatarData } from '@core/utils/periodo';
import { UiButton } from '@shared/ui/ui-button';

/** O suficiente para não mandar ao servidor o que ele recusaria com 400. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Convidar cliente e ver os convites pendentes, no Acompanhamento (#147).
 *
 * É a porta de entrada da carteira: o vínculo só nasce quando o produtor aceita um convite. Sem
 * isto, em produção, o escritório não tinha como ganhar cliente nenhum.
 *
 * - **Só o administrador convida** (403 para as outras funções), então o campo só aparece para
 *   ele; a lista de pendentes é de todos.
 * - O servidor responde **202 sempre**, exista ou não conta com o e-mail — para não revelar quem
 *   tem conta. A tela não diz "convite entregue"; diz que o produtor recebe se o e-mail estiver
 *   certo.
 */
@Component({
  selector: 'app-convites-carteira',
  standalone: true,
  imports: [LucideMailPlus, UiButton],
  template: `
    <section class="rounded-card border border-border bg-card p-4" aria-labelledby="convites">
      <h2 id="convites" class="flex items-center gap-2 font-heading font-semibold text-foreground">
        <svg lucideMailPlus [size]="18" aria-hidden="true" />
        Convidar cliente
      </h2>

      @if (administrador()) {
        <form
          class="mt-3 flex flex-wrap items-center gap-2"
          (submit)="$event.preventDefault(); convidar()"
        >
          <label class="sr-only" for="email-convite">E-mail do produtor</label>
          <input
            id="email-convite"
            type="email"
            autocomplete="off"
            class="tap-target min-w-0 flex-1 rounded-controle border border-border bg-background px-3 text-apoio text-foreground sm:max-w-sm"
            placeholder="email@do-produtor.com"
            [value]="email()"
            (input)="email.set($any($event.target).value)"
          />
          <ui-button type="submit" [disabled]="!emailValido()" [carregando]="enviando()">
            Enviar convite
          </ui-button>
        </form>
        <p class="mt-1 text-apoio text-muted-foreground">
          O produtor entra na carteira quando aceitar. Se ainda não tiver conta, ele cria uma com
          este e-mail e o convite estará esperando.
        </p>
      } @else if (administrador() === false) {
        <p class="mt-1 text-apoio text-muted-foreground">
          Quem convida cliente é o administrador do escritório.
        </p>
      }

      @if (pendentes().length) {
        <h3 class="mt-4 text-apoio font-semibold text-foreground">
          Esperando resposta ({{ pendentes().length }})
        </h3>
        <ul class="mt-1 divide-y divide-border">
          @for (c of pendentes(); track c.id) {
            <li class="flex flex-wrap justify-between gap-2 py-2 text-apoio">
              <span class="text-foreground">{{ c.email }}</span>
              <span class="text-muted-foreground">
                enviado em {{ data(c.criadoEm) }} · vale até {{ data(c.expiraEm) }}
              </span>
            </li>
          }
        </ul>
      } @else if (erroLista() && administrador()) {
        <p class="mt-3 text-apoio text-muted-foreground">
          Não foi possível carregar os convites pendentes.
        </p>
      }
    </section>
  `,
})
export class ConvitesCarteira implements OnInit {
  private readonly carteiraApi = inject(CarteiraApi);
  private readonly escritorioApi = inject(EscritorioApi);
  private readonly toast = inject(ToastService);

  /** `null` enquanto `/escritorio` não respondeu: até lá a tela não afirma nada sobre a função. */
  readonly administrador = signal<boolean | null>(null);
  readonly email = signal('');
  readonly enviando = signal(false);
  readonly pendentes = signal<ConviteEnviado[]>([]);
  readonly erroLista = signal(false);

  readonly emailValido = computed(() => EMAIL.test(this.email().trim()));

  ngOnInit(): void {
    this.escritorioApi.ehAdministrador().subscribe((sim) => this.administrador.set(sim));
    this.carregarPendentes();
  }

  private carregarPendentes(): void {
    this.carteiraApi.convitesEnviados().subscribe({
      next: (lista) => {
        this.erroLista.set(false);
        this.pendentes.set(lista.filter((c) => c.situacao === 'PENDENTE'));
      },
      error: () => this.erroLista.set(true),
    });
  }

  convidar(): void {
    if (!this.emailValido() || this.enviando()) return;
    const email = this.email().trim();
    this.enviando.set(true);
    this.carteiraApi.convidar(email).subscribe({
      next: () => {
        this.enviando.set(false);
        this.email.set('');
        this.toast.success(`Convite enviado para ${email}. Ele aparece aqui até ser respondido.`);
        this.carregarPendentes();
      },
      error: (erro: HttpErrorResponse) => {
        this.enviando.set(false);
        this.toast.error(ConvitesCarteira.mensagemDeErro(erro));
      },
    });
  }

  private static mensagemDeErro(erro: HttpErrorResponse): string {
    const falha = falhaDaApi(erro);
    if (erro.status === 403) return 'Só o administrador do escritório convida clientes.';
    if (falha.codigo === 'LIMITE_CONVITES' || erro.status === 429) {
      const espera = falha.esperarSegundos;
      const quando = espera ? ` Tente de novo em ${Math.ceil(espera / 60)} min.` : '';
      return `O escritório chegou ao limite de 30 convites por dia.${quando}`;
    }
    return falha.mensagem;
  }

  data(iso: string): string {
    return formatarData(iso);
  }
}
