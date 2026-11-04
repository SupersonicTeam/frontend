import { Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import {
  LucideCheck,
  LucideDownload,
  LucideLoaderCircle,
  LucideLockOpen,
  LucideMinus,
  LucideRefreshCw,
  LucideTrendingDown,
  LucideTrendingUp,
  LucideTriangleAlert,
  LucideUsers,
} from '@lucide/angular';
import { CarteiraApi } from '@services/contador/data-access/carteira.service';
import { Apuracao, RelatorioConformidade } from '@models/tributario.model';
import type { NotaFiscal } from '@models/nota-fiscal.model';
import type { ProdutorCarteira } from '@models/carteira.model';
import { StatusApuracao } from '@core/enums/status-apuracao.enum';
import { ToastService } from '@core/services/toast.service';
import { apiErrorDeBlob, filenameDeContentDisposition, salvarBlob } from '@core/utils/download';
import { mensagemAmigavel, mensagemDeEnvelope } from '@core/interceptors/api.interceptor';
import { UiButton } from '@shared/ui/ui-button';
import { UiEmptyState } from '@shared/ui/ui-empty-state';
import { UiTable } from '@shared/ui/ui-table';
import { SeletorCliente } from '@shared/contador/seletor-cliente';
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

const STATUS_APURACAO: Record<StatusApuracao, { label: string; classe: string }> = {
  ABERTO: { label: 'Aberta', classe: 'bg-info-soft text-info-ink border border-info/30' },
  EM_PROCESSAMENTO: {
    label: 'Em processamento',
    classe: 'bg-aviso-soft text-aviso-ink border border-aviso/30',
  },
  FECHADO: {
    label: 'Fechada',
    classe: 'bg-sucesso-soft text-sucesso-ink border border-sucesso/30',
  },
};

/** Status de nota que **não** entra na apuração — só `AUTORIZADA` entra. */
const FORA_DA_APURACAO = ['RASCUNHO', 'COM_INCONSISTENCIAS', 'REJEITADA', 'CANCELADA'] as const;

const ROTULO_STATUS: Record<string, string> = {
  RASCUNHO: 'Rascunho',
  COM_INCONSISTENCIAS: 'Com inconsistências',
  REJEITADA: 'Rejeitada',
  CANCELADA: 'Cancelada',
};

/**
 * Impostos na visão do **contador** — o fechamento do mês.
 *
 * ## Por que não é a mesma tela do produtor
 *
 * O produtor pergunta *"quanto eu pago e de onde saiu isso"*: a tela dele explica a conta, compara com o
 * mês passado em dinheiro e mostra a faixa do semestre. O contador não paga nada — ele **confere e
 * fecha**. A pergunta dele é outra: *"este número está pronto para fechar?"*.
 *
 * Daí os três blocos que só existem aqui:
 *
 * 1. **A apuração em matriz** (IBS e CBS × débito, crédito, saldo). O produtor lê uma conta de três
 *    linhas; o contador lê a tabela que ele vai transcrever.
 * 2. **A conferência** — as notas do mês que ficaram **de fora** da apuração. É a informação mais útil da
 *    tela e ninguém mostrava: só nota `AUTORIZADA` entra na soma, então um rascunho ou uma nota com
 *    inconsistência deixa o número **incompleto** sem nada na interface dizendo isso.
 * 3. **A variação decomposta** — não basta "subiu R$ 540". Subiu porque vendeu mais ou porque comprou
 *    menos? É o que o contador responde ao cliente, e são duas conversas diferentes.
 *
 * ## De qual cliente (issue #136)
 *
 * A tela lia `/api/apuracao`, `/api/relatorios/conformidade` e `/api/notas` — rotas que derivam o
 * produtor do token e respondem **403 para o contador**. Ela abria em "Não foi possível carregar a
 * apuração" e nunca mostrava número nenhum. Agora tudo vem das rotas do escritório, por cliente
 * (`CarteiraApi`, backend#255), e o cliente sai do `SeletorCliente` no topo. Sem cliente escolhido
 * não há chamada nenhuma: a tela diz o que fazer.
 *
 * Com o cliente conhecido, a reabertura (RN005) deixou de ser um botão desabilitado: a rota do
 * escritório (`POST .../apuracao/{periodo}/reabrir`) não pede o `id` que a antiga exigia.
 */
@Component({
  selector: 'app-impostos-contador',
  standalone: true,
  imports: [
    RouterLink,
    SeletorCliente,
    UiButton,
    UiEmptyState,
    UiTable,
    LucideCheck,
    LucideDownload,
    LucideLoaderCircle,
    LucideLockOpen,
    LucideMinus,
    LucideRefreshCw,
    LucideTrendingDown,
    LucideTrendingUp,
    LucideTriangleAlert,
    LucideUsers,
  ],
  templateUrl: './impostos-contador.html',
})
export class ImpostosContador {
  private readonly carteiraApi = inject(CarteiraApi);
  private readonly toast = inject(ToastService);

  /**
   * O cliente do fechamento. `undefined` enquanto a carteira não respondeu — é o que separa
   * "carregando" de "nenhum cliente escolhido".
   */
  readonly cliente = signal<ProdutorCarteira | null | undefined>(undefined);

  // Abre no mes que ACABOU, nao no corrente: ver `mesDeFechamento`.
  readonly mes = signal(mesDeFechamento().mes);
  readonly ano = signal(mesDeFechamento().ano);
  readonly periodo = computed(() => `${this.ano()}-${String(this.mes()).padStart(2, '0')}`);
  readonly meses = MESES;
  readonly anos = computed(() => {
    const atual = new Date().getFullYear();
    return [atual, atual - 1, atual - 2];
  });

  readonly apuracao = signal<Apuracao | null>(null);
  readonly anterior = signal<Apuracao | null>(null);
  readonly relatorio = signal<RelatorioConformidade | null>(null);
  readonly notas = signal<NotaFiscal[]>([]);
  /**
   * A lista de notas não respondeu. Sem isto a conferência dizia "todas as notas entraram na
   * apuração" justamente quando não sabia — lista vazia é o que uma falha engolida parece.
   */
  readonly notasErro = signal(false);
  readonly carregando = signal(false);
  readonly erro = signal(false);
  readonly baixandoPdf = signal(false);
  readonly reabrindo = signal(false);

  /**
   * Só usa o que é **deste** período. Trocar de mês dispara quatro requisições que chegam uma de cada
   * vez; sem isto a tela cruza o débito de um mês com o saldo de outro, e a variação fica absurda.
   */
  private doPeriodo<T extends { periodo: string }>(valor: T | null): T | null {
    return valor && valor.periodo === this.periodo() ? valor : null;
  }

  readonly apuracaoDoPeriodo = computed(() => this.doPeriodo(this.apuracao()));
  readonly conta = computed(() => this.doPeriodo(this.relatorio()));

  readonly status = computed(() => {
    const s = this.apuracaoDoPeriodo()?.status;
    return s ? STATUS_APURACAO[s] : null;
  });

  readonly fechada = computed(() => this.apuracaoDoPeriodo()?.status === 'FECHADO');
  readonly saldoCredor = computed(() => (this.conta()?.saldoAPagar ?? 0) < 0);

  /**
   * As notas do mês que **não** entram na apuração.
   *
   * A soma do backend filtra `status = AUTORIZADA`. Um rascunho esquecido ou uma nota com
   * inconsistência não aparece em lugar nenhum da conta — e o contador fecha um mês incompleto sem
   * saber. Aqui elas ficam listadas, com o motivo de cada uma.
   */
  readonly foraDaApuracao = computed(() =>
    this.notas()
      .filter(
        (n) =>
          (n.dataEmissao ?? '').startsWith(this.periodo()) &&
          (FORA_DA_APURACAO as readonly string[]).includes(n.status),
      )
      .sort((a, b) => (a.dataEmissao ?? '').localeCompare(b.dataEmissao ?? '')),
  );

  readonly prontoParaFechar = computed(
    () => !this.notasErro() && this.foraDaApuracao().length === 0,
  );

  /**
   * A variação **decomposta**: quanto o saldo andou, e o quanto disso veio do débito e do crédito.
   *
   * "Subiu R$ 540" não é resposta para o cliente. Subiu porque vendeu mais (débito) ou porque comprou
   * menos (crédito)? São duas conversas diferentes, e a decomposição é o que o contador leva para ela.
   */
  readonly variacao = computed(() => {
    const atual = this.apuracaoDoPeriodo();
    const antes = this.anterior();
    if (!atual || !antes) return null;

    const saldoAgora = atual.saldoIbs + atual.saldoCbs;
    const saldoAntes = antes.saldoIbs + antes.saldoCbs;
    const diferenca = saldoAgora - saldoAntes;
    if (saldoAntes === 0 && diferenca === 0) return null;

    return {
      diferenca,
      percentual: saldoAntes === 0 ? null : (diferenca / Math.abs(saldoAntes)) * 100,
      debito: atual.debitoIbs + atual.debitoCbs - (antes.debitoIbs + antes.debitoCbs),
      credito: atual.creditoIbs + atual.creditoCbs - (antes.creditoIbs + antes.creditoCbs),
      periodoAnterior: antes.periodo,
    };
  });

  /**
   * Cada troca de cliente ou de mês abre uma "vez". Resposta de uma vez antiga é descartada: sem
   * isto, trocar de cliente no meio do carregamento punha o débito de um na tela do outro — o
   * `doPeriodo` só protege contra troca de mês.
   */
  private vez = 0;

  aoTrocarCliente(cliente: ProdutorCarteira | null): void {
    const atual = this.cliente();
    if (atual !== undefined && (atual?.id ?? null) === (cliente?.id ?? null)) return;
    this.cliente.set(cliente);
    this.notas.set([]);
    this.notasErro.set(false);
    if (!cliente) {
      this.vez++;
      this.carregando.set(false);
      this.erro.set(false);
      this.apuracao.set(null);
      this.relatorio.set(null);
      this.anterior.set(null);
      return;
    }
    this.carregar();
    this.carregarNotas(cliente.id);
  }

  /**
   * As notas que podem ter ficado fora: só os status que não entram na soma, da mais nova para a
   * mais velha. O recorte do mês é feito aqui, sobre a data de emissão.
   */
  private carregarNotas(produtorId: string): void {
    this.carteiraApi
      .notasDoCliente(produtorId, {
        status: [...FORA_DA_APURACAO],
        size: 100,
        sort: 'dataEmissao,desc',
      })
      .subscribe({
        next: (notas) => {
          if (this.cliente()?.id === produtorId) this.notas.set(notas);
        },
        error: () => {
          if (this.cliente()?.id === produtorId) this.notasErro.set(true);
        },
      });
  }

  recarregarNotas(): void {
    const id = this.cliente()?.id;
    if (!id) return;
    this.notasErro.set(false);
    this.carregarNotas(id);
  }

  carregar(): void {
    const produtorId = this.cliente()?.id;
    if (!produtorId) return;
    const vez = ++this.vez;
    const daVez = () => vez === this.vez;

    this.carregando.set(true);
    this.erro.set(false);
    this.apuracao.set(null);
    this.relatorio.set(null);
    this.anterior.set(null);

    const periodo = this.periodo();
    this.carteiraApi.apuracaoDoCliente(produtorId, periodo).subscribe({
      next: (a) => {
        if (!daVez()) return;
        this.apuracao.set(a);
        this.carregando.set(false);
      },
      error: () => {
        if (!daVez()) return;
        this.erro.set(true);
        this.carregando.set(false);
      },
    });
    this.carteiraApi.relatorioConformidadeDoCliente(produtorId, periodo).subscribe({
      next: (r) => {
        if (daVez()) this.relatorio.set(r);
      },
      error: () => {
        if (daVez()) this.erro.set(true);
      },
    });
    // Falha em silêncio: sem ela a tela perde a comparação, não o número.
    this.carteiraApi.apuracaoDoCliente(produtorId, this.periodoAnterior()).subscribe({
      next: (a) => {
        if (daVez()) this.anterior.set(a);
      },
      error: () => {
        if (daVez()) this.anterior.set(null);
      },
    });
  }

  private periodoAnterior(): string {
    const d = new Date(this.ano(), this.mes() - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  mudarMes(m: string | number): void {
    this.mes.set(Number(m));
    this.carregar();
  }

  mudarAno(a: string | number): void {
    this.ano.set(Number(a));
    this.carregar();
  }

  baixarPdf(): void {
    const produtorId = this.cliente()?.id;
    if (!produtorId) return;
    this.baixandoPdf.set(true);
    const periodo = this.periodo();
    this.carteiraApi.relatorioConformidadePdfDoCliente(produtorId, periodo).subscribe({
      next: (resp) => {
        this.baixandoPdf.set(false);
        const nome = filenameDeContentDisposition(
          resp.headers.get('Content-Disposition'),
          `conformidade-${periodo}.pdf`,
        );
        if (resp.body) salvarBlob(resp.body, nome);
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
   * Reabre o mês fechado do cliente (RN005, `POST .../apuracao/{periodo}/reabrir`).
   *
   * A apuração que volta substitui a da tela: o status é decisão do servidor. O 403 tem dono — a
   * função ASSISTENTE lê a carteira mas não reabre —, e dizer "não foi possível" faria a pessoa
   * tentar de novo até desistir. O resto (409 fora de `FECHADO`, 422 além de 3 meses) traz a
   * mensagem do backend, que já é escrita para quem lê.
   */
  reabrir(): void {
    const produtorId = this.cliente()?.id;
    if (!produtorId || this.reabrindo()) return;
    const vez = this.vez;
    this.reabrindo.set(true);
    this.carteiraApi.reabrirApuracao(produtorId, this.periodo()).subscribe({
      next: (apuracao) => {
        this.reabrindo.set(false);
        if (vez !== this.vez) return;
        this.apuracao.set(apuracao);
        this.toast.success(`Apuração de ${this.formatPeriodo(apuracao.periodo)} reaberta.`);
      },
      error: (err: HttpErrorResponse) => {
        this.reabrindo.set(false);
        this.toast.error(
          err.status === 403
            ? 'A sua função no escritório não reabre apuração. Peça a um contador ou ao administrador.'
            : mensagemAmigavel(err),
        );
      },
    });
  }

  rotuloStatusNota(status: string): string {
    return ROTULO_STATUS[status] ?? status;
  }

  /** `2026-10` -> "outubro de 2026". */
  formatPeriodo(periodo: string): string {
    const [ano, mes] = periodo.split('-');
    const d = new Date(Number(ano), Number(mes) - 1, 1);
    return Number.isNaN(d.getTime())
      ? periodo
      : d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }

  formatPercentual(valor: number): string {
    return `${valor > 0 ? '+' : ''}${valor.toFixed(0)}%`;
  }

  /** Com sinal, porque aqui o sinal é a informação: o débito subiu ou desceu? */
  formatComSinal(valor: number): string {
    const sinal = valor > 0 ? '+' : valor < 0 ? '−' : '';
    return `${sinal}${Math.abs(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;
  }

  formatCurrency(v?: number | null): string {
    return (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  formatDate(iso?: string | null): string {
    if (!iso) return '—';
    const soData = /^\d{4}-\d{2}-\d{2}$/.test(iso);
    const d = new Date(soData ? `${iso}T12:00:00` : iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('pt-BR');
  }
}
