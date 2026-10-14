import { Component, inject, signal, computed, OnInit } from '@angular/core';
import {
  LucideTrendingUp,
  LucideDollarSign,
  LucideFileText,
  LucideEye,
  LucideLoaderCircle,
  LucideFile,
  LucideDownload,
  LucideSprout,
  LucideChevronDown,
  LucideChevronUp,
  LucideBell,
  LucideRefreshCw,
  LucideSparkles,
  LucideLightbulb,
  LucideCalendar,
  LucideArrowRight,
} from '@lucide/angular';
import { RouterLink } from '@angular/router';
import { BaseChartDirective } from 'ng2-charts';
import {
  Chart,
  BarController,
  BarElement,
  PieController,
  ArcElement,
  CategoryScale,
  LinearScale,
  Legend,
  Tooltip,
  type ChartConfiguration,
  type ChartData,
} from 'chart.js';

// Registro enxuto: so barras e pizza (mantem Chart.js no chunk lazy do dashboard).
// O controlador de linha saiu junto com o card "Tendencia mensal".
Chart.register(
  BarController, BarElement,
  PieController, ArcElement,
  CategoryScale, LinearScale, Legend, Tooltip,
);
import { ThemeService } from '@core/services/theme.service';
import { coresDeEixo, corDeSuperficie, limparCacheDeCores, paletaDeSeries }
  from '@core/utils/chart-tokens';
