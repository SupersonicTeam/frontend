import { Component, DestroyRef, ElementRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { LucideBuilding2 } from '@lucide/angular';
import {
  VinculosApi,
  type ConviteRecebido,
  type VinculoDoProdutor,
} from '@services/vinculos/data-access/vinculos.service';
import { ToastService } from '@core/services/toast.service';
import { NotificacoesService } from '@core/services/notificacoes.service';
import { formatarData } from '@core/utils/periodo';
import { UiButton } from '@shared/ui/ui-button';
import { UiModal } from '@shared/ui/ui-modal';

/**
 * O escritório de contabilidade do **produtor**, em Configurações (#147): convites para aceitar ou
 * recusar e o vínculo que ele pode encerrar.
 *
 * ## Por que em Configurações
 *
 * Aceitar um escritório é decidir **quem enxerga os meus dados** — é configuração da conta, como a
 * senha logo acima, não uma tarefa do dia. O aviso de que chegou convite vai pelo sino (que leva
 * para cá), então a pessoa não precisa adivinhar onde procurar.
 *
 * Erros não têm toast aqui: `/api/convites` e `/api/vinculos` passam pelo toast global do
 * `apiInterceptor`, que já mostra a mensagem do servidor.
 */
@Component({
  selector: 'app-escritorio-produtor',
  standalone: true,
  imports: [LucideBuilding2, UiButton, UiModal],
  template: `
    <div
      id="escritorio"
      class="flex scroll-mt-4 flex-col gap-3 rounded-card border border-border bg-card p-5 shadow-suave"
    >
      <h2
        tabindex="-1"
        class="flex items-center gap-2 font-heading text-lg font-semibold text-foreground focus:outline-none"
      >
        <svg lucideBuilding2 [size]="18" class="text-primary" />
        Escritório de contabilidade
      </h2>

      @for (c of convites(); track c.id) {
        <div class="rounded-controle border border-info/30 bg-info-soft p-3">
          <p class="text-apoio text-info-ink">
            <strong>{{ c.escritorio }}</strong> convidou você para ser cliente do escritório{{
              c.convidadoPor
                ? ' (convite de ' + c.convidadoPor + (c.crc ? ', CRC ' + c.crc : '') + ')'
                : ''
            }}. Aceitando, o escritório passa a ver as suas notas, guias e documentos. O convite
            vale até {{ data(c.expiraEm) }}.
          </p>
          <div class="mt-2 flex flex-wrap gap-2">
            <ui-button
              [carregando]="respondendo() === c.id + ':aceitar'"
              [disabled]="!!respondendo()"
              (click)="responder(c, 'aceitar')"
            >
              Aceitar
            </ui-button>
            <ui-button
              variant="ghost"
              [carregando]="respondendo() === c.id + ':recusar'"
              [disabled]="!!respondendo()"
              (click)="responder(c, 'recusar')"
            >
              Recusar
            </ui-button>
          </div>
        </div>
      }

      @if (vinculosAtuais().length) {
        <ul class="divide-y divide-border">
          @for (v of vinculosAtuais(); track v.id) {
            <li class="flex flex-wrap items-center justify-between gap-2 py-2">
              <div class="min-w-0 text-apoio">
                <p class="font-medium text-foreground">{{ v.escritorio }}</p>
                <p class="text-muted-foreground">
                  {{ v.situacao === 'SUSPENSO' ? 'Suspenso pelo escritório' : 'Atende você' }}
                  desde {{ data(v.inicio) }}
                  @if (v.responsavel) {
                    · responsável: {{ v.responsavel }}
                  }
                </p>
              </div>
              <ui-button variant="ghost" (click)="encerrando.set(v)">Encerrar vínculo</ui-button>
            </li>
          }
        </ul>
      } @else if (carregou() && !convites().length) {
        <p class="text-apoio text-muted-foreground">
          Nenhum escritório atende você agora. Quando um escritório mandar um convite para o seu
          e-mail, ele aparece aqui.
        </p>
      }
    </div>

    <ui-modal
      [aberto]="encerrando() !== null"
      [titulo]="'Encerrar o vínculo com ' + (encerrando()?.escritorio ?? '') + '?'"
      descricao="O escritório perde o acesso às suas notas, guias e documentos na hora. Para voltar a ser atendido por ele, é preciso um convite novo."
      tamanho="sm"
      [travado]="encerrandoAgora()"
      (fechar)="encerrando.set(null)"
    >
      <div rodape class="flex flex-wrap justify-end gap-2">
        <ui-button variant="ghost" [disabled]="encerrandoAgora()" (click)="encerrando.set(null)">
          Cancelar
        </ui-button>
        <ui-button variant="perigo" [carregando]="encerrandoAgora()" (click)="encerrar()">
          Encerrar
        </ui-button>
      </div>
    </ui-modal>
  `,
})
export class EscritorioProdutor implements OnInit {
  private readonly api = inject(VinculosApi);
  private readonly toast = inject(ToastService);
  private readonly notificacoes = inject(NotificacoesService);
  private readonly router = inject(Router, { optional: true });
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Chegou pelo sino (`#escritorio`) e a seção ainda não foi mostrada. */
  private irParaSecao = false;

  readonly convites = signal<ConviteRecebido[]>([]);
  readonly vinculos = signal<VinculoDoProdutor[]>([]);
  readonly carregou = signal(false);
  readonly respondendo = signal<string | null>(null);
  readonly encerrando = signal<VinculoDoProdutor | null>(null);
  readonly encerrandoAgora = signal(false);

  /** Encerrado é histórico: não há o que fazer com ele aqui. */
  readonly vinculosAtuais = computed(() =>
    this.vinculos().filter((v) => v.situacao !== 'ENCERRADO'),
  );

  ngOnInit(): void {
    // Lê o fragmento agora e a cada navegação terminada. Não basta observar o fragmento da rota:
    // clicar no sino já estando em `/configuracoes#escritorio` não o muda, e a tela não iria até
    // a seção. O sino navega com `onSameUrlNavigation: 'reload'`, que gera o `NavigationEnd`.
    const router = this.router;
    if (router) {
      const pedeSecao = () => router.parseUrl(router.url).fragment === 'escritorio';
      if (pedeSecao()) this.irParaSecao = true;
      router.events
        .pipe(
          filter((e) => e instanceof NavigationEnd),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe(() => {
          if (!pedeSecao()) return;
          this.irParaSecao = true;
          if (this.carregou()) this.mostrarSecao();
        });
    }
    this.carregar();
  }

  /**
   * Rola até a seção e põe o foco no título (#156). Espera o vínculo carregar: antes disso a seção
   * ainda não tem altura, e a rolagem pararia num lugar que muda logo depois.
   */
  private mostrarSecao(): void {
    if (!this.irParaSecao) return;
    this.irParaSecao = false;
    setTimeout(() => {
      const secao = this.host.nativeElement.querySelector<HTMLElement>('#escritorio');
      secao?.scrollIntoView({ block: 'start' });
      secao?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
    });
  }

  private carregar(): void {
    this.api.convites().subscribe({
      next: (lista) => this.convites.set(lista.filter((c) => c.situacao === 'PENDENTE')),
      error: () => this.convites.set([]),
    });
    this.api.listar().subscribe({
      next: (lista) => {
        this.vinculos.set(lista);
        this.carregou.set(true);
        this.mostrarSecao();
      },
      error: () => {
        this.carregou.set(true);
        this.mostrarSecao();
      },
    });
  }

  responder(convite: ConviteRecebido, resposta: 'aceitar' | 'recusar'): void {
    if (this.respondendo()) return;
    this.respondendo.set(`${convite.id}:${resposta}`);
    const chamada =
      resposta === 'aceitar'
        ? this.api.aceitarConvite(convite.id)
        : this.api.recusarConvite(convite.id);
    chamada.subscribe({
      next: () => {
        this.respondendo.set(null);
        this.toast.success(
          resposta === 'aceitar'
            ? `Pronto: ${convite.escritorio} agora atende você.`
            : `Convite de ${convite.escritorio} recusado.`,
        );
        this.carregar();
        // O sino mostrava este convite; respondido, ele sai de la tambem.
        this.notificacoes.carregar();
      },
      error: () => this.respondendo.set(null),
    });
  }

  encerrar(): void {
    const vinculo = this.encerrando();
    if (!vinculo || this.encerrandoAgora()) return;
    this.encerrandoAgora.set(true);
    this.api.encerrar(vinculo.id).subscribe({
      next: () => {
        this.encerrandoAgora.set(false);
        this.encerrando.set(null);
        this.toast.success(`Vínculo com ${vinculo.escritorio} encerrado.`);
        this.carregar();
      },
      error: () => this.encerrandoAgora.set(false),
    });
  }

  data(iso: string): string {
    return formatarData(iso);
  }
}
