import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  LucideFileText,
  LucideSearch,
  LucideUpload,
  LucideX,
  LucideEye,
  LucideDownload,
  LucideFile,
  LucideCircleCheck,
  LucideRefreshCw,
  LucidePlus,
  LucideTrash2,
  LucideSend,
  LucideClipboardList,
  LucideFileCheck,
  LucideTrendingUp,
  LucideLoaderCircle,
  LucideFileOutput,
} from '@lucide/angular';
import { HttpErrorResponse } from '@angular/common/http';
import { DashboardApi, mockNotas } from '@services/dashboard/data-access/dashboard.service';
import { NotasApi } from '@services/notas/data-access/notas.service';
import { ContadorApi } from '@services/contador/data-access/contador.service';
import { ToastService } from '@core/services/toast.service';
import { LOGGED_PRODUCER_ID } from '@core/config/produtor-logado';
import { NotaFiscal } from '@models/nota-fiscal.model';
import { RascunhoNota } from '@models/rascunho-nota.model';
import { SolicitacaoContador } from '@models/solicitacao-contador.model';
import { ApiErrorEnvelope, FiscalError } from '@dtos/shared/responses/api-error.response';
import { statusNotaLabel, statusNotaBadge } from '@core/enums/status-nota-fiscal.enum';
import { gerarNotaPdf } from '@core/utils/nota-pdf';

export interface ItemForm {
  descricao: string;
  codigoProduto: string;
  ncm: string;
  cfop: string;
  unidade: string;
  quantidade: string;
  valorUnitario: string;
  valorTotal: string;
}

const emptyItem = (): ItemForm => ({
  descricao: '',
  codigoProduto: '',
  ncm: '',
  cfop: '',
  unidade: 'UN',
  quantidade: '',
  valorUnitario: '',
  valorTotal: '',
});

const UFS = [
  'AC',
  'AL',
  'AM',
  'AP',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MG',
  'MS',
  'MT',
  'PA',
  'PB',
  'PE',
  'PI',
  'PR',
  'RJ',
  'RN',
  'RO',
  'RR',
  'RS',
  'SC',
  'SE',
  'SP',
  'TO',
];

const PERIODO_OPTIONS = [
  { value: 'todos', label: 'Todos' },
  { value: '7', label: 'Últimos 7 dias' },
  { value: '30', label: 'Últimos 30 dias' },
  { value: 'mes', label: 'Este mês' },
  { value: 'mesAnterior', label: 'Mês anterior' },
];

@Component({
  selector: 'app-documentos',
  standalone: true,
  imports: [
    FormsModule,
    LucideFileText,
    LucideSearch,
    LucideUpload,
    LucideX,
    LucideEye,
    LucideDownload,
    LucideFile,
    LucideCircleCheck,
    LucideRefreshCw,
    LucidePlus,
    LucideTrash2,
    LucideSend,
    LucideClipboardList,
    LucideFileCheck,
    LucideTrendingUp,
    LucideLoaderCircle,
    LucideFileOutput,
  ],
  templateUrl: './documentos.html',
})
export class DocumentosPage implements OnInit {
  private readonly dashboardService = inject(DashboardApi);
  private readonly notasApi = inject(NotasApi);
  private readonly contadorService = inject(ContadorApi);
  private readonly toastService = inject(ToastService);

  // Data
  notas = signal<NotaFiscal[]>([]);
  rascunhos = signal<RascunhoNota[]>([]);
  solicitacoes = signal<SolicitacaoContador[]>([]);
  loading = signal(false);
  salvando = signal(false);

  // Filters
  periodo = signal('todos');
  tipo = signal('todos');
  grupo = signal('todos');
  statusFilter = signal('todos');
  busca = signal('');
  ordenacao = signal<'data' | 'valor'>('data');

  // Carregamento de notas
  notasErro = signal(false);

  // Importar nota via XML/PDF (drag-and-drop)
  importando = signal(false);
  dragOver = signal(false);

  // View dialogs
  previewNota = signal<NotaFiscal | null>(null);
  viewRascunho = signal<RascunhoNota | null>(null);
  feedbackRascunho = signal<RascunhoNota | null>(null);
  emitirRascunho = signal<RascunhoNota | null>(null);

