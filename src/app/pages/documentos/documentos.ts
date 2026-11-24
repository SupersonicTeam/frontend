import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, Subscription, debounceTime } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import {
  LucideFileText,
  LucideListFilter,
  LucideSearch,
  LucideUpload,
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
  LucideSparkles,
  LucideX,
  LucideChevronDown,
} from '@lucide/angular';
import {
  NotasApi,
  Pageable,
  TAMANHO_MAXIMO_BUSCA,
  buscaQueValeNoServidor,
} from '@services/notas/data-access/notas.service';
import { ToastService } from '@core/services/toast.service';
import {
  AvisoNota,
  CancelamentoNota,
  NotaFiscal,
  TipoDocumento,
  contraparteDaNota,
  ehCompraImportada,
} from '@models/nota-fiscal.model';
import {
  type Pendencia,
  STATUS_PENDENCIA_LABEL,
  TIPO_DOCUMENTO_LABEL,
  FORMATOS_ACEITOS,
  TAMANHO_MAXIMO_ANEXO,
  MAXIMO_ANEXOS,
  temAnexoEmVerificacao,
} from '@models/pendencia.model';
import { PendenciasApi } from '@services/pendencias/data-access/pendencias.service';
import { VinculosApi } from '@services/vinculos/data-access/vinculos.service';
import { NotaFiscalRequest, NotaFiscalItemRequest } from '@dtos/notas/nota-fiscal.request';
import { NotaValidacaoResponse, SefazRetorno } from '@dtos/notas/sefaz.response';
import { ApiErrorEnvelope, FiscalError } from '@dtos/shared/responses/api-error.response';
import {
  editavel,
  esperaOEscritorio,
  statusNotaLabel,
  temArquivosFiscais,
} from '@core/enums/status-nota-fiscal.enum';
import { UFS } from '@core/utils/endereco';
import { apenasUltimaChecagem, ehCampoDoProdutor, rotuloDoCampo } from '@core/utils/validacoes';
import {
  salvarBlob,
  filenameDeContentDisposition,
  mensagemDeErroDeDownload,
} from '@core/utils/download';
import {
  aplicarMascara,
  cpfCnpjValido,
  mascaraCep,
  mascaraCpfCnpj,
  soDigitos,
} from '@core/utils/mascaras';
import { criarCampoCpfCnpj } from '@core/utils/campo-cpf-cnpj';
import { faixaDeEmissao, hojeEmBrasilia } from '@core/utils/periodo';
import type { ImportacaoNotaResultado } from '@dtos/notas/importacao.response';
import { NotaPreview } from '@shared/components/nota-preview/nota-preview';
import { UiBadgeStatus } from '@shared/ui/ui-badge-status';
import { UiButton } from '@shared/ui/ui-button';
import { UiEmptyState } from '@shared/ui/ui-empty-state';
import { UiModal } from '@shared/ui/ui-modal';
import { UiSkeleton } from '@shared/ui/ui-skeleton';
import { AssistenteStore } from '@shared/assistente/assistente.store';

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
  /** cClassTrib informado no item; vazio = pela regra do NCM (#208, backend#299). */
  cClassTrib: string;
  /**
   * Qual escolha da lista está marcada: um dos códigos conhecidos, `OUTRO` (código digitado) ou
   * vazio (pela regra do NCM). Só a tela usa; o que vai para a API é o `cClassTrib`.
   */
  cClassTribModo: string;
  /**
   * CST do ICMS e origem da mercadoria: **não têm campo na tela**, e ficam aqui só para voltarem
   * no `PUT`, que substitui os itens. Sem isto, editar uma nota criada pela API ou pelo seed
   * apagava a declaração de ICMS do item em silêncio (#208).
   */
  cstIcms: string;
  origemIcms: string;
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
  cClassTrib: '',
  cClassTribModo: '',
  cstIcms: '',
  origemIcms: '',
});

/**
 * Classificação do IBS/CBS que a tela oferece por nome (#208, backend#299). O resto do catálogo
 * (tabela oficial IT 2025.002) fica no `OUTRO`, digitado — é código de contador, não de produtor.
 */
const CLASS_TRIB_OUTRO = 'OUTRO';
const CLASS_TRIB_LISTADOS: readonly string[] = ['200020', '200003'];

/** A escolha da lista que corresponde ao código informado no item. */
function modoDoClassTrib(cClassTrib: string): string {
  if (!cClassTrib) return '';
  return CLASS_TRIB_LISTADOS.includes(cClassTrib) ? cClassTrib : CLASS_TRIB_OUTRO;
}
/** Quanto a busca espera depois da última tecla antes de ir ao servidor (#116). */
const DEBOUNCE_BUSCA_MS = 300;

/**
 * "Esperando você": o que ainda depende do produtor, como `status` repetido (#116). A `DEVOLVIDA`
 * entrou depois: o escritório devolveu para ele corrigir, e ela ficava fora da conta (achado do
 * roteiro da demo, 06/11 — "1 nota espera por você" com uma devolvida na lista).
 */
const ESPERANDO_O_PRODUTOR: readonly string[] = [
  'COM_INCONSISTENCIAS',
  'REJEITADA',
  'DEVOLVIDA',
  'RASCUNHO',
];

/** "a, b e c": a conjunção do português, do próprio navegador. */
const LISTA_COM_E = new Intl.ListFormat('pt-BR', { type: 'conjunction' });

const MESES_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

@Component({
  selector: 'app-documentos',
  standalone: true,
  imports: [
    UiBadgeStatus,
    UiButton,
    UiEmptyState,
    UiModal,
    UiSkeleton,
    FormsModule,
    LucideFileText,
    LucideListFilter,
    LucideSearch,
    LucideUpload,
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
    LucideSparkles,
    NotaPreview,
    LucideX,
    LucideChevronDown,
  ],
  templateUrl: './documentos.html',
})
export class DocumentosPage implements OnInit {
  private readonly notasApi = inject(NotasApi);
  private readonly assistente = inject(AssistenteStore);

  /**
   * A Ceres atende produtor (`403 PAPEL_NAO_AUTORIZADO` para contador), então o
   * botão de perguntar sobre a nota só existe para quem ela atende.
   */
  protected readonly assistenteDisponivel = this.assistente.disponivel;
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly pendenciasApi = inject(PendenciasApi);
  private readonly vinculosApi = inject(VinculosApi);
  private readonly toastService = inject(ToastService);

  // Data
  notas = signal<NotaFiscal[]>([]);
  /**
   * Os pedidos de documento do escritorio (backend#180).
   *
   * Antes isto era `solicitacoes: SolicitacaoContador[]`, preenchido por uma rota que **nunca
   * existiu** (`/contador/pendencias?produtorId=` responde 404 desde sempre) -- e por isso a secao
   * nunca aparecia, mesmo havendo pedido de verdade no banco.
   */
  pendencias = signal<Pendencia[]>([]);
  loading = signal(false);
  salvando = signal(false);

  // Filtros. Todos vão ao servidor (#116); ver `filtrosDoServidor`.
  periodo = signal('todos');
  tipo = signal('todos');
  statusFilter = signal('todos');
  /** O que está no campo de busca. Só vale depois do debounce, ver `buscaAplicada`. */
  busca = signal('');
  /** A busca que foi ao servidor, já limpa por `buscaQueValeNoServidor`. */
  readonly buscaAplicada = signal('');
  ordenacao = signal<'data' | 'valor'>('data');
  readonly TAMANHO_MAXIMO_BUSCA = TAMANHO_MAXIMO_BUSCA;

  // Carregamento de notas + paginação server-side (Page<T> do Spring)
  notasErro = signal(false);
  pageIndex = signal(0);
  /**
   * Notas por página. **Os filtros já não dependem dele** (#116): período, tipo, busca, situação
   * e ordenação vão ao servidor, e o que estiver fora da página é achado na página seguinte.
   *
   * Segue em 100 por causa do **resumo do topo** ("quanto eu faturei", "o que falta de mim") e das
   * opções de período: os dois somam o que veio, e uma página cheia cobre o produtor inteiro na
   * prática.
   */
  pageSize = signal(100);
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
  /**
   * O que a SEFAZ devolveu no último cancelamento, com a nota a que se refere (#116).
   *
   * É a prova do cancelamento, e só existe na resposta do `POST /cancelar`: a `NotaFiscalResponse`
   * não traz protocolo nem data do cancelamento. Por isso aparece no modal logo depois de cancelar,
   * e não ao reabrir a nota depois.
   */
  readonly cancelamento = signal<(CancelamentoNota & { notaId: string }) | null>(null);

  // Emissão SEFAZ / DANFE (#12)
  enviandoSefaz = signal(false);
  consultandoStatus = signal(false);
  baixandoDanfe = signal(false);
  baixandoPrevia = signal(false);
  /** Último retorno da SEFAZ (cStat/motivo/protocolo) exibido no preview. */
  sefazRetorno = signal<SefazRetorno | null>(null);

  // ── Anexar na propria pendencia ──
  // Nao ha modal: o cartao do pedido ja responde "para qual pedido e este arquivo", que era a
  // unica pergunta que o modal fazia. `anexandoEm` guarda o id de quem esta enviando, para o
  // botao girar so naquele cartao.
  anexandoEm = signal<string | null>(null);
  readonly formatosAceitos = FORMATOS_ACEITOS;

