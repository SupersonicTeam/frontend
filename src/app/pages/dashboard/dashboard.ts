import { Component, inject, signal, computed, OnInit } from '@angular/core';
import {
  LucideTrendingUp,
  LucideDollarSign,
  LucideFileText,
  LucideEye,
  LucideLoaderCircle,
  LucideFile,
  LucideDownload,
  LucideMessageCircle,
  LucideX,
  LucideSprout,
  LucideChevronDown,
  LucideChevronUp,
  LucideBell,
  LucideRefreshCw,
} from '@lucide/angular';
import { BaseChartDirective } from 'ng2-charts';
import {
  Chart,
  BarController,
  BarElement,
  PieController,
  ArcElement,
  LineController,
  PointElement,
  LineElement,
  CategoryScale,
  LinearScale,
  Legend,
  Tooltip,
  type ChartConfiguration,
  type ChartData,
} from 'chart.js';

// Registro enxuto: so barras/pizza/linha (mantem Chart.js no chunk lazy do dashboard).
Chart.register(
  BarController, BarElement,
  PieController, ArcElement,
  LineController, PointElement, LineElement,
  CategoryScale, LinearScale, Legend, Tooltip,
);
import { DashboardApi } from '@services/dashboard/data-access/dashboard.service';
import { NotasApi } from '@services/notas/data-access/notas.service';
import { statusNotaLabel, statusNotaBadge } from '@core/enums/status-nota-fiscal.enum';
import { NotaPreview } from '@shared/components/nota-preview/nota-preview';
import { LOGGED_PRODUCER_ID } from '@core/config/produtor-logado';
import { NotificacaoApi } from '@services/notificacao/data-access/notificacao.service';
import { CalendarioApi } from '@services/calendario/data-access/calendario.service';
import { ToastService } from '@core/services/toast.service';
import { NotaFiscal } from '@models/nota-fiscal.model';
import { VencimentoFiscal } from '@models/vencimento-fiscal.model';

interface DocItem {
  id: number;
  nome: string;
  tipo: string;
  data: string;
  status?: string;
  notaId?: string;
  valor: number;
}

const MESES_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** Converte "YYYY-MM" (contrato do backend) no rótulo curto em pt-BR ("Mai/26"). */
function mesLabelFromPeriodo(periodo: string): string {
  const [ano, mes] = periodo.split('-').map(Number);
  if (!ano || !mes || mes < 1 || mes > 12) return periodo;
  return `${MESES_PT[mes - 1]}/${String(ano).slice(-2)}`;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    LucideTrendingUp,
    LucideDollarSign,
    LucideFileText,
    LucideEye,
    LucideLoaderCircle,
    LucideFile,
    LucideDownload,
    LucideMessageCircle,
    LucideX,
    LucideSprout,
    LucideChevronDown,
    LucideChevronUp,
    LucideBell,
    LucideRefreshCw,
    BaseChartDirective,
    NotaPreview,
  ],
  templateUrl: './dashboard.html',
})
export class DashboardPage implements OnInit {
  private readonly dashboardService = inject(DashboardApi);
  private readonly notasApi = inject(NotasApi);
  private readonly notificacaoService = inject(NotificacaoApi);
  private readonly calendarioService = inject(CalendarioApi);
  private readonly toastService = inject(ToastService);

  readonly mesAtual = this.getMesAtual();
  readonly loading = signal(false);
  readonly erro = signal(false);
  readonly loadingDetalhes = signal(false);
  readonly enviandoNotificacao = signal(false);

  /** Último payload do dashboard — signal do service (cache local entre navegações). */
  readonly dashboard = this.dashboardService.dashboard;

  readonly nomeUsuario = computed(() => this.dashboard()?.produtor.nome ?? 'Produtor');

  readonly notaDetalhada = signal<NotaFiscal | null>(null);
  readonly previewDoc = signal<DocItem | null>(null);

  readonly loadingAlertas = signal(false);
  readonly alertas = signal<VencimentoFiscal[]>([]);

