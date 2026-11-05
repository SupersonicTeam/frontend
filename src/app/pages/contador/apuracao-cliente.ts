import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { LucideDownload, LucideLockOpen, LucideReceipt, LucideRefreshCw } from '@lucide/angular';
import { CarteiraApi } from '@services/contador/data-access/carteira.service';
import { EscritorioApi } from '@services/escritorio/data-access/escritorio.service';
import type { Apuracao, CreditoSaldo, RelatorioConformidade } from '@models/tributario.model';
import type { StatusApuracao } from '@core/enums/status-apuracao.enum';
import { ToastService } from '@core/services/toast.service';
import { mesDeFechamento } from '@core/utils/periodo';
import { apiErrorDeBlob, filenameDeContentDisposition, salvarBlob } from '@core/utils/download';
import { mensagemAmigavel, mensagemDeEnvelope } from '@core/interceptors/api.interceptor';
import { UiButton } from '@shared/ui/ui-button';
import { UiSkeleton } from '@shared/ui/ui-skeleton';

const ROTULO_STATUS: Record<StatusApuracao, { label: string; classe: string }> = {
  ABERTO: { label: 'Aberta', classe: 'bg-info-soft text-info-ink' },
  EM_PROCESSAMENTO: { label: 'Em processamento', classe: 'bg-aviso-soft text-aviso-ink' },
  FECHADO: { label: 'Fechada', classe: 'bg-sucesso-soft text-sucesso-ink' },
};

/** Quantos meses o seletor oferece, contando do mês que acabou para trás. */
const MESES_NO_SELETOR = 12;

/** Até quantos meses para trás o servidor reabre (RN005). */
const MESES_REABRIVEIS = 3;

/** Os meses do seletor: do que acabou para trás, como `AAAA-MM` e "outubro de 2026". */
export function mesesDoSeletor(hoje: Date = new Date()): { valor: string; rotulo: string }[] {
  const { mes, ano } = mesDeFechamento(hoje);
  return Array.from({ length: MESES_NO_SELETOR }, (_, i) => {
    const d = new Date(ano, mes - 1 - i, 1);
    return {
      valor: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      rotulo: d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
    };
  });
}

/**
 * Os números de **um cliente** na ficha (#138): apuração do mês, créditos e relatório de
 * conformidade, com o PDF e a reabertura.
 *
 * A ficha dizia que nada disso tinha rota no escopo do escritório; tem desde a backend#255. Toda
 * chamada leva o `produtorId` da ficha aberta — nunca a identidade do token, que é o escritório e
 * responderia 403 (ou, pior, os números de outra pessoa).
 *
 * Abre no mês que **acabou** (`mesDeFechamento`), como o Fechamento: é ele que o contador confere.
 */
@Component({
  selector: 'app-apuracao-cliente',
  standalone: true,
  imports: [LucideDownload, LucideLockOpen, LucideReceipt, LucideRefreshCw, UiButton, UiSkeleton],
  templateUrl: './apuracao-cliente.html',
})
export class ApuracaoCliente implements OnInit {
  private readonly carteiraApi = inject(CarteiraApi);
  private readonly escritorioApi = inject(EscritorioApi);
  private readonly toast = inject(ToastService);

  readonly produtorId = input.required<string>();

  readonly meses = mesesDoSeletor();
  readonly periodo = signal(this.meses[0]!.valor);

  readonly apuracao = signal<Apuracao | null>(null);
  readonly creditos = signal<CreditoSaldo | null>(null);
  readonly relatorio = signal<RelatorioConformidade | null>(null);
  readonly carregando = signal(true);
  readonly erro = signal(false);
  readonly baixandoPdf = signal(false);
  readonly reabrindo = signal(false);
  /** Só administrador e contador reabrem; o assistente não vê o botão (o servidor dá 403). */
  readonly podeReabrir = signal(false);

  readonly status = computed(() => {
    const s = this.apuracao()?.status;
    return s ? ROTULO_STATUS[s] : null;
  });
  readonly semNotas = computed(() => this.apuracao()?.totalNotas === 0);
  readonly fechada = computed(() => this.apuracao()?.status === 'FECHADO');
  /**
   * O servidor só reabre até 3 meses para trás (422 `REABERTURA_FORA_PRAZO`). O seletor oferece
   * 12, a partir do mês que acabou; o botão aparece só nos três primeiros, em vez de prometer o que
   * o servidor sempre recusa.
   */
  readonly dentroDoPrazoDeReabrir = computed(
    () => this.meses.findIndex((m) => m.valor === this.periodo()) < MESES_REABRIVEIS,
  );

  /** Troca de mês com resposta em voo: a do mês velho não entra. */
  private vez = 0;

  ngOnInit(): void {
    this.carregar();
    this.escritorioApi.podeReabrirApuracao().subscribe((pode) => this.podeReabrir.set(pode));
  }

  mudarPeriodo(periodo: string): void {
    if (periodo === this.periodo()) return;
    this.periodo.set(periodo);
    this.carregar();
  }

  /**
   * Apuração, créditos e relatório do mês. A apuração manda no estado da seção: sem ela não há o
   * que mostrar. Créditos e relatório que falharem somem sozinhos, sem derrubar o resto.
   */
  carregar(): void {
    const vez = ++this.vez;
    const daVez = () => vez === this.vez;
    const id = this.produtorId();
    const periodo = this.periodo();

    this.carregando.set(true);
    this.erro.set(false);
    this.apuracao.set(null);
    this.creditos.set(null);
    this.relatorio.set(null);

    this.carteiraApi.apuracaoDoCliente(id, periodo).subscribe({
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
    this.carteiraApi.creditosDoCliente(id, periodo).subscribe({
      next: (c) => {
        if (daVez()) this.creditos.set(c);
      },
      error: () => undefined,
    });
    this.carteiraApi.relatorioConformidadeDoCliente(id, periodo).subscribe({
      next: (r) => {
        if (daVez()) this.relatorio.set(r);
      },
      error: () => undefined,
    });
  }

  baixarPdf(): void {
    if (this.baixandoPdf()) return;
    const periodo = this.periodo();
    this.baixandoPdf.set(true);
    this.carteiraApi.relatorioConformidadePdfDoCliente(this.produtorId(), periodo).subscribe({
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

  /** Volta o mês para aberto. O que vier do servidor substitui a apuração da tela. */
  reabrir(): void {
    if (this.reabrindo() || !this.podeReabrir()) return;
    const vez = this.vez;
    this.reabrindo.set(true);
    this.carteiraApi.reabrirApuracao(this.produtorId(), this.periodo()).subscribe({
      next: (a) => {
        this.reabrindo.set(false);
        if (vez !== this.vez) return;
        this.apuracao.set(a);
        this.toast.success(`Apuração de ${this.rotuloDoPeriodo()} reaberta.`);
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

  rotuloDoPeriodo(): string {
    return this.meses.find((m) => m.valor === this.periodo())?.rotulo ?? this.periodo();
  }

  moeda(valor?: number | null): string {
    return (valor ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  data(iso?: string | null): string {
    if (!iso) return '—';
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('pt-BR');
  }
}
