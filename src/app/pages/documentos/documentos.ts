import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
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
  LucideClipboardList,
  LucideFileCheck,
  LucideLoaderCircle,
  LucideFileOutput,
  LucidePencil,
  LucideTriangleAlert,
  LucideSend,
} from '@lucide/angular';
import { NotasApi } from '@services/notas/data-access/notas.service';
import { ContadorApi } from '@services/contador/data-access/contador.service';
import { ToastService } from '@core/services/toast.service';
import { LOGGED_PRODUCER_ID } from '@core/config/produtor-logado';
import { NotaFiscal, TipoDocumento } from '@models/nota-fiscal.model';
import { SolicitacaoContador } from '@models/solicitacao-contador.model';
import { NotaFiscalRequest, NotaFiscalItemRequest } from '@dtos/notas/nota-fiscal.request';
import { NotaValidacaoResponse, SefazRetorno } from '@dtos/notas/sefaz.response';
import { ApiErrorEnvelope, FiscalError } from '@dtos/shared/responses/api-error.response';
import { statusNotaLabel, statusNotaBadge } from '@core/enums/status-nota-fiscal.enum';
import { gerarNotaPdf } from '@core/utils/nota-pdf';
import { salvarBlob, filenameDeContentDisposition, apiErrorDeBlob } from '@core/utils/download';
import { mensagemDeEnvelope } from '@core/interceptors/api.interceptor';
import { NotaPreview } from '@shared/components/nota-preview/nota-preview';

/** Item do formulário (strings, convertidas para número ao montar o request). */
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
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT',
  'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
];

const PERIODO_OPTIONS = [
  { value: 'todos', label: 'Todos' },
  { value: '7', label: 'Últimos 7 dias' },
  { value: '30', label: 'Últimos 30 dias' },
  { value: 'mes', label: 'Este mês' },
  { value: 'mesAnterior', label: 'Mês anterior' },
];

/** Só os dígitos de um CPF/CNPJ (remove máscara). */
function soDigitos(v: string): string {
  return (v ?? '').replace(/\D/g, '');
}

/** Valida os dígitos verificadores de um CPF (11 dígitos). */
function cpfValido(cpf: string): boolean {
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const dv = (base: string, pesoInicial: number): number => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesoInicial - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const d1 = dv(cpf.slice(0, 9), 10);
  const d2 = dv(cpf.slice(0, 10), 11);
  return d1 === Number(cpf[9]) && d2 === Number(cpf[10]);
}

/** Valida os dígitos verificadores de um CNPJ (14 dígitos). */
function cnpjValido(cnpj: string): boolean {
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const dv = (base: string): number => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * pesos[i];
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = dv(cnpj.slice(0, 12));
  const d2 = dv(cnpj.slice(0, 13));
  return d1 === Number(cnpj[12]) && d2 === Number(cnpj[13]);
}

/** CPF/CNPJ válido por tamanho E dígitos verificadores (espelha o @ValidCpfCnpj do backend). */
function cpfCnpjValido(v: string): boolean {
  const d = soDigitos(v);
  if (d.length === 11) return cpfValido(d);
  if (d.length === 14) return cnpjValido(d);
  return false;
}

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
    LucideClipboardList,
    LucideFileCheck,
    LucideLoaderCircle,
    LucideFileOutput,
    LucidePencil,
    LucideTriangleAlert,
    LucideSend,
    NotaPreview,
  ],
  templateUrl: './documentos.html',
})
export class DocumentosPage implements OnInit {
  private readonly notasApi = inject(NotasApi);
  private readonly contadorService = inject(ContadorApi);
  private readonly toastService = inject(ToastService);

  // Data
  notas = signal<NotaFiscal[]>([]);
  solicitacoes = signal<SolicitacaoContador[]>([]);
  loading = signal(false);
  salvando = signal(false);

  // Filters
  periodo = signal('todos');
  tipo = signal('todos');
  statusFilter = signal('todos');
  busca = signal('');
  ordenacao = signal<'data' | 'valor'>('data');

  // Carregamento de notas + paginação server-side (Page<T> do Spring)
  notasErro = signal(false);
  pageIndex = signal(0);
  pageSize = signal(12);
  totalElements = signal(0);

  // Importar nota via XML (drag-and-drop)
  importando = signal(false);
  dragOver = signal(false);

