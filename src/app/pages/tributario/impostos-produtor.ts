import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { falhaDaApi, type FalhaDaApi } from '@core/utils/erro-api';
import { FormsModule } from '@angular/forms';
import {
  LucideReceipt,
  LucideLoaderCircle,
  LucideRefreshCw,
  LucideLockOpen,
  LucideDownload,
  LucideTrendingUp,
  LucideTrendingDown,
  LucideMinus,
  LucideMessageCircleQuestion,
} from '@lucide/angular';
import { RouterLink } from '@angular/router';
import { TributarioApi } from '@services/tributario/data-access/tributario.service';
import { ContadorApi } from '@services/contador/data-access/contador.service';
import { switchMap } from 'rxjs';
import { AuthApi } from '@services/auth/data-access/auth.service';
import type { GuiaFiscal } from '@models/solicitacao-contador.model';
import { Apuracao, RelatorioConformidade } from '@models/tributario.model';
import { StatusApuracao } from '@core/enums/status-apuracao.enum';
import { ToastService } from '@core/services/toast.service';
import { mensagemDeEnvelope } from '@core/interceptors/api.interceptor';
import { salvarBlob, filenameDeContentDisposition, apiErrorDeBlob } from '@core/utils/download';
import { UiButton } from '@shared/ui/ui-button';
import { UiStat } from '@shared/ui/ui-stat';
import { AssistenteStore } from '@shared/assistente/assistente.store';

/**
 * Rótulo + classe de badge por status de apuração (RN004/RN005).
 *
 * Sobre os **tokens semânticos** (#45) em vez do par `bg-blue-100`/`dark:bg-blue-950`: o token já
 * troca de valor com o tema, então some a duplicação de cada cor em duas variantes — e o badge
 * passa a combinar com o resto do sistema, que é quem define o que é "atenção" e o que é "ok".
 */
