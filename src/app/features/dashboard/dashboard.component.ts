import { Component, inject, signal, computed, OnInit } from '@angular/core';
import {
  LucideTrendingUp,
  LucideTrendingDown,
  LucideDollarSign,
  LucideFileText,
  LucideEye,
  LucideLoaderCircle,
  LucideFile,
  LucideDownload,
  LucideMessageCircle,
  LucideX,
  LucideSprout,
  LucideChevronDown,
  LucideChevronUp,
} from '@lucide/angular';
import { DashboardService, LOGGED_PRODUCER_ID } from '../../core/services/dashboard.service';
import { NotificacaoService } from '../../core/services/notificacao.service';
import { ToastService } from '../../core/services/toast.service';
import { FluxoCaixa, NotaFiscal } from '../../core/models/types';

interface DocItem {
  id: number;
  nome: string;
  tipo: string;
  data: string;
  status?: string;
  notaId?: string;
  valor: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    LucideTrendingUp,
    LucideTrendingDown,
    LucideDollarSign,
    LucideFileText,
    LucideEye,
    LucideLoaderCircle,
    LucideFile,
    LucideDownload,
    LucideMessageCircle,
    LucideX,
    LucideSprout,
    LucideChevronDown,
    LucideChevronUp,
  ],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent implements OnInit {
  private readonly dashboardService = inject(DashboardService);
  private readonly notificacaoService = inject(NotificacaoService);
  private readonly toastService = inject(ToastService);

  readonly mesAtual = this.getMesAtual();
  readonly nomeUsuario = signal('João Silva');
  readonly loadingFluxo = signal(false);
  readonly loadingNotas = signal(false);
  readonly loadingDetalhes = signal(false);
  readonly enviandoNotificacao = signal(false);

  readonly fluxoCaixa = signal<FluxoCaixa | null>(null);
  readonly notas = signal<NotaFiscal[]>([]);
  readonly notaDetalhada = signal<NotaFiscal | null>(null);
  readonly previewDoc = signal<DocItem | null>(null);

  // Simulador — breakdown de impostos das notas
  showSimuladorDetalhe = signal(false);

  readonly impostoBreakdown = computed(() => {
    const notas = this.notas();
    const totalCbs = notas.reduce((s, n) => s + (n.valorCbs ?? 0), 0);
    const totalIbs = notas.reduce((s, n) => s + (n.valorIbs ?? 0), 0);
    const totalFunrural = notas.reduce((s, n) => s + (n.valorFunrural ?? 0), 0);
    const totalIcms = notas.reduce((s, n) => s + (n.valorIcms ?? 0), 0);
    const totalIpi = notas.reduce((s, n) => s + (n.valorIpi ?? 0), 0);
    const total = totalCbs + totalIbs + totalFunrural + totalIcms + totalIpi;
    const base = notas.reduce((s, n) => s + (n.valorTotal ?? 0), 0);

    return [
      { nome: 'CBS', aliquota: '3,5%', original: '8,8%', valor: totalCbs, reducao: true },
      { nome: 'IBS Estadual', aliquota: '5,1%', original: '12,7%', valor: totalIbs * 0.72, reducao: true },
      { nome: 'IBS Municipal', aliquota: '2,0%', original: '5,0%', valor: totalIbs * 0.28, reducao: true },
      { nome: 'FUNRURAL', aliquota: '1,5%', original: null, valor: totalFunrural, reducao: false },
      { nome: 'ICMS', aliquota: '—', original: null, valor: totalIcms, reducao: false },
      { nome: 'IPI', aliquota: '—', original: null, valor: totalIpi, reducao: false },
    ].filter(item => item.valor > 0);
  });

  readonly totalImpostoCalculado = computed(() =>
    this.impostoBreakdown().reduce((s, i) => s + i.valor, 0)
  );

  readonly documentos = computed(() =>
    this.notas()
      .slice()
      .sort((a, b) => {
        const dateA = new Date(a.dataEmissao || '1970-01-01').getTime();
        const dateB = new Date(b.dataEmissao || '1970-01-01').getTime();
        return dateB - dateA;
      })
      .slice(0, 7)
      .map((nota, idx) => ({
        id: idx + 1,
        nome: nota.naturezaOperacao || `NF ${nota.numero}`,
        tipo: nota.tipo === 'entrada' ? 'Nota de Entrada' : 'Nota de Saída',
        data: nota.dataEmissao?.split('T')[0] || new Date().toISOString().split('T')[0],
        status: nota.status,
        notaId: nota.id,
        valor: nota.valorTotal || 0,
      }))
  );

  ngOnInit(): void {
    this.carregarDados();
  }

  private carregarDados(): void {
    this.loadingFluxo.set(true);
    this.dashboardService.getFluxoCaixa(LOGGED_PRODUCER_ID).subscribe({
      next: data => { this.fluxoCaixa.set(data); this.loadingFluxo.set(false); },
      error: () => this.loadingFluxo.set(false),
    });

    this.loadingNotas.set(true);
    this.dashboardService.getNotas(LOGGED_PRODUCER_ID).subscribe({
      next: data => { this.notas.set(data); this.loadingNotas.set(false); },
      error: () => this.loadingNotas.set(false),
    });

    this.dashboardService.getProdutor(LOGGED_PRODUCER_ID).subscribe({
      next: p => { if (p?.nome) this.nomeUsuario.set(p.nome); },
      error: () => {},
    });
  }

  abrirPreview(doc: DocItem): void {
    this.previewDoc.set(doc);
    this.notaDetalhada.set(null);
    if (doc.notaId) {
      this.loadingDetalhes.set(true);
      this.dashboardService.getNota(doc.notaId).subscribe({
        next: nota => { this.notaDetalhada.set(nota); this.loadingDetalhes.set(false); },
        error: () => this.loadingDetalhes.set(false),
      });
    }
  }

  fecharPreview(): void {
    this.previewDoc.set(null);
    this.notaDetalhada.set(null);
  }

  handleNotificarWhatsApp(): void {
    this.enviandoNotificacao.set(true);
    this.notificacaoService.notificarProximasObrigacoes(LOGGED_PRODUCER_ID).subscribe({
      next: res => {
        this.enviandoNotificacao.set(false);
        if (res.enviados > 0) {
          this.toastService.success(`✅ ${res.enviados} notificação(ões) enviada(s) via WhatsApp!`);
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

  formatCurrency(value: number): string {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  formatDate(iso: string): string {
    return new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  }

  getStatusStyle(status?: string): { label: string; color: string } {
    switch (status) {
      case 'validada': return { label: 'Validado', color: 'bg-emerald-100 text-emerald-800 border border-emerald-200' };
      case 'pendente': return { label: 'Pendente', color: 'bg-yellow-100 text-yellow-800 border border-yellow-200' };
      case 'erro': return { label: 'Erro', color: 'bg-red-100 text-red-800 border border-red-200' };
      default: return { label: 'Encaminhado', color: 'bg-yellow-100 text-yellow-800 border border-yellow-200' };
    }
  }

  private getMesAtual(): string {
    const mes = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return mes.charAt(0).toUpperCase() + mes.slice(1);
  }
}