  // View dialogs
  previewNota = signal<NotaFiscal | null>(null);
  notaParaExcluir = signal<NotaFiscal | null>(null);
  excluindo = signal(false);

  // Download de nota (PDF/XML)
  baixandoXml = signal(false);
  errosFiscais = signal<FiscalError[]>([]);

  // Ciclo de vida (#14): gerar XML, validações, cancelamento
  gerandoXml = signal(false);
  validacoes = signal<NotaValidacaoResponse[]>([]);
  carregandoValidacoes = signal(false);
  cancelarAlvo = signal<NotaFiscal | null>(null);
  motivoCancel = signal('');
  cancelando = signal(false);

  // Emissão SEFAZ / DANFE (#12)
  enviandoSefaz = signal(false);
  consultandoStatus = signal(false);
  baixandoDanfe = signal(false);
  /** Último retorno da SEFAZ (cStat/motivo/protocolo) exibido no preview. */
  sefazRetorno = signal<SefazRetorno | null>(null);

  // Upload/Anexar dialog
  showAnexar = signal(false);
  solicitacaoSelecionada = signal('');
  arquivoSelecionado = signal<File | null>(null);
  enviandoAnexo = signal(false);

  // ── Formulário de nota (criar/editar) — alinhado ao NotaFiscalRequest ──
  showFormNota = signal(false);
  formNotaId = signal<string | null>(null); // null = criar; id = editar (PUT)
  formNumero = signal('');
  formSerie = signal('1');
  formTipoDoc = signal<TipoDocumento>('NFE');
  formNatureza = signal('');
  formData = signal('');
  formDestNome = signal('');
  formDestCpfCnpj = signal('');
  formDestIe = signal('');
  formEndLogradouro = signal('');
  formEndNumero = signal('');
  formEndMunicipio = signal('');
  formEndIbge = signal('');
  formEndUf = signal('');
  formEndCep = signal('');
  formItens = signal<ItemForm[]>([emptyItem()]);
  /** Erros de validação devolvidos pelo backend (400/422), exibidos campo a campo. */
  erroNota = signal<FiscalError[]>([]);

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

    // Status
    if (this.statusFilter() !== 'todos') lista = lista.filter((n) => n.status === this.statusFilter());

    // Busca (natureza, número ou destinatário)
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

  /** Um item é válido quando tem os campos exigidos pelo backend (NCM 8 díg, CFOP 4 díg). */
  private itemValido(i: ItemForm): boolean {
    return (
      !!i.descricao.trim() &&
      /^\d{8}$/.test(i.ncm.trim()) &&
      /^\d{4}$/.test(i.cfop.trim()) &&
      !!i.unidade.trim() &&
      Number(i.quantidade) > 0 &&
      Number(i.valorUnitario) > 0
    );
  }

  /** CEP: vazio (opcional) ou exatamente 8 dígitos (espelha o Bean Validation). */
  readonly cepValido = computed(() => {
    const c = soDigitos(this.formEndCep());
    return c.length === 0 || c.length === 8;
  });
  /** Código IBGE: vazio (opcional) ou exatamente 7 dígitos. */
  readonly ibgeValido = computed(() => {
    const c = soDigitos(this.formEndIbge());
    return c.length === 0 || c.length === 7;
  });

  /** CPF/CNPJ vazio (ainda digitando) ou com dígitos verificadores válidos. */
  readonly cpfCnpjValido = computed(() => {
    const d = soDigitos(this.formDestCpfCnpj());
    return d.length === 0 || cpfCnpjValido(d);
  });

  readonly canSubmitNota = computed(() => {
    return (
      Number(this.formNumero()) > 0 &&
      !!this.formNatureza().trim() &&
      !!this.formData() &&
      !!this.formDestNome().trim() &&
      cpfCnpjValido(this.formDestCpfCnpj()) &&
      this.cepValido() &&
      this.ibgeValido() &&
      this.formItens().some((i) => this.itemValido(i))
    );
  });

  ngOnInit(): void {
    this.carregarDados();
  }

  carregarDados(): void {
    this.recarregarNotas();
    this.contadorService
      .getPendencias(LOGGED_PRODUCER_ID)
      .subscribe({ next: (d) => this.solicitacoes.set(d), error: () => undefined });
  }

