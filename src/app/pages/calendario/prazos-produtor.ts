import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  LucideCalendar,
  LucideChevronLeft,
  LucideChevronRight,
  LucideCheck,
  LucideMessageCircle,
  LucideLoaderCircle,
  LucideRefreshCw,
} from '@lucide/angular';
import { CalendarioApi } from '@services/calendario/data-access/calendario.service';
import { NotificacaoApi } from '@services/notificacao/data-access/notificacao.service';
import { ToastService } from '@core/services/toast.service';
import { VencimentoFiscal } from '@models/vencimento-fiscal.model';
import { switchMap } from 'rxjs';
import { AuthApi } from '@services/auth/data-access/auth.service';

@Component({
  selector: 'app-prazos-produtor',
  standalone: true,
  imports: [
    RouterLink,
    LucideCalendar,
    LucideChevronLeft,
    LucideChevronRight,
    LucideCheck,
    LucideMessageCircle,
    LucideLoaderCircle,
    LucideRefreshCw,
  ],
  templateUrl: './prazos-produtor.html',
})
export class PrazosProdutor implements OnInit {
  private readonly calendarioService = inject(CalendarioApi);
  private readonly authApi = inject(AuthApi);
  private readonly notificacaoService = inject(NotificacaoApi);
  private readonly toastService = inject(ToastService);

  /**
   * Vencimentos já buscados, **por mês** (`AAAA-MM`). A janela é do servidor: cada mês visitado
   * vira uma busca, e o que já veio fica guardado para voltar ao mês não custar outra requisição.
   */
  private readonly vencimentosPorMes = signal<Record<string, VencimentoFiscal[]>>({});

  private readonly vencimentosReais = computed(() =>
    Object.values(this.vencimentosPorMes()).flat(),
  );

  // Fonte unica: `/calendario-fiscal/{id}/vencimentos`.
  //
  // Eram duas. A segunda buscava as solicitacoes do contador a parte e as convertia em eventos --
  // contra `/contador/pendencias?produtorId=`, que **nunca existiu** e respondia 404 em toda
  // abertura da tela. Desde a backend#180 o proprio calendario devolve a pendencia com prazo como
  // `tipo: "solicitacao"` (medido em 28/10), entao a conversao a mao virou uma segunda verdade
  // sobre o mesmo dado -- e a que estava sempre vazia.
  readonly vencimentos = computed(() => this.vencimentosReais());
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

  /**
   * O que cai em cada dia do mês, **por situação**.
   *
   * Era por tipo (imposto/obrigação/solicitação) e virava um ponto de 6px — numa grade de 35
   * células com dois dias marcados, ninguém achava. Numa tela de prazos quem decide a cor é a
   * situação: atrasado, a vencer, pago. O dia inteiro passa a ser a marca.
   */
  readonly diasComPrazo = computed(() => {
    const mapa: Record<
      number,
      { atrasado: boolean; aVencer: boolean; pago: boolean; quantidade: number; rotulo: string }
    > = {};
    const mes = this.chaveDoMes(this.mesAtual());
    const hoje = this.hoje();

    this.vencimentos()
      .filter((v) => v.dataVencimento.startsWith(mes))
      .forEach((v) => {
        const dia = Number(v.dataVencimento.slice(8, 10));
        const atual = (mapa[dia] ??= {
          atrasado: false,
          aVencer: false,
          pago: false,
          quantidade: 0,
          rotulo: '',
        });
        atual.quantidade += 1;
        atual.rotulo ||= this.rotuloCurto(v.titulo);
        if (v.status === 'pago') atual.pago = true;
        else if (v.dataVencimento < hoje) atual.atrasado = true;
        else atual.aVencer = true;
      });
    return mapa;
  });

  /**
   * "Guia ICMS" vira "ICMS".
   *
   * A celula do calendario diz **o que** vence ali, nao so que algo vence. Era a reclamacao do
   * grupo: a versao antiga da tela mostrava a data em que mandar cada coisa, e a atual pinta a
   * celula e guarda o nome num painel ao lado -- que no dia de hoje, o dia aberto por padrao,
   * costuma dizer "nada vence neste dia".
   *
   * A sigla e o que o produtor reconhece; "Guia" se repete em todas e nao distingue nenhuma.
   */
  private rotuloCurto(titulo: string): string {
    return titulo.replace(/^guias?\s+/i, '').trim();
  }

