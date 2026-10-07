import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import {
  LucideReceipt, LucideLoaderCircle, LucideRefreshCw, LucideLockOpen, LucideDownload,
  LucideTrendingUp, LucideTrendingDown, LucideMinus,
} from '@lucide/angular';
import { RouterLink } from '@angular/router';
import { TributarioApi } from '@services/tributario/data-access/tributario.service';
import { ContadorApi } from '@services/contador/data-access/contador.service';
import { LOGGED_PRODUCER_ID } from '@core/config/produtor-logado';
import type { GuiaFiscal } from '@models/solicitacao-contador.model';
import { Apuracao, CreditoSaldo, RelatorioConformidade } from '@models/tributario.model';
import { StatusApuracao } from '@core/enums/status-apuracao.enum';
import { ToastService } from '@core/services/toast.service';
import { ApiErrorEnvelope } from '@dtos/shared/responses/api-error.response';
import { mensagemDeEnvelope } from '@core/interceptors/api.interceptor';
import { salvarBlob, filenameDeContentDisposition, apiErrorDeBlob } from '@core/utils/download';
import { UiButton } from '@shared/ui/ui-button';
import { UiStat } from '@shared/ui/ui-stat';

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
  FECHADO: { label: 'Fechado', classe: 'bg-sucesso-soft text-sucesso-ink border border-sucesso/30' },
};

const MESES = [
  { v: 1, l: 'Janeiro' }, { v: 2, l: 'Fevereiro' }, { v: 3, l: 'Março' },
  { v: 4, l: 'Abril' }, { v: 5, l: 'Maio' }, { v: 6, l: 'Junho' },
  { v: 7, l: 'Julho' }, { v: 8, l: 'Agosto' }, { v: 9, l: 'Setembro' },
  { v: 10, l: 'Outubro' }, { v: 11, l: 'Novembro' }, { v: 12, l: 'Dezembro' },
];

/**
 * Tela Tributário (issue #27) — consome `TributarioApi` para exibir, no período selecionado, a
 * apuração mensal de IBS/CBS, o saldo de créditos e o relatório de conformidade (JSON + PDF em T14).
 * Os fetches são **independentes**: a falha de um não esconde os outros (TRIB-09).
 */
@Component({
  selector: 'app-tributario',
  standalone: true,
  imports: [
    UiButton,
    UiStat,
    FormsModule, RouterLink,
    LucideReceipt, LucideLoaderCircle, LucideRefreshCw, LucideLockOpen, LucideDownload,
    LucideTrendingUp, LucideTrendingDown, LucideMinus,
  ],
  templateUrl: './tributario.html',
})
export class TributarioPage implements OnInit {
  private readonly api = inject(TributarioApi);
  private readonly contadorApi = inject(ContadorApi);
  private readonly toast = inject(ToastService);

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
  /** A reabertura só faz sentido quando a apuração está FECHADA (RN005). */
  readonly podeReabrir = computed(() => this.apuracao()?.status === 'FECHADO');
  readonly reabrindo = signal(false);

  /**
   * Apuração do mês anterior, só para a comparação. Falha em silêncio: sem ela a tela perde a
   * frase "quanto variou", não o número principal.
   */
  private readonly apuracaoAnterior = signal<Apuracao | null>(null);

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

  // ── Créditos ──
  readonly creditos = signal<CreditoSaldo | null>(null);
  readonly loadingCreditos = signal(false);
  readonly erroCreditos = signal(false);

  // ── Relatório de conformidade ──
  readonly relatorio = signal<RelatorioConformidade | null>(null);
  readonly loadingRelatorio = signal(false);
  readonly erroRelatorio = signal(false);
  readonly baixandoPdf = signal(false);
  /** `saldoAPagar` negativo = saldo credor (contrato 8.8) — muda apenas o rótulo, não o valor. */
  readonly saldoCredor = computed(() => (this.relatorio()?.saldoAPagar ?? 0) < 0);

  ngOnInit(): void {
    this.carregar();
  }

  /** Recarrega todas as seções para o período atual (fetches independentes). */
  carregar(): void {
    this.carregarApuracao();
    this.carregarApuracaoAnterior();
    this.carregarCreditos();
    this.carregarRelatorio();
    this.carregarGuias();
  }

  /** Mês anterior ao selecionado, em `AAAA-MM`. */
  private periodoAnterior(): string {
    const d = new Date(this.ano(), this.mes() - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  private carregarApuracaoAnterior(): void {
    this.apuracaoAnterior.set(null);
    this.api.apuracao(this.periodoAnterior()).subscribe({
      next: (a) => this.apuracaoAnterior.set(a),
      error: () => this.apuracaoAnterior.set(null),
    });
  }

  private carregarGuias(): void {
    this.guiasCarregadas.set(false);
    this.contadorApi.getGuias(LOGGED_PRODUCER_ID).subscribe({
      next: (lista) => {
        this.guias.set(lista);
        this.guiasCarregadas.set(true);
      },
      error: () => {
        this.guias.set([]);
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

  carregarCreditos(): void {
    this.loadingCreditos.set(true);
    this.erroCreditos.set(false);
    this.api.saldoCredito(this.periodo()).subscribe({
      next: (c) => {
        this.creditos.set(c);
        this.loadingCreditos.set(false);
      },
      error: () => {
        this.creditos.set(null);
        this.erroCreditos.set(true);
        this.loadingCreditos.set(false);
      },
    });
  }

  carregarRelatorio(): void {
    this.loadingRelatorio.set(true);
    this.erroRelatorio.set(false);
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
        this.toast.error(env ? mensagemDeEnvelope(env, err?.status ?? 0) : 'Não foi possível baixar o PDF.');
      },
    });
  }

  /**
   * Reabre uma apuração FECHADA (RN005), ramificando o erro por `errors[].code` (não por texto):
   * 409 `APURACAO_NAO_REABRIVEL` e 422 `REABERTURA_FORA_PRAZO` têm mensagens específicas.
   *
   * **Não conectável hoje (A-7/OQ-1):** `ApuracaoResponse` não expõe `id` e o endpoint é
   * `POST /apuracao/{id}/reabrir` — a UI mantém o botão desabilitado com aviso. Este método fica
   * pronto (e testado com mocks) para ativar quando o backend expuser o `id`.
   */
  reabrir(id: string): void {
    this.reabrindo.set(true);
    this.api.reabrirApuracao(id).subscribe({
      next: (a) => {
        this.apuracao.set(a);
        this.reabrindo.set(false);
        this.toast.success('Apuração reaberta.');
      },
      error: (err: HttpErrorResponse) => {
        this.reabrindo.set(false);
        const env = err?.error as ApiErrorEnvelope | undefined;
        const code = env?.errors?.[0]?.code;
        if (code === 'APURACAO_NAO_REABRIVEL') {
          this.toast.error('A apuração não está fechada.');
        } else if (code === 'REABERTURA_FORA_PRAZO') {
          this.toast.error('Reabertura fora do prazo de 3 meses (RN005).');
        } else {
          this.toast.error(mensagemDeEnvelope(env, err?.status ?? 0));
        }
      },
    });
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

  /** `2026-08` -> "agosto de 2026". O produtor nao fala AAAA-MM. */
  formatPeriodo(periodo: string): string {
    const [ano, mes] = periodo.split('-');
    const d = new Date(Number(ano), Number(mes) - 1, 1);
    return Number.isNaN(d.getTime())
      ? periodo
      : d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }

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
