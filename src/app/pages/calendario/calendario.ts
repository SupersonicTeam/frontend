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
  readonly vencimentos = computed(() => [
    ...this.vencimentosReais(),
    ...this.vencimentosContador(),
  ]);
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

  /**
   * **A janela da lista, em meses para trás e para a frente de hoje.**
   *
   * A tela só olhava o mês corrente — e por isso não mostrava a guia GPS vencida em 10/09, que é
   * justamente o que mais precisa ser visto. Três meses para trás cobrem o atraso que ainda dá
   * para resolver; três para a frente, o que dá para se preparar.
   */
  private static readonly MESES_ATRAS = 3;
  private static readonly MESES_FRENTE = 3;

  /** Hoje em `AAAA-MM-DD`, fixado na carga: a data não pode mudar no meio de um computed. */
  private readonly hoje = signal(CalendarioPage.hojeISO());

  /**
   * Tudo que vence na janela, do que vence primeiro ao que vence por último.
   *
   * Ordenar por data **é** o conteúdo desta tela. A lista antiga vinha na ordem em que o servidor
   * mandou: 31/10 aparecia antes de 20/10, numa tela cujo nome é "Prazos".
   */
  readonly prazos = computed(() => {
    const de = this.limiteDaJanela(-CalendarioPage.MESES_ATRAS);
    const ate = this.limiteDaJanela(CalendarioPage.MESES_FRENTE, true);
    return this.vencimentos()
      .filter((v) => v.dataVencimento >= de && v.dataVencimento <= ate)
      .sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento));
  });

  /**
   * Atrasado é o que não foi pago e tem data no passado.
   *
   * Não basta confiar em `status === 'vencido'`: quem vira a guia é um job diário, então entre a
   * meia-noite e a rodada do job uma guia vencida ainda chega como `pendente`. A data não mente.
   */
  readonly atrasados = computed(() =>
    this.prazos().filter((v) => v.status !== 'pago' && v.dataVencimento < this.hoje()),
  );

  /** O que ainda vai vencer (inclui hoje), sem o que já foi pago. */
  readonly aVencer = computed(() =>
    this.prazos().filter((v) => v.status !== 'pago' && v.dataVencimento >= this.hoje()),
  );

  /** O próximo a vencer — o único número que a tela precisa dar de cara. */
  readonly proximoPrazo = computed(() => this.aVencer()[0] ?? null);

  readonly totalAtrasado = computed(() =>
    this.atrasados().reduce((soma, v) => soma + (v.valor ?? 0), 0),
  );

  /** O que já foi pago na janela, para a lista não dar a impressão de que nada foi resolvido. */
  readonly jaPagos = computed(() => this.prazos().filter((v) => v.status === 'pago'));

  /**
   * A lista em três blocos, nesta ordem: o que está atrasado, o que vai vencer, o que já foi
   * pago. Bloco vazio não aparece — um título "Atrasados" sobre o nada é um susto à toa.
   */
  readonly gruposDePrazo = computed(() => {
    const grupos: { chave: string; titulo: string; itens: VencimentoFiscal[] }[] = [];
    const atrasados = this.atrasados();
    const aVencer = this.aVencer();
    const pagos = this.jaPagos();
    if (atrasados.length)
      grupos.push({ chave: 'atrasados', titulo: 'Atrasados', itens: atrasados });
    if (aVencer.length) grupos.push({ chave: 'a-vencer', titulo: 'A vencer', itens: aVencer });
    if (pagos.length) grupos.push({ chave: 'pagos', titulo: 'Já pagos', itens: pagos });
    return grupos;
  });

  /**
   * A legenda só lista o que o mês realmente tem.
   *
   * Ela era fixa com três tipos, mas o backend hoje só emite `imposto` — as outras duas bolinhas
   * explicavam cores que nunca apareciam na grade. Quando `obrigacao`, `declaracao` e
   * `solicitacao` passarem a vir, elas entram sozinhas.
   */
  readonly legenda = computed(() => {
    const presentes = new Set(this.vencimentosDoMes().map((v) => v.tipo));
    const linhas: { chave: string; cor: string; texto: string }[] = [];
    if (presentes.has('imposto')) {
      linhas.push({ chave: 'imposto', cor: 'bg-aviso', texto: 'Imposto a pagar' });
    }
    if (presentes.has('obrigacao') || presentes.has('declaracao')) {
      linhas.push({ chave: 'obrigacao', cor: 'bg-info', texto: 'Obrigação ou declaração' });
    }
    if (presentes.has('solicitacao')) {
      linhas.push({ chave: 'solicitacao', cor: 'bg-accent', texto: 'Pedido do contador' });
    }
    return linhas;
  });

  /** Leva a grade para o mês da data e seleciona o dia — é como a lista conversa com o mapa. */
  irParaData(iso: string): void {
    const d = new Date(`${iso}T12:00:00`);
    if (Number.isNaN(d.getTime())) return;
    this.mesAtual.set(new Date(d.getFullYear(), d.getMonth(), 1));
    this.dataSelecionada.set(d);
    this.carregarMes(this.chaveDoMes(d));
  }

  /** `2026-10-20` -> "20/10/2026", para a lista, que mistura meses. */
  formatDataCompleta(iso: string): string {
    return new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR');
  }

  /** Dias de hoje até a data (negativo = já passou). Conta dia de calendário, não 24h. */
  diasAte(iso: string): number {
    const alvo = new Date(`${iso}T12:00:00`).getTime();
    const hoje = new Date(`${this.hoje()}T12:00:00`).getTime();
    return Math.round((alvo - hoje) / 86_400_000);
  }

  /** "vence hoje", "em 13 dias", "venceu há 27 dias" — a conta que o produtor faria de cabeça. */
  rotuloPrazo(iso: string): string {
    const dias = this.diasAte(iso);
    if (dias === 0) return 'vence hoje';
    if (dias === 1) return 'vence amanhã';
    if (dias === -1) return 'venceu ontem';
    return dias > 0 ? `em ${dias} dias` : `venceu há ${-dias} dias`;
  }

  /** O prazo aperta: até 3 dias o rótulo já fica em tom de alerta. */
  classeRotulo(iso: string, status: string): string {
    if (status === 'pago') return 'text-sucesso-ink';
    const dias = this.diasAte(iso);
    if (dias < 0) return 'font-semibold text-perigo-ink';
    if (dias <= 3) return 'font-semibold text-aviso-ink';
    return 'text-muted-foreground';
  }

  ngOnInit(): void {
    this.carregar();
  }

  /**
   * Carrega o mês que está na tela e as solicitações do contador, desacoplados: uma falha em
   * `/calendario-fiscal` mostra o banner de erro sem esconder as solicitações, e vice-versa.
   */
  carregar(): void {
    this.hoje.set(CalendarioPage.hojeISO());
    this.carregarJanela();
    this.carregarVencimentosContador();
  }

  /**
   * Busca a janela inteira (−3/+3 meses) em **uma** requisição e reparte o resultado no cache por
   * mês. Assim a lista nasce completa e a grade já tem os sete meses carregados: navegar entre
   * eles não custa mais nada. Fora da janela, `carregarMes` continua buscando mês a mês.
   */
  private carregarJanela(): void {
    const de = this.limiteDaJanela(-CalendarioPage.MESES_ATRAS);
    const ate = this.limiteDaJanela(CalendarioPage.MESES_FRENTE, true);

    this.loading.set(true);
    this.vencimentosErro.set(false);

    this.calendarioService.getVencimentos(LOGGED_PRODUCER_ID, { de, ate }).subscribe({
      next: (vencimentos) => {
        // Todo mês da janela entra no cache, inclusive vazio: sem isso a grade buscaria de novo
        // um mês que esta requisição já respondeu "não tem nada".
        const mapa: Record<string, VencimentoFiscal[]> = {};
        for (let i = -CalendarioPage.MESES_ATRAS; i <= CalendarioPage.MESES_FRENTE; i++) {
          mapa[this.chaveDoMes(this.mesDeslocado(i))] = [];
        }
        vencimentos.forEach((v) => {
          const chave = v.dataVencimento.slice(0, 7);
          (mapa[chave] ??= []).push(v);
        });
        this.vencimentosPorMes.update((atual) => ({ ...atual, ...mapa }));
        this.vencimentosErro.set(false);
        this.loading.set(false);
      },
      error: () => {
        this.vencimentosErro.set(true);
        this.loading.set(false);
      },
    });
  }

  /** Primeiro dia do mês `offset` meses a partir de hoje (ou o último, com `fimDoMes`). */
  private limiteDaJanela(offset: number, fimDoMes = false): string {
    const d = this.mesDeslocado(offset);
    const ano = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = fimDoMes ? new Date(ano, d.getMonth() + 1, 0).getDate() : 1;
    return `${ano}-${mes}-${String(dia).padStart(2, '0')}`;
  }

  private mesDeslocado(offset: number): Date {
    const hoje = new Date(`${this.hoje()}T12:00:00`);
    return new Date(hoje.getFullYear(), hoje.getMonth() + offset, 1);
  }

  private static hojeISO(): string {
    const d = new Date();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mes}-${dia}`;
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
          (p.status === 'pendente' || p.status === 'enviado' || p.status === 'rejeitado') &&
          p.prazo,
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
    return CalendarioPage.primeiraMaiuscula(
      this.mesAtual().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
    );
  }

  nomeDiaSelecionado(): string {
    return CalendarioPage.primeiraMaiuscula(
      this.dataSelecionada().toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
      }),
    );
  }

  /**
   * Só a primeira letra.
   *
   * O template usava a classe `capitalize`, que é `text-transform: capitalize` e sobe **toda**
   * palavra: saía "Outubro De 2026" e "Quarta-Feira, 07 De Outubro". Em português a preposição
   * fica minúscula, e isso é visível para qualquer banca.
   */
  private static primeiraMaiuscula(texto: string): string {
    return texto.charAt(0).toUpperCase() + texto.slice(1);
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
    if (tipo === 'imposto' && eventos.imposto)
      return selected ? 'bg-primary-foreground' : 'bg-aviso';
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
