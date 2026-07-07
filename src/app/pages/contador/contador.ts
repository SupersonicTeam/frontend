import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { TitleCasePipe } from '@angular/common';
import {
  LucideCalculator, LucidePlus, LucideX, LucideUser, LucidePhone,
  LucideMail, LucideMessageCircle, LucideFileText,
  LucideLoaderCircle, LucideRefreshCw, LucideSend, LucideEye,
  LucideCircleX, LucideRotateCcw, LucideMapPin,
  LucideUsers, LucideAlertTriangle, LucidePencil, LucideCircleCheck,
  LucideDownload, LucideBan, LucideSparkles, LucideSave, LucideClipboardCheck,
} from '@lucide/angular';
import { ContadorApi } from '@services/contador/data-access/contador.service';
import { DashboardApi } from '@services/dashboard/data-access/dashboard.service';
import { ToastService } from '@core/services/toast.service';
import { NotificacoesService } from '@core/services/notificacoes.service';
import {
  SolicitacaoContador,
  DocumentoContador,
  GuiaFiscal,
  TipoGuia,
} from '@models/solicitacao-contador.model';
import { RascunhoNota } from '@models/rascunho-nota.model';
import { ProdutorContador } from '@models/produtor.model';
import { LOGGED_PRODUCER_ID } from '@core/config/produtor-logado';

type ActiveTab = 'contatos' | 'solicitacoes' | 'recebidos' | 'rascunhos' | 'concluidos' | 'documentos';

const PRODUTOR_MOCK: ProdutorContador = {
  id: LOGGED_PRODUCER_ID,
  nome: 'João Silva',
  cidade: 'Cascavel',
  uf: 'PR',
  propriedade: 'Fazenda Boa Vista',
  contatos: [{
    nome: 'João Silva',
    funcao: 'Proprietário',
    telefone: '(44) 99999-8888',
    whatsapp: '5544999998888',
    email: 'joao.silva@fazenda.com',
  }],
};

@Component({
  selector: 'app-contador',
  standalone: true,
  imports: [
    FormsModule, ReactiveFormsModule, TitleCasePipe,
    LucideCalculator, LucidePlus, LucideX, LucideUser, LucidePhone,
    LucideMail, LucideMessageCircle, LucideFileText,
    LucideLoaderCircle, LucideRefreshCw, LucideSend, LucideEye,
    LucideCircleX, LucideRotateCcw, LucideMapPin,
    LucideUsers, LucideAlertTriangle, LucidePencil, LucideCircleCheck,
    LucideDownload, LucideBan, LucideSparkles, LucideSave, LucideClipboardCheck,
  ],
  templateUrl: './contador.html',
})
export class ContadorPage implements OnInit {
  private readonly contadorService = inject(ContadorApi);
  private readonly dashboardService = inject(DashboardApi);
  private readonly toastService = inject(ToastService);
  private readonly notificacoesService = inject(NotificacoesService);
  private readonly fb = inject(FormBuilder);

  // State
  activeTab = signal<ActiveTab>('solicitacoes');
  loading = signal(false);
  enviando = signal(false);
  produtor = signal<ProdutorContador>(PRODUTOR_MOCK);
  solicitacoes = signal<SolicitacaoContador[]>([]);
  rascunhos = signal<RascunhoNota[]>([]);
  documentosAnexados = signal<DocumentoContador[]>([]);
  loadingDocs = signal(false);
  guias = signal<GuiaFiscal[]>([]);
  enviandoGuia = signal(false);

  // Checklist de fechamento mensal (mock, estado local por período)
  periodoChecklist = signal('');
  checklistState = signal<Record<string, boolean>>({});
  readonly checklistCategorias = ['Balancete', 'Balanço', 'Extrato bancário', 'Guia de imposto', 'Documento para IR'];

  // Dialogs
  showNovaSolicitacao = signal(false);
  showAnexarGuia = signal(false);
  editandoSolicitacao = signal<SolicitacaoContador | null>(null);
  cancelandoId = signal<string | null>(null);
  cancelMotivo = signal('');
  rejeitandoId = signal<string | null>(null);
  rejeitarMotivo = signal('');
  viewDocId = signal<string | null>(null);
  rascunhoReviewId = signal<string | null>(null);
  resumoId = signal<string | null>(null);

  // Rascunho review state
  feedbackText = signal('');
  rascunhoTab = signal<'dados' | 'itens' | 'feedback'>('dados');

