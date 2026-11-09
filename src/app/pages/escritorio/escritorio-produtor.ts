import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  LucideBuilding2,
  LucideClipboardList,
  LucideEye,
  LucideHistory,
  LucideMail,
  LucideTriangleAlert,
} from '@lucide/angular';
import {
  VinculosApi,
  type ConviteRecebido,
  type VinculoDoProdutor,
} from '@services/vinculos/data-access/vinculos.service';
import { PendenciasApi } from '@services/pendencias/data-access/pendencias.service';
import type { Pendencia } from '@models/pendencia.model';
import { ToastService } from '@core/services/toast.service';
import { NotificacoesService } from '@core/services/notificacoes.service';
import { formatarData } from '@core/utils/periodo';
import { MOTIVO_ENCERRAMENTO_MAXIMO } from '@core/utils/encerramento-vinculo';
import { UiButton } from '@shared/ui/ui-button';
import { UiModal } from '@shared/ui/ui-modal';
import { UiEmptyState } from '@shared/ui/ui-empty-state';
import { UiSkeleton } from '@shared/ui/ui-skeleton';

/** Quantos pedidos do escritório a aba mostra; o resto fica em Minhas notas. */
const PEDIDOS_NA_ABA = 3;

/**
 * O escritório de contabilidade do **produtor**: convites, quem o atende, o que o escritório vê e o
 * que ele pediu. Mora na aba "Meu escritório" (`/escritorio`); até então era uma seção de
 * Configurações (#147), onde ficava escondido no meio de aparência, senha e privacidade.
 *
 * **Erro não vira estado vazio** (#107): se `/api/vinculos` falha, a tela diz que não carregou, em
 * vez de afirmar que nenhum escritório atende a pessoa.
 *
 * **Histórico (#166, backend#353):** a aba pede também os vínculos `ENCERRADO` e os lista abaixo,
 * com o período, quem encerrou e o motivo (#173, backend#402). `encerradoPor` nulo quer dizer **não
 * registrado** (encerrado antes de o backend guardar isso), e a tela diz exatamente isso, em vez de
 * supor que foi o produtor.
 *
 * Erros das chamadas passam pelo toast global do `apiInterceptor`, que já mostra a mensagem do
 * servidor.
 */
