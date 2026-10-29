import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, EMPTY, catchError, switchMap, tap } from 'rxjs';
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
import { UiTermo } from '@shared/ui/ui-termo';
import { TERMOS_FISCAIS } from '@core/utils/glossario';
import { AssistenteStore } from '@shared/assistente/assistente.store';
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
/** Os doze meses, por numero. O que a tela oferece sai de `meses()`, que corta os futuros. */
const MESES_DO_ANO = [
  { v: 1, nome: 'Janeiro' }, { v: 2, nome: 'Fevereiro' }, { v: 3, nome: 'Março' },
  { v: 4, nome: 'Abril' }, { v: 5, nome: 'Maio' }, { v: 6, nome: 'Junho' },
  { v: 7, nome: 'Julho' }, { v: 8, nome: 'Agosto' }, { v: 9, nome: 'Setembro' },
  { v: 10, nome: 'Outubro' }, { v: 11, nome: 'Novembro' }, { v: 12, nome: 'Dezembro' },
];

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
    UiTermo,
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

  /**
   * O débito do período, por tributo — **só o que a API devolve** (issue #110).
   *
   * Antes isto eram três linhas com alíquota cravada: CBS 3,5% ("8,8%" riscado), IBS Estadual
   * 5,1% e IBS Municipal 2,0%. Três coisas estavam erradas, todas medidas contra a API em 28/10:
   *
   * 1. **As alíquotas.** As de 2026 são `aliquotaCbs: 0.009` e `aliquotaIbs: 0.001` — 0,9% e 0,1%.
   * 2. **A repartição.** O IBS era dividido 72/28 entre "Estadual" e "Municipal". O backend não
   *    faz essa divisão nem a devolve em lugar nenhum: ela era invenção da tela.
   * 3. **A redução.** O selo "-60%" saía em todos, quando só o milho tem base reduzida.
   *
   * Agora são os dois tributos do contrato, com o valor inteiro do KPI. A alíquota **não aparece
   * aqui**: o KPI é a soma de itens com bases diferentes, e dividir isso daria um número que não é
   * alíquota de nada. A alíquota real é por item, e o lugar dela é a nota.
   */
  readonly impostoBreakdown = computed(() => {
    const kpis = this.dashboard()?.kpis;
    if (!kpis) return [];
    return [
      { nome: 'IBS', valor: kpis.debitoIbs },
      { nome: 'CBS', valor: kpis.debitoCbs },
    ].filter((item) => item.valor > 0);
  });

  readonly totalImpostoCalculado = computed(() =>
    this.impostoBreakdown().reduce((s, i) => s + i.valor, 0),
  );

  /**
   * A carga efetiva do período, em porcentagem — **derivada**, nunca cravada.
   *
   * É o imposto sobre o que entrou: na base de setembro, 1.809,50 / 180.950 = **1,0%**. O template
   * dizia "~10,6%", número que não vinha de lugar nenhum.
   *
   * `null` quando não há faturamento: sem denominador não há carga, e mostrar "0%" sugeriria que
   * o produtor vendeu e não pagou nada.
   */
  readonly cargaEfetiva = computed(() => {
    const entradas = this.dashboard()?.financeiro?.totalEntradas ?? 0;
    if (entradas <= 0) return null;
    return (this.totalImpostoCalculado() / entradas) * 100;
  });

  // Apuracao: periodo selecionavel (mes/ano) + status (#12).
  readonly anos = [
    new Date().getFullYear(),
    new Date().getFullYear() - 1,
    new Date().getFullYear() - 2,
  ];

  /**
   * Os meses que **ja aconteceram** no ano escolhido (#114).
   *
   * A lista era fixa nos doze. Em outubro de 2026 o produtor podia escolher novembro e dezembro
   * de 2026 -- meses que nao existem ainda -- e o painel respondia com tudo zerado: faturamento
   * zero, imposto zero, nenhuma nota. Parece app quebrado, e nao e: foi a tela que ofereceu uma
   * pergunta sem resposta possivel.
   *
   * O corte so vale para o ano corrente; em 2025 os doze continuam validos.
   */
  readonly meses = computed(() => {
    const hoje = new Date();
    const ultimo = this.periodoAno() === hoje.getFullYear() ? hoje.getMonth() + 1 : 12;
    return MESES_DO_ANO.filter((m) => m.v <= ultimo);
  });
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

  /**
   * Cada troca de periodo entra por aqui, e **cancela a anterior** (issue #108).
   *
   * Antes `trocarPeriodo` disparava dois `subscribe` soltos, e nada cancelava os de antes. Maio ->
   * Julho com a resposta de maio atrasada: ela chegava por ultimo e o `tap` do service gravava os
   * valores de maio no signal, com Julho selecionado no seletor -- R$ 102.900 debaixo do rotulo
   * errado. Reproduzivel, e foi assim que o teste manual de 28/10 pegou.
   *
   * O `switchMap` resolve na raiz: ao chegar o periodo novo ele desinscreve do anterior, e o
   * `HttpClient` **aborta a requisicao**. Resposta que nao existe nao sobrescreve nada.
   *
   * O `catchError` fica **dentro** do `switchMap`: se subisse, o erro mataria o fluxo e a proxima
   * troca de mes nao carregaria mais nada.
   */
  private readonly periodoPedido = new Subject<string>();

  private readonly painelPorPeriodo = this.periodoPedido
    .pipe(
      tap(() => {
        this.loading.set(true);
        this.erro.set(false);
      }),
      switchMap((periodo) =>
        this.dashboardService.carregar(periodo).pipe(
          catchError(() => {
            this.loading.set(false);
            this.erro.set(true);
            return EMPTY;
          }),
        ),
      ),
      takeUntilDestroyed(),
    )
    .subscribe(() => {
      this.loading.set(false);
      this.carregarNotasComProblema();
    });

  private readonly apuracaoPorPeriodo = this.periodoPedido
    .pipe(
      tap(() => this.statusDoBackend.set(null)),
      switchMap((periodo) =>
        this.tributarioApi.apuracao(periodo).pipe(catchError(() => EMPTY)),
      ),
      takeUntilDestroyed(),
    )
    .subscribe((a) => this.statusDoBackend.set(a.status ?? null));

  /** Recarrega painel e apuracao para o periodo escolhido. */
  private trocarPeriodo(): void {
    this.periodoPedido.next(this.periodoSelecionado());
  }

  setMes(valor: string): void {
    this.periodoMes.set(Number(valor));
    this.trocarPeriodo();
  }

  setAno(valor: string): void {
    this.periodoAno.set(Number(valor));
    // Vindo de um ano passado com mes alto (dezembro/2025) para o ano corrente, o mes escolhido
    // passaria a ser futuro. Puxa para o ultimo mes que existe, senao o painel pediria um periodo
    // que a lista de meses nem oferece mais.
    const ultimo = this.meses().at(-1)?.v ?? 12;
    if (this.periodoMes() > ultimo) this.periodoMes.set(ultimo);
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

  /**
   * O glossario fiscal (#105).
   *
   * Aqui havia um `termoExplicado` e um `explicar()` com o comentario "Abre o glossario de um
   * termo fiscal (IBS, CBS, credito)" -- e **nenhum dos dois era referenciado em lugar nenhum**:
   * nem template, nem teste, nem outro arquivo. Era andaime parecendo feature. O conteudo morava
   * noutro lugar: um paragrafo corrido dentro do painel recolhido, explicando os cinco termos de
   * uma vez. As frases sao as mesmas; cada uma agora presa ao termo que explica.
   */
  readonly termosFiscais = TERMOS_FISCAIS;

  private readonly assistenteStore = inject(AssistenteStore);

  /** O verbete entrega a pergunta pronta a Ceres -- "glossario e atalhos alinhados" da issue. */
  perguntarSobre(pergunta: string): void {
    this.assistenteStore.abrirPerguntando(pergunta);
  }

  ngOnInit(): void {
    // **Um caminho so** para carregar o painel (#114). Antes a primeira carga corria por fora dos
    // pipelines: `carregarDashboard()` chamava `carregar()` SEM periodo enquanto o seletor ja
    // exibia o mes corrente, e logo abaixo vinha um `apuracao(periodoSelecionado())` solto. Os
    // numeros vinham do padrao do backend e o seletor afirmava outra coisa.
    //
    // `trocarPeriodo()` empurra o periodo escolhido nos dois pipelines, que ja fazem tudo o que
    // aquelas duas chamadas faziam -- inclusive o estado de carregando e o selo da apuracao.
    this.trocarPeriodo();

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

  tentarNovamente(): void {
    // Refaz **o periodo escolhido**. Antes voltava ao padrao do backend com o seletor intacto:
    // quem errasse num mes antigo e clicasse "tentar novamente" via o mes corrente aparecer.
    this.trocarPeriodo();
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