  // Grafico: notas por mes (contagens; ultimos meses do periodo retornado pelo backend)
  readonly barChartData = computed<ChartData<'bar'>>(() => {
    const dados = this.dashboard()?.notasPorMes ?? [];
    return {
      labels: dados.map(d => mesLabelFromPeriodo(d.periodo)),
      datasets: [
        {
          label: 'Entradas',
          data: dados.map(d => d.entradas),
          backgroundColor: 'hsl(33, 55%, 52%)',
          borderRadius: 6,
          maxBarThickness: 28,
        },
        {
          label: 'Saídas',
          data: dados.map(d => d.saidas),
          backgroundColor: 'hsl(142, 44%, 32%)',
          borderRadius: 6,
          maxBarThickness: 28,
        },
      ],
    };
  });

  readonly barChartOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 700 },
    plugins: {
      legend: {
        position: 'bottom',
        labels: { usePointStyle: true, boxWidth: 8, font: { family: 'Inter' } },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { family: 'Inter' } } },
      y: {
        beginAtZero: true,
        ticks: { precision: 0, font: { family: 'Inter' } },
        grid: { color: 'hsl(142, 15%, 88%)' },
      },
    },
  };

  // Grafico: distribuicao de impostos (pizza) — so IBS x CBS (LC 214/2025)
  readonly pieChartData = computed<ChartData<'pie'>>(() => {
    const d = this.dashboard()?.distribuicaoImpostos;
    return {
      labels: ['CBS', 'IBS'],
      datasets: [
        {
          data: [d?.cbs ?? 0, d?.ibs ?? 0],
          backgroundColor: ['hsl(33, 55%, 52%)', 'hsl(142, 44%, 32%)'],
          borderColor: 'hsl(0, 0%, 100%)',
          borderWidth: 2,
        },
      ],
    };
  });

  readonly pieChartOptions: ChartConfiguration<'pie'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 700 },
    plugins: {
      legend: {
        position: 'bottom',
        labels: { usePointStyle: true, boxWidth: 8, font: { family: 'Inter' } },
      },
      tooltip: {
        callbacks: {
          label: ctx => ` ${ctx.label}: ${this.formatCurrency(ctx.parsed as number)}`,
        },
      },
    },
  };

  // Grafico: tendencia mensal (linha) — reusa notasPorMes (contagens)
  readonly lineChartData = computed<ChartData<'line'>>(() => {
    const dados = this.dashboard()?.notasPorMes ?? [];
    return {
      labels: dados.map(d => mesLabelFromPeriodo(d.periodo)),
      datasets: [
        {
          label: 'Entradas',
          data: dados.map(d => d.entradas),
          borderColor: 'hsl(33, 55%, 52%)',
          backgroundColor: 'hsl(33, 55%, 52%)',
          tension: 0.35,
          pointRadius: 3,
        },
        {
          label: 'Saídas',
          data: dados.map(d => d.saidas),
          borderColor: 'hsl(142, 44%, 32%)',
          backgroundColor: 'hsl(142, 44%, 32%)',
          tension: 0.35,
          pointRadius: 3,
        },
      ],
    };
  });

  readonly lineChartOptions: ChartConfiguration<'line'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 700 },
    plugins: {
      legend: {
        position: 'bottom',
        labels: { usePointStyle: true, boxWidth: 8, font: { family: 'Inter' } },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { family: 'Inter' } } },
      y: {
        beginAtZero: true,
        ticks: { precision: 0, font: { family: 'Inter' } },
        grid: { color: 'hsl(142, 15%, 88%)' },
      },
    },
  };

  // Simulador — breakdown de impostos derivado dos KPIs do periodo (nao soma notas)
  showSimuladorDetalhe = signal(false);

  readonly impostoBreakdown = computed(() => {
    const kpis = this.dashboard()?.kpis;
    if (!kpis) return [];
    return [
      { nome: 'CBS', aliquota: '3,5%', original: '8,8%', valor: kpis.debitoCbs, reducao: true },
      { nome: 'IBS Estadual', aliquota: '5,1%', original: '12,7%', valor: kpis.debitoIbs * 0.72, reducao: true },
      { nome: 'IBS Municipal', aliquota: '2,0%', original: '5,0%', valor: kpis.debitoIbs * 0.28, reducao: true },
    ].filter(item => item.valor > 0);
  });

  readonly totalImpostoCalculado = computed(() =>
    this.impostoBreakdown().reduce((s, i) => s + i.valor, 0)
  );

  // Apuracao: periodo selecionavel (mes/ano) + status (#12) — exibicao apenas; MVP carrega so o mes corrente
  readonly meses = [
    { v: 1, nome: 'Janeiro' }, { v: 2, nome: 'Fevereiro' }, { v: 3, nome: 'Março' },
    { v: 4, nome: 'Abril' }, { v: 5, nome: 'Maio' }, { v: 6, nome: 'Junho' },
    { v: 7, nome: 'Julho' }, { v: 8, nome: 'Agosto' }, { v: 9, nome: 'Setembro' },
    { v: 10, nome: 'Outubro' }, { v: 11, nome: 'Novembro' }, { v: 12, nome: 'Dezembro' },
  ];
  readonly anos = [
    new Date().getFullYear(),
    new Date().getFullYear() - 1,
    new Date().getFullYear() - 2,
  ];
  readonly periodoMes = signal(new Date().getMonth() + 1);
  readonly periodoAno = signal(new Date().getFullYear());

  readonly statusApuracao = computed<{ label: string; classe: string }>(() => {
    const agora = new Date();
    const atual = agora.getFullYear() * 100 + (agora.getMonth() + 1);
    const sel = this.periodoAno() * 100 + this.periodoMes();
    if (sel === atual) return { label: 'Aberto', classe: 'bg-green-100 text-green-700' };
    if (sel < atual) return { label: 'Fechado', classe: 'bg-muted text-muted-foreground' };
    return { label: 'Em processamento', classe: 'bg-accent/15 text-accent' };
  });

  setMes(valor: string): void {
    this.periodoMes.set(Number(valor));
  }

  setAno(valor: string): void {
    this.periodoAno.set(Number(valor));
  }

  // Ultimas notas reais do payload do dashboard (DASH-06) — ja ordenadas pelo backend por dataEmissao desc
  readonly documentos = computed<DocItem[]>(() =>
    (this.dashboard()?.ultimasNotas ?? [])
      .slice()
      .sort((a, b) => new Date(b.dataEmissao).getTime() - new Date(a.dataEmissao).getTime())
      .map((nota, idx) => ({
        id: idx + 1,
        nome: nota.contraparte || `NF ${nota.numero}`,
        tipo: nota.origem === 'IMPORTADA' ? 'Nota importada' : 'Nota própria',
        data: nota.dataEmissao?.split('T')[0] || new Date().toISOString().split('T')[0],
        status: nota.status,
        notaId: nota.id,
        valor: nota.valorTotalNota ?? 0,
      }))
  );

  ngOnInit(): void {
    this.carregarDashboard();

    this.loadingAlertas.set(true);
    this.calendarioService.getVencimentos(LOGGED_PRODUCER_ID).subscribe({
      next: data => {
        const ordenados = data
          .slice()
          .sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento))
          .slice(0, 5);
        this.alertas.set(ordenados);
        this.loadingAlertas.set(false);
      },
      error: () => this.loadingAlertas.set(false),
    });
  }

  /** Carrega GET /api/dashboard (mes corrente). Sem fallback mock — erro vira estado de retry. */
  carregarDashboard(): void {
    this.loading.set(true);
    this.erro.set(false);
    this.dashboardService.carregar().subscribe({
      next: () => this.loading.set(false),
      error: () => {
        this.loading.set(false);
        this.erro.set(true);
      },
    });
  }

  tentarNovamente(): void {
    this.carregarDashboard();
  }

  abrirPreview(doc: DocItem): void {
    this.previewDoc.set(doc);
    this.notaDetalhada.set(null);
    if (!doc.notaId) return;
    this.loadingDetalhes.set(true);
    this.notasApi.obter(doc.notaId).subscribe({
      next: nota => {
        this.notaDetalhada.set(nota);
        this.loadingDetalhes.set(false);
      },
      error: () => {
        this.loadingDetalhes.set(false);
        this.toastService.error('Erro ao carregar detalhes da nota.');
      },
    });
  }

  fecharPreview(): void {
    this.previewDoc.set(null);
    this.notaDetalhada.set(null);
  }

  handleNotificarWhatsApp(): void {
    this.enviandoNotificacao.set(true);
    this.notificacaoService.notificarProximasObrigacoes(LOGGED_PRODUCER_ID).subscribe({
      next: res => {
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

  formatCurrency(value: number): string {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  formatDate(iso: string): string {
    return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  }

  getStatusStyle(status?: string): { label: string; color: string } {
    return { label: statusNotaLabel(status), color: statusNotaBadge(status) };
  }

  private getMesAtual(): string {
    const mes = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return mes.charAt(0).toUpperCase() + mes.slice(1);
  }
}
