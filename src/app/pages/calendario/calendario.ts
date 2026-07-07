import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  LucideCalendar,
  LucideChevronLeft,
  LucideChevronRight,
  LucideCheck,
  LucideMessageCircle,
  LucideLoaderCircle,
  LucideCoins,
  LucideClipboardList,
  LucideFileText,
  LucideMail,
  LucideRefreshCw,
} from '@lucide/angular';
import { forkJoin } from 'rxjs';
import { CalendarioApi } from '@services/calendario/data-access/calendario.service';
import { ContadorApi } from '@services/contador/data-access/contador.service';
import { NotificacaoApi } from '@services/notificacao/data-access/notificacao.service';
import { ToastService } from '@core/services/toast.service';
import { VencimentoFiscal } from '@models/vencimento-fiscal.model';
import { SolicitacaoContador } from '@models/solicitacao-contador.model';
import { LOGGED_PRODUCER_ID } from '@core/config/produtor-logado';

@Component({
  selector: 'app-calendario',
  standalone: true,
  imports: [
    RouterLink,
    LucideCalendar,
    LucideChevronLeft,
    LucideChevronRight,
    LucideCheck,
    LucideMessageCircle,
    LucideLoaderCircle,
    LucideCoins,
    LucideClipboardList,
    LucideFileText,
    LucideMail,
    LucideRefreshCw,
  ],
  templateUrl: './calendario.html',
})
export class CalendarioPage implements OnInit {
  private readonly calendarioService = inject(CalendarioApi);
  private readonly contadorService = inject(ContadorApi);
  private readonly notificacaoService = inject(NotificacaoApi);
  private readonly toastService = inject(ToastService);

  vencimentos = signal<VencimentoFiscal[]>([]);
  loading = signal(false);
  vencimentosErro = signal(false);
  enviandoNotificacao = signal(false);
  dataSelecionada = signal(new Date());
  mesAtual = signal(new Date());

  readonly diasDoMes = computed(() => this.buildCalendar(this.mesAtual()));
  readonly diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  // Vencimentos filtrados por mês
  readonly vencimentosDoMes = computed(() => {
    const mes = this.mesAtual();
    return this.vencimentos().filter((v) => {
      const d = new Date(v.dataVencimento + 'T12:00:00');
      return d.getFullYear() === mes.getFullYear() && d.getMonth() === mes.getMonth();
    });
  });

  // Vencimentos do dia selecionado, separados por tipo de grupo
  readonly vencimentosDia = computed(() => {
    const sel = this.dataSelecionada();
    return this.vencimentos().filter((v) => {
      const d = new Date(v.dataVencimento + 'T12:00:00');
      return (
        d.getFullYear() === sel.getFullYear() &&
        d.getMonth() === sel.getMonth() &&
        d.getDate() === sel.getDate()
      );
    });
  });

  readonly impostosHoje = computed(() => this.vencimentosDia().filter((v) => v.tipo === 'imposto'));
  readonly obrigacoesHoje = computed(() =>
    this.vencimentosDia().filter((v) => v.tipo === 'obrigacao' || v.tipo === 'declaracao'),
  );
  readonly solicitacoesHoje = computed(() =>
    this.vencimentosDia().filter((v) => v.tipo === 'solicitacao'),
  );

  // Contagem de eventos por dia para indicadores
  readonly eventosPorDia = computed(() => {
    const mapa: Record<number, { imposto: boolean; obrigacao: boolean; solicitacao: boolean }> = {};
    const mes = this.mesAtual();
    this.vencimentos().forEach((v) => {
      const d = new Date(v.dataVencimento + 'T12:00:00');
      if (d.getFullYear() === mes.getFullYear() && d.getMonth() === mes.getMonth()) {
        const dia = d.getDate();
        if (!mapa[dia]) mapa[dia] = { imposto: false, obrigacao: false, solicitacao: false };
        if (v.tipo === 'imposto') mapa[dia].imposto = true;
        else if (v.tipo === 'solicitacao') mapa[dia].solicitacao = true;
        else mapa[dia].obrigacao = true;
      }
    });
    return mapa;
  });

  ngOnInit(): void {
    this.carregar();
  }

  /**
   * Busca vencimentos fiscais E solicitações do contador, mesclando no calendário.
   * Em falha (ex.: backend offline) exibe o banner de erro com "Tentar novamente"
   * (`vencimentosErro`), sem dados mockados.
   */
  carregar(): void {
    this.loading.set(true);
    this.vencimentosErro.set(false);
    forkJoin({
      vencimentos: this.calendarioService.getVencimentos(LOGGED_PRODUCER_ID),
      pendencias: this.contadorService.getPendencias(LOGGED_PRODUCER_ID),
    }).subscribe({
      next: ({ vencimentos, pendencias }) => {
        const solicitacoes = this.mapPendenciasParaEventos(pendencias);
        this.vencimentos.set([...vencimentos, ...solicitacoes]);
        this.vencimentosErro.set(false);
        this.loading.set(false);
      },
      error: () => {
        this.vencimentos.set([]);
        this.vencimentosErro.set(true);
        this.loading.set(false);
      },
    });
  }

  retry(): void {
    this.carregar();
  }