  // ── Formulário de nota (criar/editar) — alinhado ao NotaFiscalRequest ──
  showFormNota = signal(false);
  formNotaId = signal<string | null>(null); // null = criar; id = editar (PUT)
  formNumero = signal('');
  formSerie = signal('1');
  /** A pessoa já escreveu no número desta nota; a sugestão não o sobrescreve (#195). */
  private numeroDigitado = false;
  private sugestaoNumero?: Subscription;
  formTipoDoc = signal<TipoDocumento>('NFE');
  formNatureza = signal('');
  formData = signal('');
  formDestNome = signal('');
  /**
   * CPF/CNPJ do destinatário, com a regra dos cadastros (#156): julgado só depois de a pessoa sair
   * do campo. Antes a frase "inválido" aparecia no primeiro dígito digitado.
   */
  readonly destDocumento = criarCampoCpfCnpj();
  formDestCpfCnpj = this.destDocumento.valor;
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

  readonly ufs = UFS;

  /**
   * **Os períodos que existem de verdade.**
   *
   * As opções eram relativas a hoje — "Últimos 7 dias", "Este mês", "Mês anterior" — e, com as
   * notas indo de abril a setembro, três das cinco devolviam lista vazia. Um filtro cujas opções
   * em geral não têm nada atrás não é filtro: é um jeito de a tela dizer "nada aqui".
   *
   * Agora as opções saem das próprias notas: cada mês que tem nota vira uma entrada, com a
   * contagem, agrupada por ano — e o ano inteiro também é escolhível. Escolher um período vazio
   * deixa de ser possível.
   *
   * "Últimos 30 dias" fica, porque responde a outra pergunta ("o que saiu agora"), e some quando
   * não há nota nesse intervalo.
   *
   * Como todo filtro desta tela, isto roda sobre o que veio na página — ver `pageSize`.
   */
  readonly periodosPorAno = computed(() => {
    const porMes = new Map<string, number>();
    for (const n of this.notasDaBase()) {
      const mes = (n.dataEmissao ?? '').slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(mes)) porMes.set(mes, (porMes.get(mes) ?? 0) + 1);
    }

    const anos = new Map<string, { value: string; label: string }[]>();
    for (const mes of [...porMes.keys()].sort().reverse()) {
      const ano = mes.slice(0, 4);
      const nome = MESES_PT[Number(mes.slice(5, 7)) - 1] ?? mes;
      const lista = anos.get(ano) ?? [];
      lista.push({ value: mes, label: `${nome} (${porMes.get(mes)})` });
      anos.set(ano, lista);
    }

    return [...anos.entries()].map(([ano, meses]) => ({
      ano,
      total: meses.reduce((soma, m) => soma + Number(m.label.match(/\((\d+)\)/)?.[1] ?? 0), 0),
      meses,
    }));
  });

  /** Há nota nos últimos 30 dias? Sem isso a opção não aparece. */
  readonly temNotasRecentes = computed(() => {
    const limite = new Date();
    limite.setDate(limite.getDate() - 30);
    const corte = limite.toISOString().slice(0, 10);
    return this.notasDaBase().some((n) => (n.dataEmissao ?? '').slice(0, 10) >= corte);
  });

  /** O que está escrito no seletor quando alguém volta a olhar para ele. */
  readonly rotuloDoPeriodo = computed(() => {
    const p = this.periodo();
    if (p === 'todos') return 'Todo o período';
    if (p === 'ultimos30') return 'Últimos 30 dias';
    if (/^\d{4}$/.test(p)) return p;
    const nome = MESES_PT[Number(p.slice(5, 7)) - 1];
    return nome ? `${nome} de ${p.slice(0, 4)}` : p;
  });

  /**
   * As notas da página, **já filtradas e ordenadas pelo servidor** (#116).
   *
   * Período, tipo e busca eram cortados aqui, em memória, sobre a página carregada: o filtro não
   * enxergava o que estivesse fora dela, e a busca não achava "Jose" em "José", que o servidor acha.
   */
  readonly notasFiltradas = computed(() => this.notas());

  /**
   * As notas sem filtro nenhum, da última carga sem filtro. É de onde saem as **opções** de período:
   * tiradas da lista filtrada, escolher setembro faria os outros meses sumirem do seletor.
   */
  private readonly notasDaBase = signal<NotaFiscal[]>([]);

  /**
   * A base do resumo do topo: a última página carregada **sem situação**, com o período, o tipo e a
   * busca que estão valendo. O resumo descreve o recorte e não pode mudar quando a pessoa escolhe
   * uma situação ("ver essas notas"); ver `recarregarNotas`.
   */
  private readonly baseDoResumo = signal<NotaFiscal[]>([]);
  /** Período, tipo e busca de que a `baseDoResumo` foi tirada. */
  private chaveDoResumo = '';
  /** O recorte cuja carga de resumo está em voo, para não pedir a mesma duas vezes. */
  private chaveDoResumoPedida = '';

  /**
   * O resumo do recorte que esta na tela, para o produtor.
   *
   * A tela abria com cinco controles e 15 cartoes iguais, e nunca respondia as duas perguntas
   * que alguem faz ao abrir "Minhas notas": **quanto eu faturei** e **o que ainda falta de
   * mim**. O faturamento estava espalhado por 15 cartoes para somar de cabeca, e a nota com
   * inconsistencia de junho ficava na terceira tela de rolagem, do mesmo tamanho das outras.
   *
   * Conta sobre a `baseDoResumo`: periodo, tipo e busca entram, situacao nao -- o resumo
   * descreve o recorte que a pessoa escolheu, e nao pode mudar quando ela clica em "ver essas
   * notas", que e um filtro de situacao.
   *
   * So nota **autorizada** entra no faturamento: rascunho nao foi emitido e nota com
   * inconsistencia nao vale documento fiscal. Somar as tres daria um numero que nao existe em
   * lugar nenhum.
   */
  readonly resumoDoPeriodo = computed(() => {
    const base = this.baseDoResumo();
    const autorizadas = base.filter((n) => n.status === 'AUTORIZADA');
    const comInconsistencia = base.filter((n) => this.podeVerValidacoes(n)).length;
    const rascunhos = base.filter((n) => n.status === 'RASCUNHO').length;
    const devolvidas = base.filter((n) => n.status === 'DEVOLVIDA').length;
    return {
      faturado: autorizadas.reduce((soma, n) => soma + (n.valorTotalNota ?? 0), 0),
      autorizadas: autorizadas.length,
      comInconsistencia,
      rascunhos,
      devolvidas,
      esperando: comInconsistencia + rascunhos + devolvidas,
    };
  });

  /**
   * "1 com inconsistência, 1 devolvida pelo escritório e 2 em rascunho": o que compõe o número de
   * "esperam por você", com "e" só antes do último (`Intl.ListFormat`). Com três tipos, o `@if`
   * por par do template não dava mais conta da conjunção.
   */
  readonly detalheDoQueEspera = computed(() => {
    const r = this.resumoDoPeriodo();
    const partes = [
      r.comInconsistencia ? `${r.comInconsistencia} com inconsistência` : '',
      r.devolvidas
        ? `${r.devolvidas} ${r.devolvidas === 1 ? 'devolvida' : 'devolvidas'} pelo escritório`
        : '',
      r.rascunhos ? `${r.rascunhos} em rascunho` : '',
    ].filter(Boolean);
    return LISTA_COM_E.format(partes);
  });

  /**
   * Notas agrupadas por mes de emissao.
   *
   * A lista atravessa setembro, agosto, julho, junho e maio sem nenhuma marca de
   * transicao -- doze cards seguidos em que so a data em texto pequeno diz que
   * mudou de mes. Agrupando, a pessoa se localiza sem ler data por data.
   *
   * So agrupa quando a ordenacao e por data: ordenado por valor, um cabecalho de
   * mes mentiria sobre a sequencia.
   */
  readonly notasPorMes = computed(() => {
    if (this.ordenacao() !== 'data') return [];

    const grupos = new Map<string, { rotulo: string; notas: NotaFiscal[] }>();
    for (const nota of this.notasFiltradas()) {
      const chave = (nota.dataEmissao ?? '').slice(0, 7); // YYYY-MM
      if (!grupos.has(chave)) {
        grupos.set(chave, { rotulo: this.rotuloDoMes(chave), notas: [] });
      }
      grupos.get(chave)!.notas.push(nota);
    }
    return [...grupos.entries()].map(([chave, g]) => ({ chave, ...g }));
  });

  /** `2026-09` vira "Setembro de 2026". Mes invalido devolve "Sem data". */
  private rotuloDoMes(periodo: string): string {
    const [ano, mes] = periodo.split('-');
    const data = new Date(Number(ano), Number(mes) - 1, 1);
    if (Number.isNaN(data.getTime())) return 'Sem data';
    const texto = data.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  }

  /**
   * O que o template percorre: grupos por mes quando ordenado por data, ou um
   * unico grupo sem rotulo quando ordenado por valor. Assim o template tem um
   * caminho so, em vez de dois blocos quase iguais.
   */
  readonly listaAgrupada = computed(() => {
    const porMes = this.notasPorMes();
    if (porMes.length) return porMes;
    return [{ chave: 'todas', rotulo: '', notas: this.notasFiltradas() }];
  });

  /**
   * Meses que o produtor fechou. Guarda o **fechado**, nao o aberto: assim um mes
   * novo que aparece na lista ja nasce aberto, sem ninguem precisar lembrar de
   * registra-lo em lugar nenhum.
   */
  private readonly mesesFechados = signal<ReadonlySet<string>>(new Set());

  /**
   * Com BUSCA ligada, tudo fica aberto -- quem digitou um nome nao pode ter o
   * resultado escondido atras de um mes fechado. O que ele fechou nao se perde:
   * `mesesFechados` continua intacto e volta a valer quando a busca sai.
   *
   * Antes isto valia para `temFiltroAtivo()` inteiro, e era demais: filtrar por
   * tipo ou situacao continua devolvendo uma lista longa, de varios meses, e
   * justamente ali o produtor perdia o recolher sem entender por que. Filtro de
   * periodo entao nem se discute -- ele ja reduziu a lista a um mes so.
   */
  mesAberto(chave: string): boolean {
    if (this.buscaAplicada()) return true;
    return !this.mesesFechados().has(chave);
  }

  alternarMes(chave: string): void {
    this.mesesFechados.update((atual) => {
      const proximo = new Set(atual);
      if (!proximo.delete(chave)) proximo.add(chave);
      return proximo;
    });
  }

  /** Quantos meses estao abertos agora -- decide o rotulo do botao global. */
  readonly todosOsMesesAbertos = computed(() =>
    this.notasPorMes().every((g) => !this.mesesFechados().has(g.chave)),
  );

  alternarTodosOsMeses(): void {
    if (this.todosOsMesesAbertos()) {
      this.mesesFechados.set(new Set(this.notasPorMes().map((g) => g.chave)));
    } else {
      this.mesesFechados.set(new Set());
    }
  }

  /** Soma do mes, para o cabecalho dizer algo util mesmo fechado. */
  totalDoGrupo(notas: readonly NotaFiscal[]): number {
    return notas.reduce((soma, n) => soma + (n.valorTotalNota ?? 0), 0);
  }

  /** Algum filtro esta ativo? Decide se vale oferecer "limpar". */
  /**
   * Os filtros recolhidos no celular.
   *
   * Sao quatro controles, e num telefone eles viram quatro linhas empilhadas -- umas 300px de
   * caixinha antes da primeira nota. Em tela larga nao ha problema: eles cabem lado a lado e
   * continuam sempre visiveis (`sm:contents` no envoltorio).
   */
  readonly filtrosAbertos = signal(false);

  /** Quantos filtros estao valendo agora -- vai no rotulo do botao, para o que esta escondido
   * nao ficar invisivel. */
  readonly quantosFiltros = computed(
    () =>
      (this.periodo() !== 'todos' ? 1 : 0) +
      (this.tipo() !== 'todos' ? 1 : 0) +
      (this.statusFilter() !== 'todos' ? 1 : 0),
  );

  readonly temFiltroAtivo = computed(
    () =>
      this.periodo() !== 'todos' ||
      this.tipo() !== 'todos' ||
      this.statusFilter() !== 'todos' ||
      this.buscaAplicada() !== '',
  );

  /**
   * Cada filtro troca o valor **e recarrega da primeira página**: todos são do servidor (#116), e
   * trocar só o signal deixaria a lista no recorte anterior.
   */
  trocarSituacao(valor: string): void {
    if (this.statusFilter() === valor) return;
    this.statusFilter.set(valor);
    this.recarregarDoInicio();
  }

  trocarPeriodo(valor: string): void {
    if (this.periodo() === valor) return;
    this.periodo.set(valor);
    this.recarregarDoInicio();
  }

  trocarTipo(valor: string): void {
    if (this.tipo() === valor) return;
    this.tipo.set(valor);
    this.recarregarDoInicio();
  }

  trocarOrdenacao(valor: 'data' | 'valor'): void {
    if (this.ordenacao() === valor) return;
    this.ordenacao.set(valor);
    this.recarregarDoInicio();
  }

  /**
   * A busca vai ao servidor **300 ms depois da última tecla** (#116), e só quando ele a usaria
   * (`buscaQueValeNoServidor`): "ab" não pede nada, porque o servidor ignoraria e devolveria tudo.
   */
  private readonly buscaDigitada = new Subject<void>();

  constructor() {
    // Le o CAMPO na hora de aplicar, e nao o termo que entrou no debounce: apagar (Esc, o x,
    // "Limpar filtros") antes dos 300 ms faria a emissao pendente trazer de volta a busca apagada.
    this.buscaDigitada
      .pipe(debounceTime(DEBOUNCE_BUSCA_MS), takeUntilDestroyed())
      .subscribe(() => this.aplicarBusca(this.busca()));
  }

  digitarBusca(valor: string): void {
    this.busca.set(valor);
    this.buscaDigitada.next();
  }

  /** Apagar a busca (o `x` e o `Esc`) vale na hora, sem esperar o debounce. */
  limparBusca(): void {
    this.busca.set('');
    this.aplicarBusca('');
  }

  private aplicarBusca(termo: string): void {
    const valendo = buscaQueValeNoServidor(termo);
    if (valendo === this.buscaAplicada()) return;
    this.buscaAplicada.set(valendo);
    this.recarregarDoInicio();
  }

  private recarregarDoInicio(): void {
    this.pageIndex.set(0);
    this.recarregarNotas();
  }

  limparFiltros(): void {
    const tinhaFiltro =
      this.periodo() !== 'todos' ||
      this.tipo() !== 'todos' ||
      this.statusFilter() !== 'todos' ||
      this.buscaAplicada() !== '';
    this.periodo.set('todos');
    this.tipo.set('todos');
    this.statusFilter.set('todos');
    this.busca.set('');
    this.buscaAplicada.set('');
    if (tinhaFiltro) this.recarregarDoInicio();
  }

  readonly pendenciasFiltradas = computed(() => {
    const busca = this.busca().toLowerCase();
    if (!busca) return this.pendencias();
    return this.pendencias().filter(
      (p) =>
        p.titulo.toLowerCase().includes(busca) || (p.descricao ?? '').toLowerCase().includes(busca),
    );
  });

  /** Quantos pedidos ainda dependem do produtor -- o numero que vale como chamado. */
  readonly pendenciasEsperandoVoce = computed(
    () => this.pendencias().filter((p) => p.status === 'PENDENTE').length,
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

  /**
   * Escolheu "outro código" e ainda não digitou os 6 dígitos que a API exige.
   *
   * Não entra no {@link itemValido}: ele é quem filtra os itens que vão no request, e um item
   * barrado ali sairia da nota em silêncio. Aqui o item fica, e quem não deixa salvar é o
   * {@link canSubmitNota}, com a frase do {@link itemErro} à vista.
   */
  classTribIncompleto(i: ItemForm): boolean {
    return i.cClassTribModo === CLASS_TRIB_OUTRO && !/^\d{6}$/.test(i.cClassTrib.trim());
  }

  /** Item ainda no estado inicial (usuário não digitou nada) — não mostrar erro ainda. */
  private itemIntocado(i: ItemForm): boolean {
    return (
      !i.descricao.trim() &&
      !i.ncm.trim() &&
      !i.cfop.trim() &&
      !i.quantidade.trim() &&
      !i.valorUnitario.trim()
    );
  }

  /**
   * Mensagem do primeiro campo inválido do item, ou null se válido/intocado.
   * Sem isto o botão "Criar nota" ficava desabilitado sem nenhuma pista visual
   * quando o NCM/CFOP não batiam o formato exigido — mesmo padrão de feedback
   * já usado no CPF/CNPJ e no CEP/IBGE do destinatário.
   */
  itemErro(i: ItemForm): string | null {
    // Antes do "intocado": quem escolheu a classificação tocou no item, mesmo sem digitar o resto.
    if (this.classTribIncompleto(i)) {
      return 'Classificação do IBS/CBS: informe os 6 dígitos do código ou escolha "pela regra do NCM".';
    }
    if (this.itemIntocado(i)) return null;
    if (!i.descricao.trim()) return 'Descrição é obrigatória.';
    if (!/^\d{8}$/.test(i.ncm.trim())) return 'NCM deve ter exatamente 8 dígitos numéricos.';
    if (!/^\d{4}$/.test(i.cfop.trim())) return 'CFOP deve ter exatamente 4 dígitos numéricos.';
    if (!i.unidade.trim()) return 'Unidade é obrigatória.';
    if (!(Number(i.quantidade) > 0)) return 'Quantidade deve ser maior que zero.';
    if (!(Number(i.valorUnitario) > 0)) return 'Valor unitário deve ser maior que zero.';
    return null;
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

  /**
   * O que falta preencher para habilitar "Criar nota", em ordem. Espelha exatamente as
   * condições de `canSubmitNota` — sem isto o botão ficava cinza sem nenhuma pista de
   * qual campo do topo do formulário (Número, Natureza, Data, destinatário) estava
   * faltando, já que `erroDe(...)` só mostra erro depois de uma tentativa de envio ao
   * servidor, e o botão desabilitado nunca deixa essa tentativa acontecer.
   */
  readonly camposPendentes = computed(() => {
    const faltando: string[] = [];
    if (!(Number(this.formNumero()) > 0)) faltando.push('Número');
    if (!this.formNatureza().trim()) faltando.push('Natureza da operação');
    if (!this.formData()) faltando.push('Data de emissão');
    if (!this.formDestNome().trim()) faltando.push('Nome do destinatário');
    if (!cpfCnpjValido(this.formDestCpfCnpj())) faltando.push('CPF/CNPJ do destinatário (válido)');
    if (!this.cepValido()) faltando.push('CEP do destinatário (8 dígitos)');
    if (!this.ibgeValido()) faltando.push('Código IBGE do destinatário (7 dígitos)');
    if (!this.formItens().some((i) => this.itemValido(i))) faltando.push('Ao menos um item válido');
    if (this.formItens().some((i) => this.classTribIncompleto(i))) {
      faltando.push('Classificação do IBS/CBS do item (6 dígitos)');
    }
    return faltando;
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
      this.formItens().some((i) => this.itemValido(i)) &&
      !this.formItens().some((i) => this.classTribIncompleto(i))
    );
  });

  ngOnInit(): void {
    this.carregarDados();
    this.abrirNotaDaUrl();
  }

  /**
   * Abre direto a nota pedida em `?nota=<id>`.
   *
   * O alerta do painel ("2 notas precisam da sua correcao") levava so para esta
   * lista, e quem chegava tinha que caçar a nota certa entre as 12 da pagina.
   * Agora o link carrega o id e a nota abre ja no modal, com as inconsistencias
   * do fisco na tela.
   *
   * Busca por `obter(id)` em vez de procurar na lista carregada: a nota pode
   * estar na pagina 2, e ai nao seria encontrada.
   */
  private abrirNotaDaUrl(): void {
    const id = this.route.snapshot.queryParamMap.get('nota');
    if (!id) return;

    this.notasApi.obter(id).subscribe({
      next: (nota) => this.abrirPreview(nota),
      error: () =>
        this.toastService.error('Não encontramos essa nota. Ela pode ter sido excluída.'),
    });
  }

  carregarDados(): void {
    this.recarregarNotas();
    this.carregarRevisao();
    // O produtor e o autenticado: a rota nao leva produtorId. Falha fica silenciosa de proposito
    // -- esta e uma secao lateral da tela de notas, e um toast de erro aqui roubaria a atencao do
    // que o produtor veio fazer.
    this.pendenciasApi.listar().subscribe({
      next: (d) => {
        this.pendencias.set(d);
        this.completarAnexosParados(d);
      },
      error: () => undefined,
    });
  }

  /**
   * Busca o detalhe de quem tem arquivo parado no antivirus.
   *
   * **A lista devolve `anexos: []`** -- so o `quantidadeAnexos`; os metadados (e com eles a
   * `situacao` de cada arquivo) vem no detalhe. Sem isto o aviso de "em verificacao" aparecia no
   * instante do upload e sumia ao recarregar a pagina: o produtor voltava, via "esperando voce"
   * com o arquivo ja enviado e nenhuma explicacao, e mandava de novo.
   *
   * So pede o detalhe de quem precisa: `PENDENTE` **com** anexo. Quem nao anexou nada nao tem o
   * que verificar, e quem ja esta `ENVIADA` passou pelo antivirus por definicao. Na pratica sao
   * zero ou um pedido.
   *
   * A falha de um detalhe e silenciosa de proposito: o pedido continua na lista com o que a
   * listagem deu. Perder o aviso e ruim; perder o pedido inteiro e pior.
   */
  private completarAnexosParados(pendencias: Pendencia[]): void {
    for (const p of pendencias) {
      if (p.status !== 'PENDENTE' || p.quantidadeAnexos === 0) continue;
      this.pendenciasApi.detalhar(p.id).subscribe({
        next: (completa) =>
          this.pendencias.update((lista) =>
            lista.map((atual) => (atual.id === completa.id ? completa : atual)),
          ),
        error: () => undefined,
      });
    }
  }

  /**
   * O que vai a `GET /api/notas` (#116): situação, período, tipo, busca e ordenação.
   *
   * "Esperando você" não é status do backend, é o que depende do produtor: inconsistência,
   * rejeitada e rascunho. Vai como `status` **repetido**, que o servidor lê como OU. Antes ela era
   * cortada em memória sobre a página, e não via nota fora dela.
   */
  private filtrosDoServidor(): Pageable {
    const situacao = this.statusFilter();
    const status =
      situacao === 'todos'
        ? undefined
        : situacao === 'esperando'
          ? ESPERANDO_O_PRODUTOR
          : [situacao];
    return {
      sort: this.ordenacao() === 'valor' ? 'valorTotal,desc' : 'dataEmissao,desc',
      status,
      tipoDocumento: this.tipo() === 'todos' ? undefined : this.tipo(),
      ...faixaDeEmissao(this.periodo()),
      busca: this.buscaAplicada() || undefined,
    };
  }

  /** Período, tipo e busca: o recorte que o resumo descreve. */
  private recorteDoResumo(): string {
    return [this.periodo(), this.tipo(), this.buscaAplicada()].join('|');
  }

  /** Cada carga ganha uma vez; resposta de uma vez antiga chega tarde e é descartada. */
  private vez = 0;

  /**
   * Recarrega as notas do produtor a partir do backend real (`GET /api/notas`).
   * Em falha (ex.: backend offline) exibe o banner de erro com "Tentar novamente"
   * (`notasErro`), sem dados mockados.
   *
   * Filtro trocado depressa (duas teclas da busca, dois meses seguidos) dispara duas cargas, e a
   * primeira pode responder por último. Sem a `vez`, a lista mostraria o recorte anterior debaixo
   * do filtro novo.
   */
  recarregarNotas(): void {
    const vez = ++this.vez;
    const filtros = this.filtrosDoServidor();
    const recorte = this.recorteDoResumo();
    const semSituacao = filtros.status === undefined;
    const semFiltro = semSituacao && !filtros.tipoDocumento && !filtros.emitidaDe && !filtros.busca;
    const primeiraPagina = this.pageIndex() === 0;

    this.loading.set(true);
    this.notasErro.set(false);
    this.notasApi.listar({ ...filtros, page: this.pageIndex(), size: this.pageSize() }).subscribe({
      next: (page) => {
        if (vez !== this.vez) return;
        this.notas.set(page.content);
        this.carregarMotivosDeDevolucao(page.content);
        this.totalElements.set(page.totalElements);
        if (semFiltro && primeiraPagina) this.notasDaBase.set(page.content);
        if (semSituacao && primeiraPagina) {
          this.baseDoResumo.set(page.content);
          this.chaveDoResumo = recorte;
        }
        this.notasErro.set(false);
        this.loading.set(false);
      },
      error: () => {
        if (vez !== this.vez) return;
        this.notas.set([]);
        this.totalElements.set(0);
        this.notasErro.set(true);
        this.loading.set(false);
      },
    });

    // Com uma situação escolhida, a lista não serve de base para o resumo. Se o recorte mudou
    // desde a última base, o resumo precisa da sua própria carga, sem a situação.
    if (!semSituacao && recorte !== this.chaveDoResumo && recorte !== this.chaveDoResumoPedida) {
      this.recarregarResumo(recorte);
    }
  }

  private recarregarResumo(recorte: string): void {
    this.chaveDoResumoPedida = recorte;
    const semSituacao = { ...this.filtrosDoServidor(), status: undefined };
    this.notasApi.listar({ ...semSituacao, page: 0, size: this.pageSize() }).subscribe({
      next: (page) => {
        if (this.chaveDoResumoPedida === recorte) this.chaveDoResumoPedida = '';
        if (recorte !== this.recorteDoResumo()) return;
        this.baseDoResumo.set(page.content);
        this.chaveDoResumo = recorte;
      },
      // Sem a base nova, o resumo fica com a anterior: errar o recorte por um momento é melhor
      // que zerar o faturamento do produtor na tela. A próxima carga tenta de novo.
      error: () => {
        if (this.chaveDoResumoPedida === recorte) this.chaveDoResumoPedida = '';
      },
    });
  }

  /** Total de páginas (server-side, a partir de totalElements/pageSize). */
  readonly totalPaginas = computed(() =>
    Math.max(1, Math.ceil(this.totalElements() / this.pageSize())),
  );

  /** Vai para uma página (0-based) e recarrega do backend (Pageable). */
  irParaPagina(idx: number): void {
    const alvo = Math.min(Math.max(0, idx), this.totalPaginas() - 1);
    if (alvo === this.pageIndex()) return;
    this.pageIndex.set(alvo);
    this.recarregarNotas();
  }

  /**
   * Mudança local numa nota (cancelada, enviada, excluída) vale para a lista **e** para as bases do
   * resumo e das opções de período. Antes da #116 o resumo saía da própria lista; sem isto, cancelar
   * uma nota deixaria o faturamento contando com ela.
   */
  private mudarNasListas(mudar: (lista: NotaFiscal[]) => NotaFiscal[]): void {
    this.notas.update(mudar);
    this.baseDoResumo.update(mudar);
    this.notasDaBase.update(mudar);
  }

  /**
   * Recarrega depois de algo que muda notas (salvar, importar, a recusa do validador): o resumo
   * também precisa de base nova, mesmo com o recorte igual.
   */
  private recarregarAposMudanca(): void {
    this.chaveDoResumo = '';
    this.recarregarNotas();
  }

  /** Substitui a nota na listagem e no preview após uma atualização do backend. */
  private atualizarNotaLocal(nota: NotaFiscal): void {
    this.mudarNasListas((list) => list.map((n) => (n.id === nota.id ? nota : n)));
    if (this.previewNota()?.id === nota.id) this.previewNota.set(nota);
  }

  // ── Revisão do contador (backend#178) ──

  /**
   * O produtor tem escritório vinculado.
   *
   * É o que decide se o botão é "Gerar XML" ou "Enviar para revisão" — e não é preferência de
   * tela: com escritório ativo, `gerar-xml` num rascunho responde **409 `APROVACAO_EXIGIDA`**
   * (medido em 28/10). Sem escritório, `enviar-para-revisao` é que responde 409. Ou seja, os dois
   * fluxos existem e só um vale para cada produtor.
   */
  readonly temContador = signal(false);

  /** Motivo da última devolução, por nota, buscado do histórico de revisão. */
  private readonly motivosDeDevolucao = signal<Record<string, string>>({});
  readonly enviandoRevisao = signal<string | null>(null);

  /** O texto que o contador escreveu ao devolver esta nota, se já chegou. */
  motivoDaDevolucao(notaId: string): string | undefined {
    return this.motivosDeDevolucao()[notaId];
  }

  /**
   * A nota vai para a mesa do contador.
   *
   * Vale para o que ainda é do produtor: rascunho, nota com inconsistência e nota devolvida — os
   * mesmos estados que `editavel()` permite mexer.
   */
  podeEnviarParaRevisao(nota?: NotaFiscal | null): boolean {
    return this.temContador() && editavel(nota?.status);
  }

  /** A nota está na mesa do contador e o produtor pode trazê-la de volta. */
  podeRetirarDaRevisao(nota?: NotaFiscal | null): boolean {
    return esperaOEscritorio(nota?.status);
  }

  /** Manda a nota para a revisão do escritório. */
  enviarParaRevisao(nota: NotaFiscal): void {
    this.enviandoRevisao.set(nota.id);
    this.notasApi.enviarParaRevisao(nota.id).subscribe({
      next: (atualizada) => {
        this.enviandoRevisao.set(null);
        this.trocarNota(atualizada);
        this.toastService.success('Nota enviada para o seu contador.');
      },
      error: (erro: HttpErrorResponse) => {
        this.enviandoRevisao.set(null);
        // 422: a validação fiscal reprovou antes de mudar o status, e a nota foi para
        // COM_INCONSISTENCIAS. O produtor precisa saber que ela voltou, não que "deu erro".
        this.toastService.error(
          erro.status === 422
            ? 'O validador fiscal recusou a nota. Abra as inconsistências e corrija antes de enviar.'
            : 'Não foi possível enviar a nota para o contador.',
        );
        if (erro.status === 422) this.recarregarAposMudanca();
      },
    });
  }

  /** Traz a nota de volta da mesa do contador, para rascunho. */
  retirarDaRevisao(nota: NotaFiscal): void {
    this.enviandoRevisao.set(nota.id);
    this.notasApi.retirarDaRevisao(nota.id).subscribe({
      next: (atualizada) => {
        this.enviandoRevisao.set(null);
        this.trocarNota(atualizada);
      },
      error: () => {
        this.enviandoRevisao.set(null);
        this.toastService.error('Não foi possível retirar a nota da revisão.');
      },
    });
  }

  /** Substitui a nota na lista e no painel aberto, se for a mesma. */
  private trocarNota(atualizada: NotaFiscal): void {
    this.mudarNasListas((lista) => lista.map((n) => (n.id === atualizada.id ? atualizada : n)));
    if (this.previewNota()?.id === atualizada.id) this.previewNota.set(atualizada);
  }

  /**
   * Busca se há escritório vinculado e, para cada nota devolvida, o motivo.
   *
   * O motivo não vem na nota: ele mora no histórico de revisão (`/notas/{id}/revisoes`). Sem
   * buscá-lo, a nota apareceria como "Devolvida para corrigir" **sem dizer o que corrigir**, que
   * é a única informação que importa nesse estado.
   */
  private carregarRevisao(): void {
    this.vinculosApi.listar().subscribe({
      next: (vinculos) => this.temContador.set(vinculos.some((v) => v.situacao === 'ATIVO')),
      error: () => this.temContador.set(false),
    });
  }

  /** Para cada nota devolvida, busca o motivo da última devolução. */
  private carregarMotivosDeDevolucao(notas: NotaFiscal[]): void {
    for (const nota of notas) {
      if (String(nota.status) !== 'DEVOLVIDA' || this.motivosDeDevolucao()[nota.id]) continue;
      this.notasApi.revisoes(nota.id).subscribe({
        next: (historico) => {
          const devolucao = historico.find((r) => r.acao === 'DEVOLVIDA' && r.motivo);
          if (devolucao?.motivo) {
            this.motivosDeDevolucao.update((atuais) => ({
              ...atuais,
              [nota.id]: devolucao.motivo as string,
            }));
          }
        },
        error: () => undefined,
      });
    }
  }

  // ─────────────── Visibilidade de ações por status (#14) ───────────────
  /**
   * O XML pode ser gerado.
   *
   * **Com escritório vinculado, só depois da aprovação** (backend#178): o servidor responde 409
   * `APROVACAO_EXIGIDA` para um rascunho, então oferecer "Gerar XML" ali seria oferecer um erro.
   * Sem escritório, o fluxo antigo segue valendo.
   */
  podeGerarXml(nota?: NotaFiscal | null): boolean {
    if (String(nota?.status) === 'APROVADA') return true;
    if (this.temContador()) return false;
    return nota?.status === 'RASCUNHO' || nota?.status === 'COM_INCONSISTENCIAS';
  }
  /**
   * XML/DANFE disponiveis apos a geracao do XML (409 antes dela).
   *
   * Isto era `!this.podeGerarXml(nota)` -- a negacao de uma checagem de **permissao**, nao de
   * **estado** (#101). Quando a aprovacao do contador entrou no `podeGerarXml` (#178), ele passou
   * a devolver `false` para todo produtor com escritorio, e a negacao virou `true` num rascunho:
   * a nota exibia "XML" e "DANFE" de arquivos inexistentes. Agora a pergunta vai ao status, que e
   * quem sabe a resposta.
   */
  temArquivos(nota?: NotaFiscal | null): boolean {
    return !!nota && temArquivosFiscais(nota.status);
  }

  /**
   * A previa simplificada e o que da para baixar **enquanto o documento fiscal nao existe** (#101).
   *
   * Ela e gerada aqui no navegador, a partir da nota que ja esta na tela: nao depende de XML, de
   * SEFAZ nem de aprovacao. Mesmo assim vivia dentro do bloco do "Gerar XML", escondida justamente
   * nas notas em que e a unica coisa baixavel. Onde o DANFE oficial existe, ele manda -- ninguem
   * quer o rascunho tendo o documento com valor fiscal.
   */
  podeBaixarPrevia(nota?: NotaFiscal | null): boolean {
    return !!nota && !this.temArquivos(nota);
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
  /**
   * Só a nota própria autorizada se cancela. A compra importada é do fornecedor que a emitiu: o
   * backend responde 409 `CANCELAMENTO_COMPRA_IMPORTADA` (backend#418), e o botão nem aparece.
   */
  podeCancelar(nota?: NotaFiscal | null): boolean {
    return nota?.status === 'AUTORIZADA' && !ehCompraImportada(nota);
  }

  protected readonly ehCompraImportada = ehCompraImportada;
  protected readonly contraparteDaNota = contraparteDaNota;
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
  /** Nome do campo em portugues, para o bloco de pendencia do modal. */
  rotuloDoCampo = rotuloDoCampo;

  /**
   * A pendencia da nota e corrigivel editando a propria nota?
   *
   * Quando o campo e `produtor.*` (inscricao estadual, endereco), o problema
   * esta no cadastro do produtor, que o app ainda nao permite editar -- a tela
   * de Configuracoes so finge salvar. Oferecer "Corrigir" ali levaria a um beco.
   */
  readonly pendenciaCorrigivelNaNota = computed(() => {
    const vs = this.validacoes();
    return vs.length > 0 && vs.some((v) => !ehCampoDoProdutor(v.field));
  });

  /** Ha pendencia de cadastro do produtor, que nao se resolve pela nota. */
  readonly pendenciaNoCadastro = computed(() =>
    this.validacoes().some((v) => ehCampoDoProdutor(v.field)),
  );

  verValidacoes(nota: NotaFiscal): void {
    this.carregandoValidacoes.set(true);
    this.notasApi.listarValidacoes(nota.id).subscribe({
      next: (v) => {
        // Só a checagem mais recente: o endpoint devolve o historico inteiro e a
        // nota 7 repetia a mesma frase duas vezes (ver @core/utils/validacoes).
        this.validacoes.set(apenasUltimaChecagem(v));
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
      next: (resposta) => {
        this.cancelando.set(false);
        this.cancelarAlvo.set(null);
        this.cancelamento.set({ ...resposta, notaId: nota.id });
        this.atualizarNotaLocal({ ...nota, status: 'CANCELADA' });
        this.toastService.success(
          resposta?.protocoloCancelamento
            ? `Nota cancelada junto à SEFAZ. Protocolo ${resposta.protocoloCancelamento}.`
            : 'Nota cancelada junto à SEFAZ.',
        );
      },
      error: (err: HttpErrorResponse) => {
        this.cancelando.set(false);
        const env = err?.error as ApiErrorEnvelope | undefined;
        // Rede de segurança (backend#418): o botão não aparece na compra, mas uma nota que virou
        // importada depois de a tela carregar ainda pode chegar aqui.
        if (env?.errors?.[0]?.code === 'CANCELAMENTO_COMPRA_IMPORTADA') {
          this.cancelarAlvo.set(null);
          this.toastService.error(
            'Esta nota é uma compra: quem cancela é o fornecedor que a emitiu.',
          );
          return;
        }
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
        if (r.status === 'AUTORIZADA')
          this.toastService.success(`Autorizada pela SEFAZ (cStat ${r.cStat}).`);
        else if (r.status === 'REJEITADA')
          this.toastService.error(`Rejeitada (cStat ${r.cStat}): ${r.xMotivo}`);
        else this.toastService.info(`Pendente na SEFAZ: ${r.xMotivo}`);
      },
      error: (err: HttpErrorResponse) => {
        this.enviandoSefaz.set(false);
        const env = err?.error as ApiErrorEnvelope | undefined;
        if (err?.status === 502) {
          this.toastService.error(
            'SEFAZ indisponível após as tentativas. Tente novamente em instantes.',
          );
        } else if (env?.errors?.[0]?.code === 'XML_REGRA_FISCAL_DESATUALIZADA') {
          // backend#389: o XML foi gerado por uma regra fiscal anterior. Nada foi transmitido e a
          // nota voltou a COM_INCONSISTENCIAS (perdendo a aprovação, se tinha). O texto é da tela:
          // a `message` traz o id da nota e a `suggestion` cita a rota da API.
          this.toastService.warning(
            'Nada foi enviado: a regra fiscal mudou depois que o XML foi gerado. A nota voltou ' +
              'para correção; confira e gere o XML de novo. Se o escritório já tinha aprovado, ' +
              'ela passa pela revisão outra vez.',
          );
          this.recarregarNotaDoServidor(nota);
        } else if (err?.status === 409) {
          this.toastService.error(env?.message ?? 'Envio inválido para o status atual.');
        } else {
          this.toastService.error(env?.message ?? 'Falha ao enviar à SEFAZ.');
        }
      },
    });
  }

  /**
   * Busca a nota de novo e troca nas listas e no modal. Sem isto, depois do 409 de regra fiscal
   * a tela seguia com a nota em `XML_GERADO` e o botão de enviar, que falharia de novo.
   */
  private recarregarNotaDoServidor(nota: NotaFiscal): void {
    this.notasApi.obter(nota.id).subscribe({
      next: (atual) => {
        this.atualizarNotaLocal(atual);
        if (this.previewNota()?.id === atual.id && this.podeVerValidacoes(atual)) {
          this.verValidacoes(atual);
        }
        // Voltou a COM_INCONSISTENCIAS: entra na fila de "Ajustar", como depois de salvar.
        this.carregarFilaDeAjustes();
      },
      // Sem a nota nova, ao menos a lista vem do servidor.
      error: () => this.recarregarAposMudanca(),
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
        this.toastService.success(
          `Status sincronizado: ${statusNotaLabel(r.status)} (cStat ${r.cStat}).`,
        );
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
          await mensagemDeErroDeDownload(err, 'DANFE indisponível (gere o XML primeiro).'),
        );
      },
    });
  }

  // ─────────────────────────── Formulário de nota ───────────────────────────

  /**
   * A nota pode ser editada ou excluída (backend: 409 fora disso).
   *
   * A regra mora em `editavel()`, no enum, porque a #178 acrescentou dois casos que é fácil
   * esquecer: `AGUARDANDO_APROVACAO` e `APROVADA` **não** são editáveis — mexer numa nota que
   * está com o contador, ou que ele já aprovou, invalidaria a aprovação. `DEVOLVIDA` é editável.
   */
  podeEditar(nota?: NotaFiscal | null): boolean {
    return editavel(nota?.status);
  }

  private resetForm(): void {
    this.sugestaoNumero?.unsubscribe();
    this.numeroDigitado = false;
    this.formNotaId.set(null);
    this.formNumero.set('');
    this.formSerie.set('1');
    this.formTipoDoc.set('NFE');
    this.formNatureza.set('');
    // Nota nova nasce datada de hoje (#115): e a data da esmagadora maioria das emissoes, e
    // deixa-la vazia cobrava uma digitacao por nota. Quem emite com outra data so troca.
    this.formData.set(hojeEmBrasilia());
    this.formDestNome.set('');
    this.destDocumento.reiniciar();
    this.formDestIe.set('');
    this.formEndLogradouro.set('');
    this.formEndNumero.set('');
    this.formEndMunicipio.set('');
    this.formEndIbge.set('');
    this.formEndUf.set('');
    this.formEndCep.set('');
    this.formItens.set([emptyItem()]);
    this.erroNota.set([]);
    this.esquecerAvisos();
  }

  /**
   * Aba ativa do modal de nova nota: preencher o formulario ou subir o XML.
   *
   * As duas coisas eram dois botoes flutuantes concorrendo no canto da tela, e
   * o "carregar" nem estava neles -- vivia numa area de arrastar solta no meio
   * da pagina. Agora sao dois caminhos para a mesma intencao ("colocar uma nota
   * aqui dentro"), atras de um botao so.
   */
  readonly abaNota = signal<'criar' | 'carregar' | 'ajustar'>('criar');

  /**
   * Fila de notas que o fisco travou, para a aba "Precisam de ajuste".
   *
   * Vem de uma busca propria e nao de `notas()`: a lista da pagina e paginada
   * em 12, e uma nota travada pode estar na pagina 2 -- some justamente da fila
   * de quem precisa resolver.
   */
  readonly notasParaAjustar = signal<NotaFiscal[]>([]);

  /**
   * Quem entrou numa nota vindo da fila volta para ela ao sair, em vez de o
   * modal fechar. E o que permite corrigir uma atras da outra sem reabrir tudo
   * a cada nota.
   */
  private readonly veioDaFila = signal(false);

  abrirNovaNota(aba: 'criar' | 'carregar' | 'ajustar' = 'criar'): void {
    this.abaNota.set(aba);
    this.veioDaFila.set(false);
    this.abrirFormNota();
    this.carregarFilaDeAjustes();
  }

  /** Abre o modal ja na fila — usado ao sair de uma nota que veio de la. */
  abrirFilaDeAjustes(): void {
    this.formNotaId.set(null);
    this.abaNota.set('ajustar');
    this.showFormNota.set(true);
    this.carregarFilaDeAjustes();
  }

  carregarFilaDeAjustes(): void {
    this.notasApi.listar({ size: 100, sort: 'dataEmissao,desc' }).subscribe({
      next: (pagina) =>
        this.notasParaAjustar.set(
          pagina.content.filter(
            (n) => n.status === 'COM_INCONSISTENCIAS' || n.status === 'REJEITADA',
          ),
        ),
      error: () => this.notasParaAjustar.set([]),
    });
  }

  /** Corrige uma nota escolhida na fila; ao sair, volta para a fila. */
  corrigirDaFila(nota: NotaFiscal): void {
    this.editarNota(nota);
    this.veioDaFila.set(true);
  }

  private abrirFormNota(): void {
    this.resetForm();
    this.showFormNota.set(true);
    this.sugerirProximoNumero();
  }

  /** A pessoa digitou no número (#195): daí em diante a sugestão não toca mais no campo. */
  digitarNumero(valor: string): void {
    this.numeroDigitado = true;
    this.sugestaoNumero?.unsubscribe();
    this.formNumero.set(valor);
  }

  /**
   * Trocar a série pede a sugestão de novo (#195): a sequência é por série. Só enquanto o
   * número ainda for o sugerido — o que a pessoa escreveu fica.
   */
  digitarSerie(valor: string): void {
    this.formSerie.set(valor);
    if (this.formNotaId() !== null || this.numeroDigitado) return;
    this.formNumero.set('');
    this.sugerirProximoNumero();
  }

  /**
   * Sugere o próximo número de nota pelo `GET /notas/proximo-numero` da série do formulário
   * (#195). Antes vinha do maior número de **todas** as notas, compras importadas inclusive: no
   * seed da banca o Carlos vende a partir de 3184 e as compras passam de 40.000, e a tela sugeria
   * a ele um número de fornecedor.
   *
   * A resposta chega depois de o modal abrir, então ela só preenche o campo se ninguém digitou
   * nada nele nesse meio-tempo: a versão anterior sobrescrevia o número digitado. Falha ou série
   * inválida deixam o campo vazio. O campo segue editável; o 409 do `POST` cobre o número repetido.
   */
  private sugerirProximoNumero(): void {
    this.sugestaoNumero?.unsubscribe();
    const serie = Number(this.formSerie());
    if (!Number.isInteger(serie) || serie < 0 || serie > 999 || this.formSerie().trim() === '') {
      return;
    }
    this.sugestaoNumero = this.notasApi.proximoNumero(serie).subscribe({
      next: (sugestao) => {
        // O form mudou para edição, ou a pessoa digitou, enquanto a chamada corria.
        if (this.formNotaId() !== null || this.numeroDigitado) return;
        if (sugestao.serie !== serie) return;
        this.formNumero.set(String(sugestao.numero));
      },
      error: () => undefined, // sem sugestão automática — usuário preenche manualmente
    });
  }

  /** Abre o formulário pré-preenchido para editar uma nota em RASCUNHO/COM_INCONSISTENCIAS. */
  editarNota(nota: NotaFiscal): void {
    this.resetForm();
    // Editar nao tem aba: volta ao formulario para o estado nao ficar preso em
    // "carregar" se a pessoa passou por la antes.
    this.abaNota.set('criar');
    this.formNotaId.set(nota.id);
    this.formNumero.set(String(nota.numero ?? ''));
    this.formSerie.set(String(nota.serie ?? 1));
    this.formTipoDoc.set(nota.tipoDocumento ?? 'NFE');
    this.formNatureza.set(nota.naturezaOperacao ?? '');
    this.formData.set(nota.dataEmissao?.split('T')[0] ?? '');
    this.formDestNome.set(nota.destinatarioNome ?? '');
    // Mascarado tambem ao ABRIR a nota para editar (#102). A API guarda e devolve so os digitos,
    // entao sem isto o CPF de uma nota existente aparecia cru enquanto um digitado na hora
    // aparecia pontuado -- o mesmo campo com duas caras, dependendo de como se chegou nele.
    this.destDocumento.reiniciar(mascaraCpfCnpj(nota.destinatarioCpfCnpj ?? ''));
    // Nota que já existe não está "sendo digitada": um documento errado nela aparece na hora.
    this.destDocumento.sair();
    this.formDestIe.set(nota.destinatarioIe ?? '');
    const e = nota.destinatarioEndereco;
    this.formEndLogradouro.set(e?.logradouro ?? '');
    this.formEndNumero.set(e?.numero ?? '');
    this.formEndMunicipio.set(e?.municipio ?? '');
    this.formEndIbge.set(e?.codigoMunicipioIbge ?? '');
    this.formEndUf.set(e?.uf ?? '');
    this.formEndCep.set(mascaraCep(e?.cep ?? ''));
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
        // O que a tela mostra (o cClassTrib) e o que ela não mostra (o ICMS) voltam no `PUT`.
        cClassTrib: it.cClassTrib ?? '',
        cClassTribModo: modoDoClassTrib(it.cClassTrib ?? ''),
        cstIcms: it.cstIcms ?? '',
        origemIcms: it.origemIcms ?? '',
      })),
    );
    if (!this.formItens().length) this.formItens.set([emptyItem()]);
    this.previewNota.set(null);
    this.showFormNota.set(true);
  }

  fecharForm(): void {
    // Veio da fila? Volta para ela, com a proxima nota a um clique.
    if (this.veioDaFila()) {
      this.veioDaFila.set(false);
      this.abrirFilaDeAjustes();
      return;
    }
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
    // De qual posicao do formulario saiu cada item enviado: o request renumera de 1 em diante
    // depois de descartar os invalidos, e e por esse numero que os avisos do servidor voltam.
    this.posicaoDosItensEnviados = this.formItens()
      .map((item, idx) => (this.itemValido(item) ? idx : -1))
      .filter((idx) => idx >= 0);
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
        cClassTrib: item.cClassTrib.trim() || undefined,
        // Reenviados como vieram: o `PUT` substitui os itens, e o que não for enviado se perde.
        cstIcms: item.cstIcms.trim() || undefined,
        origemIcms: item.origemIcms.trim() || undefined,
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
    this.esquecerAvisos();
    const req = this.buildNotaRequest();
    const id = this.formNotaId();
    const req$ = id ? this.notasApi.atualizar(id, req) : this.notasApi.criar(req);
    req$.subscribe({
      next: (salva) => {
        this.salvando.set(false);
        this.toastService.success(id ? 'Nota atualizada!' : 'Nota criada em rascunho!');
        // backend#389: a nota foi salva, mas algo merece atenção (ex.: cClassTrib não admitido
        // para o NCM, ou o 200020 da cooperativa). É aviso, não erro: nada foi recusado.
        const avisos = salva?.avisos ?? [];
        for (const aviso of avisos) {
          this.toastService.warning(DocumentosPage.textoDoAviso(aviso));
        }
        this.avisosDaNota.set(avisos);
        if (avisos.length) {
          // O formulario fica aberto com o aviso ao lado do item: o toast some, e o do 200020
          // pede uma providencia fora do sistema. Como a nota ja esta gravada, o formulario
          // passa a editar ESTA nota -- salvar de novo nao pode criar uma segunda.
          if (salva?.id) this.formNotaId.set(salva.id);
        } else {
          this.fecharForm();
        }
        this.recarregarAposMudanca();
        // A nota corrigida sai da fila (ou continua, se o fisco ainda reclamar).
        this.carregarFilaDeAjustes();
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

  /**
   * Avisos da última gravação (backend#389), para ficarem à vista no item — o toast passa, e o
   * `COOPERATIVA_OPTANTE_A_CONFIRMAR` pede uma providência fora do sistema: guardar a
   * comunicação da cooperativa (#208).
   */
  readonly avisosDaNota = signal<AvisoNota[]>([]);
  private posicaoDosItensEnviados: number[] = [];

  /** Os avisos que o servidor devolveu para este item do formulário. */
  avisosDoItem(idx: number): AvisoNota[] {
    const numeroItem = this.posicaoDosItensEnviados.indexOf(idx) + 1;
    if (numeroItem === 0) return [];
    return this.avisosDaNota().filter((a) => a.numeroItem === numeroItem);
  }

  /** "Item 2: ..." — o aviso com o item, quando o servidor diz qual. */
  private static textoDoAviso(aviso: AvisoNota): string {
    return aviso.numeroItem ? `Item ${aviso.numeroItem}: ${aviso.mensagem}` : aviso.mensagem;
  }

  /** Primeiro erro do backend cujo `field` casa (exato ou por prefixo) com o campo dado. */
  erroDe(campo: string): FiscalError | undefined {
    return this.erroNota().find((e) => e.field === campo || e.field?.startsWith(campo + '.'));
  }

  // Itens do formulário
  addItem(): void {
    this.formItens.update((list) => [...list, emptyItem()]);
    this.esquecerAvisos();
  }
  removeItem(idx: number): void {
    this.formItens.update((list) => list.filter((_, i) => i !== idx));
    this.esquecerAvisos();
  }

  /**
   * Larga os avisos da última gravação. Eles chegam por **número de item**, e a lista de itens
   * acabou de mudar: mantê-los apontaria o aviso de um item para o que subiu no lugar dele.
   */
  private esquecerAvisos(): void {
    this.avisosDaNota.set([]);
    this.posicaoDosItensEnviados = [];
  }
  /**
   * Marca a classificação do IBS/CBS do item. `OUTRO` abre o campo de digitar e começa vazio: o
   * código anterior era de outra escolha, e deixá-lo ali o mandaria sem ninguém ter digitado.
   */
  escolherClassTrib(idx: number, modo: string): void {
    this.formItens.update((list) =>
      list.map((item, i) =>
        i === idx
          ? {
              ...item,
              cClassTribModo: modo,
              cClassTrib: modo === CLASS_TRIB_OUTRO ? '' : modo,
            }
          : item,
      ),
    );
  }

  protected readonly classTribOutro = CLASS_TRIB_OUTRO;

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
        this.mudarNasListas((list) => list.filter((n) => n.id !== nota.id));
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

  // === Anexar na pendencia ===

  /**
   * Envia um arquivo para o pedido do escritorio.
   *
   * **Nao validamos o formato aqui, so o tamanho.** O servidor confere o tipo pelos *bytes*, nao
   * pela extensao -- um `.pdf` que nao e PDF tem de ser recusado por ele, e repetir essa regra no
   * cliente so criaria duas verdades. O teto de 5 MB, esse sim, vale conferir antes: evita gastar
   * o upload inteiro (que pode ser o 4G da fazenda) para receber 400 no fim.
   */
  anexarNaPendencia(pendencia: Pendencia, evento: Event): void {
    const input = evento.target as HTMLInputElement;
    const arquivo = input.files?.[0];
    // Zera o input para o mesmo arquivo poder ser escolhido de novo depois de um erro.
    input.value = '';
    if (!arquivo) return;

    if (arquivo.size > TAMANHO_MAXIMO_ANEXO) {
      this.toastService.error(
        'O arquivo passa de 5 MB. Mande uma foto menor ou um PDF comprimido.',
      );
      return;
    }
    if (pendencia.quantidadeAnexos >= MAXIMO_ANEXOS) {
      this.toastService.error(`Este pedido ja tem ${MAXIMO_ANEXOS} arquivos, que e o limite.`);
      return;
    }

    this.anexandoEm.set(pendencia.id);
    this.pendenciasApi.anexar(pendencia.id, arquivo).subscribe({
      next: (atualizada) => {
        this.anexandoEm.set(null);
        this.pendencias.update((lista) =>
          lista.map((p) => (p.id === atualizada.id ? atualizada : p)),
        );
        // A mensagem depende do antivirus, nao do upload: com ele fora do ar o arquivo sobe (201)
        // e a pendencia **continua** PENDENTE. Dizer "enviado ao escritorio" ali seria mentira, e
        // o produtor anexaria de novo achando que falhou.
        this.toastService.success(
          temAnexoEmVerificacao(atualizada)
            ? 'Arquivo recebido. Ele chega ao escritorio quando a verificacao de seguranca terminar.'
            : 'Arquivo enviado ao escritorio.',
        );
      },
      error: (erro: HttpErrorResponse) => {
        this.anexandoEm.set(null);
        this.toastService.error(this.mensagemDoAnexo(erro));
      },
    });
  }

  /**
   * Traduz a recusa do servidor em algo acionavel.
   *
   * Os quatro codigos do contrato pedem acoes **diferentes** do produtor; jogar todos num "erro ao
   * anexar" obrigaria ele a adivinhar qual e o caso.
   */
  private mensagemDoAnexo(erro: HttpErrorResponse): string {
    const codigo = (erro.error as ApiErrorEnvelope | null)?.errors?.[0]?.code;
    switch (codigo) {
      case 'ANEXO_INVALIDO':
        return 'Arquivo recusado: aceita PDF, JPG, PNG ou XML ate 5 MB, e o tipo e conferido pelo conteudo, nao pelo nome.';
      case 'ANEXO_INFECTADO':
        return 'O antivirus recusou este arquivo por seguranca. Nada foi salvo.';
      case 'LIMITE_ANEXOS':
        return `Este pedido ja tem ${MAXIMO_ANEXOS} arquivos, que e o limite.`;
      case 'TRANSICAO_PENDENCIA_INVALIDA':
        return 'Este pedido nao esta mais aceitando arquivos. Recarregue para ver a situacao dele.';
      default:
        return 'Nao foi possivel enviar o arquivo. Tente de novo.';
    }
  }

  /** Rotulo do status, na voz de quem le: o produtor. */
  pendenciaStatusLabel(status: Pendencia['status']): string {
    return STATUS_PENDENCIA_LABEL[status];
  }

  /** Cor do status sobre os tokens semanticos -- claro e escuro saem juntos. */
  pendenciaStatusColor(status: Pendencia['status']): string {
    const map: Record<Pendencia['status'], string> = {
      PENDENTE: 'bg-aviso-soft text-aviso-ink',
      ENVIADA: 'bg-info-soft text-info-ink',
      CONCLUIDA: 'bg-sucesso-soft text-sucesso-ink',
      CANCELADA: 'bg-surface-2 text-muted-foreground',
    };
    return map[status];
  }

  /** "nota fiscal ou comprovante de pagamento" -- o que este pedido aceita. */
  tiposAceitos(pendencia: Pendencia): string {
    const nomes = pendencia.tiposDocumento.map((t) => TIPO_DOCUMENTO_LABEL[t]);
    if (nomes.length <= 1) return nomes[0] ?? 'qualquer documento';
    return `${nomes.slice(0, -1).join(', ')} ou ${nomes[nomes.length - 1]}`;
  }

  /** Ha arquivo preso no antivirus neste pedido. */
  emVerificacao(pendencia: Pendencia): boolean {
    return temAnexoEmVerificacao(pendencia);
  }

  /**
   * Abre a gaveta do assistente com esta nota do lado. Se a nota tem pendência,
   * a gaveta busca `/notas/{id}/validações` e mostra o que o fisco apontou —
   * o caminho curto entre "essa nota não sai" e entender por quê.
   */
  perguntarSobre(nota: NotaFiscal): void {
    this.assistente.abrirSobreNota(nota);
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
    // Fechou o preview de uma nota travada? A fila entra no lugar, com as
    // demais a um clique -- e o caminho que comeca no alerta do painel.
    const travada = this.podeVerValidacoes(this.previewNota());

    this.previewNota.set(null);
    this.errosFiscais.set([]);
    this.validacoes.set([]);
    this.sefazRetorno.set(null);

    // Tira o `?nota=` da barra de endereco: sem isso, recarregar a pagina depois
    // de fechar reabriria o modal que a pessoa acabou de dispensar.
    if (this.route.snapshot.queryParamMap.has('nota')) {
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { nota: null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }

    if (travada && !this.showFormNota()) {
      this.abrirFilaDeAjustes();
    }
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
        this.toastService.error(await mensagemDeErroDeDownload(err, 'Erro ao baixar o XML.'));
      },
    });
  }

  /**
   * A prévia da DANFE — **do servidor**, não montada aqui (issue #101).
   *
   * Isto chamava `gerarNotaPdf`, um DANFE simplificado que o navegador desenhava com `jspdf` a
   * partir da nota em tela. Era um substituto: quando a #101 foi feita eu não sabia que existia
   * rota para isso. Existe — `GET /notas/{id}/danfe-preview` — e devolve a prévia de verdade, com
   * o layout do documento, conferida contra a API em 29/10 (200, `application/pdf`, 60 kB).
   *
   * **Sem cair no gerador local em caso de falha.** Se o servidor recusar, a tela diz o motivo que
   * ele deu: um PDF aproximado no lugar de uma mensagem de erro é o tipo de fallback que esconde o
   * problema (#107), e aqui esconderia justamente que a nota não está pronta.
   */
  baixarPrevia(nota: NotaFiscal): void {
    this.baixandoPrevia.set(true);
    this.notasApi.previewDanfe(nota.id).subscribe({
      next: (resp) => {
        this.baixandoPrevia.set(false);
        const nome = filenameDeContentDisposition(
          resp.headers.get('Content-Disposition'),
          `previa-nota-${nota.numero ?? nota.id}.pdf`,
        );
        salvarBlob(resp.body!, nome);
        this.toastService.success('Prévia baixada (sem valor fiscal).');
      },
      error: async (err: HttpErrorResponse) => {
        this.baixandoPrevia.set(false);
        this.toastService.error(
          await mensagemDeErroDeDownload(err, 'Prévia indisponível para esta nota.'),
        );
      },
    });
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
      this.toastService.info(
        'A importação lê apenas o XML da NF-e (o PDF não é aceito pelo backend).',
      );
      return;
    }
    this.importando.set(true);
    this.notasApi.importar([file]).subscribe({
      next: (resultados) => {
        this.importando.set(false);
        this.recarregarAposMudanca();
        this.relatarImportacao(resultados);
      },
      error: () => {
        this.importando.set(false);
        this.toastService.error('Não foi possível importar a nota.');
      },
    });
  }

  /**
   * Diz o que aconteceu com **cada arquivo** (issue #117).
   *
   * Isto era um `success('Importação processada. Confira a lista de notas.')` disparado sem olhar
   * a resposta. Desde o lote de segurança do backend a importação **confere** o destinatário, a
   * assinatura e o que a SEFAZ autorizou, e recusa com um motivo escrito — então "processada"
   * virava mensagem de sucesso para uma recusa, e a pessoa ia embora achando que a nota entrou.
   *
   * O `motivo` vem pronto do servidor e é mostrado como veio: ele é quem sabe por que recusou. A
   * tela só escolhe o **tom** — recusa é erro, duplicada é aviso, importada é sucesso.
   */
  private relatarImportacao(resultados: ImportacaoNotaResultado[]): void {
    if (!resultados?.length) {
      // Lista vazia não é sucesso: é o servidor não dizendo nada sobre o arquivo.
      this.toastService.info('O servidor não informou o resultado da importação.');
      return;
    }

    for (const r of resultados) {
      const arquivo = r.arquivo ? `${r.arquivo}: ` : '';
      if (r.status === 'INVALIDA') {
        this.toastService.error(`${arquivo}${r.motivo ?? 'arquivo recusado na conferência.'}`);
      } else if (r.status === 'DUPLICADA') {
        // Só é duplicada quando a chave já está **nesta** conta. A nota que outro emitiu para o
        // produtor passou a importar normalmente, então isto deixou de ser falso positivo comum.
        this.toastService.info(`${arquivo}${r.motivo ?? 'esta nota já está na sua conta.'}`);
      } else {
        this.toastService.success(`${arquivo}${r.motivo ?? 'nota importada.'}`);
      }
    }
  }

  // Máscara CPF/CNPJ do formulário
  /**
   * CPF/CNPJ com mascara (#102).
   *
   * A formatacao em si ja existia aqui; o que faltava era **nao perder o cursor**. Medido antes:
   * com `123.456.789-09` e o cursor na posicao 2, digitar um `7` levava o cursor para a posicao
   * **15**, o fim do campo. Ver `@core/utils/mascaras`.
   */
  formatCpfCnpj(event: Event): void {
    this.destDocumento.digitar(event);
  }

  /**
   * CEP com mascara (#102).
   *
   * O campo prometia `78890-000` no placeholder e aceitava `78890000` -- o exemplo formatado
   * sugeria um formato que a tela nao entregava.
   */
  formatCep(event: Event): void {
    this.formEndCep.set(aplicarMascara(event, mascaraCep));
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

  /** Instante com fuso (`dataCancelamento`) como data e hora locais; não corta no `T` (UTC). */
  formatInstante(iso?: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? iso
      : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }

  notaStatusLabel(status?: string): string {
    return statusNotaLabel(status);
  }
}