  /** Quantos prazos o mês na grade tem — vai ao lado do nome do mês. */
  readonly prazosNoMes = computed(
    () =>
      this.vencimentos().filter((v) =>
        v.dataVencimento.startsWith(this.chaveDoMes(this.mesAtual())),
      ).length,
  );

  /** A grade está em outro mês que não o de hoje? Aí vale oferecer a volta. */
  readonly foraDoMesCorrente = computed(
    () => this.chaveDoMes(this.mesAtual()) !== this.hoje().slice(0, 7),
  );

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
  private readonly hoje = signal(PrazosProdutor.hojeISO());

  /**
   * Tudo que vence na janela, do que vence primeiro ao que vence por último.
   *
   * Ordenar por data **é** o conteúdo desta tela. A lista antiga vinha na ordem em que o servidor
   * mandou: 31/10 aparecia antes de 20/10, numa tela cujo nome é "Prazos".
   */
  readonly prazos = computed(() => {
    const de = this.limiteDaJanela(-PrazosProdutor.MESES_ATRAS);
    const ate = this.limiteDaJanela(PrazosProdutor.MESES_FRENTE, true);
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

  /**
   * "quinta-feira, 15 de outubro" — o eixo da linha do tempo.
   *
   * Por extenso, e nao `15/10/2026`: a linha de hoje e o unico lugar da tela onde a data e lida
   * como quem fala, nao conferida como quem confere numero.
   */
  readonly hojePorExtenso = computed(() => {
    const d = new Date(`${this.hoje()}T12:00:00`);
    return d.toLocaleDateString('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  });

  /**
   * A frase de data de um prazo, montada aqui e nao no template.
   *
   * No template ela virava `{{ data }}@if (desc) {, {{ desc }}}.` -- e o formatador quebrava
   * aquilo em linhas, metendo espaco antes da virgula e do ponto ("10 de setembro , ... ."). Em
   * TypeScript a frase e uma string so, e a pontuacao cola onde deve.
   */
  frasePrazo(v: VencimentoFiscal): string {
    const quando = this.dataPorExtenso(v.dataVencimento);
    // "Vence" e verbo de guia. A obrigacao (status nulo, #181) nao se paga: dizer que ela "venceu"
    // sugere divida, e no caso do fechamento da apuracao -- que acontece sozinho -- sugere uma
    // falta que nao houve. Para ela o prazo apenas **era** aquela data.
    const verbo =
      v.status === null
        ? this.diasAte(v.dataVencimento) < 0
          ? 'O prazo era'
          : 'O prazo é'
        : v.status === 'pago'
          ? 'Venceu em'
          : this.diasAte(v.dataVencimento) < 0
            ? 'Vencia em'
            : 'Vence em';
    const referencia = v.descricao ? `, ${v.descricao.toLowerCase()}` : '';
    return `${verbo} ${quando}${referencia}.`;
  }

  /** "20 de outubro". Sem o ano, que na janela de seis meses so faz ruido. */
  dataPorExtenso(iso: string): string {
    const d = new Date(`${iso}T12:00:00`);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
  }

  /**
   * "vence hoje", "em 13 dias", "venceu há 27 dias" — a conta que o produtor faria de cabeça.
   *
   * `ehObrigacao` troca o verbo de pagamento pelo de prazo: a obrigação não vence, o prazo dela
   * passa.
   */
  rotuloPrazo(iso: string, ehObrigacao = false): string {
    const dias = this.diasAte(iso);
    if (dias === 0) return ehObrigacao ? 'é hoje' : 'vence hoje';
    if (dias === 1) return ehObrigacao ? 'é amanhã' : 'vence amanhã';
    if (dias === -1) return ehObrigacao ? 'era ontem' : 'venceu ontem';
    if (dias > 0) return `em ${dias} dias`;
    return ehObrigacao ? `passou há ${-dias} dias` : `venceu há ${-dias} dias`;
  }

  /** O rótulo relativo já no verbo certo para este item. */
  rotuloPrazoDe(v: VencimentoFiscal): string {
    return this.rotuloPrazo(v.dataVencimento, v.status === null);
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
    this.hoje.set(PrazosProdutor.hojeISO());
    this.carregarJanela();
  }

  /**
   * Busca a janela inteira (−3/+3 meses) em **uma** requisição e reparte o resultado no cache por
   * mês. Assim a lista nasce completa e a grade já tem os sete meses carregados: navegar entre
   * eles não custa mais nada. Fora da janela, `carregarMes` continua buscando mês a mês.
   */
  private carregarJanela(): void {
    const de = this.limiteDaJanela(-PrazosProdutor.MESES_ATRAS);
    const ate = this.limiteDaJanela(PrazosProdutor.MESES_FRENTE, true);

    this.loading.set(true);
    this.vencimentosErro.set(false);

    // O id do produtor vem do servidor, nao de constante (#106): `GET /auth/me` ja existe e
    // devolve o id do autenticado. Ver `AuthApi`.
    this.authApi
      .carregar()
      .pipe(switchMap((sessao) => this.calendarioService.getVencimentos(sessao.usuarioId, { de, ate })))
      .subscribe({
      next: (vencimentos) => {
        // Todo mês da janela entra no cache, inclusive vazio: sem isso a grade buscaria de novo
        // um mês que esta requisição já respondeu "não tem nada".
        const mapa: Record<string, VencimentoFiscal[]> = {};
        for (let i = -PrazosProdutor.MESES_ATRAS; i <= PrazosProdutor.MESES_FRENTE; i++) {
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

    // O id do produtor vem do servidor, nao de constante (#106): `GET /auth/me` ja existe e
    // devolve o id do autenticado. Ver `AuthApi`.
    this.authApi
      .carregar()
      .pipe(
        switchMap((sessao) =>
          this.calendarioService.getVencimentos(sessao.usuarioId, this.janelaDoMes(chave)),
        ),
      )
      .subscribe({
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

  retry(): void {
    this.carregar();
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
    // O id do produtor vem do servidor, nao de constante (#106): `GET /auth/me` ja existe e
    // devolve o id do autenticado. Ver `AuthApi`.
    this.authApi
      .carregar()
      .pipe(switchMap((sessao) => this.notificacaoService.notificarProximasObrigacoes(sessao.usuarioId)))
      .subscribe({
      next: (res) => {
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

  nomeMes(): string {
    return PrazosProdutor.primeiraMaiuscula(
      this.mesAtual().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
    );
  }

  nomeDiaSelecionado(): string {
    return PrazosProdutor.primeiraMaiuscula(
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

  /**
   * A cor do selo. **`null` é a obrigação**, que não se paga: cor neutra, nunca a vermelha de
   * guia vencida.
   */
  statusColor(status: string | null): string {
    if (status === null) return 'bg-info-soft text-info-ink border border-info/30';
    return (
      {
        pago: 'bg-sucesso-soft text-sucesso-ink border border-sucesso/30',
        vencido: 'bg-perigo-soft text-perigo-ink border border-perigo/30',
        pendente: 'bg-aviso-soft text-aviso-ink border border-aviso/30',
      }[status] ?? 'bg-muted text-muted-foreground border border-border'
    );
  }

  /**
   * O rótulo do selo.
   *
   * A obrigação (`status` nulo) não é "pendente" nem "vencida" — ela é algo **a fazer**. Dizer
   * "Vencido" ali empurraria o produtor a procurar uma guia que não existe.
   */
  statusLabel(status: string | null): string {
    if (status === null) return 'A fazer';
    return { pago: 'Pago', vencido: 'Vencido', pendente: 'Pendente' }[status] ?? status;
  }

  /** `MENSAL` → "todo mês". O backend fala em caixa alta; o produtor, não. */
  rotuloPeriodicidade(periodicidade: string): string {
    return (
      {
        MENSAL: 'todo mês',
        BIMESTRAL: 'a cada dois meses',
        TRIMESTRAL: 'a cada três meses',
        SEMESTRAL: 'a cada seis meses',
        ANUAL: 'uma vez por ano',
      }[periodicidade] ?? periodicidade.toLowerCase()
    );
  }

  /** O item é uma guia — ou seja, tem dinheiro e data de pagamento. */
  ehGuia(vencimento: VencimentoFiscal): boolean {
    return vencimento.tipo === 'imposto';
  }

  /**
   * Há guia atrasada entre os atrasados.
   *
   * O aviso de multa e juros só vale para guia. Antes ele aparecia no **primeiro** item atrasado,
   * qualquer que fosse: o fechamento da apuração aparecia com "guia atrasada costuma ter multa e
   * juros", conselho de pagamento para algo que não se paga.
   */
  readonly temGuiaAtrasada = computed(() => this.atrasados().some((v) => this.ehGuia(v)));

  /** A primeira guia atrasada — é nela que o aviso de multa e juros se cola. */
  readonly primeiraGuiaAtrasada = computed(
    () => this.atrasados().find((v) => this.ehGuia(v)) ?? null,
  );

  /**
   * A cara do dia na grade.
   *
   * Ordem de precedência: o que está selecionado, depois o atraso, depois o que vai vencer, e
   * por último o que já foi pago. Um dia com guia atrasada **e** guia paga é um dia com guia
   * atrasada — o alívio não apaga o problema.
   */
  /**
   * As classes do NUMERO do dia -- nao da celula inteira.
   *
   * A grade pintava o fundo de celulas inteiras: num mes com dois prazos, dois retangulos
   * coloridos num tabuleiro de 35 quadrados, com legenda embaixo explicando as cores. Isso e um
   * seletor de data vestido de visualizacao, e ninguem esta escolhendo data aqui.
   *
   * Agora a celula nao tem fundo nenhum: o dia comum e so um numero em tinta fraca, e quem tem
   * prazo ganha tinta forte, a marca colorida embaixo (ver `marcaDoDia`) e o nome da guia. Hoje
   * e um anel em volta do numero, nao um bloco preenchido; o dia escolhido e o unico circulo
   * cheio da grade, porque selecao precisa de retorno forte.
   */
  diaClass(dia: number): string {
    const base = 'inline-flex size-7 items-center justify-center rounded-full';
    if (this.ehSelecionado(dia)) return `${base} bg-primary font-semibold text-primary-foreground`;

    const hoje = this.ehHoje(dia) ? ` ${base} ring-1 ring-primary font-semibold` : ` ${base}`;
    const prazo = this.diasComPrazo()[dia];

    if (prazo?.atrasado) return `${hoje} font-semibold text-perigo-ink`;
    if (prazo?.aVencer) return `${hoje} font-semibold text-aviso-ink`;
    if (prazo?.pago) return `${hoje} text-sucesso-ink`;
    if (this.ehHoje(dia)) return `${hoje} text-foreground`;
    return `${base} text-muted-foreground`;
  }

  /** A cor da marca embaixo do numero. Vazio no dia sem prazo -- e a maioria dos dias. */
  marcaDoDia(dia: number): string {
    const prazo = this.diasComPrazo()[dia];
    if (prazo?.atrasado) return 'bg-perigo';
    if (prazo?.aVencer) return 'bg-aviso';
    if (prazo?.pago) return 'bg-sucesso';
    return '';
  }

  /** Para o leitor de tela: o dia 20 não é só "20". */
  rotuloDoDia(dia: number): string {
    const prazo = this.diasComPrazo()[dia];
    if (!prazo) return `${dia}`;
    const quantos = prazo.quantidade === 1 ? '1 prazo' : `${prazo.quantidade} prazos`;
    if (prazo.atrasado) return `${dia}, ${quantos}, há atraso`;
    if (prazo.aVencer) return `${dia}, ${quantos} a vencer`;
    return `${dia}, ${quantos}, pago`;
  }

  temEvento(dia: number): boolean {
    return !!this.diasComPrazo()[dia];
  }

  /** Volta a grade para o mês de hoje e seleciona o dia de hoje. */
  irParaHoje(): void {
    this.irParaData(this.hoje());
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