  // Converte solicitações do contador (com prazo) em eventos do calendário
  private mapPendenciasParaEventos(pendencias: SolicitacaoContador[]): VencimentoFiscal[] {
    return pendencias
      .filter(
        (p) =>
          (p.status === 'pendente' || p.status === 'enviado' || p.status === 'rejeitado') && p.prazo,
      )
      .map((p) => ({
        id: 'sol-' + p.id,
        titulo: p.titulo,
        descricao: p.descricao,
        dataVencimento: (p.prazo || '').split('T')[0],
        tipo: 'solicitacao' as const,
        status: 'pendente' as const,
        prioridade: p.prioridade,
      }));
  }

  mesAnterior(): void {
    const d = new Date(this.mesAtual());
    d.setMonth(d.getMonth() - 1);
    this.mesAtual.set(d);
  }

  proximoMes(): void {
    const d = new Date(this.mesAtual());
    d.setMonth(d.getMonth() + 1);
    this.mesAtual.set(d);
  }

  selecionarDia(dia: number): void {
    const d = new Date(this.mesAtual());
    d.setDate(dia);
    this.dataSelecionada.set(d);
  }

  ehHoje(dia: number): boolean {
    const hoje = new Date();
    const mes = this.mesAtual();
    return (
      hoje.getFullYear() === mes.getFullYear() &&
      hoje.getMonth() === mes.getMonth() &&
      hoje.getDate() === dia
    );
  }

  ehSelecionado(dia: number): boolean {
    const sel = this.dataSelecionada();
    const mes = this.mesAtual();
    return (
      sel.getFullYear() === mes.getFullYear() &&
      sel.getMonth() === mes.getMonth() &&
      sel.getDate() === dia
    );
  }

  handleNotificarWhatsApp(): void {
    this.enviandoNotificacao.set(true);
    this.notificacaoService.notificarProximasObrigacoes(LOGGED_PRODUCER_ID).subscribe({
      next: (res) => {
        this.enviandoNotificacao.set(false);
        if (res.enviados > 0) {
          this.toastService.success(`✅ ${res.enviados} notificação(ões) enviada(s) via WhatsApp!`);
        } else {
          this.toastService.info('Nenhuma obrigação pendente para notificar.');
        }
      },
      error: () => {
        this.enviandoNotificacao.set(false);
        this.toastService.error('Erro ao enviar notificações.');
      },
    });
  }

  nomeMes(): string {
    return this.mesAtual().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }

  nomeDiaSelecionado(): string {
    return this.dataSelecionada().toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
    });
  }

  formatDate(iso: string): string {
    return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
    });
  }

  formatCurrency(value?: number): string {
    if (!value) return '';
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  tipoIconClass(tipo: string): string {
    return (
      {
        imposto: 'bg-amber-50 text-amber-600',
        obrigacao: 'bg-blue-50 text-blue-600',
        declaracao: 'bg-violet-50 text-violet-600',
        solicitacao: 'bg-orange-50 text-orange-600',
      }[tipo] ?? 'bg-muted text-muted-foreground'
    );
  }

  prioridadeColor(p?: string): string {
    return (
      {
        urgente: 'text-red-600 font-semibold',
        alta: 'text-orange-600',
        media: 'text-yellow-600',
        baixa: 'text-green-600',
      }[p ?? ''] ?? 'text-muted-foreground'
    );
  }

  statusColor(status: string): string {
    return status === 'pago'
      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
      : status === 'vencido'
        ? 'bg-red-100 text-red-800 border border-red-200'
        : 'bg-yellow-100 text-yellow-800 border border-yellow-200';
  }

  statusLabel(status: string): string {
    return { pago: 'Pago', vencido: 'Vencido', pendente: 'Pendente' }[status] ?? status;
  }

  diaClass(dia: number): string {
    if (this.ehSelecionado(dia)) return 'bg-primary text-primary-foreground font-semibold';
    if (this.ehHoje(dia)) return 'bg-muted font-bold ring-2 ring-primary/40 text-foreground';
    return 'hover:bg-muted text-foreground';
  }

  dotColor(dia: number, tipo: 'imposto' | 'obrigacao' | 'solicitacao'): string {
    const eventos = this.eventosPorDia()[dia];
    if (!eventos) return '';
    const selected = this.ehSelecionado(dia);
    if (tipo === 'imposto' && eventos.imposto) return selected ? 'bg-primary-foreground' : 'bg-amber-500';
    if (tipo === 'obrigacao' && eventos.obrigacao)
      return selected ? 'bg-primary-foreground' : 'bg-blue-500';
    if (tipo === 'solicitacao' && eventos.solicitacao)
      return selected ? 'bg-primary-foreground' : 'bg-orange-500';
    return '';
  }

  temEvento(dia: number): boolean {
    const e = this.eventosPorDia()[dia];
    return !!e && (e.imposto || e.obrigacao || e.solicitacao);
  }

  private buildCalendar(mes: Date): (number | null)[] {
    const primeiroDia = new Date(mes.getFullYear(), mes.getMonth(), 1).getDay();
    const ultimoDia = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate();
    const dias: (number | null)[] = [];
    for (let i = 0; i < primeiroDia; i++) dias.push(null);
    for (let d = 1; d <= ultimoDia; d++) dias.push(d);
    return dias;
  }
}