  // Download de nota (PDF/XML)
  baixandoXml = signal(false);
  errosFiscais = signal<FiscalError[]>([]);

  // Upload/Anexar dialog
  showAnexar = signal(false);
  solicitacaoSelecionada = signal('');
  arquivoSelecionado = signal<string | null>(null);

  // Gerar Rascunho dialog
  showGerarRascunho = signal(false);
  rascunhoTipo = signal<'entrada' | 'saida'>('saida');
  rascunhoDestinatario = signal('');
  rascunhoCpfCnpj = signal('');
  rascunhoUf = signal('');
  rascunhoCfop = signal('');
  rascunhoNatureza = signal('');
  rascunhoData = signal('');
  rascunhoValor = signal('');
  rascunhoObs = signal('');
  rascunhoItens = signal<ItemForm[]>([emptyItem()]);

  readonly periodoOptions = PERIODO_OPTIONS;
  readonly ufs = UFS;

  readonly notasFiltradas = computed(() => {
    let lista = this.notas().slice();
    const busca = this.busca().toLowerCase();
    const now = new Date();

    // Período
    if (this.periodo() !== 'todos') {
      lista = lista.filter((n) => {
        const d = new Date(n.dataEmissao?.split('T')[0] + 'T12:00:00' || '');
        const diff = (now.getTime() - d.getTime()) / 86400000;
        if (this.periodo() === '7') return diff >= 0 && diff <= 7;
        if (this.periodo() === '30') return diff >= 0 && diff <= 30;
        if (this.periodo() === 'mes')
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        if (this.periodo() === 'mesAnterior') {
          const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          return d.getMonth() === prev.getMonth() && d.getFullYear() === prev.getFullYear();
        }
        return true;
      });
    }

    // Tipo do documento (NFE/NFA)
    if (this.tipo() !== 'todos') lista = lista.filter((n) => (n.tipoDocumento ?? 'NFE') === this.tipo());

    // Busca (natureza da operação, número ou destinatário)
    if (busca)
      lista = lista.filter(
        (n) =>
          (n.naturezaOperacao || '').toLowerCase().includes(busca) ||
          String(n.numero ?? '').includes(busca) ||
          (n.destinatarioNome || '').toLowerCase().includes(busca),
      );

    // Ordenação
    lista.sort((a, b) => {
      if (this.ordenacao() === 'valor') return (b.valorTotalNota ?? 0) - (a.valorTotalNota ?? 0);
      return new Date(b.dataEmissao ?? 0).getTime() - new Date(a.dataEmissao ?? 0).getTime();
    });

    return lista;
  });

  readonly rascunhosFiltrados = computed(() => {
    const busca = this.busca().toLowerCase();
    return this.rascunhos().filter(
      (r) =>
        !busca ||
        (r.titulo || '').toLowerCase().includes(busca) ||
        (r.naturezaOperacao || '').toLowerCase().includes(busca),
    );
  });

  readonly solicitacoesFiltradas = computed(() => {
    const busca = this.busca().toLowerCase();
    return this.solicitacoes().filter(
      (s) =>
        !busca ||
        s.titulo.toLowerCase().includes(busca) ||
        s.descricao.toLowerCase().includes(busca),
    );
  });

  readonly solicitacoesPendentes = computed(() =>
    this.solicitacoes().filter((s) => s.status === 'pendente'),
  );

  readonly solicitacaoInfo = computed(
    () => this.solicitacoes().find((s) => s.id === this.solicitacaoSelecionada()) ?? null,
  );

  readonly canSubmitRascunho = computed(
    () =>
      !!this.rascunhoDestinatario().trim() &&
      !!this.rascunhoData() &&
      !!this.rascunhoValor() &&
      this.rascunhoItens().some((i) => i.descricao && i.quantidade),
  );

  ngOnInit(): void {
    this.carregarDados();
  }

  carregarDados(): void {
    this.recarregarNotas();
    this.dashboardService
      .getRascunhos(LOGGED_PRODUCER_ID)
      .subscribe({ next: (d) => this.rascunhos.set(d), error: () => {} });
    this.contadorService
      .getPendencias(LOGGED_PRODUCER_ID)
      .subscribe({ next: (d) => this.solicitacoes.set(d), error: () => {} });
  }