  /**
   * Recarrega as notas do produtor a partir do backend real (`GET /api/notas`).
   * Em falha (ex.: backend offline) exibe o banner de erro com "Tentar novamente"
   * (`notasErro`), sem dados mockados.
   */
  recarregarNotas(): void {
    this.loading.set(true);
    this.notasErro.set(false);
    this.notasApi
      .listar({ page: this.pageIndex(), size: this.pageSize(), sort: 'dataEmissao,desc' })
      .subscribe({
        next: (page) => {
          this.notas.set(page.content);
          this.totalElements.set(page.totalElements);
          this.notasErro.set(false);
          this.loading.set(false);
        },
        error: () => {
          this.notas.set([]);
          this.totalElements.set(0);
          this.notasErro.set(true);
          this.loading.set(false);
        },
      });
  }

  /** Total de páginas (server-side, a partir de totalElements/pageSize). */
  readonly totalPaginas = computed(() => Math.max(1, Math.ceil(this.totalElements() / this.pageSize())));

  /** Vai para uma página (0-based) e recarrega do backend (Pageable). */
  irParaPagina(idx: number): void {
    const alvo = Math.min(Math.max(0, idx), this.totalPaginas() - 1);
    if (alvo === this.pageIndex()) return;
    this.pageIndex.set(alvo);
    this.recarregarNotas();
  }

  /** Substitui a nota na listagem e no preview após uma atualização do backend. */
  private atualizarNotaLocal(nota: NotaFiscal): void {
    this.notas.update((list) => list.map((n) => (n.id === nota.id ? nota : n)));
    if (this.previewNota()?.id === nota.id) this.previewNota.set(nota);
  }

  // ─────────────── Visibilidade de ações por status (#14) ───────────────
  /** XML pode ser gerado só em RASCUNHO/COM_INCONSISTENCIAS. */
  podeGerarXml(nota?: NotaFiscal | null): boolean {
    return nota?.status === 'RASCUNHO' || nota?.status === 'COM_INCONSISTENCIAS';
  }
  /** XML/DANFE disponíveis após a geração do XML (409 em RASCUNHO/COM_INCONSISTENCIAS). */
  temArquivos(nota?: NotaFiscal | null): boolean {
    return !!nota && !this.podeGerarXml(nota);
  }
  /** Envio à SEFAZ só em XML_GERADO. */
  podeEnviarSefaz(nota?: NotaFiscal | null): boolean {
    return nota?.status === 'XML_GERADO';
  }
  /** Consulta de status só para notas transmitidas. */
  podeConsultarSefaz(nota?: NotaFiscal | null): boolean {
    return (
      nota?.status === 'AUTORIZADA' ||
      nota?.status === 'REJEITADA' ||
      nota?.status === 'PENDENTE_SEFAZ'
    );
  }
  /** Cancelamento só de nota AUTORIZADA. */
  podeCancelar(nota?: NotaFiscal | null): boolean {
    return nota?.status === 'AUTORIZADA';
  }
  /** Histórico de inconsistências relevante em COM_INCONSISTENCIAS/REJEITADA. */
  podeVerValidacoes(nota?: NotaFiscal | null): boolean {
    return nota?.status === 'COM_INCONSISTENCIAS' || nota?.status === 'REJEITADA';
  }

  /**
   * Gera o XML da nota (RASCUNHO/COM_INCONSISTENCIAS → XML_GERADO). Em 422 mostra as
   * inconsistências e carrega o histórico de validações; 500 = certificado ausente no backend.
   */
  gerarXml(nota: NotaFiscal): void {
    this.gerandoXml.set(true);
    this.errosFiscais.set([]);
    this.notasApi.gerarXml(nota.id).subscribe({
      next: (atualizada) => {
        this.gerandoXml.set(false);
        this.atualizarNotaLocal(atualizada);
        this.validacoes.set([]);
        this.toastService.success('XML gerado e assinado!');
      },
      error: (err: HttpErrorResponse) => {
        this.gerandoXml.set(false);
        const env = err?.error as ApiErrorEnvelope | undefined;
        if (err?.status === 422 && env?.errors?.length) {
          this.errosFiscais.set(env.errors);
          // O 422 move a nota para COM_INCONSISTENCIAS; reflete no preview e na lista.
          this.atualizarNotaLocal({ ...nota, status: 'COM_INCONSISTENCIAS' });
          this.verValidacoes(nota);
          this.toastService.error('Não foi possível gerar o XML: inconsistências fiscais.');
        } else if (err?.status === 409) {
          this.toastService.error(env?.message ?? 'Ação inválida para o status atual.');
        } else {
          // 500 CERTIFICADO_AUSENTE ou outra falha do backend.
          const detalhe = env?.errors?.[0]?.message ?? env?.message;
          this.toastService.error(detalhe ?? 'Erro ao gerar o XML.');
        }
      },
    });
  }

