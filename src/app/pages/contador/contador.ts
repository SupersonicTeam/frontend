import { Component, OnInit, computed, inject, signal } from '@angular/core';
import {
  LucideCalculator,
  LucideCheck,
  LucideChevronDown,
  LucideChevronRight,
  LucideDownload,
  LucideHandCoins,
  LucideLoaderCircle,
  LucideTriangleAlert,
} from '@lucide/angular';
import { RouterLink } from '@angular/router';
import { LOGGED_PRODUCER_ID } from '@core/config/produtor-logado';
import { filenameDeContentDisposition, salvarBlob } from '@core/utils/download';
import { ToastService } from '@core/services/toast.service';
import type { GuiaFiscal } from '@models/solicitacao-contador.model';
import type { NotaFiscal } from '@models/nota-fiscal.model';
import type { Apuracao, RelatorioConformidade } from '@models/tributario.model';
import type { NotaValidacaoResponse } from '@dtos/notas/sefaz.response';
import { apenasUltimaChecagem, rotuloDoCampo } from '@core/utils/validacoes';
import { ContadorApi } from '@services/contador/data-access/contador.service';
import { DashboardApi } from '@services/dashboard/data-access/dashboard.service';
import { NotasApi } from '@services/notas/data-access/notas.service';
import { TributarioApi } from '@services/tributario/data-access/tributario.service';
import { UiBadgeStatus } from '@shared/ui/ui-badge-status';
import { UiButton } from '@shared/ui/ui-button';
import { UiSkeleton } from '@shared/ui/ui-skeleton';
import { UiStat } from '@shared/ui/ui-stat';
import { mesDeFechamento } from '@core/utils/periodo';

const MESES = [
  { v: 1, l: 'Janeiro' },
  { v: 2, l: 'Fevereiro' },
  { v: 3, l: 'Março' },
  { v: 4, l: 'Abril' },
  { v: 5, l: 'Maio' },
  { v: 6, l: 'Junho' },
  { v: 7, l: 'Julho' },
  { v: 8, l: 'Agosto' },
  { v: 9, l: 'Setembro' },
  { v: 10, l: 'Outubro' },
  { v: 11, l: 'Novembro' },
  { v: 12, l: 'Dezembro' },
];

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
 *
 * ## A tela foi organizada em volta de fechar o mês (caminho A)
 *
 * A versão anterior era uma pilha de listas sem pergunta: três números no topo, as notas com
 * problema, as guias. O contador não abre isto para "ver dados" — ele abre para saber **se dá
 * para fechar o mês e o que falta**. Então a ordem é essa:
 *
 * 1. **O que impede fechar** o período escolhido — nota com inconsistência (com o que o fisco
 *    apontou, de verdade, ao expandir) e guia vencida.
 * 2. **Os números do período** — a apuração e o relatório de conformidade na tela, não só no PDF.
 * 3. **O atalho para a cobrança** — as guias moraram aqui por um tempo, em tabela inteira, e
 *    passaram a morar em Prazos, que é a tela delas. Esta aponta para lá em vez de repetir.
 *
 * **O seletor de período governa 1 e 2, mas não as guias.** Guia atrasada de agosto não pode
 * sumir da tela porque o contador está olhando outubro — ela continua sendo problema dele hoje.
 */
