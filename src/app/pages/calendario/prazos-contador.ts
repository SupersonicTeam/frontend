import { Component, computed, inject, signal } from '@angular/core';
import {
  LucideCheck,
  LucideFileText,
  LucideHandCoins,
  LucidePlus,
  LucideMessageSquare,
  LucideLoaderCircle,
  LucideTriangleAlert,
  LucideUsers,
} from '@lucide/angular';
import { HttpErrorResponse } from '@angular/common/http';
import { falhaDaApi, type FalhaDaApi } from '@core/utils/erro-api';
import { dataDoPagamento } from '@core/utils/guias';
import { formatarData } from '@core/utils/periodo';
import { ToastService } from '@core/services/toast.service';
import {
  NotificacaoApi,
  type NotificacaoError,
} from '@services/notificacao/data-access/notificacao.service';
import type { GuiaFiscal, TipoGuia } from '@models/solicitacao-contador.model';
import { CarteiraApi } from '@services/contador/data-access/carteira.service';
import { GuiasApi } from '@services/guias/data-access/guias.service';
import type { ProdutorCarteira } from '@models/carteira.model';
import { SeletorCliente } from '@shared/contador/seletor-cliente';
import { UiButton } from '@shared/ui/ui-button';
import { UiEmptyState } from '@shared/ui/ui-empty-state';
import { UiModal } from '@shared/ui/ui-modal';
import { UiSkeleton } from '@shared/ui/ui-skeleton';
import { UiStat } from '@shared/ui/ui-stat';
import { UiTable } from '@shared/ui/ui-table';

const TIPOS_GUIA: TipoGuia[] = ['ICMS', 'FUNRURAL', 'DARF', 'GPS', 'OUTRO'];

/** Dias à frente que contam como "cobrar agora". */
const JANELA_COBRANCA = 7;

type Situacao = 'todas' | 'cobrar' | 'pendente' | 'pago';

/**
 * Prazos na visão do **contador** — a cobrança.
 *
 * ## Por que não é a mesma tela do produtor
 *
 * O produtor abre Prazos para saber *o que ele deve e quando*. O contador abre para saber *o que ele
 * precisa cobrar, de quem, e o que já pode dar baixa*. É o outro lado do mesmo balcão: um recebe o
 * aviso, o outro emite a guia.
 *
 * Por isso aqui não há calendário mensal, nem "o próximo prazo", nem conselho de procurar o escritório
 * — o escritório é quem está lendo. Há a fila de cobrança, o lançamento e a baixa.
 *
 * **As guias vivem aqui, e não no Acompanhamento.** A tela de Acompanhamento é a triagem ("o que
 * impede fechar"); ela aponta para cá em vez de repetir a tabela. Antes as mesmas guias apareciam
 * inteiras nas duas.
 */
@Component({
  selector: 'app-prazos-contador',
  standalone: true,
  imports: [
    UiButton,
    UiEmptyState,
    UiModal,
    UiSkeleton,
    UiStat,
    UiTable,
    LucideCheck,
    LucideFileText,
    LucideHandCoins,
    LucidePlus,
    LucideMessageSquare,
    LucideLoaderCircle,
    LucideTriangleAlert,
    LucideUsers,
    SeletorCliente,
  ],
  templateUrl: './prazos-contador.html',
})
export class PrazosContador {
  private readonly carteiraApi = inject(CarteiraApi);
  private readonly guiasApi = inject(GuiasApi);
  private readonly toast = inject(ToastService);

  private readonly notificacaoApi = inject(NotificacaoApi);

  /**
   * De quem sao as guias desta tela (issue #106).
   *
   * Isto era `LOGGED_PRODUCER_ID` cravado -- em **duas** chamadas: a que lista e a que **lanca**.
   * Medido contra a API local em 29/10, a carteira semeada tem **dois** clientes (Joao da Silva
   * Produtor e Maria Agricultora): o escritorio nunca via as guias da Maria, e qualquer guia que
   * lancasse ia para o Joao, mesmo achando que atendia a outra. Escrita no cliente errado e bem
   * pior do que leitura errada.
   *
   * Nao precisou esperar o JWT da #93: desde a #95 a carteira devolve os ids de verdade. O que o
   * JWT resolve e o lado do PRODUTOR, onde o id proprio ainda vem de constante.
   */
  readonly cliente = signal<ProdutorCarteira | null | undefined>(undefined);
  readonly clienteId = signal<string | null>(null);