import { DashboardApi } from '@services/dashboard/data-access/dashboard.service';
import { TributarioApi } from '@services/tributario/data-access/tributario.service';
import { NotasApi } from '@services/notas/data-access/notas.service';
import { NotaPreview } from '@shared/components/nota-preview/nota-preview';
import { UiBadgeStatus } from '@shared/ui/ui-badge-status';
import { UiButton } from '@shared/ui/ui-button';
import { UiCard } from '@shared/ui/ui-card';
import { UiEmptyState } from '@shared/ui/ui-empty-state';
import { UiModal } from '@shared/ui/ui-modal';
import { UiInsight } from '@shared/ui/ui-insight';
import { UiSkeleton } from '@shared/ui/ui-skeleton';
import { UiStat } from '@shared/ui/ui-stat';
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
    LucideSprout,
    LucideChevronDown,
    LucideChevronUp,
    LucideBell,
    LucideRefreshCw,
    LucideSparkles,
    RouterLink,
    BaseChartDirective,
    NotaPreview,
    UiBadgeStatus,
    UiButton,
    UiCard,
    UiEmptyState,
    UiInsight,
    UiModal,
    UiSkeleton,
    UiStat,
    LucideLightbulb,
    LucideCalendar,
    LucideArrowRight,
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

  /**
   * Fluxo de caixa em R$ do período (bloco `financeiro`, backend#71). Pode ser `null` quando o
   * backend não envia o bloco. **Não re-inverter** entradas/saídas: o backend já entrega
   * `totalEntradas` = vendas (PROPRIA) e `totalSaidas` = compras (IMPORTADA).
   */
  readonly financeiro = computed(() => this.dashboard()?.financeiro ?? null);
  readonly temFinanceiro = computed(() => this.financeiro() !== null);

  readonly notaDetalhada = signal<NotaFiscal | null>(null);
  readonly previewDoc = signal<DocItem | null>(null);

  readonly loadingAlertas = signal(false);
  readonly alertas = signal<VencimentoFiscal[]>([]);

  // Grafico: notas por mes (contagens; ultimos meses do periodo retornado pelo backend)
  private readonly themeService = inject(ThemeService);

  /**
   * Cores dos graficos, derivadas dos tokens do tema.
   *
   * Dependem de `themeService.tema()` de proposito: e o que faz o Chart.js
   * receber uma configuracao nova ao alternar claro/escuro. O `<canvas>` nao
   * herda cor do CSS, entao sem isto a linha de grade continuaria clara sobre
   * fundo escuro depois da troca de tema.
   */
  private readonly paleta = computed(() => {
    this.themeService.tema();
    limparCacheDeCores();
    return paletaDeSeries();
  });

  private readonly eixo = computed(() => {
    this.themeService.tema();
    return coresDeEixo();
  });

  readonly barChartData = computed<ChartData<'bar'>>(() => {
    const dados = this.dashboard()?.notasPorMes ?? [];
    const [entradas, saidas] = this.paleta();
    return {
      labels: dados.map(d => mesLabelFromPeriodo(d.periodo)),
      datasets: [
        {
          label: 'Entradas',
          data: dados.map(d => d.entradas),
          backgroundColor: entradas,
          borderRadius: 6,
          maxBarThickness: 28,
        },
        {
          label: 'Saídas',
          data: dados.map(d => d.saidas),
          backgroundColor: saidas,
          borderRadius: 6,
          maxBarThickness: 28,
        },
      ],
    };
  });

  /**
   * O produtor nao tem nenhuma nota de entrada: `notasPorMes` devolve
   * `entradas: 0` em todos os meses. Sem dizer isso, o grafico parece quebrado —
   * a serie laranja simplesmente nao aparece.
   */
  readonly semNotasDeEntrada = computed(() => {
    const dados = this.dashboard()?.notasPorMes ?? [];
    return dados.length > 0 && dados.every(d => d.entradas === 0);
  });

  readonly barChartOptions = computed<ChartConfiguration<'bar'>['options']>(() => {
    const { grade, texto } = this.eixo();
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 700 },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            usePointStyle: true, boxWidth: 8, font: { family: 'Inter' }, color: texto,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { font: { family: 'Inter' }, color: texto },
        },
        y: {
          beginAtZero: true,
          ticks: { precision: 0, font: { family: 'Inter' }, color: texto },
          grid: { color: grade },
        },
      },
    };
  });

  // Grafico: distribuicao de impostos (pizza) — so IBS x CBS (LC 214/2025)
  readonly pieChartData = computed<ChartData<'pie'>>(() => {
    const d = this.dashboard()?.distribuicaoImpostos;
    return {
      labels: ['CBS', 'IBS'],
      datasets: [
        {
          data: [d?.cbs ?? 0, d?.ibs ?? 0],
          backgroundColor: this.paleta(),
          borderColor: corDeSuperficie(),
          borderWidth: 2,
        },
      ],
    };
  });

  readonly pieChartOptions = computed<ChartConfiguration<'pie'>['options']>(() => {
    const { texto } = this.eixo();
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 700 },
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            usePointStyle: true, boxWidth: 8, font: { family: 'Inter' }, color: texto,
          },
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${this.formatCurrency(ctx.parsed as number)}`,
          },
        },
      },
    };
  });

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

  private readonly tributarioApi = inject(TributarioApi);

  /** Periodo escolhido, no formato que os endpoints pedem. */
  readonly periodoSelecionado = computed(
    () => `${this.periodoAno()}-${String(this.periodoMes()).padStart(2, '0')}`,
  );

  /** Status vindo de `/api/apuracao`; null enquanto carrega ou se falhar. */
  private readonly statusDoBackend = signal<string | null>(null);

  /**
   * Situacao da apuracao, **como o backend responde**.
   *
   * Antes era adivinhada pela data: qualquer mes passado virava "Fechado". Mas
   * a API responde `status: "ABERTO"` para junho, com `dataFechamento: null` --
   * o selo mentia sobre o estado fiscal do produtor. E usava
   * `bg-green-100 text-green-700`, fora dos tokens, quebrando no tema escuro.
   */
  readonly statusApuracao = computed<{ label: string; classe: string }>(() => {
    const status = this.statusDoBackend();
    if (status === 'FECHADO') {
      return { label: 'Fechada', classe: 'bg-surface-2 text-muted-foreground' };
    }
    if (status === 'ABERTO') {
      return { label: 'Aberta', classe: 'bg-sucesso-soft text-sucesso-ink' };
    }
    return { label: 'Verificando…', classe: 'bg-surface-2 text-muted-foreground' };
  });

  /** Recarrega painel e apuracao para o periodo escolhido. */
  private trocarPeriodo(): void {
    const periodo = this.periodoSelecionado();
    this.loading.set(true);
    this.dashboardService.carregar(periodo).subscribe({
      next: () => {
        this.loading.set(false);
        this.carregarNotasComProblema();
      },
      error: () => {
        this.loading.set(false);
        this.erro.set(true);
      },
    });
    this.statusDoBackend.set(null);
    this.tributarioApi.apuracao(periodo).subscribe({
      next: (a) => this.statusDoBackend.set(a.status ?? null),
      error: () => this.statusDoBackend.set(null),
    });
  }

  setMes(valor: string): void {
    this.periodoMes.set(Number(valor));
    this.trocarPeriodo();
  }

  setAno(valor: string): void {
    this.periodoAno.set(Number(valor));
    this.trocarPeriodo();
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

  /**
   * O numero que o produtor quer ver primeiro: quanto ele tem a pagar no periodo.
   * E a soma dos saldos de IBS e CBS - no backend sao duas linhas, na cabeca dele
   * e uma conta so. O detalhamento tecnico fica no bloco "ver detalhe".
   */
  readonly saldoAPagar = computed(() => {
    const k = this.dashboard()?.kpis;
    return (k?.saldoIbs ?? 0) + (k?.saldoCbs ?? 0);
  });

  /** Credito acumulado (IBS + CBS) - o que abate do proximo pagamento. */
  readonly creditoAcumulado = computed(() => {
    const k = this.dashboard()?.kpis;
    return (k?.creditoIbs ?? 0) + (k?.creditoCbs ?? 0);
  });

  /** Detalhamento tecnico, escondido atras do "ver detalhe" em vez de ocupar a tela. */
  readonly detalheTributos = computed(() => {
    const k = this.dashboard()?.kpis;
    if (!k) return [];
    return [
      { rotulo: 'Débito IBS', valor: k.debitoIbs },
      { rotulo: 'Crédito IBS', valor: k.creditoIbs },
      { rotulo: 'Saldo IBS', valor: k.saldoIbs },
      { rotulo: 'Débito CBS', valor: k.debitoCbs },
      { rotulo: 'Crédito CBS', valor: k.creditoCbs },
      { rotulo: 'Saldo CBS', valor: k.saldoCbs },
    ];
  });

  readonly mostrarDetalheTributos = signal(false);

  // ---------------------------------------------------------------------------
  // Camada do assistente (#47)
  //
  // A banca apontou que o design nao comunica que existe IA na solucao. Estes
  // computeds alimentam o <ui-insight>, e valem a regra combinada na #45: **so
  // entra com dado real**. Nada aqui e texto gerado para parecer inteligente -
  // a lista de notas vem do payload do dashboard e o motivo da pendencia vem do
  // endpoint /notas/{id}/validacoes, escrito pelo proprio backend.
  // ---------------------------------------------------------------------------

  /** Notas que exigem acao do produtor, extraidas do payload do dashboard. */
  /**
   * Notas que exigem acao, buscadas em TODAS as notas do produtor.
   *
   * A primeira versao lia `dashboard().ultimasNotas`, que traz so as 3 mais
   * recentes - e o assistente sumia da tela assim que as tres ultimas estavam em
   * ordem, mesmo havendo pendencia antiga em aberto. Pendencia fiscal nao
   * envelhece: enquanto a nota nao for corrigida, o produtor precisa saber.
   */
  readonly notasComProblema = signal<NotaFiscal[]>([]);

  /**
   * Quantas notas o produtor tem no total.
   *
   * O card "Ultimos documentos" mostra so 5 -- o backend devolve
   * `findTop5ByProdutorIdOrderByDataEmissaoDesc` e nunca mais que isso. Sem
   * saber o total, o card virava beco sem saida: quem tem 15 notas via 5 e nao
   * tinha como chegar nas outras. O numero vem do `totalElements` desta mesma
   * chamada, sem requisicao extra.
   */
  readonly totalDeNotas = signal(0);

  private carregarNotasComProblema(): void {
    this.notasApi.listar({ size: 50, sort: 'dataEmissao,desc' }).subscribe({
      next: (pagina) => {
        this.totalDeNotas.set(pagina.totalElements ?? pagina.content.length);
        this.notasComProblema.set(
          pagina.content.filter(
            (n) => n.status === 'COM_INCONSISTENCIAS' || n.status === 'REJEITADA',
          ),
        );
        this.carregarMotivoDaPendencia();
      },
      error: () => {
        this.notasComProblema.set([]);
        this.totalDeNotas.set(0);
      },
    });
  }

  /** Motivo textual da primeira pendencia, como o backend descreve. */
  readonly motivoPendencia = signal<string | null>(null);

  /** Vencimento mais proximo ainda em aberto, para o assistente antecipar o prazo. */
  readonly proximoVencimento = computed(() => this.alertas()[0] ?? null);

  /** Ha algo que o assistente precise dizer? Evita renderizar bloco vazio. */
  readonly temInsight = computed(
    () => this.notasComProblema().length > 0 || this.proximoVencimento() !== null,
  );

  /**
   * Busca o motivo real da primeira nota pendente. Falha em silencio de proposito:
   * o insight ja se sustenta sem o detalhe ("2 notas precisam de correcao"), e um
   * toast de erro aqui seria ruido sobre informacao acessoria.
   */
  private carregarMotivoDaPendencia(): void {
    const nota = this.notasComProblema()[0];
    if (!nota) {
      this.motivoPendencia.set(null);
      return;
    }
    this.notasApi.listarValidacoes(nota.id).subscribe({
      next: (validacoes) => this.motivoPendencia.set(validacoes[0]?.message ?? null),
      error: () => this.motivoPendencia.set(null),
    });
  }

  /** Abre o glossario de um termo fiscal (IBS, CBS, credito). */
  readonly termoExplicado = signal<string | null>(null);

  explicar(termo: string): void {
    this.termoExplicado.set(this.termoExplicado() === termo ? null : termo);
  }

  ngOnInit(): void {
    this.carregarDashboard();
    // O selo da apuracao tambem vem do backend na primeira carga.
    this.tributarioApi.apuracao(this.periodoSelecionado()).subscribe({
      next: a => this.statusDoBackend.set(a.status ?? null),
      error: () => this.statusDoBackend.set(null),
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

  /** Carrega GET /api/dashboard (mes corrente). Sem fallback mock — erro vira estado de retry. */
  carregarDashboard(): void {
    this.loading.set(true);
    this.erro.set(false);
    this.dashboardService.carregar().subscribe({
      next: () => {
        this.loading.set(false);
        this.carregarNotasComProblema();
      },
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
        if (res.indisponivel) {
          // Ver `NotificarResult.indisponivel`: dizer "nada pendente" aqui era mentira.
          this.toastService.error('O envio de avisos ainda não existe no servidor.');
        } else if (res.enviados > 0) {
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

  formatCurrency(value: number): string {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  formatDate(iso: string): string {
    return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  }

  private getMesAtual(): string {
    const mes = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return mes.charAt(0).toUpperCase() + mes.slice(1);
  }
}