  readonly categorias = [
    'Nota de venda', 'Nota de compra', 'Frete', 'Salário', 'DARF', 'FUNRURAL', 'GPS', 'Recibo', 'Contrato', 'Outro',
    'Guia de imposto', 'Balancete', 'Balanço', 'Extrato bancário', 'Documento para IR',
  ];
  readonly meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  readonly prioridades = [{ value: 'baixa', label: 'Baixa' }, { value: 'media', label: 'Média' }, { value: 'alta', label: 'Alta' }, { value: 'urgente', label: 'Urgente' }];
  readonly tiposGuia: { value: TipoGuia; label: string }[] = [
    { value: 'ICMS', label: 'ICMS' },
    { value: 'FUNRURAL', label: 'FUNRURAL' },
    { value: 'DARF', label: 'DARF' },
    { value: 'GPS', label: 'GPS' },
    { value: 'OUTRO', label: 'Outro' },
  ];

  readonly novaSolicitacaoForm = this.fb.group({
    titulo: ['', [Validators.required, Validators.minLength(3)]],
    descricao: ['', Validators.required],
    categoria: ['', Validators.required],
    mesReferencia: [''],
    prioridade: ['media' as string, Validators.required],
    prazo: [''],
    observacoes: [''],
  });

  readonly novaGuiaForm = this.fb.group({
    tipoGuia: ['ICMS' as TipoGuia, Validators.required],
    dataVencimento: ['', Validators.required],
    valor: ['', [Validators.required, Validators.min(0.01)]],
    observacoes: [''],
  });

  // Computed lists
  readonly pendentes = computed(() => this.solicitacoes().filter(s => s.status === 'pendente' || s.status === 'enviado'));
  readonly recebidos = computed(() => this.solicitacoes().filter(s => s.status === 'enviado'));
  readonly concluidos = computed(() => this.solicitacoes().filter(s => ['concluido', 'cancelado', 'rejeitado'].includes(s.status)));
  readonly rascunhoSelecionado = computed(() => this.rascunhos().find(r => r.id === this.rascunhoReviewId()) ?? null);

  ngOnInit(): void {
    this.carregarDados();
  }

  setTab(tab: ActiveTab): void {
    this.activeTab.set(tab);
    if (tab === 'rascunhos' && this.rascunhos().length === 0) this.carregarRascunhos();
  }