  /**
   * Recarrega as notas do produtor a partir do backend real (`GET /api/notas`).
   * Em falha (ex.: backend offline) exibe `mockNotas()` com o banner "dados de
   * exemplo" (`notasErro`), mantendo a tela utilizável.
   */
  recarregarNotas(): void {
    this.loading.set(true);
    this.notasApi.listar({ page: 0, size: 100, sort: 'dataEmissao,desc' }).subscribe({
      next: (page) => {
        this.notas.set(page.content);
        this.notasErro.set(false);
        this.loading.set(false);
      },
      error: () => {
        this.notas.set(mockNotas());
        this.notasErro.set(true);
        this.loading.set(false);
      },
    });
  }

  /** Substitui a nota na listagem e no preview após uma atualização do backend. */
  private atualizarNotaLocal(nota: NotaFiscal): void {
    this.notas.update((list) => list.map((n) => (n.id === nota.id ? nota : n)));
    if (this.previewNota()?.id === nota.id) this.previewNota.set(nota);
  }

  // === Gerar Rascunho ===
  resetRascunhoForm(): void {
    this.rascunhoTipo.set('saida');
    this.rascunhoDestinatario.set('');
    this.rascunhoCpfCnpj.set('');
    this.rascunhoUf.set('');
    this.rascunhoCfop.set('');
    this.rascunhoNatureza.set('');
    this.rascunhoData.set('');
    this.rascunhoValor.set('');
    this.rascunhoObs.set('');
    this.rascunhoItens.set([emptyItem()]);
  }

  abrirGerarRascunho(): void {
    this.resetRascunhoForm();
    this.showGerarRascunho.set(true);
  }
  fecharGerarRascunho(): void {
    this.showGerarRascunho.set(false);
  }

  salvarRascunho(enviarContador = false): void {
    if (!this.canSubmitRascunho()) return;
    this.salvando.set(true);
    const dto = this.buildRascunhoDto();
    this.dashboardService.criarRascunho(dto).subscribe({
      next: (r) => {
        this.salvando.set(false);
        if (r) {
          this.rascunhos.update((list) => [r, ...list]);
          if (enviarContador && r.id) {
            this.dashboardService.enviarRascunhoContador(r.id).subscribe({
              next: (updated) => {
                if (updated)
                  this.rascunhos.update((list) =>
                    list.map((x) => (x.id === updated.id ? updated : x)),
                  );
              },
              error: () => {},
            });
          }
          this.toastService.success(
            enviarContador ? 'Rascunho enviado ao contador!' : 'Rascunho salvo!',
          );
        }
        this.fecharGerarRascunho();
      },
      error: () => {
        this.salvando.set(false);
        this.toastService.error('Erro ao salvar rascunho.');
      },
    });
  }

  private buildRascunhoDto(): unknown {
    return {
      produtorId: LOGGED_PRODUCER_ID,
      tipo: this.rascunhoTipo(),
      cfop: this.rascunhoCfop() || undefined,
      naturezaOperacao: this.rascunhoNatureza() || undefined,
      nomeDestinatario: this.rascunhoDestinatario(),
      cpfCnpjDestinatario: this.rascunhoCpfCnpj().replace(/\D/g, '') || undefined,
      ufDestino: this.rascunhoUf() || undefined,
      dataEmissao: this.rascunhoData(),
      observacoes: this.rascunhoObs() || undefined,
      itens: this.rascunhoItens()
        .filter((i) => i.descricao && i.quantidade)
        .map((item, idx) => ({
          numeroItem: idx + 1,
          codigoProduto: item.codigoProduto || undefined,
          descricao: item.descricao,
          ncm: item.ncm || undefined,
          cfop: item.cfop || undefined,
          unidade: item.unidade || undefined,
          quantidade: parseFloat(item.quantidade),
          valorUnitario: parseFloat(item.valorUnitario) || 0,
          valorTotal: parseFloat(item.valorTotal) || 0,
        })),
    };
  }