  readonly clienteAtual = computed(() => this.cliente() ?? null);

  /** Começa carregando: até o seletor responder, não se sabe de quem são as guias. */
  readonly carregando = signal(true);
  readonly guias = signal<GuiaFiscal[]>([]);
  readonly situacao = signal<Situacao>('todas');

  /** Hoje em `AAAA-MM-DD`, fixado na carga: a data não pode mudar no meio de um computed. */
  private readonly hoje = signal(PrazosContador.hojeISO());

  readonly tiposGuia = TIPOS_GUIA;

  /** Da que vence primeiro para a que vence por último — é uma fila de cobrança. */
  private readonly ordenadas = computed(() =>
    [...this.guias()].sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento)),
  );

  /**
   * Atrasado é o que não foi pago e tem data no passado.
   *
   * Não basta confiar no `status`: quem vira a guia para `vencido` é um job diário, então entre a
   * meia-noite e a rodada do job uma guia vencida ainda chega como `pendente`. A data não mente.
   */
  readonly atrasadas = computed(() =>
    this.ordenadas().filter((g) => g.status !== 'pago' && g.dataVencimento < this.hoje()),
  );

  /** Vence nos próximos dias — ainda dá tempo de avisar o produtor. */
  readonly vencendo = computed(() => {
    const limite = new Date(`${this.hoje()}T12:00:00`);
    limite.setDate(limite.getDate() + JANELA_COBRANCA);
    const ate = limite.toISOString().slice(0, 10);
    return this.ordenadas().filter(
      (g) => g.status !== 'pago' && g.dataVencimento >= this.hoje() && g.dataVencimento <= ate,
    );
  });

  /** A fila de trabalho: o atrasado primeiro, depois o que está para vencer. */
  readonly aCobrar = computed(() => [...this.atrasadas(), ...this.vencendo()]);

  readonly totalACobrar = computed(() =>
    this.aCobrar().reduce((soma, g) => soma + (g.valor ?? 0), 0),
  );

  readonly totalEmAberto = computed(() =>
    this.ordenadas()
      .filter((g) => g.status !== 'pago')
      .reduce((soma, g) => soma + (g.valor ?? 0), 0),
  );

  readonly filtros: { valor: Situacao; rotulo: string }[] = [
    { valor: 'todas', rotulo: 'Todas' },
    { valor: 'cobrar', rotulo: 'A cobrar' },
    { valor: 'pendente', rotulo: 'Em aberto' },
    { valor: 'pago', rotulo: 'Pagas' },
  ];

  readonly guiasFiltradas = computed(() => {
    const s = this.situacao();
    if (s === 'todas') return this.ordenadas();
    if (s === 'pago') return this.ordenadas().filter((g) => g.status === 'pago');
    if (s === 'pendente') return this.ordenadas().filter((g) => g.status !== 'pago');
    const naFila = new Set(this.aCobrar().map((g) => g.id));
    return this.ordenadas().filter((g) => naFila.has(g.id));
  });

  // ── Cobrança no WhatsApp (#94) ──

  readonly cobrando = signal(false);

  /**
   * Cobra o cliente selecionado pelo que vence nos próximos 7 dias.
   *
   * O id no caminho é o **do cliente**, não o de quem está logado — é a rota do escritório
   * (`/contador/produtores/{id}/notificacao/...`), e produtor fora da carteira responde 404. Quem
   * dispara fica registrado como `CONTADOR` no histórico, então o produtor vê que a cobrança veio
   * do escritório e não de um robô.
   */
  cobrarCliente(): void {
    const cliente = this.clienteId();
    if (!cliente || this.cobrando()) return;

    this.cobrando.set(true);
    this.notificacaoApi.cobrarProximasObrigacoes(cliente).subscribe({
      next: (res) => {
        this.cobrando.set(false);
        if (res.enviados > 0) {
          const urgentes = res.urgentes > 0 ? ` (${res.urgentes} urgente(s))` : '';
          this.toast.success(`${res.enviados} aviso(s) enviado(s) ao cliente${urgentes}.`);
        } else {
          // `enviados: 0` e sucesso: nao havia o que cobrar.
          this.toast.info('Nada a cobrar: este cliente não tem vencimento nos próximos 7 dias.');
        }
      },
      error: (erro: NotificacaoError) => {
        this.cobrando.set(false);
        this.toast.error(PrazosContador.mensagemDaCobranca(erro));
      },
    });
  }

  /**
   * O que dizer quando a cobrança não sai.
   *
   * **Cliente sem WhatsApp não é "nada a cobrar"** — e aqui o recado é para o escritório, que não
   * cadastra o número do cliente: ele precisa pedir, não corrigir.
   */
  private static mensagemDaCobranca(erro: NotificacaoError): string {
    if (erro?.codigo === 'CONTATO_AUSENTE') {
      return 'Este cliente não tem WhatsApp cadastrado. Peça o número a ele.';
    }
    if (erro?.codigo === 'LIMITE_NOTIFICACOES') {
      const espera = erro.retryAfterSegundos;
      const quando = espera ? ` Tente em ${Math.ceil(espera / 60)} min.` : '';
      return `Muitas cobranças seguidas para este cliente.${quando}`;
    }
    return erro?.message || 'Não foi possível cobrar este cliente.';
  }

  // ── Lançar guia ──
  readonly showNovaGuia = signal(false);
  readonly salvando = signal(false);
  readonly formTipo = signal<TipoGuia>('ICMS');
  readonly formVencimento = signal('');
  readonly formValor = signal('');
  readonly formObs = signal('');
  readonly formValido = computed(() => !!this.formVencimento() && Number(this.formValor()) > 0);

  /**
   * Por que "Lançar guia" está desabilitado, dito **no campo** (#115).
   *
   * O botão apagava e a pessoa ficava procurando o que estava errado — valor negativo e valor
   * vazio desabilitavam igual, sem distinção. Campo ainda em branco não acusa nada: avisar antes
   * de a pessoa digitar é ranzinza, não prestativo.
   */
  readonly erroDoValor = computed(() => {
    const bruto = this.formValor().trim();
    if (!bruto) return '';
    const valor = Number(bruto);
    if (Number.isNaN(valor)) return 'Digite o valor em números, como 1840,55.';
    if (valor <= 0) return 'O valor precisa ser maior que zero.';
    return '';
  });

  /**
   * O cliente vem do `<app-seletor-cliente>`, como em Notas e no Fechamento (#136): do endereço
   * (`?cliente=`, que o "Cobrar em Prazos" da ficha manda), senão do cliente em foco, senão do
   * único da carteira. Esta tela tinha um seletor próprio que abria sempre no **primeiro** cliente:
   * da ficha do Carlos, com guia vencida, o botão caía em outro dizendo "Nada para cobrar agora"
   * (roteiro da demo, 06/11). Com mais de um cliente e nenhum escolhido, a tela pede a escolha em
   * vez de adivinhar.
   */
  aoTrocarCliente(cliente: ProdutorCarteira | null): void {
    const atual = this.cliente();
    if (atual !== undefined && (atual?.id ?? null) === (cliente?.id ?? null)) return;
    this.cliente.set(cliente);
    this.clienteId.set(cliente?.id ?? null);
    this.guias.set([]);
    this.carregar();
  }

  /**
   * A falha da busca, quando houve (issue #107).
   *
   * Antes o `error` desta tela fazia `guias.set([])`, e a falha virava a mesma tela de "Nenhuma
   * guia lançada". Com o produtor errado da #106 o escritório via "nenhuma guia" enquanto havia
   * oito no banco, uma de ICMS de R$ 3.420 vencida. Vazio é "não há guia"; erro é outra coisa.
   */
  readonly erro = signal<FalhaDaApi | null>(null);

  carregar(): void {
    const cliente = this.clienteId();
    if (!cliente) {
      this.guias.set([]);
      this.carregando.set(false);
      return;
    }
    this.carregando.set(true);
    this.erro.set(null);
    this.hoje.set(PrazosContador.hojeISO());
    this.carteiraApi.guiasDoCliente(cliente).subscribe({
      next: (lista) => {
        this.guias.set(lista);
        this.carregando.set(false);
      },
      error: (err: HttpErrorResponse) => {
        // A lista **não** é zerada: o que estava na tela continua sendo o último dado verdadeiro
        // que o servidor deu, e some só se ele disser que sumiu.
        this.erro.set(falhaDaApi(err));
        this.carregando.set(false);
      },
    });
  }

  abrirNovaGuia(): void {
    this.formTipo.set('ICMS');
    this.formVencimento.set('');
    this.formValor.set('');
    this.formObs.set('');
    this.showNovaGuia.set(true);
  }

  salvarGuia(): void {
    const cliente = this.clienteId();
    if (!this.formValido() || !cliente) return;
    this.salvando.set(true);
    this.carteiraApi
      .lancarGuia(cliente, {
        tipoGuia: this.formTipo(),
        dataVencimento: this.formVencimento(),
        valor: Number(this.formValor()),
        observacoes: this.formObs().trim() || undefined,
      })
      .subscribe({
        next: () => {
          this.salvando.set(false);
          this.showNovaGuia.set(false);
          this.toast.success('Guia lançada.');
          this.carregar();
        },
        // O service não devolve mais `null` em falha (#107), então o único caminho de erro é
        // este — e a mensagem agora é a do servidor, não uma frase nossa para qualquer causa.
        error: (err: HttpErrorResponse) => {
          this.salvando.set(false);
          this.toast.error(falhaDaApi(err).mensagem);
        },
      });
  }

  /**
   * Dar baixa. **Pelo contrato a baixa é do produtor** (backend#273: `PATCH /api/guias/{id}/pagar`,
   * contador recebe 403 `PAPEL_NAO_AUTORIZADO`), e já era assim na rota antiga. O botão segue aqui
   * até o time decidir se ele sai desta tela e vai para a do produtor; a migração (#198) não
   * muda o que ele faz.
   */
  marcarPaga(guia: GuiaFiscal): void {
    this.guiasApi.pagar(guia.id).subscribe({
      next: () => {
        this.toast.success(`Guia de ${guia.tipoGuia} marcada como paga.`);
        this.carregar();
      },
      error: (err: HttpErrorResponse) => this.toast.error(falhaDaApi(err).mensagem),
    });
  }

  /** Dias de hoje até a data (negativo = já passou). */
  diasAte(iso: string): number {
    const alvo = new Date(`${iso}T12:00:00`).getTime();
    const hoje = new Date(`${this.hoje()}T12:00:00`).getTime();
    return Math.round((alvo - hoje) / 86_400_000);
  }

  /** "venceu há 27 dias" é o que faz o contador pegar o telefone; "20/09" não. */
  rotuloPrazo(guia: GuiaFiscal): string {
    if (guia.status === 'pago') return 'paga';
    const dias = this.diasAte(guia.dataVencimento);
    if (dias === 0) return 'vence hoje';
    if (dias === 1) return 'vence amanhã';
    if (dias === -1) return 'venceu ontem';
    return dias > 0 ? `em ${dias} dias` : `venceu há ${-dias} dias`;
  }

  classeRotulo(guia: GuiaFiscal): string {
    if (guia.status === 'pago') return 'text-sucesso-ink';
    const dias = this.diasAte(guia.dataVencimento);
    if (dias < 0) return 'font-semibold text-perigo-ink';
    if (dias <= 3) return 'font-semibold text-aviso-ink';
    return 'text-muted-foreground';
  }

  rotuloStatus(status: GuiaFiscal['status']): string {
    return { pendente: 'Em aberto', pago: 'Paga', vencido: 'Vencida' }[status] ?? status;
  }

  classeStatus(status: GuiaFiscal['status']): string {
    const tons: Record<GuiaFiscal['status'], string> = {
      pendente: 'bg-aviso-soft text-aviso-ink border-aviso/30',
      pago: 'bg-sucesso-soft text-sucesso-ink border-sucesso/30',
      vencido: 'bg-perigo-soft text-perigo-ink border-perigo/30',
    };
    return `inline-flex items-center rounded-full border px-2.5 py-1 text-apoio font-medium ${tons[status]}`;
  }

  formatCurrency(valor?: number): string {
    return (valor ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  /** Data pura ou instante com fuso, ver `formatarData`. */
  formatDate(iso?: string | null): string {
    return formatarData(iso);
  }

  /** "em 03/11/2026" na guia paga, quando o servidor diz quando (#116). */
  pagaEm(guia: GuiaFiscal): string | null {
    const data = dataDoPagamento(guia);
    return data ? formatarData(data) : null;
  }

  private static hojeISO(): string {
    const d = new Date();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${mes}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
