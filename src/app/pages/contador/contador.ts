import { Component, OnInit, computed, inject, signal } from '@angular/core';
import {
  LucideCalculator,
  LucideCheck,
  LucideDownload,
  LucideFileText,
  LucidePlus,
  LucideTriangleAlert,
} from '@lucide/angular';
import { RouterLink } from '@angular/router';
import { LOGGED_PRODUCER_ID } from '@core/config/produtor-logado';
import { filenameDeContentDisposition, salvarBlob } from '@core/utils/download';
import { ToastService } from '@core/services/toast.service';
import type { GuiaFiscal, TipoGuia } from '@models/solicitacao-contador.model';
import type { NotaFiscal } from '@models/nota-fiscal.model';
import { ContadorApi } from '@services/contador/data-access/contador.service';
import { DashboardApi } from '@services/dashboard/data-access/dashboard.service';
import { NotasApi } from '@services/notas/data-access/notas.service';
import { TributarioApi } from '@services/tributario/data-access/tributario.service';
import { UiBadgeStatus } from '@shared/ui/ui-badge-status';
import { UiButton } from '@shared/ui/ui-button';
import { UiEmptyState } from '@shared/ui/ui-empty-state';
import { UiModal } from '@shared/ui/ui-modal';
import { UiSkeleton } from '@shared/ui/ui-skeleton';
import { UiStat } from '@shared/ui/ui-stat';
import { UiTable } from '@shared/ui/ui-table';

const TIPOS_GUIA: TipoGuia[] = ['ICMS', 'FUNRURAL', 'DARF', 'GPS', 'OUTRO'];

/**
 * Acompanhamento do contador (#50).
 *
 * **O que mudou e por quê.** A versão anterior tinha 703 linhas e seis abas
 * (contatos, solicitações, recebidos, rascunhos, concluídos, documentos), quase
 * todas alimentadas por dados de exemplo: o backend não tem `ContadorController`,
 * e o service devolvia fixtures quando a chamada falhava. A tela avisava "prévia
 * com dados de exemplo", mas na prática mostrava solicitações inventadas como se
 * fossem do produtor.
 *
 * Esta versão fica só com o que existe de verdade:
 *
 * - **guias fiscais** — `GET/POST /contador/guias` e `PATCH /contador/guias/{id}/pagar`;
 * - **relatório de conformidade** — `GET /relatorios/conformidade` e o PDF;
 * - **notas que exigem atenção** — derivadas de `GET /notas`.
 *
 * Solicitações, documentos anexados e o checklist saíram da tela e viraram
 * pendência do backend. É preferível uma tela menor e verdadeira a uma tela
 * cheia que engana o contador.
 *
 * A densidade aqui é de desktop, ao contrário do dashboard do produtor: o
 * contador trabalha em tela grande e com muitos registros de uma vez.
 */
@Component({
  selector: 'app-contador',
  standalone: true,
  imports: [
    LucideCalculator,
    LucideCheck,
    LucideDownload,
    LucideFileText,
    LucidePlus,
    LucideTriangleAlert,
    RouterLink,
    UiBadgeStatus,
    UiButton,
    UiEmptyState,
    UiModal,
    UiSkeleton,
    UiStat,
    UiTable,
  ],
  templateUrl: './contador.html',
})
export class ContadorPage implements OnInit {
  private readonly contadorApi = inject(ContadorApi);
  private readonly dashboardApi = inject(DashboardApi);
  private readonly notasApi = inject(NotasApi);
  private readonly tributarioApi = inject(TributarioApi);
  private readonly toast = inject(ToastService);

  readonly carregandoGuias = signal(false);
  readonly guias = signal<GuiaFiscal[]>([]);
  readonly notasComProblema = signal<NotaFiscal[]>([]);
  readonly baixandoRelatorio = signal(false);

  /** Nome do produtor vem do payload real do dashboard, não de constante no código. */
  readonly produtorNome = computed(() => this.dashboardApi.dashboard()?.produtor.nome ?? 'Produtor');

  readonly guiasPendentes = computed(() => this.guias().filter((g) => g.status !== 'pago'));
  readonly totalAPagar = computed(() =>
    this.guiasPendentes().reduce((soma, g) => soma + (g.valor ?? 0), 0),
  );
  readonly guiasVencidas = computed(() => this.guias().filter((g) => g.status === 'vencido'));