  // Itens do rascunho
  addItem(): void {
    this.rascunhoItens.update((list) => [...list, emptyItem()]);
  }
  removeItem(idx: number): void {
    this.rascunhoItens.update((list) => list.filter((_, i) => i !== idx));
  }
  updateItem(idx: number, field: keyof ItemForm, value: string): void {
    this.rascunhoItens.update((list) =>
      list.map((item, i) => {
        if (i !== idx) return item;
        const updated = { ...item, [field]: value };
        if (
          (field === 'quantidade' || field === 'valorUnitario') &&
          updated.quantidade &&
          updated.valorUnitario
        ) {
          updated.valorTotal = (
            parseFloat(updated.quantidade) * parseFloat(updated.valorUnitario)
          ).toFixed(2);
        }
        return updated;
      }),
    );
  }

  // === Enviar rascunho existente ===
  enviarRascunhoContador(id: string): void {
    this.dashboardService.enviarRascunhoContador(id).subscribe({
      next: (r) => {
        if (r) this.rascunhos.update((list) => list.map((x) => (x.id === r.id ? r : x)));
        this.toastService.success('Rascunho enviado ao contador!');
      },
      error: () => this.toastService.error('Erro ao enviar.'),
    });
  }

  // === Emitir NF-e ===
  confirmarEmitir(rascunho: RascunhoNota): void {
    this.salvando.set(true);
    this.dashboardService
      .feedbackRascunho(rascunho.id, { status: 'finalizado', feedback: 'Emitido pelo produtor' })
      .subscribe({
        next: (r) => {
          this.salvando.set(false);
          if (r) this.rascunhos.update((list) => list.map((x) => (x.id === r.id ? r : x)));
          this.toastService.success('NF-e emitida com sucesso!');
          this.emitirRascunho.set(null);
        },
        error: () => {
          this.salvando.set(false);
          this.toastService.error('Erro ao emitir.');
        },
      });
  }

  // === Anexar documento ===
  fecharAnexar(): void {
    this.showAnexar.set(false);
    this.solicitacaoSelecionada.set('');
    this.arquivoSelecionado.set(null);
  }
  handleFileSelect(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.arquivoSelecionado.set(file.name);
  }
  salvarAnexo(): void {
    if (!this.solicitacaoSelecionada()) return;
    this.toastService.success('Documento anexado com sucesso!');
    this.fecharAnexar();
  }

  // === Download de nota (PDF/XML) ===
  abrirPreview(nota: NotaFiscal): void {
    this.errosFiscais.set([]);
    this.previewNota.set(nota);
  }

  fecharPreview(): void {
    this.previewNota.set(null);
    this.errosFiscais.set([]);
  }

  /**
   * Gera (se necessário) e baixa o XML assinado da nota via backend real.
   * Nota já com XML (`XML_GERADO`+) baixa direto; caso contrário gera primeiro
   * (`POST gerar-xml` → `GET xml`). Em 422 exibe as inconsistências no painel.
   * O fluxo completo de emissão (SEFAZ/DANFE) é tratado na #12.
   */
  baixarXml(nota: NotaFiscal): void {
    this.baixandoXml.set(true);
    this.errosFiscais.set([]);
    const jaGerado = nota.status !== 'RASCUNHO' && nota.status !== 'COM_INCONSISTENCIAS';
    if (jaGerado) {
      this.baixarXmlGerado(nota);
      return;
    }
    this.notasApi.gerarXml(nota.id).subscribe({
      next: (atualizada) => {
        this.atualizarNotaLocal(atualizada);
        this.baixarXmlGerado(atualizada);
      },
      error: (err: HttpErrorResponse) => {
        this.baixandoXml.set(false);
        const env = err?.error as ApiErrorEnvelope | undefined;
        if (err?.status === 422 && env?.errors?.length) {
          this.errosFiscais.set(env.errors);
          this.toastService.error('A nota possui inconsistências fiscais.');
        } else {
          this.toastService.error(env?.message ?? 'Erro ao gerar o XML.');
        }
      },
    });
  }

