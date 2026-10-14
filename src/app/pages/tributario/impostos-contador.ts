import { Component, OnInit, computed, inject, signal } from '@angular/core';
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
} from '@lucide/angular';
import { TributarioApi } from '@services/tributario/data-access/tributario.service';
import { NotasApi } from '@services/notas/data-access/notas.service';
import { Apuracao, RelatorioConformidade } from '@models/tributario.model';
import type { NotaFiscal } from '@models/nota-fiscal.model';
import { StatusApuracao } from '@core/enums/status-apuracao.enum';
import { ToastService } from '@core/services/toast.service';
import { apiErrorDeBlob, filenameDeContentDisposition, salvarBlob } from '@core/utils/download';
import { mensagemDeEnvelope } from '@core/interceptors/api.interceptor';
import { UiButton } from '@shared/ui/ui-button';
import { UiTable } from '@shared/ui/ui-table';
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
const FORA_DA_APURACAO = ['RASCUNHO', 'COM_INCONSISTENCIAS', 'REJEITADA', 'CANCELADA'];

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
 * A reabertura (RN005) continua desabilitada com o motivo à vista: `ApuracaoResponse` não expõe o `id`
 * que `POST /apuracao/{id}/reabrir` exige.
 */
@Component({
  selector: 'app-impostos-contador',
  standalone: true,
  imports: [
    RouterLink,
    UiButton,
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
  ],
  templateUrl: './impostos-contador.html',
})
export class ImpostosContador implements OnInit {
  private readonly api = inject(TributarioApi);
  private readonly notasApi = inject(NotasApi);
  private readonly toast = inject(ToastService);

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
          (n.dataEmissao ?? '').startsWith(this.periodo()) && FORA_DA_APURACAO.includes(n.status),
      )
      .sort((a, b) => (a.dataEmissao ?? '').localeCompare(b.dataEmissao ?? '')),
  );

  readonly prontoParaFechar = computed(() => this.foraDaApuracao().length === 0);

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

  ngOnInit(): void {
    this.carregar();
    this.notasApi.listar({ size: 100, sort: 'dataEmissao,desc' }).subscribe({
      next: (pagina) => this.notas.set(pagina.content),
      error: () => this.notas.set([]),
    });
  }

  carregar(): void {
    this.carregando.set(true);
    this.erro.set(false);
    this.apuracao.set(null);
    this.relatorio.set(null);
    this.anterior.set(null);

    const periodo = this.periodo();
    this.api.apuracao(periodo).subscribe({
      next: (a) => {
        this.apuracao.set(a);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set(true);
        this.carregando.set(false);
      },
    });
    this.api.relatorioConformidade(periodo).subscribe({
      next: (r) => this.relatorio.set(r),
      error: () => this.erro.set(true),
    });
    // Falha em silêncio: sem ela a tela perde a comparação, não o número.
    this.api.apuracao(this.periodoAnterior()).subscribe({
      next: (a) => this.anterior.set(a),
      error: () => this.anterior.set(null),
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
    this.baixandoPdf.set(true);
    const periodo = this.periodo();
    this.api.relatorioConformidadePdf(periodo).subscribe({
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
