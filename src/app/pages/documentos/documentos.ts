import { Component, inject, signal, computed, OnInit } from '@angular/core';
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
import { NotasApi } from '@services/notas/data-access/notas.service';
import { ContadorApi } from '@services/contador/data-access/contador.service';
import { ToastService } from '@core/services/toast.service';
import { NotaFiscal, TipoDocumento } from '@models/nota-fiscal.model';
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
import { apenasUltimaChecagem, ehCampoDoProdutor, rotuloDoCampo } from '@core/utils/validacoes';
import {
  salvarBlob,
  filenameDeContentDisposition,
  mensagemDeErroDeDownload,
} from '@core/utils/download';
import { aplicarMascara, mascaraCep, mascaraCpfCnpj, soDigitos } from '@core/utils/mascaras';
import { hojeEmBrasilia } from '@core/utils/periodo';
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
    const pesos =
      base.length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
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
  private readonly contadorService = inject(ContadorApi);
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

  // Filters
  periodo = signal('todos');
  tipo = signal('todos');
  statusFilter = signal('todos');
  busca = signal('');
  ordenacao = signal<'data' | 'valor'>('data');

  // Carregamento de notas + paginação server-side (Page<T> do Spring)
  notasErro = signal(false);
  pageIndex = signal(0);
  /**
   * **Ainda provisório, mas por menos tempo (issue #104).**
   *
   * Filtrar é trabalho do servidor. Quando esta tela foi escrita, `GET /api/notas` aceitava só
   * `Pageable`, então todos os filtros rodavam em memória sobre a página carregada — e com 12 por
   * página o filtro **não enxergava** o que estivesse fora dela: buscar um destinatário da página
   * 2 devolvia "nenhuma nota". Subir para 100 era o remendo.
   *
   * O backend avançou. Medido contra a API local em 29/10: **`status` e `busca` filtram**, e o
   * `status` já vai daqui para o servidor (`recarregarNotas`). Mas `de`/`ate` **continuam sendo
   * ignorados** — `?de=2026-09-01&ate=2026-09-30` devolve as 15 notas, as mesmas de sem filtro.
   *
   * É isso que segura o número aqui: enquanto o recorte por data for em memória, cair para 12
   * ressuscita o bug antigo no filtro de período. Quando `de`/`ate` valerem, isto volta para 12 e
   * os filtros em memória saem junto.
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
    for (const n of this.notas()) {
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
    return this.notas().some((n) => (n.dataEmissao ?? '').slice(0, 10) >= corte);
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
   * A lista com tudo aplicado **menos a situacao**.
   *
   * Existe separada da `notasFiltradas` por causa do resumo do periodo: ele descreve o recorte que
   * a pessoa escolheu, e nao pode mudar quando ela escolhe uma situacao.
   */
  private readonly notasAntesDaSituacao = computed(() => {
    let lista = this.notas().slice();
    const busca = this.busca().toLowerCase();
    const now = new Date();

    // Período: `AAAA-MM` (um mês), `AAAA` (o ano) ou `ultimos30`. Comparação por prefixo de
    // string, que não passa por fuso nenhum — `new Date('2026-09-10')` é meia-noite em UTC e, no
    // horário de Brasília, cai no dia 9.
    const periodo = this.periodo();
    if (periodo === 'ultimos30') {
      const limite = new Date(now);
      limite.setDate(limite.getDate() - 30);
      const corte = limite.toISOString().slice(0, 10);
      lista = lista.filter((n) => (n.dataEmissao ?? '').slice(0, 10) >= corte);
    } else if (/^\d{4}(-\d{2})?$/.test(periodo)) {
      lista = lista.filter((n) => (n.dataEmissao ?? '').startsWith(periodo));
    }

    // Tipo do documento (NFE/NFA)
    if (this.tipo() !== 'todos')
      lista = lista.filter((n) => (n.tipoDocumento ?? 'NFE') === this.tipo());

    // Busca (natureza, número ou destinatário)
    if (busca)
      lista = lista.filter(
        (n) =>
          (n.naturezaOperacao || '').toLowerCase().includes(busca) ||
          String(n.numero ?? '').includes(busca) ||
          (n.destinatarioNome || '').toLowerCase().includes(busca),
      );

    return lista;
  });

  readonly notasFiltradas = computed(() => {
    let lista = this.notasAntesDaSituacao().slice();

    // Situacao. Nem toda opcao e um status do backend: `esperando` e um recorte de trabalho.
    //
    // As caixas do contador (`revisao`, `travadas`) sairam daqui junto com ele (#136): o contador
    // tem a tela propria (`NotasContador`), que filtra por status no servidor, por cliente.
    const situacao = this.statusFilter();
    // `esperando` e o recorte do produtor: o que ainda depende dele. Atravessa tres status
    // (inconsistencia, rejeitada, rascunho) porque o que une os tres e a pendencia, nao a
    // etiqueta -- nenhum deles virou documento fiscal ainda.
    if (situacao === 'esperando')
      lista = lista.filter((n) => this.podeVerValidacoes(n) || n.status === 'RASCUNHO');
    else if (situacao !== 'todos') lista = lista.filter((n) => n.status === situacao);

    // Ordenação
    lista.sort((a, b) => {
      if (this.ordenacao() === 'valor') return (b.valorTotalNota ?? 0) - (a.valorTotalNota ?? 0);
      return new Date(b.dataEmissao ?? 0).getTime() - new Date(a.dataEmissao ?? 0).getTime();
    });

    return lista;
  });

  /**
   * O resumo do recorte que esta na tela, para o produtor.
   *
   * A tela abria com cinco controles e 15 cartoes iguais, e nunca respondia as duas perguntas
   * que alguem faz ao abrir "Minhas notas": **quanto eu faturei** e **o que ainda falta de
   * mim**. O faturamento estava espalhado por 15 cartoes para somar de cabeca, e a nota com
   * inconsistencia de junho ficava na terceira tela de rolagem, do mesmo tamanho das outras.
   *
   * Conta sobre a `notasAntesDaSituacao`: periodo e busca entram, situacao nao -- o resumo
   * descreve o recorte que a pessoa escolheu, e nao pode mudar quando ela clica em "ver essas
   * notas", que e um filtro de situacao.
   *
   * So nota **autorizada** entra no faturamento: rascunho nao foi emitido e nota com
   * inconsistencia nao vale documento fiscal. Somar as tres daria um numero que nao existe em
   * lugar nenhum.
   */
  readonly resumoDoPeriodo = computed(() => {
    const base = this.notasAntesDaSituacao();
    const autorizadas = base.filter((n) => n.status === 'AUTORIZADA');
    const comInconsistencia = base.filter((n) => this.podeVerValidacoes(n)).length;
    const rascunhos = base.filter((n) => n.status === 'RASCUNHO').length;
    return {
      faturado: autorizadas.reduce((soma, n) => soma + (n.valorTotalNota ?? 0), 0),
      autorizadas: autorizadas.length,
      comInconsistencia,
      rascunhos,
      esperando: comInconsistencia + rascunhos,
    };
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
    if (this.busca().trim().length > 0) return true;
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

  /**
   * A pagina atual ja contem todas as notas do produtor?
   *
   * Enquanto for verdade, o filtro em memoria da o mesmo resultado que um filtro
   * no servidor daria, e a contagem pode falar da base inteira. Se um dia passar
   * de `pageSize`, a contagem volta a dizer "nesta pagina" -- que e a verdade.
   */
  readonly tudoCarregado = computed(() => this.notas().length >= this.totalElements());

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
      this.busca().trim().length > 0,
  );

  /**
   * Troca a situação **e recarrega**, porque agora ela é filtro de servidor (#104).
   *
   * O template chamava `statusFilter.set(...)` direto. Com o filtro subindo para a API, trocar o
   * signal sem recarregar deixaria a lista mostrando o recorte anterior.
   */
  trocarSituacao(valor: string): void {
    if (this.statusFilter() === valor) return;
    this.statusFilter.set(valor);
    this.pageIndex.set(0);
    this.recarregarNotas();
  }

  limparFiltros(): void {
    // So recarrega se a situacao anterior ia ao SERVIDOR. "Esperando voce" e composicao da tela:
    // limpa-la nao muda o recorte que a API aplicou, e recarregar seria pedir a mesma coisa.
    const tinhaSituacao = this.statusParaOServidor() !== undefined;
    this.periodo.set('todos');
    this.tipo.set('todos');
    this.statusFilter.set('todos');
    this.busca.set('');
    // A situacao e filtro de servidor (#104): limpa-la sem recarregar deixaria a lista presa no
    // recorte anterior, agora que a API e quem o aplica. Periodo, tipo e busca seguem em memoria.
    if (tinhaSituacao) {
      this.pageIndex.set(0);
      this.recarregarNotas();
    }
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

  /** CPF/CNPJ vazio (ainda digitando) ou com dígitos verificadores válidos. */
  readonly cpfCnpjValido = computed(() => {
    const d = soDigitos(this.formDestCpfCnpj());
    return d.length === 0 || cpfCnpjValido(d);
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
      this.formItens().some((i) => this.itemValido(i))
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
   * Recarrega as notas do produtor a partir do backend real (`GET /api/notas`).
   * Em falha (ex.: backend offline) exibe o banner de erro com "Tentar novamente"
   * (`notasErro`), sem dados mockados.
   */
  /**
   * A situação escolhida, quando ela é um status que o servidor entende (#104).
   *
   * `todos` não é filtro, e `esperando` é uma **composição da tela** (o que depende de uma ação do
   * produtor) que não existe como status no backend — essas duas continuam em memória.
   */
  private statusParaOServidor(): string | undefined {
    const s = this.statusFilter();
    return s === 'todos' || s === 'esperando' ? undefined : s;
  }

  recarregarNotas(): void {
    this.loading.set(true);
    this.notasErro.set(false);
    this.notasApi
      .listar({
        page: this.pageIndex(),
        size: this.pageSize(),
        sort: 'dataEmissao,desc',
        status: this.statusParaOServidor(),
      })
      .subscribe({
        next: (page) => {
          this.notas.set(page.content);
          this.carregarMotivosDeDevolucao(page.content);
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

  /** Substitui a nota na listagem e no preview após uma atualização do backend. */
  private atualizarNotaLocal(nota: NotaFiscal): void {
    this.notas.update((list) => list.map((n) => (n.id === nota.id ? nota : n)));
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
        if (erro.status === 422) this.recarregarNotas();
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
    this.notas.update((lista) => lista.map((n) => (n.id === atualizada.id ? atualizada : n)));
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
    this.formNotaId.set(null);
    this.formNumero.set('');
    this.formSerie.set('1');
    this.formTipoDoc.set('NFE');
    this.formNatureza.set('');
    // Nota nova nasce datada de hoje (#115): e a data da esmagadora maioria das emissoes, e
    // deixa-la vazia cobrava uma digitacao por nota. Quem emite com outra data so troca.
    this.formData.set(hojeEmBrasilia());
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

  /**
   * Sugere o próximo número de nota (maior número já emitido pelo produtor + 1),
   * continuando a sequência em vez de deixar o usuário adivinhar/repetir um número
   * já usado — campo continua editável, é só um ponto de partida.
   */
  private sugerirProximoNumero(): void {
    this.notasApi.listar({ size: 1, sort: 'numero,desc' }).subscribe({
      next: (pagina) => {
        if (this.formNotaId() !== null) return; // form já mudou p/ edição enquanto a chamada corria
        const maiorNumero = pagina.content[0]?.numero ?? 0;
        this.formNumero.set(String(maiorNumero + 1));
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
    this.formDestCpfCnpj.set(mascaraCpfCnpj(nota.destinatarioCpfCnpj ?? ''));
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
        this.recarregarNotas();
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
    this.formDestCpfCnpj.set(aplicarMascara(event, mascaraCpfCnpj));
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

  notaStatusLabel(status?: string): string {
    return statusNotaLabel(status);
  }
}