  /** Carrega o histórico de inconsistências (GET /validacoes) para exibir no preview. */
  verValidacoes(nota: NotaFiscal): void {
    this.carregandoValidacoes.set(true);
    this.notasApi.listarValidacoes(nota.id).subscribe({
      next: (v) => {
        this.validacoes.set(v);
        this.carregandoValidacoes.set(false);
      },
      error: () => {
        this.validacoes.set([]);
        this.carregandoValidacoes.set(false);
      },
    });
  }

  // ─────────────── Cancelamento (#14) ───────────────
  readonly motivoCancelValido = computed(() => {
    const m = this.motivoCancel().trim();
    return m.length >= 15 && m.length <= 255;
  });

  pedirCancelamento(nota: NotaFiscal): void {
    this.motivoCancel.set('');
    this.cancelarAlvo.set(nota);
  }
  fecharCancelamento(): void {
    this.cancelarAlvo.set(null);
  }
  confirmarCancelamento(): void {
    const nota = this.cancelarAlvo();
    if (!nota || !this.motivoCancelValido()) return;
    this.cancelando.set(true);
    this.notasApi.cancelar(nota.id, this.motivoCancel().trim()).subscribe({
      next: () => {
        this.cancelando.set(false);
        this.cancelarAlvo.set(null);
        this.atualizarNotaLocal({ ...nota, status: 'CANCELADA' });
        this.toastService.success('Nota cancelada junto à SEFAZ.');
      },
      error: (err: HttpErrorResponse) => {
        this.cancelando.set(false);
        const env = err?.error as ApiErrorEnvelope | undefined;
        this.toastService.error(env?.message ?? 'Não foi possível cancelar a nota.');
      },
    });
  }

  // ─────────────── Emissão: SEFAZ e DANFE (#12) ───────────────

  /** Transmite a NF-e (XML_GERADO) à SEFAZ e reflete o retorno (cStat/motivo/protocolo). */
  enviarSefaz(nota: NotaFiscal): void {
    this.enviandoSefaz.set(true);
    this.sefazRetorno.set(null);
    this.notasApi.enviarSefaz(nota.id).subscribe({
      next: (r) => {
        this.enviandoSefaz.set(false);
        this.sefazRetorno.set(r);
        this.atualizarNotaLocal({ ...nota, status: r.status, chaveAcesso: r.chaveAcesso });
        if (r.status === 'AUTORIZADA') this.toastService.success(`Autorizada pela SEFAZ (cStat ${r.cStat}).`);
        else if (r.status === 'REJEITADA') this.toastService.error(`Rejeitada (cStat ${r.cStat}): ${r.xMotivo}`);
        else this.toastService.info(`Pendente na SEFAZ: ${r.xMotivo}`);
      },
      error: (err: HttpErrorResponse) => {
        this.enviandoSefaz.set(false);
        const env = err?.error as ApiErrorEnvelope | undefined;
        if (err?.status === 502) {
          this.toastService.error('SEFAZ indisponível após as tentativas. Tente novamente em instantes.');
        } else if (err?.status === 409) {
          this.toastService.error(env?.message ?? 'Envio inválido para o status atual.');
        } else {
          this.toastService.error(env?.message ?? 'Falha ao enviar à SEFAZ.');
        }
      },
    });
  }

  /** Consulta e sincroniza o status da NF-e na SEFAZ (notas transmitidas). */
  consultarStatus(nota: NotaFiscal): void {
    this.consultandoStatus.set(true);
    this.notasApi.consultarStatus(nota.id).subscribe({
      next: (r) => {
        this.consultandoStatus.set(false);
        this.sefazRetorno.set(r);
        this.atualizarNotaLocal({ ...nota, status: r.status, chaveAcesso: r.chaveAcesso });
        this.toastService.success(`Status sincronizado: ${statusNotaLabel(r.status)} (cStat ${r.cStat}).`);
      },
      error: (err: HttpErrorResponse) => {
        this.consultandoStatus.set(false);
        const env = err?.error as ApiErrorEnvelope | undefined;
        this.toastService.error(env?.message ?? 'Falha ao consultar o status na SEFAZ.');
      },
    });
  }

