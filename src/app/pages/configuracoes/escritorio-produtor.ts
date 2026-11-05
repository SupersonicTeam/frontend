import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { LucideBuilding2 } from '@lucide/angular';
import {
  VinculosApi,
  type ConviteRecebido,
  type VinculoDoProdutor,
} from '@services/vinculos/data-access/vinculos.service';
import { ToastService } from '@core/services/toast.service';
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
    <div class="flex flex-col gap-3 rounded-card border border-border bg-card p-5 shadow-suave">
      <h2 class="flex items-center gap-2 font-heading text-lg font-semibold text-foreground">
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
    this.carregar();
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
      },
      error: () => this.carregou.set(true),
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