@Component({
  selector: 'app-contador',
  standalone: true,
  imports: [
    LucideCalculator,
    LucideCheck,
    LucideChevronDown,
    LucideChevronRight,
    LucideDownload,
    LucideHandCoins,
    LucideLoaderCircle,
    LucideTriangleAlert,
    RouterLink,
    UiBadgeStatus,
    UiButton,
    UiSkeleton,
    UiStat,
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
  readonly carregandoNotas = signal(false);
  readonly baixandoRelatorio = signal(false);

  /** Nome do produtor vem do payload real do dashboard, não de constante no código. */
  readonly produtorNome = computed(
    () => this.dashboardApi.dashboard()?.produtor.nome ?? 'Produtor',
  );

  readonly guiasPendentes = computed(() => this.guias().filter((g) => g.status !== 'pago'));
  readonly totalAPagar = computed(() =>
    this.guiasPendentes().reduce((soma, g) => soma + (g.valor ?? 0), 0),
  );
  readonly guiasVencidas = computed(() => this.guias().filter((g) => g.status === 'vencido'));

  // ── Nova guia ──
  // ── Período: governa os impedimentos e os números, nunca as guias ──
  // Abre no mes que ACABOU, nao no corrente: ver `mesDeFechamento`.
  readonly mes = signal(mesDeFechamento().mes);
  readonly ano = signal(mesDeFechamento().ano);
  readonly periodo = computed(() => `${this.ano()}-${String(this.mes()).padStart(2, '0')}`);
  readonly meses = MESES;
  readonly anos = computed(() => {
    const atual = new Date().getFullYear();
    return [atual, atual - 1, atual - 2];
  });

  // ── Os números do período ──
  readonly apuracao = signal<Apuracao | null>(null);
  readonly relatorio = signal<RelatorioConformidade | null>(null);
  readonly carregandoNumeros = signal(false);
  readonly erroNumeros = signal(false);

  /**
   * Só usa o que é **deste** período. Trocar de mês dispara duas requisições que chegam uma de
   * cada vez; sem isto a tela cruza o débito de um mês com o saldo de outro por um instante.
   * Protege também de resposta fora de ordem.
   */
  private doPeriodo<T extends { periodo: string }>(valor: T | null): T | null {
    return valor && valor.periodo === this.periodo() ? valor : null;
  }

  readonly conta = computed(() => this.doPeriodo(this.relatorio()));
  readonly apuracaoDoPeriodo = computed(() => this.doPeriodo(this.apuracao()));
  readonly saldoCredor = computed(() => (this.conta()?.saldoAPagar ?? 0) < 0);

  // ── O que impede fechar ──

  /**
   * Nota com inconsistência **do período escolhido**.
   *
   * Uma nota de junho não impede fechar outubro: ela nunca foi autorizada, então nunca entrou na
   * apuração de mês nenhum. O impedimento é do mês dela.
   */
  readonly notasDoPeriodo = computed(() =>
    this.notasComProblema().filter((n) => (n.dataEmissao ?? '').startsWith(this.periodo())),
  );

  readonly podeFechar = computed(
    () => this.notasDoPeriodo().length === 0 && this.guiasVencidas().length === 0,
  );

  /**
   * Enquanto notas e guias nao chegaram, a tela NAO sabe se o mes fecha.
   *
   * Sem isto ela afirmava "Nada impede fechar setembro" no instante em que abria -- as duas
   * listas comecam vazias, e vazio e exatamente o que `podeFechar()` entende como "tudo certo".
   * Um segundo depois a guia vencida chegava e a tela se contradizia. Dizer "esta tudo bem" e
   * voltar atras e pior do que nao dizer nada: o contador pode ter ja fechado a aba.
   */
  readonly apurandoImpedimentos = computed(() => this.carregandoNotas() || this.carregandoGuias());

  // ── O que o fisco apontou, ao expandir a nota ──
  readonly notaExpandida = signal<string | null>(null);
  readonly validacoes = signal<NotaValidacaoResponse[]>([]);
  readonly carregandoValidacoes = signal(false);

  /**
   * Abre (ou fecha) uma nota e busca o que impede emitir.
   *
   * O texto vem de `GET /notas/{id}/validacoes` — `code`, `field` e `message` do backend. Não é
   * frase minha: o contador precisa ver o que o validador fiscal disse, para saber o que pedir
   * ao produtor.
   */
  alternarNota(nota: NotaFiscal): void {
    if (this.notaExpandida() === nota.id) {
      this.notaExpandida.set(null);
      return;
    }

    this.notaExpandida.set(nota.id);
    this.validacoes.set([]);
    this.carregandoValidacoes.set(true);
    this.notasApi.listarValidacoes(nota.id).subscribe({
      next: (lista) => {
        this.validacoes.set(apenasUltimaChecagem(lista));
        this.carregandoValidacoes.set(false);
      },
      error: () => {
        this.validacoes.set([]);
        this.carregandoValidacoes.set(false);
      },
    });
  }

  /** O campo em português; identificador desconhecido cai nele mesmo. */
  rotuloCampo(campo?: string): string {
    return campo ? rotuloDoCampo(campo) : '';
  }

  /** `2026-10` -> "outubro de 2026". */
  formatPeriodo(periodo: string): string {
    const [ano, mes] = periodo.split('-');
    const d = new Date(Number(ano), Number(mes) - 1, 1);
    return Number.isNaN(d.getTime())
      ? periodo
      : d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }

  mudarMes(m: string | number): void {
    this.mes.set(Number(m));
    this.carregarNumeros();
  }

  mudarAno(a: string | number): void {
    this.ano.set(Number(a));
    this.carregarNumeros();
  }

  /**
   * Apuração e relatório do período, independentes entre si: a falha de um não apaga o outro.
   * Os valores anteriores são limpos na hora — melhor um instante vazio que o número do mês
   * passado passando por deste.
   */
  carregarNumeros(): void {
    this.carregandoNumeros.set(true);
    this.erroNumeros.set(false);
    this.apuracao.set(null);
    this.relatorio.set(null);
    this.notaExpandida.set(null);

    const periodo = this.periodo();
    this.tributarioApi.apuracao(periodo).subscribe({
      next: (a) => {
        this.apuracao.set(a);
        this.carregandoNumeros.set(false);
      },
      error: () => {
        this.erroNumeros.set(true);
        this.carregandoNumeros.set(false);
      },
    });
    this.tributarioApi.relatorioConformidade(periodo).subscribe({
      next: (r) => this.relatorio.set(r),
      error: () => this.erroNumeros.set(true),
    });
  }

  ngOnInit(): void {
    this.carregarGuias();
    this.carregarNumeros();
    this.dashboardApi.carregar().subscribe({ error: () => undefined });
    this.carregandoNotas.set(true);
    this.notasApi.listar({ size: 50, sort: 'dataEmissao,desc' }).subscribe({
      next: (pagina) => {
        this.notasComProblema.set(
          pagina.content.filter(
            (n) => n.status === 'COM_INCONSISTENCIAS' || n.status === 'REJEITADA',
          ),
        );
        this.carregandoNotas.set(false);
      },
      error: () => {
        this.notasComProblema.set([]);
        this.carregandoNotas.set(false);
      },
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

  baixarRelatorio(): void {
    this.baixandoRelatorio.set(true);
    const periodo = this.periodo();
    this.tributarioApi.relatorioConformidadePdf(periodo).subscribe({
      next: (resposta) => {
        this.baixandoRelatorio.set(false);
        const nome = filenameDeContentDisposition(
          resposta.headers.get('Content-Disposition'),
          `conformidade-${periodo}.pdf`,
        );
        if (resposta.body) salvarBlob(resposta.body, nome);
      },
      error: () => {
        this.baixandoRelatorio.set(false);
        this.toast.error('Não foi possível baixar o relatório.');
      },
    });
  }

  formatCurrency(valor: number): string {
    return (valor ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  formatDate(iso?: string): string {
    if (!iso) return '—';
    return new Date(iso.split('T')[0] + 'T12:00:00').toLocaleDateString('pt-BR');
  }
}