  /** Baixa a DANFE oficial (PDF do backend via JasperReports) para notas já com XML. */
  baixarDanfe(nota: NotaFiscal): void {
    this.baixandoDanfe.set(true);
    this.notasApi.baixarPdf(nota.id).subscribe({
      next: (resp) => {
        this.baixandoDanfe.set(false);
        const nome = filenameDeContentDisposition(
          resp.headers.get('Content-Disposition'),
          `danfe-${nota.numero ?? nota.id}.pdf`,
        );
        salvarBlob(resp.body!, nome);
        this.toastService.success('DANFE baixada.');
      },
      error: async (err: HttpErrorResponse) => {
        this.baixandoDanfe.set(false);
        this.toastService.error(
          await this.mensagemErroDownload(err, 'DANFE indisponível (gere o XML primeiro).'),
        );
      },
    });
  }

  // ─────────────────────────── Formulário de nota ───────────────────────────

  /** Só notas em RASCUNHO ou COM_INCONSISTENCIAS podem ser editadas/excluídas (backend: 409 fora disso). */
  podeEditar(nota?: NotaFiscal | null): boolean {
    return nota?.status === 'RASCUNHO' || nota?.status === 'COM_INCONSISTENCIAS';
  }

  private resetForm(): void {
    this.formNotaId.set(null);
    this.formNumero.set('');
    this.formSerie.set('1');
    this.formTipoDoc.set('NFE');
    this.formNatureza.set('');
    this.formData.set('');
    this.formDestNome.set('');
    this.formDestCpfCnpj.set('');
    this.formDestIe.set('');
    this.formEndLogradouro.set('');
    this.formEndNumero.set('');
    this.formEndMunicipio.set('');
    this.formEndIbge.set('');
    this.formEndUf.set('');
    this.formEndCep.set('');
    this.formItens.set([emptyItem()]);
    this.erroNota.set([]);
  }

  abrirNovaNota(): void {
    this.resetForm();
    this.showFormNota.set(true);
  }

  /** Abre o formulário pré-preenchido para editar uma nota em RASCUNHO/COM_INCONSISTENCIAS. */
  editarNota(nota: NotaFiscal): void {
    this.resetForm();
    this.formNotaId.set(nota.id);
    this.formNumero.set(String(nota.numero ?? ''));
    this.formSerie.set(String(nota.serie ?? 1));
    this.formTipoDoc.set(nota.tipoDocumento ?? 'NFE');
    this.formNatureza.set(nota.naturezaOperacao ?? '');
    this.formData.set(nota.dataEmissao?.split('T')[0] ?? '');
    this.formDestNome.set(nota.destinatarioNome ?? '');
    this.formDestCpfCnpj.set(nota.destinatarioCpfCnpj ?? '');
    this.formDestIe.set(nota.destinatarioIe ?? '');
    const e = nota.destinatarioEndereco;
    this.formEndLogradouro.set(e?.logradouro ?? '');
    this.formEndNumero.set(e?.numero ?? '');
    this.formEndMunicipio.set(e?.municipio ?? '');
    this.formEndIbge.set(e?.codigoMunicipioIbge ?? '');
    this.formEndUf.set(e?.uf ?? '');
    this.formEndCep.set(e?.cep ?? '');
    this.formItens.set(
      (nota.itens ?? []).map((it) => ({
        descricao: it.descricao ?? '',
        codigoProduto: it.codigoProduto ?? '',
        ncm: it.ncm ?? '',
        cfop: it.cfop ?? '',
        unidade: it.unidade ?? 'UN',
        quantidade: String(it.quantidade ?? ''),
        valorUnitario: String(it.valorUnitario ?? ''),
        valorTotal: String(it.valorTotal ?? ''),
      })),
    );
    if (!this.formItens().length) this.formItens.set([emptyItem()]);
    this.previewNota.set(null);
    this.showFormNota.set(true);
  }

