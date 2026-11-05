import { Component, computed, inject, signal } from '@angular/core';
import type { Observable } from 'rxjs';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  LucideArrowLeft,
  LucideChevronDown,
  LucideChevronRight,
  LucideFileWarning,
  LucideHandCoins,
  LucideInbox,
  LucideLoaderCircle,
  LucideStamp,
  LucideTriangleAlert,
  LucideUserX,
} from '@lucide/angular';
import { CarteiraApi } from '@services/contador/data-access/carteira.service';
import type { ProdutorCarteira } from '@models/carteira.model';
import {
  type Pendencia,
  type StatusPendencia,
  type TipoDocumentoPendencia,
  TIPO_DOCUMENTO_LABEL,
  TIPOS_DOCUMENTO,
} from '@models/pendencia.model';
import type {
  NovoPedidoDocumento,
  SituacaoDoVinculo,
} from '@services/contador/data-access/carteira.service';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastService } from '@core/services/toast.service';
import { filenameDeContentDisposition, salvarBlob } from '@core/utils/download';
import type { NotaFiscal } from '@models/nota-fiscal.model';
import type { GuiaFiscal } from '@models/solicitacao-contador.model';
import type { NotaValidacaoResponse } from '@dtos/notas/sefaz.response';
import { apenasUltimaChecagem, rotuloDoCampo } from '@core/utils/validacoes';
import { UiBadgeStatus } from '@shared/ui/ui-badge-status';
import { UiButton } from '@shared/ui/ui-button';
import { UiEmptyState } from '@shared/ui/ui-empty-state';
import { UiSkeleton } from '@shared/ui/ui-skeleton';
import { ApuracaoCliente } from './apuracao-cliente';
import { VinculoCliente } from './vinculo-cliente';

/** Os quatro verbos do ciclo de um pedido de documento. */
export type VerboPendencia = 'concluir' | 'rejeitar' | 'cancelar' | 'reabrir';

/** Uma ação oferecida no cartão do pedido. */
export interface AcaoPendencia {
  verbo: VerboPendencia;
  rotulo: string;
  tom: 'primary' | 'ghost' | 'sutil';
}

/** Qual bloco a triagem pediu para destacar ao abrir. */
export type FocoCliente = 'inconsistencia' | 'aprovacao' | 'guias' | 'documentos' | null;

/**
 * Os status de nota que são **trabalho do escritório** — e por isso o que esta tela pede.
 *
 * `COM_INCONSISTENCIAS` o fisco recusou e o produtor tem de corrigir; `AGUARDANDO_APROVACAO` está
 * na mesa do contador (backend#178); `DEVOLVIDA` o escritório já devolveu e está esperando o
 * produtor. Nota autorizada não entra: não há o que fazer com ela aqui, e a lista inteira do
 * cliente é a aba de Notas.
 */
const STATUS_DE_TRABALHO = ['COM_INCONSISTENCIAS', 'AGUARDANDO_APROVACAO', 'DEVOLVIDA'] as const;

/**
 * Um cliente da carteira: `/contador/{produtorId}` (backend#177, frontend#95).
 *
 * ## A divisão com a triagem
 *
 * `/contador` responde "qual cliente precisa de mim"; esta tela responde "o que eu faço por ele".
 * Por isso aqui não há lista nem filtro de clientes: quem chegou já escolheu.
 *
 * ## Só o que o escritório alcança de verdade
 *
 * Todas as fontes desta tela estão no escopo do contador: a carteira,
 * `/contador/produtores/{id}/notas`, `/contador/guias?produtorId=`,
 * `/contador/produtores/{id}/pendencias` e, desde a backend#255, a apuração, os créditos e o
 * relatório de conformidade do cliente (`ApuracaoCliente`, #138). Nenhuma lê a identidade do token:
 * a do escritório daria 403, ou os números de **outra pessoa** nesta ficha.
 *
 * ## As ações também ficaram de fora, de propósito
 *
 * Aprovar e devolver nota (backend#178), lançar guia e dar baixa (que moram em Prazos e cobrança) e
 * pedir documento (backend#180) são verbos de outras issues. Esta tela é a leitura que falta para
 * a carteira fazer sentido; os botões entram quando cada fluxo entrar, com o seu próprio teste.
 */
