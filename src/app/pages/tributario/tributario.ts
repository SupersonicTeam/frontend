import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import {
  LucideReceipt, LucideLoaderCircle, LucideRefreshCw, LucideLockOpen, LucideDownload,
} from '@lucide/angular';
import { TributarioApi } from '@services/tributario/data-access/tributario.service';
import { Apuracao, CreditoSaldo, RelatorioConformidade } from '@models/tributario.model';
import { StatusApuracao } from '@core/enums/status-apuracao.enum';
import { ToastService } from '@core/services/toast.service';
import { ApiErrorEnvelope } from '@dtos/shared/responses/api-error.response';
import { mensagemDeEnvelope } from '@core/interceptors/api.interceptor';
import { salvarBlob, filenameDeContentDisposition, apiErrorDeBlob } from '@core/utils/download';
import { UiStat } from '@shared/ui/ui-stat';

/** Rótulo + classe de badge por status de apuração (RN004/RN005). */
const STATUS_APURACAO: Record<StatusApuracao, { label: string; classe: string }> = {
  ABERTO: {
    label: 'Aberto',
    classe: 'bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
  },
  EM_PROCESSAMENTO: {
    label: 'Em processamento',
    classe: 'bg-yellow-100 text-yellow-700 border border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800',
  },
  FECHADO: {
    label: 'Fechado',
    classe: 'bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800',
  },
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
    UiStat,
    FormsModule, LucideReceipt, LucideLoaderCircle, LucideRefreshCw, LucideLockOpen, LucideDownload,
  ],
  templateUrl: './tributario.html',
})
export class TributarioPage implements OnInit {
  private readonly api = inject(TributarioApi);
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
    this.carregarCreditos();
    this.carregarRelatorio();
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

  formatCurrency(v?: number | null): string {
    return (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
}