  fecharForm(): void {
    this.showFormNota.set(false);
  }

  private enderecoPreenchido(): boolean {
    return !!(
      this.formEndLogradouro() ||
      this.formEndNumero() ||
      this.formEndMunicipio() ||
      this.formEndIbge() ||
      this.formEndUf() ||
      this.formEndCep()
    );
  }

  private buildNotaRequest(): NotaFiscalRequest {
    const itens: NotaFiscalItemRequest[] = this.formItens()
      .filter((i) => this.itemValido(i))
      .map((item, idx) => ({
        numeroItem: idx + 1,
        codigoProduto: item.codigoProduto.trim() || undefined,
        descricao: item.descricao.trim(),
        ncm: item.ncm.trim(),
        cfop: item.cfop.trim(),
        unidade: item.unidade.trim(),
        quantidade: Number(item.quantidade),
        valorUnitario: Number(item.valorUnitario),
      }));

    const req: NotaFiscalRequest = {
      numero: Number(this.formNumero()),
      serie: this.formSerie() ? Number(this.formSerie()) : undefined,
      naturezaOperacao: this.formNatureza().trim(),
      // dataEmissao como OffsetDateTime no fuso America/Sao_Paulo (-03:00, sem horário de verão).
      dataEmissao: `${this.formData()}T00:00:00-03:00`,
      tipoDocumento: this.formTipoDoc(),
      destinatarioNome: this.formDestNome().trim(),
      destinatarioCpfCnpj: soDigitos(this.formDestCpfCnpj()),
      destinatarioIe: this.formDestIe().trim() || undefined,
      itens,
    };

    if (this.enderecoPreenchido()) {
      req.destinatarioEndereco = {
        logradouro: this.formEndLogradouro().trim() || undefined,
        numero: this.formEndNumero().trim() || undefined,
        municipio: this.formEndMunicipio().trim() || undefined,
        codigoMunicipioIbge: soDigitos(this.formEndIbge()) || undefined,
        uf: this.formEndUf().trim().toUpperCase() || undefined,
        cep: soDigitos(this.formEndCep()) || undefined,
      };
    }
    return req;
  }

  salvarNota(): void {
    if (!this.canSubmitNota() || this.salvando()) return;
    this.salvando.set(true);
    this.erroNota.set([]);
    const req = this.buildNotaRequest();
    const id = this.formNotaId();
    const req$ = id ? this.notasApi.atualizar(id, req) : this.notasApi.criar(req);
    req$.subscribe({
      next: () => {
        this.salvando.set(false);
        this.toastService.success(id ? 'Nota atualizada!' : 'Nota criada em rascunho!');
        this.fecharForm();
        this.recarregarNotas();
      },
      error: (err: HttpErrorResponse) => {
        this.salvando.set(false);
        const env = err?.error as ApiErrorEnvelope | undefined;
        if (env?.errors?.length) {
          this.erroNota.set(env.errors);
          this.toastService.error(env.message ?? 'Corrija os campos destacados.');
        } else {
          this.toastService.error(env?.message ?? 'Erro ao salvar a nota.');
        }
      },
    });
  }

  /** Primeiro erro do backend cujo `field` casa (exato ou por prefixo) com o campo dado. */
  erroDe(campo: string): FiscalError | undefined {
    return this.erroNota().find((e) => e.field === campo || e.field?.startsWith(campo + '.'));
  }

