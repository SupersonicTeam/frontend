import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideReceipt, LucideLoaderCircle, LucideRefreshCw } from '@lucide/angular';
import { TributarioApi } from '@services/tributario/data-access/tributario.service';
import { Apuracao, CreditoSaldo } from '@models/tributario.model';
import { StatusApuracao } from '@core/enums/status-apuracao.enum';

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
  imports: [FormsModule, LucideReceipt, LucideLoaderCircle, LucideRefreshCw],
  templateUrl: './tributario.html',
})
export class TributarioPage implements OnInit {
  private readonly api = inject(TributarioApi);

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

  // ── Créditos ──
  readonly creditos = signal<CreditoSaldo | null>(null);
  readonly loadingCreditos = signal(false);
  readonly erroCreditos = signal(false);

  ngOnInit(): void {
    this.carregar();
  }

  /** Recarrega todas as seções para o período atual (fetches independentes). */
  carregar(): void {
    this.carregarApuracao();
    this.carregarCreditos();
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
