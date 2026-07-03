import { Component, inject, signal, computed, OnInit } from '@angular/core';
import {
  LucideTrendingUp,
  LucideTrendingDown,
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
import {
  DashboardApi,
  ResumoMensalNotas,
  DistribuicaoImposto,
  mockNotas,
} from '@services/dashboard/data-access/dashboard.service';
import { NotasApi } from '@services/notas/data-access/notas.service';
import { statusNotaLabel, statusNotaBadge } from '@core/enums/status-nota-fiscal.enum';
import { LOGGED_PRODUCER_ID } from '@core/config/produtor-logado';
import { NotificacaoApi } from '@services/notificacao/data-access/notificacao.service';
import { CalendarioApi } from '@services/calendario/data-access/calendario.service';
import { ToastService } from '@core/services/toast.service';
import { FluxoCaixa } from '@models/fluxo-caixa.model';
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

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    LucideTrendingUp,
    LucideTrendingDown,
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
    BaseChartDirective,
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
  readonly nomeUsuario = signal('João Silva');
  readonly loadingFluxo = signal(false);
  readonly loadingNotas = signal(false);
  readonly loadingDetalhes = signal(false);
  readonly enviandoNotificacao = signal(false);

  readonly fluxoCaixa = signal<FluxoCaixa | null>(null);
  readonly notas = signal<NotaFiscal[]>([]);
  readonly loadingAlertas = signal(false);
  readonly alertas = signal<VencimentoFiscal[]>([]);
  readonly notaDetalhada = signal<NotaFiscal | null>(null);
  readonly previewDoc = signal<DocItem | null>(null);

  // Grafico: notas por mes (ultimos 6 meses)
  readonly loadingGrafico = signal(false);
  readonly notasPorMes = signal<ResumoMensalNotas[]>([]);

  readonly barChartData = computed<ChartData<'bar'>>(() => {
    const dados = this.notasPorMes();
    return {
      labels: dados.map(d => d.mes),
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

  // Grafico: distribuicao de impostos (pizza)
  readonly distribuicaoImpostos = signal<DistribuicaoImposto[]>([]);

  readonly pieChartData = computed<ChartData<'pie'>>(() => {
    const d = this.distribuicaoImpostos();
    return {
      labels: d.map(x => x.nome),
      datasets: [
        {
          data: d.map(x => x.valor),
          backgroundColor: [
            'hsl(142, 44%, 32%)',
            'hsl(33, 55%, 52%)',
            'hsl(142, 25%, 55%)',
            'hsl(0, 72%, 51%)',
            'hsl(205, 45%, 50%)',
          ],
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

  // Grafico: tendencia mensal (linha) — reusa notasPorMes
  readonly lineChartData = computed<ChartData<'line'>>(() => {
    const dados = this.notasPorMes();
    return {
      labels: dados.map(d => d.mes),
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

  // Simulador — breakdown de impostos das notas
  showSimuladorDetalhe = signal(false);

  readonly impostoBreakdown = computed(() => {
    const notas = this.notas();
    // O backend só calcula IBS/CBS (reforma 2026, LC 214/2025). FUNRURAL/ICMS/IPI
    // não existem no NotaFiscalResponse — removidos do breakdown.
    const totalCbs = notas.reduce((s, n) => s + (n.valorTotalCbs ?? 0), 0);
    const totalIbs = notas.reduce((s, n) => s + (n.valorTotalIbs ?? 0), 0);

    return [
      { nome: 'CBS', aliquota: '3,5%', original: '8,8%', valor: totalCbs, reducao: true },
      { nome: 'IBS Estadual', aliquota: '5,1%', original: '12,7%', valor: totalIbs * 0.72, reducao: true },
      { nome: 'IBS Municipal', aliquota: '2,0%', original: '5,0%', valor: totalIbs * 0.28, reducao: true },
    ].filter(item => item.valor > 0);
  });

  readonly totalImpostoCalculado = computed(() =>
    this.impostoBreakdown().reduce((s, i) => s + i.valor, 0)
  );

  // Apuracao: periodo selecionavel (mes/ano) + status (#12)
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

  readonly documentos = computed(() =>
    this.notas()
      .slice()
      .sort((a, b) => {
        const dateA = new Date(a.dataEmissao || '1970-01-01').getTime();
        const dateB = new Date(b.dataEmissao || '1970-01-01').getTime();
        return dateB - dateA;
      })
      .slice(0, 7)
      .map((nota, idx) => ({
        id: idx + 1,
        nome: nota.naturezaOperacao || `NF ${nota.numero}`,
        tipo: nota.tipoDocumento === 'NFA' ? 'NFA (avulsa)' : 'NF-e (modelo 55)',
        data: nota.dataEmissao?.split('T')[0] || new Date().toISOString().split('T')[0],
        status: nota.status,
        notaId: nota.id,
        valor: nota.valorTotalNota ?? nota.valorTotalProdutos ?? 0,
      }))
  );

  ngOnInit(): void {
    this.carregarDados();
  }

  private carregarDados(): void {
    this.loadingFluxo.set(true);
    this.dashboardService.getFluxoCaixa(LOGGED_PRODUCER_ID).subscribe({
      next: data => { this.fluxoCaixa.set(data); this.loadingFluxo.set(false); },
      error: () => this.loadingFluxo.set(false),
    });

    this.loadingNotas.set(true);
    this.notasApi.listar({ page: 0, size: 100, sort: 'dataEmissao,desc' }).subscribe({
      next: page => { this.notas.set(page.content); this.loadingNotas.set(false); },
      error: () => { this.notas.set(mockNotas()); this.loadingNotas.set(false); },
    });

    this.dashboardService.getProdutor(LOGGED_PRODUCER_ID).subscribe({
      next: p => { if (p?.nome) this.nomeUsuario.set(p.nome); },
      error: () => undefined,
    });

    this.loadingGrafico.set(true);
    this.dashboardService.getNotasPorMes(LOGGED_PRODUCER_ID).subscribe({
      next: data => { this.notasPorMes.set(data); this.loadingGrafico.set(false); },
      error: () => this.loadingGrafico.set(false),
    });

    this.dashboardService.getDistribuicaoImpostos(LOGGED_PRODUCER_ID).subscribe({
      next: data => this.distribuicaoImpostos.set(data),
      error: () => undefined,
    });

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

  abrirPreview(doc: DocItem): void {
    this.previewDoc.set(doc);
    this.notaDetalhada.set(null);
    if (doc.notaId) {
      // A nota já está carregada na listagem — evita uma chamada HTTP extra.
      this.notaDetalhada.set(this.notas().find(n => n.id === doc.notaId) ?? null);
    }
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