@Component({
  selector: 'app-escritorio-produtor',
  standalone: true,
  imports: [
    RouterLink,
    LucideBuilding2,
    LucideClipboardList,
    LucideEye,
    LucideHistory,
    LucideMail,
    LucideTriangleAlert,
    UiButton,
    UiModal,
    UiEmptyState,
    UiSkeleton,
  ],
  template: `
    <div class="flex flex-col gap-4">
      @for (c of convites(); track c.id) {
        <section
          class="rounded-card border border-info-borda bg-info-soft p-5 shadow-suave"
          [attr.aria-label]="'Convite de ' + c.escritorio"
        >
          <h2 class="flex items-center gap-2 font-heading text-lg font-semibold text-info-ink">
            <svg lucideMail [size]="18" aria-hidden="true" />
            Convite de {{ c.escritorio }}
          </h2>
          <p class="mt-2 text-apoio text-info-ink">
            <strong>{{ c.escritorio }}</strong> convidou você para ser cliente do escritório{{
              c.convidadoPor
                ? ' (convite de ' + c.convidadoPor + (c.crc ? ', CRC ' + c.crc : '') + ')'
                : ''
            }}. Aceitando, o escritório passa a ver as suas notas, guias e documentos. O convite
            vale até {{ data(c.expiraEm) }}.
          </p>
          <div class="mt-3 flex flex-wrap gap-2">
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
        </section>
      }

      @if (encerradoAgora(); as e) {
        <p
          role="status"
          class="rounded-card border border-border bg-card p-5 text-apoio text-muted-foreground shadow-suave"
        >
          Você encerrou o vínculo com <strong class="text-foreground">{{ e.escritorio }}</strong> em
          {{ data(e.quando) }}. O escritório não vê mais as suas notas, guias e documentos. Para
          voltar a ser atendido por ele, peça um convite novo.
        </p>
      }

      @if (!carregou()) {
        <ui-skeleton [linhas]="2" formato="bloco" altura="5rem" />
      } @else if (erro()) {
        <div
          class="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-card p-5 text-apoio text-muted-foreground shadow-suave"
        >
          <span>Não foi possível carregar o seu escritório de contabilidade.</span>
          <ui-button variant="ghost" (click)="carregar()">Tentar de novo</ui-button>
        </div>
      } @else {
        @for (v of vinculosAtuais(); track v.id) {
          <section
            class="flex flex-col gap-4 rounded-card border border-border bg-card p-5 shadow-suave"
          >
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <h2
                  class="flex items-center gap-2 font-heading text-lg font-semibold text-foreground"
                >
                  <svg lucideBuilding2 [size]="18" class="text-primary" aria-hidden="true" />
                  {{ v.escritorio }}
                </h2>
                <dl class="mt-2 grid gap-x-6 gap-y-1 text-apoio sm:grid-cols-2">
                  <div>
                    <dt class="inline text-muted-foreground">Atende você desde</dt>
                    <dd class="ml-1 inline text-foreground">{{ data(v.inicio) }}</dd>
                  </div>
                  @if (v.responsavel) {
                    <div>
                      <dt class="inline text-muted-foreground">Responsável:</dt>
                      <dd class="ml-1 inline text-foreground">{{ v.responsavel }}</dd>
                    </div>
                  }
                  @if (v.crc) {
                    <div>
                      <dt class="inline text-muted-foreground">CRC:</dt>
                      <dd class="ml-1 inline text-foreground">{{ v.crc }}</dd>
                    </div>
                  }
                </dl>
              </div>
              <ui-button variant="ghost" (click)="pedirEncerramento(v)">Encerrar vínculo</ui-button>
            </div>

            @if (v.situacao === 'SUSPENSO') {
              <p
                class="flex gap-2 rounded-controle border border-aviso-borda bg-aviso-soft p-3 text-apoio text-aviso-ink"
              >
                <svg lucideTriangleAlert [size]="18" class="mt-0.5 shrink-0" aria-hidden="true" />
                O escritório suspendeu o atendimento. Enquanto estiver suspenso, ele não acessa as
                suas notas, guias e documentos. Quem reativa é o próprio escritório.
              </p>
            } @else {
              <div>
                <h3 class="flex items-center gap-2 text-apoio font-semibold text-foreground">
                  <svg lucideEye [size]="16" class="text-primary" aria-hidden="true" />
                  O que o escritório vê
                </h3>
                <p class="mt-1 text-apoio text-muted-foreground">
                  As suas notas fiscais, as guias de imposto e os documentos que você enviar. Ele
                  confere as notas antes da emissão e pode pedir documentos. Você pode encerrar o
                  vínculo quando quiser; para voltar, só com um convite novo.
                </p>
              </div>
            }
          </section>
        }

        @if (temAtivo()) {
          <section class="rounded-card border border-border bg-card p-5 shadow-suave">
            <h2 class="flex items-center gap-2 font-heading text-lg font-semibold text-foreground">
              <svg lucideClipboardList [size]="18" class="text-primary" aria-hidden="true" />
              O que o escritório pediu
            </h2>
            @if (erroPedidos()) {
              <div class="mt-2 flex flex-wrap items-center justify-between gap-3 text-apoio">
                <span class="text-muted-foreground">Não foi possível carregar os pedidos.</span>
                <ui-button variant="ghost" (click)="carregarPedidos()">Tentar de novo</ui-button>
              </div>
            } @else if (pedidos() === null) {
              <ui-skeleton class="mt-3 block" [linhas]="2" />
            } @else if (pedidos()!.length === 0) {
              <p class="mt-2 text-apoio text-muted-foreground">
                Nenhum pedido de documento esperando você.
              </p>
            } @else {
              <ul class="mt-2 divide-y divide-border">
                @for (p of pedidosNaAba(); track p.id) {
                  <li class="flex flex-wrap items-baseline justify-between gap-2 py-2 text-apoio">
                    <span class="font-medium text-foreground">{{ p.titulo }}</span>
                    <span class="text-muted-foreground">
                      {{ p.dataLimite ? 'até ' + data(p.dataLimite) : 'sem prazo' }}
                    </span>
                  </li>
                }
              </ul>
              <p class="mt-2 text-apoio text-muted-foreground">
                {{
                  pedidos()!.length > pedidosNaAba().length
                    ? 'E mais ' + (pedidos()!.length - pedidosNaAba().length) + '. '
                    : ''
                }}Você vê e envia os documentos em
                <a
                  routerLink="/documentos"
                  class="tap-target inline-flex items-center font-medium text-primary underline"
                  >Minhas notas</a
                >.
              </p>
            }
          </section>
        }

        @if (erroConvites()) {
          <div
            class="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-card p-5 text-apoio text-muted-foreground shadow-suave"
          >
            <span>Não foi possível carregar os convites de escritório.</span>
            <ui-button variant="ghost" (click)="carregar()">Tentar de novo</ui-button>
          </div>
        } @else if (!vinculosAtuais().length && !convites().length) {
          <ui-empty-state
            titulo="Nenhum escritório atende você agora"
            descricao="Quando um escritório de contabilidade quiser atender você, ele manda um convite para o e-mail desta conta. O convite aparece aqui e no sino; aceitando, o escritório passa a ver as suas notas, guias e documentos."
          >
            <svg icone lucideBuilding2 [size]="28" class="text-primary" aria-hidden="true" />
          </ui-empty-state>
        }

        @if (historico().length) {
          <!-- Quem ja atendeu (#166), quem encerrou e por que (#173). -->
          <section class="rounded-card border border-border bg-card p-5 shadow-suave">
            <h2 class="flex items-center gap-2 font-heading text-lg font-semibold text-foreground">
              <svg lucideHistory [size]="18" class="text-primary" aria-hidden="true" />
              Escritórios que já atenderam você
            </h2>
            <ul class="mt-2 divide-y divide-border">
              @for (v of historico(); track v.id) {
                <li class="py-2 text-apoio">
                  <div class="flex flex-wrap items-baseline justify-between gap-2">
                    <span class="font-medium text-foreground">{{ v.escritorio }}</span>
                    <span class="text-muted-foreground">
                      de {{ data(v.inicio) }} a {{ v.fim ? data(v.fim) : '—' }}
                    </span>
                  </div>
                  <p class="text-muted-foreground">
                    {{ quemEncerrou(v) }}
                    @if (v.motivoEncerramento) {
                      — “{{ v.motivoEncerramento }}”
                    }
                  </p>
                </li>
              }
            </ul>
            <p class="mt-2 text-apoio text-muted-foreground">
              Um vínculo encerrado não volta: para ser atendido de novo por um destes escritórios,
              peça um convite novo.
            </p>
          </section>
        }
      }
    </div>

    <ui-modal
      [aberto]="encerrando() !== null"
      [titulo]="'Encerrar o vínculo com ' + (encerrando()?.escritorio ?? '') + '?'"
      descricao="O escritório perde o acesso às suas notas, guias e documentos na hora. Isto não se desfaz: para voltar a ser atendido por ele, é preciso um convite novo."
      tamanho="sm"
      [travado]="encerrandoAgora()"
      (fechar)="encerrando.set(null)"
    >
      <label for="motivo-encerramento" class="mb-1.5 block text-apoio font-medium text-foreground">
        Motivo <span class="font-normal text-muted-foreground">(opcional)</span>
      </label>
      <textarea
        id="motivo-encerramento"
        rows="3"
        [attr.maxlength]="motivoMaximo"
        class="w-full rounded-controle border border-border bg-card px-3 py-2 text-apoio text-foreground"
        [value]="motivo()"
        (input)="motivo.set($any($event.target).value)"
      ></textarea>
      <p class="mt-1 text-apoio text-muted-foreground">
        O escritório vê o motivo. Até {{ motivoMaximo }} caracteres.
      </p>

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
  private readonly pendenciasApi = inject(PendenciasApi);
  private readonly toast = inject(ToastService);
  private readonly notificacoes = inject(NotificacoesService);

  readonly convites = signal<ConviteRecebido[]>([]);
  readonly vinculos = signal<VinculoDoProdutor[]>([]);
  readonly carregou = signal(false);
  /** `/api/vinculos` falhou: a tela diz isso, em vez de afirmar que não há escritório (#107). */
  readonly erro = signal(false);
  /** `/api/convites` falhou: sem isso a tela afirmaria que não há convite nenhum. */
  readonly erroConvites = signal(false);
  /** Pedidos de documento ainda sem envio; `null` enquanto carregam. */
  readonly pedidos = signal<Pendencia[] | null>(null);
  /** `/api/pendencias` falhou: a seção diz isso, em vez de "nenhum pedido esperando". */
  readonly erroPedidos = signal(false);
  readonly respondendo = signal<string | null>(null);
  readonly encerrando = signal<VinculoDoProdutor | null>(null);
  readonly encerrandoAgora = signal(false);
  /** O motivo opcional do encerramento (#173); o escritório o vê. */
  readonly motivo = signal('');
  protected readonly motivoMaximo = MOTIVO_ENCERRAMENTO_MAXIMO;
  /**
   * O vínculo que a pessoa acabou de encerrar aqui. É o único caso em que a tela sabe quem encerrou
   * (foi ela), então é o único que diz "Você encerrou"; no histórico ele aparece sem autor.
   */
  readonly encerradoAgora = signal<{ escritorio: string; quando: string } | null>(null);

  /** Os que estão valendo: ativos e suspensos. */
  readonly vinculosAtuais = computed(() =>
    this.vinculos().filter((v) => v.situacao !== 'ENCERRADO'),
  );
  /** Os encerrados, na ordem do servidor: do que terminou por último ao que terminou primeiro. */
  readonly historico = computed(() => this.vinculos().filter((v) => v.situacao === 'ENCERRADO'));
  /** Só um escritório ativo pede documento; suspenso não acessa nada. */
  readonly temAtivo = computed(() => this.vinculos().some((v) => v.situacao === 'ATIVO'));
  readonly pedidosNaAba = computed(() => (this.pedidos() ?? []).slice(0, PEDIDOS_NA_ABA));

  ngOnInit(): void {
    this.carregar();
  }

  carregar(): void {
    // Voltando de um erro, o esqueleto volta também: sem isto a aba saía do erro direto para
    // "nenhum escritório atende você" enquanto a resposta ainda não tinha chegado.
    if (this.erro()) this.carregou.set(false);
    this.erro.set(false);
    this.erroConvites.set(false);
    this.api.convites().subscribe({
      next: (lista) => this.convites.set(lista.filter((c) => c.situacao === 'PENDENTE')),
      error: () => {
        this.convites.set([]);
        this.erroConvites.set(true);
      },
    });
    this.api.listar(['ATIVO', 'SUSPENSO', 'ENCERRADO']).subscribe({
      next: (lista) => {
        this.vinculos.set(lista);
        this.carregou.set(true);
        if (this.temAtivo()) this.carregarPedidos();
      },
      error: () => {
        this.erro.set(true);
        this.carregou.set(true);
      },
    });
  }

  carregarPedidos(): void {
    this.pedidos.set(null);
    this.erroPedidos.set(false);
    this.pendenciasApi.listar(['PENDENTE']).subscribe({
      next: (lista) => this.pedidos.set(lista),
      // Sem os pedidos o resto da aba continua útil, mas a seção não pode dizer "nenhum pedido".
      error: () => this.erroPedidos.set(true),
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
        this.encerradoAgora.set(null);
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

  pedirEncerramento(vinculo: VinculoDoProdutor): void {
    this.motivo.set('');
    this.encerrando.set(vinculo);
  }

  encerrar(): void {
    const vinculo = this.encerrando();
    if (!vinculo || this.encerrandoAgora()) return;
    this.encerrandoAgora.set(true);
    this.api.encerrar(vinculo.id, this.motivo()).subscribe({
      next: () => {
        this.encerrandoAgora.set(false);
        this.encerrando.set(null);
        this.encerradoAgora.set({
          escritorio: vinculo.escritorio,
          quando: new Date().toISOString(),
        });
        this.toast.success(`Vínculo com ${vinculo.escritorio} encerrado.`);
        this.carregar();
      },
      error: () => this.encerrandoAgora.set(false),
    });
  }

  /** Quem encerrou, sem supor: `null` é "não registrado", não "foi você" (#173, backend#402). */
  quemEncerrou(vinculo: VinculoDoProdutor): string {
    if (vinculo.encerradoPor === 'PRODUTOR') return 'Encerrado por você';
    if (vinculo.encerradoPor === 'ESCRITORIO') return 'Encerrado pelo escritório';
    return 'Encerramento não registrado';
  }

  data(iso: string): string {
    return formatarData(iso);
  }
}
