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

  /**
   * Vencimentos já buscados, **por mês** (`AAAA-MM`). A janela é do servidor: cada mês visitado
   * vira uma busca, e o que já veio fica guardado para voltar ao mês não custar outra requisição.
   */
  private readonly vencimentosPorMes = signal<Record<string, VencimentoFiscal[]>>({});
  private readonly vencimentosContador = signal<VencimentoFiscal[]>([]);

  private readonly vencimentosReais = computed(() =>
    Object.values(this.vencimentosPorMes()).flat(),
  );

  // As duas fontes carregam desacopladas: uma falha isolada em `/calendario-fiscal` não esconde
  // as solicitações do contador, e vice-versa (ver design.md: "Resiliência do calendário").
  readonly vencimentos = computed(() => [...this.vencimentosReais(), ...this.vencimentosContador()]);
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
   * Carrega o mês que está na tela e as solicitações do contador, desacoplados: uma falha em
   * `/calendario-fiscal` mostra o banner de erro sem esconder as solicitações, e vice-versa.
   */
  carregar(): void {
    this.carregarMes(this.chaveDoMes(this.mesAtual()), { recarregar: true });
    this.carregarVencimentosContador();
  }

  /**
   * Busca um mês no servidor, uma vez só.
   *
   * **A janela vai na query, não no filtro da tela.** Sem `de`/`ate` o backend devolve o mês
   * corrente ±12 meses — navegar para fora disso traria lista vazia, que na tela é idêntico a
   * "não há nada a pagar neste mês".
   */
  private carregarMes(chave: string, opcoes: { recarregar?: boolean } = {}): void {
    if (!opcoes.recarregar && this.vencimentosPorMes()[chave]) return;

    this.loading.set(true);
    this.vencimentosErro.set(false);

    this.calendarioService.getVencimentos(LOGGED_PRODUCER_ID, this.janelaDoMes(chave)).subscribe({
      next: (vencimentos) => {
        this.vencimentosPorMes.update((mapa) => ({ ...mapa, [chave]: vencimentos }));
        this.vencimentosErro.set(false);
        this.loading.set(false);
      },
      error: () => {
        this.vencimentosPorMes.update((mapa) => {
          const copia = { ...mapa };
          delete copia[chave];
          return copia;
        });
        this.vencimentosErro.set(true);
        this.loading.set(false);
      },
    });
  }

  /** `2026-10` → primeiro e último dia do mês, que é o que o endpoint espera. */
  private janelaDoMes(chave: string): { de: string; ate: string } {
    const [ano, mes] = chave.split('-').map(Number);
    const ultimoDia = new Date(ano, mes, 0).getDate();
    return { de: `${chave}-01`, ate: `${chave}-${String(ultimoDia).padStart(2, '0')}` };
  }

  private chaveDoMes(data: Date): string {
    return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
  }

  private carregarVencimentosContador(): void {
    this.contadorService.getPendencias(LOGGED_PRODUCER_ID).subscribe({
      next: (pendencias) => this.vencimentosContador.set(this.mapPendenciasParaEventos(pendencias)),
      error: () => this.vencimentosContador.set([]),
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
    this.irParaMes(-1);
  }

  proximoMes(): void {
    this.irParaMes(1);
  }

  /** Troca o mês e busca o que faltar — o servidor é quem recorta a janela. */
  private irParaMes(passo: number): void {
    const d = new Date(this.mesAtual());
    // Dia 1 antes de somar: em 31/03, `setMonth(-1)` cairia em 03/03 (fevereiro não tem 31).
    d.setDate(1);
    d.setMonth(d.getMonth() + passo);
    this.mesAtual.set(d);
    this.carregarMes(this.chaveDoMes(d));
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
          this.toastService.success(`${res.enviados} notificação(ões) enviada(s) via WhatsApp.`);
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

  /**
   * Cor por tipo, status e prioridade sai dos **tokens semânticos** (#45), não de `amber-50` e
   * companhia: as classes fixas do Tailwind não têm variante `dark:`, então no tema escuro o chip
   * ficava com fundo claro e texto claro. Os tokens já trocam de valor com o tema.
   */
  tipoIconClass(tipo: string): string {
    return (
      {
        imposto: 'bg-aviso-soft text-aviso-ink',
        obrigacao: 'bg-info-soft text-info-ink',
        declaracao: 'bg-assistente-soft text-assistente-ink',
        solicitacao: 'bg-accent/15 text-accent',
      }[tipo] ?? 'bg-muted text-muted-foreground'
    );
  }

  prioridadeColor(p?: string): string {
    return (
      {
        urgente: 'text-perigo font-semibold',
        alta: 'text-accent',
        media: 'text-aviso-ink',
        baixa: 'text-sucesso',
      }[p ?? ''] ?? 'text-muted-foreground'
    );
  }

  statusColor(status: string): string {
    return (
      {
        pago: 'bg-sucesso-soft text-sucesso-ink border border-sucesso/30',
        vencido: 'bg-perigo-soft text-perigo-ink border border-perigo/30',
        pendente: 'bg-aviso-soft text-aviso-ink border border-aviso/30',
      }[status] ?? 'bg-muted text-muted-foreground border border-border'
    );
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
    if (tipo === 'imposto' && eventos.imposto) return selected ? 'bg-primary-foreground' : 'bg-aviso';
    if (tipo === 'obrigacao' && eventos.obrigacao)
      return selected ? 'bg-primary-foreground' : 'bg-info';
    if (tipo === 'solicitacao' && eventos.solicitacao)
      return selected ? 'bg-primary-foreground' : 'bg-accent';
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