@Component({
  selector: 'app-cliente',
  standalone: true,
  imports: [
    ApuracaoCliente,
    VinculoCliente,
    LucideArrowLeft,
    LucideChevronDown,
    LucideChevronRight,
    LucideFileWarning,
    LucideHandCoins,
    LucideInbox,
    LucideLoaderCircle,
    LucideStamp,
    LucideTriangleAlert,
    LucideUserX,
    RouterLink,
    UiBadgeStatus,
    UiButton,
    UiEmptyState,
    UiSkeleton,
  ],
  templateUrl: './cliente.html',
})
export class ClientePage {
  private readonly carteiraApi = inject(CarteiraApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly produtorId = this.route.snapshot.paramMap.get('produtorId') ?? '';

  /** Bloco que a triagem pediu para destacar; `null` quando se chegou pelo nome do cliente. */
  readonly foco = signal<FocoCliente>(
    (this.route.snapshot.queryParamMap.get('foco') as FocoCliente) ?? null,
  );

  readonly cliente = signal<ProdutorCarteira | null>(null);
  readonly notas = signal<NotaFiscal[]>([]);
  readonly guias = signal<GuiaFiscal[]>([]);
  readonly pendencias = signal<Pendencia[]>([]);

  readonly carregando = signal(true);
  readonly erro = signal(false);
  /**
   * O produtor existe, mas não está na carteira ativa deste escritório — o backend responde 404
   * para isso, nunca 403, justamente para não confirmar que o produtor existe.
   *
   * É um estado próprio, e não "deu erro": a resposta certa na tela é explicar que atender esse
   * produtor depende de convite aceito, não oferecer "tentar de novo".
   */
  readonly naoECliente = signal(false);

  readonly notasComInconsistencia = computed(() =>
    this.notas().filter((n) => n.status === 'COM_INCONSISTENCIAS'),
  );
  readonly notasAguardandoAprovacao = computed(() =>
    this.notas().filter((n) => String(n.status) === 'AGUARDANDO_APROVACAO'),
  );
  readonly notasDevolvidas = computed(() =>
    this.notas().filter((n) => String(n.status) === 'DEVOLVIDA'),
  );

  /**
   * As guias que ainda custam algo, vencida primeiro.
   *
   * **Sem filtro de período, de propósito.** Guia atrasada de agosto não pode sumir porque o
   * contador está olhando outubro — ela continua sendo problema dele hoje. É a mesma regra que a
   * tela de triagem segue.
   */
  readonly guiasACobrar = computed(() =>
    this.guias()
      .filter((g) => g.status !== 'pago')
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'vencido' ? -1 : 1;
        return (a.dataVencimento ?? '').localeCompare(b.dataVencimento ?? '');
      }),
  );

  readonly totalACobrar = computed(() =>
    this.guiasACobrar().reduce((soma, g) => soma + (g.valor ?? 0), 0),
  );

  readonly nadaAFazer = computed(
    () =>
      !this.carregando() &&
      !this.erro() &&
      !this.naoECliente() &&
      this.notas().length === 0 &&
      this.guiasACobrar().length === 0 &&
      this.pendencias().length === 0,
  );

  // ── O que o fisco apontou, ao expandir a nota ──
  readonly notaExpandida = signal<string | null>(null);
  readonly validacoes = signal<NotaValidacaoResponse[]>([]);
  readonly carregandoValidacoes = signal(false);

  constructor() {
    this.carregar();
  }

  private carregar(): void {
    this.carregando.set(true);
    this.erro.set(false);
    this.naoECliente.set(false);

    this.carteiraApi.obterCliente(this.produtorId).subscribe({
      next: (cliente) => {
        this.cliente.set(cliente);
        if (!cliente) {
          this.naoECliente.set(true);
          this.carregando.set(false);
          return;
        }
        // Vinculo suspenso: as rotas do cliente respondem 404, nao ha trabalho para buscar (#147).
        if (cliente.situacaoVinculo !== 'ATIVO') {
          this.carregando.set(false);
          return;
        }
        this.carregarTrabalho();
      },
      error: () => {
        this.erro.set(true);
        this.carregando.set(false);
      },
    });
  }

  /**
   * Depois de suspender, reativar ou encerrar (#147).
   *
   * Encerrado não volta, então a ficha deixa de ter o que mostrar e devolve para a carteira.
   * Reativado, recarrega: o trabalho do cliente volta a ser alcançável.
   */
  aoMudarVinculo(nova: SituacaoDoVinculo): void {
    if (nova.situacao === 'ENCERRADO') {
      void this.router.navigate(['/contador']);
      return;
    }
    if (nova.situacao === 'ATIVO') {
      this.carregar();
      return;
    }
    this.cliente.update((c) => (c ? { ...c, situacaoVinculo: nova.situacao } : c));
  }

  /**
   * As três listas de trabalho.
   *
   * Cada uma falha por conta própria: uma guia que não carregou não pode esconder a nota com
   * inconsistência que carregou. O `erro()` geral fica para a falha de identificar o cliente.
   */
  private carregarTrabalho(): void {
    this.carteiraApi
      .notasDoCliente(this.produtorId, {
        status: [...STATUS_DE_TRABALHO],
        sort: 'dataEmissao,desc',
      })
      .subscribe({
        next: (notas) => {
          this.notas.set(notas);
          this.carregando.set(false);
        },
        error: () => this.carregando.set(false),
      });

    this.carteiraApi.guiasDoCliente(this.produtorId).subscribe({
      next: (guias) => this.guias.set(guias),
      error: () => this.guias.set([]),
    });

    // Todos os status, nao so ENVIADA: filtrar escondia o que o escritorio pediu e ainda nao
    // voltou -- justamente o que ele precisa ver para saber que ja cobrou.
    this.carteiraApi.pendenciasDoCliente(this.produtorId).subscribe({
      next: (pendencias) => {
        this.pendencias.set(pendencias);
        this.completarAnexos(pendencias);
      },
      error: () => this.pendencias.set([]),
    });
  }

  /**
   * Busca os metadados dos arquivos de quem tem arquivo.
   *
   * **A listagem devolve `anexos: []`**, só com `quantidadeAnexos`; os metadados vêm no detalhe.
   * Sem isto não há o que baixar — e conferir um documento é justamente abrir o arquivo, de modo
   * que o bloco inteiro ficaria decorativo. Só pede o detalhe de quem tem anexo.
   *
   * Falha de um detalhe é silenciosa: o pedido continua na lista com o que a listagem deu. Perder
   * o botão de baixar é ruim; perder o pedido é pior.
   */
  private completarAnexos(pendencias: Pendencia[]): void {
    for (const p of pendencias) {
      if (p.quantidadeAnexos === 0) continue;
      this.carteiraApi.detalharPendencia(this.produtorId, p.id).subscribe({
        next: (completa) =>
          this.pendencias.update((lista) =>
            lista.map((atual) => (atual.id === completa.id ? completa : atual)),
          ),
        error: () => undefined,
      });
    }
  }

  /**
   * Abre (ou fecha) uma nota e busca o que impede emitir.
   *
   * O texto vem do backend (`code`, `field`, `message`) — não é frase nossa. O contador precisa ler
   * o que o validador fiscal disse para saber o que pedir ao produtor.
   */
  alternarNota(notaId: string): void {
    if (this.notaExpandida() === notaId) {
      this.notaExpandida.set(null);
      return;
    }
    this.notaExpandida.set(notaId);
    this.validacoes.set([]);
    this.carregandoValidacoes.set(true);
    this.carteiraApi.validacoesDaNota(this.produtorId, notaId).subscribe({
      next: (lista) => {
        this.validacoes.set(apenasUltimaChecagem(lista));
        this.carregandoValidacoes.set(false);
      },
      error: () => this.carregandoValidacoes.set(false),
    });
  }

  // ── Pedidos de documento (backend#180) ──

  readonly executando = signal<string | null>(null);
  /**
   * O motivo que está sendo escrito, e de quem.
   *
   * Um só por vez, e com `alvo`: devolver uma **nota** (backend#178) e devolver um **pedido de
   * documento** (#180) usam o mesmo campo e a mesma regra de 5 a 500 caracteres, mas batem em
   * rotas diferentes. Sem o `alvo`, confirmar um acabaria executando o outro.
   */
  readonly motivoAberto = signal<{
    id: string;
    verbo: VerboPendencia;
    alvo: 'pendencia' | 'nota';
  } | null>(null);
  readonly motivo = signal('');

  // ── Formulário de pedir documento ──
  readonly pedindo = signal(false);
  readonly novoTitulo = signal('');
  readonly novoPrazo = signal('');
  readonly novaDescricao = signal('');
  readonly novosTipos = signal<TipoDocumentoPendencia[]>([]);
  readonly tiposPossiveis = TIPOS_DOCUMENTO;
  readonly rotuloDoTipo = TIPO_DOCUMENTO_LABEL;

  /** O servidor exige título e ao menos um tipo; o resto é opcional. */
  readonly podeCriarPedido = computed(
    () => this.novoTitulo().trim().length > 0 && this.novosTipos().length > 0,
  );

  /** O motivo tem de 5 a 500 caracteres; fora disso o servidor devolve 400. */
  readonly motivoValido = computed(() => {
    const texto = this.motivo().trim();
    return texto.length >= 5 && texto.length <= 500;
  });

  /**
   * Os pedidos na ordem de trabalho: quem espera o escritório primeiro, depois o que foi pedido e
   * ainda não voltou, e por fim o que já acabou.
   */
  readonly pedidosOrdenados = computed(() => {
    const peso: Record<StatusPendencia, number> = {
      ENVIADA: 0,
      PENDENTE: 1,
      CONCLUIDA: 2,
      CANCELADA: 3,
    };
    return [...this.pendencias()].sort((a, b) => peso[a.status] - peso[b.status]);
  });

  readonly pedidosEsperandoConferencia = computed(
    () => this.pendencias().filter((p) => p.status === 'ENVIADA').length,
  );

  /**
   * O que pode ser feito com este pedido **agora**.
   *
   * O servidor recusa transição fora de ordem com 409 `TRANSICAO_PENDENCIA_INVALIDA` — medido:
   * concluir uma `PENDENTE` responde "esta PENDENTE e nao permite esta acao". Então a tela não
   * oferece o que não vale: um botão que só produz erro é uma armadilha, não uma opção.
   */
  acoesDe(pendencia: Pendencia): AcaoPendencia[] {
    switch (pendencia.status) {
      case 'ENVIADA':
        return [
          { verbo: 'concluir', rotulo: 'Aceitar', tom: 'primary' },
          { verbo: 'rejeitar', rotulo: 'Devolver', tom: 'ghost' },
          { verbo: 'cancelar', rotulo: 'Cancelar pedido', tom: 'sutil' },
        ];
      case 'PENDENTE':
        return [{ verbo: 'cancelar', rotulo: 'Cancelar pedido', tom: 'sutil' }];
      default:
        return [{ verbo: 'reabrir', rotulo: 'Reabrir', tom: 'ghost' }];
    }
  }

  /** Abre o campo de motivo. */
  abrirMotivo(pendencia: Pendencia, verbo: VerboPendencia): void {
    this.motivoAberto.set({ id: pendencia.id, verbo, alvo: 'pendencia' });
    this.motivo.set('');
  }

  /** Abre o campo de motivo para devolver uma **nota** ao produtor. */
  abrirMotivoDaNota(nota: NotaFiscal): void {
    this.motivoAberto.set({ id: nota.id, verbo: 'rejeitar', alvo: 'nota' });
    this.motivo.set('');
  }

  fecharMotivo(): void {
    this.motivoAberto.set(null);
    this.motivo.set('');
  }

  /** Verbo com motivo abre o campo; sem motivo executa direto. */
  acionar(pendencia: Pendencia, verbo: VerboPendencia): void {
    if (verbo === 'rejeitar' || verbo === 'cancelar') {
      this.abrirMotivo(pendencia, verbo);
      return;
    }
    this.executar(pendencia, verbo);
  }

  /** Confirma a ação que estava esperando o motivo. */
  confirmarMotivo(): void {
    const aberto = this.motivoAberto();
    if (!aberto || !this.motivoValido()) return;
    const motivo = this.motivo().trim();

    if (aberto.alvo === 'nota') {
      const nota = this.notas().find((n) => n.id === aberto.id);
      if (nota) this.devolver(nota, motivo);
      return;
    }
    const pendencia = this.pendencias().find((p) => p.id === aberto.id);
    if (pendencia) this.executar(pendencia, aberto.verbo, motivo);
  }

  /**
   * Aprova a nota: o produtor passa a poder emitir.
   *
   * Enquanto isto não acontece, `gerar-xml` responde 409 `APROVACAO_EXIGIDA` para ele — ou seja,
   * este botão é o que destrava a emissão, não um carimbo.
   */
  aprovar(nota: NotaFiscal): void {
    this.executarNaNota(nota, () => this.carteiraApi.aprovarNota(this.produtorId, nota.id));
  }

  /** Devolve a nota ao produtor com o motivo, que entra no histórico de revisão. */
  devolver(nota: NotaFiscal, motivo: string): void {
    this.executarNaNota(nota, () =>
      this.carteiraApi.devolverNota(this.produtorId, nota.id, motivo),
    );
  }

  /** Troca a nota pela versão que o servidor devolveu — o status é decisão dele. */
  private executarNaNota(nota: NotaFiscal, chamada: () => Observable<NotaFiscal>): void {
    this.executando.set(nota.id);
    chamada().subscribe({
      next: (atualizada) => {
        this.executando.set(null);
        this.fecharMotivo();
        this.notas.update((lista) => lista.map((n) => (n.id === atualizada.id ? atualizada : n)));
      },
      error: (erro: HttpErrorResponse) => {
        this.executando.set(null);
        // O 403 aqui tem dono: a função ASSISTENTE lê a carteira mas **não aprova nota**
        // (#111). Dizer "não foi possível" faria a pessoa tentar de novo até desistir.
        this.toast.error(
          erro.status === 403
            ? 'A sua função no escritório não aprova nem devolve nota. Peça a um contador ou ao administrador.'
            : erro.status === 409
              ? 'A situação desta nota mudou. Recarregue para ver como ela está.'
              : 'Não foi possível concluir a ação. Tente de novo.',
        );
      },
    });
  }

  /** Abre a DANFE do rascunho, com marca d'água, para conferir antes de aprovar. */
  verPreviaDanfe(nota: NotaFiscal): void {
    this.carteiraApi.previewDanfe(this.produtorId, nota.id).subscribe({
      next: (resposta) => {
        const nome = filenameDeContentDisposition(
          resposta.headers.get('Content-Disposition'),
          `nota-${nota.numero}.pdf`,
        );
        if (resposta.body) salvarBlob(resposta.body, nome);
      },
      error: () => this.toast.error('Não foi possível gerar a prévia da DANFE.'),
    });
  }

  /**
   * Executa um verbo do ciclo e substitui o pedido pelo que o servidor devolveu.
   *
   * O status **não** é mexido à mão: quem decide para onde a pendência vai é o backend, e
   * `rejeitar` a devolve para `PENDENTE` — não para um estado que a tela adivinharia.
   */
  executar(pendencia: Pendencia, verbo: VerboPendencia, motivo?: string): void {
    const chamada = {
      concluir: () => this.carteiraApi.concluirPendencia(this.produtorId, pendencia.id),
      reabrir: () => this.carteiraApi.reabrirPendencia(this.produtorId, pendencia.id),
      rejeitar: () =>
        this.carteiraApi.rejeitarPendencia(this.produtorId, pendencia.id, motivo ?? ''),
      cancelar: () =>
        this.carteiraApi.cancelarPendencia(this.produtorId, pendencia.id, motivo ?? ''),
    }[verbo]();

    this.executando.set(pendencia.id);
    chamada.subscribe({
      next: (atualizada) => {
        this.executando.set(null);
        this.fecharMotivo();
        this.pendencias.update((lista) =>
          lista.map((p) => (p.id === atualizada.id ? atualizada : p)),
        );
      },
      error: (erro: HttpErrorResponse) => {
        this.executando.set(null);
        this.toast.error(
          erro.status === 409
            ? 'A situação deste pedido mudou. Recarregue para ver como ele está.'
            : 'Não foi possível concluir a ação. Tente de novo.',
        );
      },
    });
  }

  /** Marca ou desmarca um tipo de documento no formulário. */
  alternarTipo(tipo: TipoDocumentoPendencia): void {
    this.novosTipos.update((atuais) =>
      atuais.includes(tipo) ? atuais.filter((t) => t !== tipo) : [...atuais, tipo],
    );
  }

  /** Cria o pedido. Só vai o que tem valor: campo vazio não vira string vazia no corpo. */
  criarPedido(): void {
    if (!this.podeCriarPedido()) return;
    const pedido: NovoPedidoDocumento = {
      titulo: this.novoTitulo().trim(),
      tiposDocumento: this.novosTipos(),
    };
    if (this.novoPrazo()) pedido.dataLimite = this.novoPrazo();
    if (this.novaDescricao().trim()) pedido.descricao = this.novaDescricao().trim();

    this.executando.set('novo');
    this.carteiraApi.criarPendencia(this.produtorId, pedido).subscribe({
      next: (criada) => {
        this.executando.set(null);
        this.pendencias.update((lista) => [criada, ...lista]);
        this.pedindo.set(false);
        this.novoTitulo.set('');
        this.novoPrazo.set('');
        this.novaDescricao.set('');
        this.novosTipos.set([]);
        this.toast.success('Pedido enviado ao produtor.');
      },
      error: () => {
        this.executando.set(null);
        this.toast.error('Não foi possível criar o pedido.');
      },
    });
  }

  /** Baixa um anexo do cliente. Em verificação o servidor recusa com 409. */
  baixarAnexo(pendencia: Pendencia, anexoId: string): void {
    this.carteiraApi.baixarAnexoDoCliente(this.produtorId, pendencia.id, anexoId).subscribe({
      next: (resposta) => {
        const nome = filenameDeContentDisposition(
          resposta.headers.get('Content-Disposition'),
          'anexo',
        );
        if (resposta.body) salvarBlob(resposta.body, nome);
      },
      error: (erro: HttpErrorResponse) => {
        this.toast.error(
          erro.status === 409
            ? 'O arquivo ainda está em verificação de segurança.'
            : 'Não foi possível baixar o arquivo.',
        );
      },
    });
  }

  rotuloDoCampo = rotuloDoCampo;

  /**
   * Dinheiro em real.
   *
   * Método, e não o `CurrencyPipe`: o projeto inteiro formata assim (dashboard, documentos,
   * prazos, impostos) e por isso **nunca registrou o locale `pt-BR`** no `main.ts`. Com o pipe o
   * valor saía vazio na tela — o número simplesmente não aparecia ao lado da guia.
   */
  moeda(valor?: number | null): string {
    return (valor ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  /**
   * Data em `dd/mm/aaaa`, tolerando `AAAA-MM-DD` (guia, prazo) e ISO com hora (emissão da nota).
   *
   * A data pura é fatiada como texto, **sem** passar por `new Date`: `new Date('2026-10-20')` é
   * meia-noite em UTC, que no horário de Brasília é o dia 19 — a guia apareceria vencendo um dia
   * antes.
   */
  dataCurta(valor?: string | null): string {
    if (!valor) return '—';
    const soData = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
    if (soData) return `${soData[3]}/${soData[2]}/${soData[1]}`;
    const data = new Date(valor);
    return Number.isNaN(data.getTime()) ? '—' : data.toLocaleDateString('pt-BR');
  }

  /** Rótulo do status do pedido, na voz do escritório. */
  rotuloDoStatus(status: StatusPendencia): string {
    const map: Record<StatusPendencia, string> = {
      PENDENTE: 'Com o produtor',
      ENVIADA: 'Para conferir',
      CONCLUIDA: 'Concluído',
      CANCELADA: 'Cancelado',
    };
    return map[status];
  }

  /** Documento, regime e praça, quando o backend os manda. */
  identificacao(cliente: ProdutorCarteira): string {
    return [cliente.cpfCnpj, cliente.regime, cliente.uf].filter(Boolean).join(' · ');
  }

  recarregar(): void {
    this.carregar();
  }
}