const STATUS_APURACAO: Record<StatusApuracao, { label: string; classe: string }> = {
  ABERTO: { label: 'Aberto', classe: 'bg-info-soft text-info-ink border border-info/30' },
  EM_PROCESSAMENTO: {
    label: 'Em processamento',
    classe: 'bg-aviso-soft text-aviso-ink border border-aviso/30',
  },
  FECHADO: {
    label: 'Fechado',
    classe: 'bg-sucesso-soft text-sucesso-ink border border-sucesso/30',
  },
};

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
 * Tela Impostos (issue #27) — a apuração mensal de IBS/CBS do período, a conta que a produz e o
 * relatório de conformidade em PDF. Os fetches são **independentes**: a falha de um não esconde
 * os outros (TRIB-09).
 *
 * **Saiu o card "Saldo de créditos".** `GET /creditos` e a metade de crédito de
 * `GET /relatorios/conformidade` são a mesma query no backend (`somarCreditosPorPeriodo`, mesma
 * janela de mês): a tela mostrava o mesmo crédito em três lugares e fazia uma requisição a mais
 * para isso. O crédito agora aparece uma vez, dentro da conta, onde ele significa alguma coisa —
 * é o que abate o débito.
 */
@Component({
  selector: 'app-impostos-produtor',
  standalone: true,
  imports: [
    UiButton,
    UiStat,
    FormsModule,
    RouterLink,
    LucideReceipt,
    LucideLoaderCircle,
    LucideRefreshCw,
    LucideLockOpen,
    LucideDownload,
    LucideTrendingUp,
    LucideTrendingDown,
    LucideMinus,
    LucideMessageCircleQuestion,
  ],
  templateUrl: './impostos-produtor.html',
})
export class ImpostosProdutor implements OnInit {
  private readonly api = inject(TributarioApi);
  private readonly contadorApi = inject(ContadorApi);
  private readonly authApi = inject(AuthApi);
  private readonly toast = inject(ToastService);
  protected readonly assistente = inject(AssistenteStore);

  // ── Período (mês/ano) — default mês corrente (America/Sao_Paulo assumido pelo ambiente) ──
  readonly mes = signal(new Date().getMonth() + 1);
  readonly ano = signal(new Date().getFullYear());
  /** Período no formato YYYY-MM exigido pelos endpoints (contrato 7.4/7.5/7.6). */
  readonly periodo = computed(() => `${this.ano()}-${String(this.mes()).padStart(2, '0')}`);

  readonly meses = MESES;
  readonly anos = computed(() => {
    const atual = new Date().getFullYear();
    return [atual, atual - 1, atual - 2];
  });

  // ── Apuração ──
  readonly apuracao = signal<Apuracao | null>(null);
  readonly loadingApuracao = signal(false);
  readonly erroApuracao = signal(false);
  readonly statusApuracao = computed(() => {
    const s = this.apuracao()?.status;
    return s ? STATUS_APURACAO[s] : null;
  });
  // A reabertura **saiu daqui** (#117): passou a ser do escritorio, numa rota do contador. O botao
  // vivia desabilitado, com um aviso dizendo que o backend nao expunha o id da apuracao -- a rota
  // nova nao pede id, e sim produtor e periodo. Ver `CarteiraApi.reabrirApuracao`.

  /**
   * Os cinco meses **antes** do selecionado, por período (`AAAA-MM`).
   *
   * Eram **cinco requisições**, uma por mês, e havia aqui um comentário dizendo que era assim
   * porque "não existe endpoint de histórico". Existe — `GET /apuracao?de=&ate=` — e foi conferido
   * no OpenAPI do backend e medido contra a API em 29/10. Agora é **uma** chamada (#116).
   *
   * A faixa vem **sem buraco** por contrato: mês sem nota chega zerado. Então o `null` deixou de
   * significar "este mês falhou" e passa a não acontecer: ou a faixa inteira responde, ou nenhuma
   * parte dela. Continua falhando em silêncio — sem ela a tela perde o histórico, não o número
   * principal.
   */
  private readonly mesesAnteriores = signal<Record<string, Apuracao | null>>({});

  /** Quantos meses a faixa mostra, contando o da tela. */
  private static readonly MESES_NO_HISTORICO = 6;

  /**
   * A apuração do mês anterior, para a frase de comparação — tirada do mesmo histórico, para não
   * pedir ao servidor duas vezes o mesmo mês.
   */
  private readonly apuracaoAnterior = computed(
    () => this.mesesAnteriores()[this.periodoAnterior()] ?? null,
  );

  /**
   * A faixa dos seis meses, do mais antigo ao mês na tela.
   *
   * **Por que ela existe:** "R$ 1.809,50" sozinho não diz se é muito ou pouco. A frase de
   * comparação responde por um mês; a faixa responde pelo semestre — é onde o produtor vê que
   * dezembro sempre pesa, ou que o imposto vem subindo desde a colheita.
   *
   * Mês sem resposta entra como `valor: null` e aparece como lacuna. Zerar seria afirmar que
   * não houve movimento, que é coisa diferente de não ter conseguido olhar.
   */
  readonly historico = computed(() => {
    const anteriores = this.mesesAnteriores();
    const selecionado = this.periodo();
    const meses: {
      periodo: string;
      valor: number | null;
      ibs: number;
      cbs: number;
      atual: boolean;
    }[] = [];

    for (let atras = ImpostosProdutor.MESES_NO_HISTORICO - 1; atras >= 1; atras--) {
      const periodo = this.periodoDeslocado(-atras);
      const a = anteriores[periodo];
      meses.push({
        periodo,
        valor: a ? a.saldoIbs + a.saldoCbs : null,
        ibs: a?.saldoIbs ?? 0,
        cbs: a?.saldoCbs ?? 0,
        atual: false,
      });
    }

    const atual = this.apuracao();
    meses.push({
      periodo: selecionado,
      valor: atual ? atual.saldoIbs + atual.saldoCbs : null,
      ibs: atual?.saldoIbs ?? 0,
      cbs: atual?.saldoCbs ?? 0,
      atual: true,
    });
    return meses;
  });

  /**
   * Media dos meses que responderam.
   *
   * E a referencia que faltava: a barra mais comprida sempre parece cara, porque ela e o
   * proprio teto da escala. Com a media desenhada atravessando a faixa, o produtor ve se o
   * mes ficou acima ou abaixo do normal dele -- que e a pergunta de verdade.
   *
   * Menos de dois meses com resposta nao tem media que signifique nada.
   */
  readonly mediaDoHistorico = computed(() => {
    const valores = this.historico()
      .map((m) => m.valor)
      .filter((v): v is number => v !== null);
    if (valores.length < 2) return null;
    return valores.reduce((total, v) => total + v, 0) / valores.length;
  });

  /** Maior valor absoluto da faixa — é ele que define o comprimento das barras. */
  readonly maiorDoHistorico = computed(() =>
    Math.max(0, ...this.historico().map((m) => Math.abs(m.valor ?? 0))),
  );

  /** A faixa só vale a pena quando há mais de um mês com resposta. */
  readonly temHistorico = computed(
    () => this.historico().filter((m) => m.valor !== null).length > 1,
  );

  /**
   * Quanto o saldo variou em relação ao mês anterior. `null` quando não há com o que comparar —
   * e aí a tela não diz nada, em vez de insinuar estabilidade que ninguém apurou.
   */
  readonly variacao = computed(() => {
    const atual = this.apuracao();
    const anterior = this.apuracaoAnterior();
    if (!atual || !anterior) return null;

    const hoje = atual.saldoIbs + atual.saldoCbs;
    const antes = anterior.saldoIbs + anterior.saldoCbs;
    const diferenca = hoje - antes;
    if (antes === 0 && diferenca === 0) return null;

    return {
      diferenca,
      // Sem base não há percentual: de zero para qualquer coisa não é "infinito por cento".
      percentual: antes === 0 ? null : (diferenca / Math.abs(antes)) * 100,
      periodoAnterior: anterior.periodo,
    };
  });

  /**
   * Guias lançadas pelo escritório para este período — é o que transforma "você deve R$ X" em
   * "vence dia 20". Antes o valor ficava órfão aqui e a guia morava só na tela de Prazos.
   *
   * O recorte por período é feito aqui porque `GET /contador/guias` só aceita `produtorId`
   * (sem filtro de data). Com filtro no servidor isto sai — ver SupersonicTeam/backend#174.
   */
  private readonly guias = signal<GuiaFiscal[]>([]);

  readonly guiasDoPeriodo = computed(() =>
    this.guias()
      .filter((g) => (g.dataVencimento ?? '').startsWith(this.periodo()))
      .sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento)),
  );

  readonly guiasCarregadas = signal(false);

  // ── Relatório de conformidade ──
  readonly relatorio = signal<RelatorioConformidade | null>(null);
  readonly loadingRelatorio = signal(false);
  readonly erroRelatorio = signal(false);
  readonly baixandoPdf = signal(false);

  /**
   * **A conta que produz o número**: saídas − entradas = saldo, com o IBS/CBS por dentro.
   *
   * Vem do relatório de conformidade porque é ele que diz **quantas** notas entraram de cada
   * lado — e é a mesma agregação que alimenta a apuração no backend (`somarDebitosPorPeriodo` /
   * `somarCreditosPorPeriodo`), então os dois números batem. Se o relatório falhar, cai para a
   * própria apuração: perde-se a contagem, não a conta (TRIB-09).
   */
  readonly conta = computed(() => {
    const rel = this.doPeriodo(this.relatorio());
    if (rel) {
      return {
        debito: { ibs: rel.debitoIbs, cbs: rel.debitoCbs, total: rel.debitoTotal },
        credito: { ibs: rel.creditoIbs, cbs: rel.creditoCbs, total: rel.creditoTotal },
        saldo: rel.saldoAPagar,
        saidas: rel.quantidadeSaidas as number | null,
        entradas: rel.quantidadeEntradas as number | null,
      };
    }

    const ap = this.doPeriodo(this.apuracao());
    if (!ap) return null;
    return {
      debito: { ibs: ap.debitoIbs, cbs: ap.debitoCbs, total: ap.debitoIbs + ap.debitoCbs },
      credito: { ibs: ap.creditoIbs, cbs: ap.creditoCbs, total: ap.creditoIbs + ap.creditoCbs },
      saldo: ap.saldoIbs + ap.saldoCbs,
      saidas: null,
      entradas: null,
    };
  });

  /** `saldoAPagar` negativo = saldo credor (contrato 8.8) — muda apenas o rótulo, não o valor. */
  readonly saldoCredor = computed(() => (this.conta()?.saldo ?? 0) < 0);

  /**
   * A apuração FECHADA é um retrato: o job a congelou e nenhum evento de nota a recalcula — só a
   * reabertura auditada corrige (RN005). O relatório, não: ele soma as notas de agora. Quando os
   * dois discordam, alguma nota do mês mudou depois do fechamento, e quem lê precisa saber disso
   * em vez de escolher sozinho em qual dos dois números acreditar.
   */
  readonly contaDivergeDaApuracao = computed(() => {
    const ap = this.doPeriodo(this.apuracao());
    const rel = this.doPeriodo(this.relatorio());
    // Sem fechamento não há retrato congelado: aí divergência é coisa de carregamento, não
    // notícia para o produtor.
    if (!ap || !rel || !ap.dataFechamento) return false;
    return Math.abs(ap.saldoIbs + ap.saldoCbs - rel.saldoAPagar) >= 0.01;
  });

  /**
   * Só usa o que é **deste** período.
   *
   * Cruzar apuração e relatório no mesmo bloco trouxe um problema que, enquanto cada um morava
   * no seu card, ninguém via: ao trocar de mês as respostas chegam uma de cada vez, e por um
   * instante a tela mostrava o débito de um mês ao lado do saldo de outro — com a conta acusando
   * uma divergência que não existe. Respostas fora de ordem (trocar de mês duas vezes rápido)
   * fariam o mesmo. Ambos os contratos carregam o `periodo`; é ele quem decide.
   */
  private doPeriodo<T extends { periodo: string }>(valor: T | null): T | null {
    return valor && valor.periodo === this.periodo() ? valor : null;
  }

  ngOnInit(): void {
    this.carregar();
  }

  /** Recarrega todas as seções para o período atual (fetches independentes). */
  carregar(): void {
    this.carregarApuracao();
    this.carregarMesesAnteriores();
    this.carregarRelatorio();
    this.carregarGuias();
  }

  /** Mês anterior ao selecionado, em `AAAA-MM`. */
  private periodoAnterior(): string {
    return this.periodoDeslocado(-1);
  }

  /** O período `meses` à frente (negativo para trás) do selecionado, em `AAAA-MM`. */
  private periodoDeslocado(meses: number): string {
    const d = new Date(this.ano(), this.mes() - 1 + meses, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * Busca os cinco meses anteriores **numa requisição só** (#116).
   *
   * Cada item entra no mapa pela chave do período que **ele** declara, e não pela posição na
   * lista: é a mesma precaução de antes, agora barata — trocar de mês rápido ainda faz respostas
   * se cruzarem, e um saldo no mês errado é pior que um buraco.
   */
  private carregarMesesAnteriores(): void {
    this.mesesAnteriores.set({});
    const ate = this.periodoDeslocado(-1);
    const de = this.periodoDeslocado(-(ImpostosProdutor.MESES_NO_HISTORICO - 1));
    this.api.apuracaoFaixa(de, ate).subscribe({
      next: (faixa) => {
        const mapa: Record<string, Apuracao | null> = {};
        for (const a of faixa) if (a.periodo) mapa[a.periodo] = a;
        this.mesesAnteriores.set(mapa);
      },
      error: () => this.mesesAnteriores.set({}),
    });
  }

  /** A falha da busca de guias, quando houve — separada de "não há guia" (#107). */
  readonly erroGuias = signal<FalhaDaApi | null>(null);

  private carregarGuias(): void {
    this.guiasCarregadas.set(false);
    this.erroGuias.set(null);
    // O id do produtor vem do servidor, nao de constante (#106): `GET /auth/me` ja existe e
    // devolve o id do autenticado. Ver `AuthApi`.
    this.authApi
      .carregar()
      .pipe(switchMap((sessao) => this.contadorApi.getGuias(sessao.usuarioId)))
      .subscribe({
      next: (lista) => {
        this.guias.set(lista);
        this.guiasCarregadas.set(true);
      },
      // A lista **não** é zerada: o que estava na tela é o último dado verdadeiro do servidor.
      // Zerar em falha fazia a guia sumir como se tivesse sido paga (#107).
      error: (err: HttpErrorResponse) => {
        this.erroGuias.set(falhaDaApi(err));
        this.guiasCarregadas.set(true);
      },
    });
  }

  /** `pago`/`vencido`/`pendente` em palavra de produtor. */
  rotuloGuia(status: GuiaFiscal['status']): string {
    return { pago: 'Paga', vencido: 'Vencida', pendente: 'Em aberto' }[status] ?? status;
  }

  classeGuia(status: GuiaFiscal['status']): string {
    const tons: Record<GuiaFiscal['status'], string> = {
      pendente: 'bg-aviso-soft text-aviso-ink border-aviso/30',
      pago: 'bg-sucesso-soft text-sucesso-ink border-sucesso/30',
      vencido: 'bg-perigo-soft text-perigo-ink border-perigo/30',
    };
    return `inline-flex items-center rounded-full border px-2 py-0.5 text-apoio font-medium ${tons[status]}`;
  }

  carregarApuracao(): void {
    this.loadingApuracao.set(true);
    this.erroApuracao.set(false);
    this.apuracao.set(null);
    this.api.apuracao(this.periodo()).subscribe({
      next: (a) => {
        this.apuracao.set(a);
        this.loadingApuracao.set(false);
      },
      error: () => {
        this.apuracao.set(null);
        this.erroApuracao.set(true);
        this.loadingApuracao.set(false);
      },
    });
  }

  carregarRelatorio(): void {
    this.loadingRelatorio.set(true);
    this.erroRelatorio.set(false);
    this.relatorio.set(null);
    this.api.relatorioConformidade(this.periodo()).subscribe({
      next: (r) => {
        this.relatorio.set(r);
        this.loadingRelatorio.set(false);
      },
      error: () => {
        this.relatorio.set(null);
        this.erroRelatorio.set(true);
        this.loadingRelatorio.set(false);
      },
    });
  }

  /**
   * Baixa o PDF do relatório de conformidade (blob), lendo o nome do arquivo de `Content-Disposition`
   * (fallback `conformidade-{periodo}.pdf`). Em erro-como-blob, deriva a mensagem via `errors[].code`.
   */
  baixarPdf(): void {
    this.baixandoPdf.set(true);
    const periodo = this.periodo();
    this.api.relatorioConformidadePdf(periodo).subscribe({
      next: (resp) => {
        this.baixandoPdf.set(false);
        const nome = filenameDeContentDisposition(
          resp.headers.get('Content-Disposition'),
          `conformidade-${periodo}.pdf`,
        );
        salvarBlob(resp.body!, nome);
      },
      error: async (err: HttpErrorResponse) => {
        this.baixandoPdf.set(false);
        const env = err?.error instanceof Blob ? await apiErrorDeBlob(err.error) : null;
        this.toast.error(
          env ? mensagemDeEnvelope(env, err?.status ?? 0) : 'Não foi possível baixar o PDF.',
        );
      },
    });
  }



  /**
   * Abre a Ceres já perguntando sobre a apuração na tela.
   *
   * A pergunta vai pronta porque o produtor não precisa redigir o que a tela já sabe — e porque
   * "como foi calculada" é exatamente o que a função `consultarApuracao` dela responde, com as
   * notas e a lei por trás. O botão só aparece quando ela atende (`disponivel`): para o contador
   * a conversa não existe.
   */
  perguntarACeres(): void {
    this.assistente.abrirPerguntando(
      `Como foi calculada a minha apuração de ${this.formatPeriodo(this.periodo())}?`,
    );
  }

  /** Atualiza o mês do período e recarrega. */
  mudarMes(m: string | number): void {
    this.mes.set(Number(m));
    this.carregar();
  }

  /** Atualiza o ano do período e recarrega. */
  mudarAno(a: string | number): void {
    this.ano.set(Number(a));
    this.carregar();
  }

  /** Vai para um `AAAA-MM` inteiro — é por aqui que a faixa dos seis meses navega. */
  mudarParaPeriodo(periodo: string): void {
    const [ano, mes] = periodo.split('-').map(Number);
    if (!ano || !mes) return;
    this.ano.set(ano);
    this.mes.set(mes);
    this.carregar();
  }

  /** `2026-08` -> "agosto de 2026". O produtor nao fala AAAA-MM. */
  formatPeriodo(periodo: string): string {
    const [ano, mes] = periodo.split('-');
    const d = new Date(Number(ano), Number(mes) - 1, 1);
    return Number.isNaN(d.getTime())
      ? periodo
      : d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }

  /** `2026-08` -> "ago/26". Rotulo curto, para caber na faixa dos seis meses. */
  formatMesCurto(periodo: string): string {
    const [ano, mes] = periodo.split('-');
    const d = new Date(Number(ano), Number(mes) - 1, 1);
    if (Number.isNaN(d.getTime())) return periodo;
    const nome = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
    return `${nome}/${ano.slice(2)}`;
  }

  /** Comprimento da barra do mes, em porcentagem do maior da faixa. */
  larguraDaBarra(valor: number | null): number {
    const maior = this.maiorDoHistorico();
    // Mes zerado nao ganha barra: o piso abaixo existe para o movimento pequeno nao sumir,
    // e dar um tracinho ao zero seria inventar movimento que nao houve.
    if (valor === null || valor === 0 || maior === 0) return 0;
    return Math.max(2, (Math.abs(valor) / maior) * 100);
  }

  /**
   * O que o leitor de tela ouve em cada mes da faixa.
   *
   * A barra e desenho (`aria-hidden`), entao a composicao IBS/CBS so existe para quem enxerga
   * -- a nao ser que ela entre aqui. Mes sem resposta diz isso, em vez de "R$ 0,00", que seria
   * afirmar que nao houve movimento.
   */
  descricaoDoMes(mes: { periodo: string; valor: number | null; ibs: number; cbs: number }): string {
    const quando = this.formatPeriodo(mes.periodo);
    if (mes.valor === null) return `${quando}: sem resposta do servidor`;
    const total = this.formatCurrency(mes.valor);
    if (mes.valor < 0) return `${quando}: ${total} de credito`;
    return (
      `${quando}: ${total}, sendo ${this.formatCurrency(mes.ibs)} de IBS ` +
      `e ${this.formatCurrency(mes.cbs)} de CBS`
    );
  }

  /**
   * Comprimento de UM PEDACO (IBS ou CBS) da barra, em % do maior mes da faixa.
   *
   * Sem piso minimo, ao contrario do `larguraDaBarra`: aqui o pedaco minusculo pode sumir
   * sem prejuizo, porque o outro pedaco e a propria barra. Dar 2% ao IBS de um mes que foi
   * quase todo CBS mentiria sobre a proporcao, que e justamente o que o empilhamento conta.
   */
  larguraDoPedaco(valor: number): number {
    const maior = this.maiorDoHistorico();
    if (!valor || maior === 0) return 0;
    return (Math.abs(valor) / maior) * 100;
  }

  /** Quanto um pedaco representa do total, em %. Total zerado nao divide nada. */
  fatiaDoSaldo(parte: number, total: number): number {
    if (!total) return 0;
    return Math.min(100, Math.max(0, (parte / total) * 100));
  }

  /** Onde a linha da media cruza a faixa, em % do maior mes. */
  readonly posicaoDaMedia = computed(() => {
    const media = this.mediaDoHistorico();
    const maior = this.maiorDoHistorico();
    if (media === null || maior === 0) return null;
    return Math.min(100, (Math.abs(media) / maior) * 100);
  });

  /** Sempre com sinal explicito: "+18%" e "-7%" leem melhor que "18%" solto. */
  formatPercentual(valor: number): string {
    const sinal = valor > 0 ? '+' : '';
    return `${sinal}${valor.toFixed(0)}%`;
  }

  formatCurrency(v?: number | null): string {
    return (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  /**
   * Formata as duas coisas que esta tela mostra: instante completo (`dataFechamento`,
   * `2026-08-01T03:00:00Z`) e data pura (`dataVencimento` da guia, `2026-09-10`).
   *
   * **A data pura precisa do meio-dia.** `new Date('2026-09-10')` é lido como meia-noite em
   * **UTC**; renderizado no fuso de Brasília (UTC−3) vira 09/09 — a guia aparecia vencendo um dia
   * antes do que o backend informou. Ancorar ao meio-dia local tira a data do alcance de qualquer
   * fuso entre −11 e +12.
   */
  formatDate(iso?: string | null): string {
    if (!iso) return '—';
    const soData = /^\d{4}-\d{2}-\d{2}$/.test(iso);
    const d = new Date(soData ? `${iso}T12:00:00` : iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('pt-BR');
  }
}