  carregarDados(): void {
    this.loading.set(true);
    this.contadorService.getPendencias(LOGGED_PRODUCER_ID).subscribe({
      next: data => { this.solicitacoes.set(data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
    this.carregarGuias();
  }

  carregarGuias(): void {
    this.contadorService.getGuias(LOGGED_PRODUCER_ID).subscribe({
      next: data => this.guias.set(data),
      error: () => {},
    });
  }

  carregarRascunhos(): void {
    this.dashboardService.getRascunhos(LOGGED_PRODUCER_ID).subscribe({
      next: data => this.rascunhos.set(data),
      error: () => {},
    });
  }

  // === CRUD Solicitações ===
  abrirNova(): void {
    this.editandoSolicitacao.set(null);
    this.novaSolicitacaoForm.reset({ prioridade: 'media' });
    this.showNovaSolicitacao.set(true);
  }

  abrirEditar(s: SolicitacaoContador): void {
    this.editandoSolicitacao.set(s);
    this.novaSolicitacaoForm.patchValue({
      titulo: s.titulo,
      descricao: s.descricao,
      categoria: s.categoria,
      mesReferencia: s.mesReferencia,
      prioridade: s.prioridade,
      prazo: s.prazo?.split('T')[0] ?? '',
      observacoes: s.observacoes ?? '',
    });
    this.showNovaSolicitacao.set(true);
  }

  fecharDialog(): void {
    this.showNovaSolicitacao.set(false);
    this.editandoSolicitacao.set(null);
  }

  salvarSolicitacao(): void {
    if (this.novaSolicitacaoForm.invalid) return;
    const v = this.novaSolicitacaoForm.value;
    this.enviando.set(true);

    const editando = this.editandoSolicitacao();
    if (editando) {
      this.contadorService.atualizarSolicitacao(editando.id, {
        titulo: v.titulo!, descricao: v.descricao!, categoria: v.categoria!,
        mesReferencia: v.mesReferencia || undefined, prioridade: v.prioridade as any,
        prazo: v.prazo || undefined, observacoes: v.observacoes || undefined,
      }).subscribe({
        next: s => {
          this.enviando.set(false);
          if (s) {
            this.solicitacoes.update(list => list.map(x => x.id === s.id ? s : x));
            this.toastService.success('Solicitação atualizada!');
          }
          this.fecharDialog();
        },
        error: () => { this.enviando.set(false); this.toastService.error('Erro ao atualizar.'); },
      });
    } else {
      this.contadorService.criarSolicitacao({
        produtorId: LOGGED_PRODUCER_ID, titulo: v.titulo!, descricao: v.descricao!,
        categoria: v.categoria!, mesReferencia: v.mesReferencia || undefined,
        prioridade: v.prioridade as any, prazo: v.prazo || undefined, observacoes: v.observacoes || undefined,
      }).subscribe({
        next: s => {
          this.enviando.set(false);
          if (s) {
            this.solicitacoes.update(list => [s, ...list]);
            this.toastService.success('Solicitação criada!');
            this.toastService.info('Envio por WhatsApp — em breve');
            this.notificacoesService.adicionar(`Nova solicitação do contador: ${s.titulo}`, 'Solicitação', '/documentos');
          }
          this.fecharDialog();
        },
        error: () => { this.enviando.set(false); this.toastService.error('Erro ao criar.'); },
      });
    }
  }

  // === Anexar guia fiscal ===
  abrirAnexarGuia(): void {
    this.novaGuiaForm.reset({ tipoGuia: 'ICMS' });
    this.showAnexarGuia.set(true);
  }

  fecharAnexarGuia(): void {
    this.showAnexarGuia.set(false);
  }

  salvarGuia(): void {
    if (this.novaGuiaForm.invalid) return;
    const v = this.novaGuiaForm.value;
    this.enviandoGuia.set(true);
    this.contadorService.anexarGuia({
      produtorId: LOGGED_PRODUCER_ID,
      tipoGuia: v.tipoGuia as TipoGuia,
      dataVencimento: v.dataVencimento!,
      valor: Number(v.valor),
      observacoes: v.observacoes || undefined,
    }).subscribe({
      next: guia => {
        this.enviandoGuia.set(false);
        if (guia) {
          this.guias.update(list => [guia, ...list]);
          this.toastService.success('Guia anexada!');
          this.toastService.info('Envio por WhatsApp — em breve');
        }
        this.fecharAnexarGuia();
      },
      error: () => { this.enviandoGuia.set(false); this.toastService.error('Erro ao anexar guia.'); },
    });
  }

  marcarPaga(id: string): void {
    this.contadorService.marcarGuiaPaga(id).subscribe({
      next: () => {
        this.guias.update(list => list.map(g => g.id === id ? { ...g, status: 'pago' as const } : g));
        this.toastService.success('Guia marcada como paga!');
      },
      error: () => this.toastService.error('Erro ao marcar guia como paga.'),
    });
  }

  // === Checklist de fechamento mensal ===
  setPeriodoChecklist(periodo: string): void {
    this.periodoChecklist.set(periodo);
  }

  isChecklistItemRecebido(categoria: string): boolean {
    return !!this.checklistState()[`${this.periodoChecklist()}:${categoria}`];
  }

  toggleChecklistItem(categoria: string): void {
    const key = `${this.periodoChecklist()}:${categoria}`;
    this.checklistState.update(state => ({ ...state, [key]: !state[key] }));
  }

  // === Cancelar ===
  abrirCancelar(id: string): void { this.cancelandoId.set(id); this.cancelMotivo.set(''); }
  fecharCancelar(): void { this.cancelandoId.set(null); this.cancelMotivo.set(''); }

  confirmarCancelar(): void {
    const id = this.cancelandoId();
    if (!id || !this.cancelMotivo().trim()) return;
    this.contadorService.cancelarSolicitacao(id, this.cancelMotivo()).subscribe({
      next: () => {
        this.solicitacoes.update(list => list.map(s => s.id === id ? { ...s, status: 'cancelado' as any, motivoCancelamento: this.cancelMotivo() } : s));
        this.toastService.success('Solicitação cancelada.');
        this.fecharCancelar();
      },
      error: () => this.toastService.error('Erro ao cancelar.'),
    });
  }

  reabrir(id: string): void {
    this.contadorService.reabrirSolicitacao(id).subscribe({
      next: () => {
        this.solicitacoes.update(list => list.map(s => s.id === id ? { ...s, status: 'pendente' as any } : s));
        this.toastService.success('Solicitação reaberta.');
      },
      error: () => this.toastService.error('Erro ao reabrir.'),
    });
  }

  // === Rejeitar ===
  abrirRejeitar(id: string): void { this.rejeitandoId.set(id); this.rejeitarMotivo.set(''); }
  fecharRejeitar(): void { this.rejeitandoId.set(null); this.rejeitarMotivo.set(''); }

  confirmarRejeitar(): void {
    const id = this.rejeitandoId();
    if (!id || !this.rejeitarMotivo().trim()) return;
    this.contadorService.rejeitarSolicitacao(id, this.rejeitarMotivo()).subscribe({
      next: () => {
        this.solicitacoes.update(list => list.map(s => s.id === id ? { ...s, status: 'rejeitado' as any, motivoRejeicao: this.rejeitarMotivo() } : s));
        this.toastService.success('Documento rejeitado.');
        this.fecharRejeitar();
      },
      error: () => this.toastService.error('Erro ao rejeitar.'),
    });
  }

  // === Ver documentos ===
  verDocumentos(id: string): void {
    this.viewDocId.set(id);
    this.loadingDocs.set(true);
    this.contadorService.getDocumentos(id).subscribe({
      next: docs => { this.documentosAnexados.set(docs); this.loadingDocs.set(false); },
      error: () => { this.documentosAnexados.set([]); this.loadingDocs.set(false); },
    });
  }
  fecharViewDoc(): void { this.viewDocId.set(null); this.documentosAnexados.set([]); }

  // === Concluir ===
  concluir(id: string): void {
    this.contadorService.concluirSolicitacao(id).subscribe({
      next: () => {
        this.solicitacoes.update(list => list.map(s => s.id === id ? { ...s, status: 'concluido' as any } : s));
        this.toastService.success('Solicitação concluída!');
        this.fecharViewDoc();
      },
      error: () => this.toastService.error('Erro ao concluir.'),
    });
  }

  // === Rascunho review ===
  abrirRascunho(id: string): void {
    this.rascunhoReviewId.set(id);
    this.rascunhoTab.set('dados');
    const r = this.rascunhos().find(x => x.id === id);
    this.feedbackText.set(r?.feedbackContador ?? '');
  }
  fecharRascunho(): void { this.rascunhoReviewId.set(null); }

  enviarFeedback(status: 'aprovado' | 'revisao' | 'reprovado'): void {
    const id = this.rascunhoReviewId();
    if (!id) return;
    this.dashboardService.feedbackRascunho(id, { status, feedback: this.feedbackText() }).subscribe({
      next: r => {
        if (r) this.rascunhos.update(list => list.map(x => x.id === id ? r : x));
        this.toastService.success(status === 'aprovado' ? 'Rascunho aprovado!' : status === 'reprovado' ? 'Devolvido com feedback.' : 'Em revisão.');
        this.fecharRascunho();
      },
      error: () => this.toastService.error('Erro ao enviar feedback.'),
    });
  }

  // === Helpers ===
  formatDate(iso?: string): string {
    if (!iso) return '—';
    return new Date(iso.split('T')[0] + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  formatCurrency(v?: number): string {
    return (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  statusColor(status: string): string {
    const map: Record<string, string> = {
      pendente: 'bg-yellow-100 text-yellow-700 border border-yellow-200',
      enviado: 'bg-blue-100 text-blue-700 border border-blue-200',
      concluido: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
      cancelado: 'bg-gray-100 text-gray-700 border border-gray-200',
      rejeitado: 'bg-red-100 text-red-700 border border-red-200',
      rascunho: 'bg-gray-100 text-gray-700 border border-gray-200',
      aprovado: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
      reprovado: 'bg-red-100 text-red-700 border border-red-200',
      revisao: 'bg-yellow-100 text-yellow-700 border border-yellow-200',
      finalizado: 'bg-purple-100 text-purple-700 border border-purple-200',
      pago: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
      vencido: 'bg-red-100 text-red-700 border border-red-200',
    };
    return map[status] ?? 'bg-gray-100 text-gray-700';
  }

  statusLabel(status: string): string {
    const map: Record<string, string> = {
      pendente: 'Pendente', enviado: 'Enviado', concluido: 'Concluído',
      cancelado: 'Cancelado', rejeitado: 'Rejeitado', rascunho: 'Rascunho',
      aprovado: 'Aprovado', reprovado: 'Devolvido', revisao: 'Em Revisão', finalizado: 'Finalizado',
      pago: 'Pago', vencido: 'Vencido',
    };
    return map[status] ?? status;
  }

  prioridadeColor(p: string): string {
    return { urgente: 'text-red-600 font-semibold', alta: 'text-orange-600', media: 'text-yellow-600', baixa: 'text-green-600' }[p] ?? 'text-muted-foreground';
  }

  isExtensaoImagem(nome: string): boolean {
    return /\.(jpg|jpeg|png|gif|webp)$/i.test(nome);
  }

  getDownloadUrl(docId: string): string {
    return `/api/contador/documentos/${docId}/download`;
  }

  getSolicitacaoNome(id: string): string {
    return this.solicitacoes().find(s => s.id === id)?.titulo ?? '';
  }
}