  // ── Nova guia ──
  readonly tiposGuia = TIPOS_GUIA;
  readonly showNovaGuia = signal(false);
  readonly salvandoGuia = signal(false);
  readonly formTipo = signal<TipoGuia>('ICMS');
  readonly formVencimento = signal('');
  readonly formValor = signal('');
  readonly formObs = signal('');

  readonly formValido = computed(
    () => !!this.formVencimento() && Number(this.formValor()) > 0,
  );

  readonly periodoAtual = new Date().toISOString().slice(0, 7);

  ngOnInit(): void {
    this.carregarGuias();
    this.dashboardApi.carregar().subscribe({ error: () => undefined });
    this.notasApi.listar({ size: 50, sort: 'dataEmissao,desc' }).subscribe({
      next: (pagina) =>
        this.notasComProblema.set(
          pagina.content.filter(
            (n) => n.status === 'COM_INCONSISTENCIAS' || n.status === 'REJEITADA',
          ),
        ),
      error: () => this.notasComProblema.set([]),
    });
  }

  carregarGuias(): void {
    this.carregandoGuias.set(true);
    this.contadorApi.getGuias(LOGGED_PRODUCER_ID).subscribe({
      next: (lista) => {
        this.guias.set(lista);
        this.carregandoGuias.set(false);
      },
      error: () => {
        this.guias.set([]);
        this.carregandoGuias.set(false);
      },
    });
  }

  abrirNovaGuia(): void {
    this.formTipo.set('ICMS');
    this.formVencimento.set('');
    this.formValor.set('');
    this.formObs.set('');
    this.showNovaGuia.set(true);
  }

  salvarGuia(): void {
    if (!this.formValido()) return;
    this.salvandoGuia.set(true);
    this.contadorApi
      .anexarGuia({
        produtorId: LOGGED_PRODUCER_ID,
        tipoGuia: this.formTipo(),
        dataVencimento: this.formVencimento(),
        valor: Number(this.formValor()),
        observacoes: this.formObs().trim() || undefined,
      })
      .subscribe({
        next: (guia) => {
          this.salvandoGuia.set(false);
          if (!guia) {
            this.toast.error('Não foi possível criar a guia. Tente novamente.');
            return;
          }
          this.showNovaGuia.set(false);
          this.toast.success('Guia criada.');
          this.carregarGuias();
        },
        error: () => {
          this.salvandoGuia.set(false);
          this.toast.error('Não foi possível criar a guia. Tente novamente.');
        },
      });
  }

  marcarPaga(guia: GuiaFiscal): void {
    this.contadorApi.marcarGuiaPaga(guia.id).subscribe({
      next: () => {
        this.toast.success(`Guia de ${guia.tipoGuia} marcada como paga.`);
        this.carregarGuias();
      },
      error: () => this.toast.error('Não foi possível marcar a guia como paga.'),
    });
  }

  baixarRelatorio(): void {
    this.baixandoRelatorio.set(true);
    this.tributarioApi.relatorioConformidadePdf(this.periodoAtual).subscribe({
      next: (resposta) => {
        this.baixandoRelatorio.set(false);
        const nome = filenameDeContentDisposition(
          resposta.headers.get('Content-Disposition'),
          `conformidade-${this.periodoAtual}.pdf`,
        );
        if (resposta.body) salvarBlob(resposta.body, nome);
      },
      error: () => {
        this.baixandoRelatorio.set(false);
        this.toast.error('Não foi possível baixar o relatório.');
      },
    });
  }

  /** Guia nao e NF-e: tem status proprio (pendente/pago/vencido), sobre os mesmos tokens. */
  rotuloStatusGuia(status: GuiaFiscal['status']): string {
    return { pendente: 'Em aberto', pago: 'Paga', vencido: 'Vencida' }[status] ?? status;
  }

  classeStatusGuia(status: GuiaFiscal['status']): string {
    const tons: Record<GuiaFiscal['status'], string> = {
      pendente: 'bg-aviso-soft text-aviso-ink border-aviso/30',
      pago: 'bg-sucesso-soft text-sucesso-ink border-sucesso/30',
      vencido: 'bg-perigo-soft text-perigo-ink border-perigo/30',
    };
    return `inline-flex items-center rounded-full border px-2.5 py-1 text-apoio font-medium ${tons[status]}`;
  }

  formatCurrency(valor: number): string {
    return (valor ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  formatDate(iso?: string): string {
    if (!iso) return '—';
    return new Date(iso.split('T')[0] + 'T12:00:00').toLocaleDateString('pt-BR');
  }
}