  // Itens do formulário
  addItem(): void {
    this.formItens.update((list) => [...list, emptyItem()]);
  }
  removeItem(idx: number): void {
    this.formItens.update((list) => list.filter((_, i) => i !== idx));
  }
  updateItem(idx: number, field: keyof ItemForm, value: string): void {
    this.formItens.update((list) =>
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

  // ─────────────────────────── Excluir nota ───────────────────────────
  pedirExclusao(nota: NotaFiscal): void {
    this.notaParaExcluir.set(nota);
  }

  cancelarExclusao(): void {
    this.notaParaExcluir.set(null);
  }

  confirmarExclusao(): void {
    const nota = this.notaParaExcluir();
    if (!nota) return;
    this.excluindo.set(true);
    this.notasApi.excluir(nota.id).subscribe({
      next: () => {
        this.excluindo.set(false);
        this.notaParaExcluir.set(null);
        if (this.previewNota()?.id === nota.id) this.previewNota.set(null);
        this.notas.update((list) => list.filter((n) => n.id !== nota.id));
        this.toastService.success('Nota excluída.');
      },
      error: (err: HttpErrorResponse) => {
        this.excluindo.set(false);
        this.notaParaExcluir.set(null);
        const env = err?.error as ApiErrorEnvelope | undefined;
        this.toastService.error(env?.message ?? 'Não foi possível excluir a nota.');
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
    if (file) this.arquivoSelecionado.set(file);
  }
  salvarAnexo(): void {
    const solicitacaoId = this.solicitacaoSelecionada();
    const file = this.arquivoSelecionado();
    if (!solicitacaoId || !file) return;
    const categoria = this.solicitacaoInfo()?.categoria ?? 'Documento';
    this.enviandoAnexo.set(true);
    this.contadorService.anexarDocumento(solicitacaoId, file, categoria).subscribe({
      next: doc => {
        this.enviandoAnexo.set(false);
        if (doc) {
          this.solicitacoes.update(list =>
            list.map(s => (s.id === solicitacaoId ? { ...s, status: 'enviado' as const } : s))
          );
          this.toastService.success('Documento anexado com sucesso!');
          this.fecharAnexar();
        } else {
          this.toastService.error('Não foi possível anexar o documento.');
        }
      },
      error: () => {
        this.enviandoAnexo.set(false);
        this.toastService.error('Erro ao anexar documento.');
      },
    });
  }

  // === Preview + Download de nota (PDF/XML) ===
  abrirPreview(nota: NotaFiscal): void {
    this.errosFiscais.set([]);
    this.validacoes.set([]);
    this.sefazRetorno.set(null);
    this.previewNota.set(nota);
    if (this.podeVerValidacoes(nota)) this.verValidacoes(nota);
  }

  fecharPreview(): void {
    this.previewNota.set(null);
    this.errosFiscais.set([]);
    this.validacoes.set([]);
    this.sefazRetorno.set(null);
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
    if (!this.podeEditar(nota)) {
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
      next: (resp) => {
        this.baixandoXml.set(false);
        const nome = filenameDeContentDisposition(
          resp.headers.get('Content-Disposition'),
          `nota-${nota.numero ?? nota.id}.xml`,
        );
        salvarBlob(new Blob([resp.body ?? ''], { type: 'application/xml' }), nome);
        this.toastService.success('XML assinado baixado com sucesso!');
      },
      error: async (err: HttpErrorResponse) => {
        this.baixandoXml.set(false);
        this.toastService.error(await this.mensagemErroDownload(err, 'Erro ao baixar o XML.'));
      },
    });
  }

  /**
   * Deriva a mensagem de erro de um download por blob/text: o corpo do erro chega como `Blob`
   * (responseType blob) ou string (responseType text) de `ApiError` JSON — desserializa e ramifica
   * por `errors[].code` (via `mensagemDeEnvelope`); usa o `fallback` quando não é um envelope.
   */
  private async mensagemErroDownload(err: HttpErrorResponse, fallback: string): Promise<string> {
    const body: unknown = err?.error;
    let env: ApiErrorEnvelope | null = null;
    if (body instanceof Blob) {
      env = await apiErrorDeBlob(body);
    } else if (typeof body === 'string') {
      try {
        env = JSON.parse(body) as ApiErrorEnvelope;
      } catch {
        env = null;
      }
    } else if (body && typeof body === 'object') {
      env = body as ApiErrorEnvelope;
    }
    return env ? mensagemDeEnvelope(env, err?.status ?? 0) : fallback;
  }

  async baixarPdf(nota: NotaFiscal): Promise<void> {
    try {
      await gerarNotaPdf(nota);
    } catch {
      this.toastService.error('Erro ao gerar o PDF.');
    }
  }

  // === Importar nota (XML, drag-and-drop) ===
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

  // Máscara CPF/CNPJ do formulário
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
    this.formDestCpfCnpj.set(formatted);
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
      pendente: 'bg-yellow-100 text-yellow-700 border border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800',
      enviado: 'bg-blue-100 text-blue-700 border border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
      concluido: 'bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800',
      cancelado: 'bg-gray-100 text-gray-700 border border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
      rejeitado: 'bg-red-100 text-red-700 border border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800',
    };
    return map[status] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
  }
}