  private baixarXmlGerado(nota: NotaFiscal): void {
    this.notasApi.obterXml(nota.id).subscribe({
      next: (xml) => {
        this.baixandoXml.set(false);
        this.triggerDownload(`nota-${nota.numero ?? nota.id}.xml`, xml, 'application/xml');
        this.toastService.success('XML assinado baixado com sucesso!');
      },
      error: () => {
        this.baixandoXml.set(false);
        this.toastService.error('Erro ao baixar o XML.');
      },
    });
  }

  async baixarPdf(nota: NotaFiscal): Promise<void> {
    try {
      await gerarNotaPdf(nota);
    } catch {
      this.toastService.error('Erro ao gerar o PDF.');
    }
  }

  private triggerDownload(filename: string, content: string, mime: string): void {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // === Importar nota (XML/PDF, drag-and-drop) ===
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) this.importarArquivo(file);
  }

  onFileImport(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.importarArquivo(file);
    input.value = '';
  }

  importarArquivo(file: File): void {
    const nome = file.name.toLowerCase();
    if (!nome.endsWith('.xml') && !nome.endsWith('.pdf')) {
      this.toastService.error('Envie um arquivo XML ou PDF da NF-e.');
      return;
    }
    if (!nome.endsWith('.xml')) {
      this.toastService.info('A importação lê apenas o XML da NF-e (o PDF não é aceito pelo backend).');
      return;
    }
    this.importando.set(true);
    this.notasApi.importar([file]).subscribe({
      next: () => {
        this.importando.set(false);
        this.recarregarNotas();
        this.toastService.success('Importação processada. Confira a lista de notas.');
      },
      error: () => {
        this.importando.set(false);
        this.toastService.error('Não foi possível importar a nota.');
      },
    });
  }

  // Formatação CPF/CNPJ
  formatCpfCnpj(event: Event): void {
    const input = event.target as HTMLInputElement;
    const numeros = input.value.replace(/\D/g, '');
    let formatted: string;
    if (numeros.length <= 11) {
      formatted = numeros
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    } else {
      formatted = numeros
        .replace(/(\d{2})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1/$2')
        .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
    }
    this.rascunhoCpfCnpj.set(formatted);
    input.value = formatted;
  }

  // Helpers
  formatCurrency(v?: number | null): string {
    return (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  formatDate(iso?: string): string {
    if (!iso) return '—';
    return new Date(iso.split('T')[0] + 'T12:00:00').toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  rascunhoStatusLabel(status: string): string {
    const map: Record<string, string> = {
      rascunho: 'Rascunho',
      enviado: 'Enviado',
      revisao: 'Em Revisão',
      aprovado: 'Aprovado',
      reprovado: 'Devolvido',
      finalizado: 'Finalizado',
    };
    return map[status] ?? status;
  }

  rascunhoStatusColor(status: string): string {
    const map: Record<string, string> = {
      rascunho: 'bg-gray-100 text-gray-700 border border-gray-200',
      enviado: 'bg-blue-100 text-blue-700 border border-blue-200',
      revisao: 'bg-yellow-100 text-yellow-700 border border-yellow-200',
      aprovado: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
      reprovado: 'bg-red-100 text-red-700 border border-red-200',
      finalizado: 'bg-purple-100 text-purple-700 border border-purple-200',
    };
    return map[status] ?? 'bg-gray-100 text-gray-700';
  }

  notaStatusLabel(status?: string): string {
    return statusNotaLabel(status);
  }

  notaStatusColor(status?: string): string {
    return statusNotaBadge(status);
  }

  solicitacaoStatusLabel(status: string): string {
    const map: Record<string, string> = {
      pendente: 'Pendente',
      enviado: 'Enviado',
      concluido: 'Concluído',
      cancelado: 'Cancelado',
      rejeitado: 'Rejeitado',
    };
    return map[status] ?? status;
  }

  solicitacaoStatusColor(status: string): string {
    const map: Record<string, string> = {
      pendente: 'bg-yellow-100 text-yellow-700 border border-yellow-200',
      enviado: 'bg-blue-100 text-blue-700 border border-blue-200',
      concluido: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
      cancelado: 'bg-gray-100 text-gray-700 border border-gray-200',
      rejeitado: 'bg-red-100 text-red-700 border border-red-200',
    };
    return map[status] ?? 'bg-gray-100 text-gray-700';
  }
}
