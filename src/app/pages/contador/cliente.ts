import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
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
import type { PendenciaCliente, ProdutorCarteira } from '@models/carteira.model';
import type { NotaFiscal } from '@models/nota-fiscal.model';
import type { GuiaFiscal } from '@models/solicitacao-contador.model';
import type { NotaValidacaoResponse } from '@dtos/notas/sefaz.response';
import { apenasUltimaChecagem, rotuloDoCampo } from '@core/utils/validacoes';
import { UiBadgeStatus } from '@shared/ui/ui-badge-status';
import { UiButton } from '@shared/ui/ui-button';
import { UiEmptyState } from '@shared/ui/ui-empty-state';
import { UiSkeleton } from '@shared/ui/ui-skeleton';

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
 * As quatro fontes desta tela existem no escopo do contador e foram medidas respondendo 200:
 * a carteira, `/contador/produtores/{id}/notas`, `/contador/guias?produtorId=` e
 * `/contador/produtores/{id}/pendencias`.
 *
 * **Apuração e relatório de conformidade não estão aqui**, e não é esquecimento:
 * `/api/apuracao` e `/api/relatorios/conformidade` derivam o produtor da identidade e dão 403 para
 * contador, e a versão por cliente não existe (`/contador/produtores/{id}/apuracao` responde 404 —
 * só o `reabrir` mora lá). Pedido em SupersonicTeam/backend#255. Preencher esse espaço com os
 * números do produtor da identidade atual seria mostrar o dinheiro de **outra pessoa** na ficha
 * deste cliente; a tela prefere dizer que não sabe.
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

  readonly produtorId = this.route.snapshot.paramMap.get('produtorId') ?? '';

  /** Bloco que a triagem pediu para destacar; `null` quando se chegou pelo nome do cliente. */
  readonly foco = signal<FocoCliente>(
    (this.route.snapshot.queryParamMap.get('foco') as FocoCliente) ?? null,
  );

  readonly cliente = signal<ProdutorCarteira | null>(null);
  readonly notas = signal<NotaFiscal[]>([]);
  readonly guias = signal<GuiaFiscal[]>([]);
  readonly pendencias = signal<PendenciaCliente[]>([]);

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
        this.carregarTrabalho();
      },
      error: () => {
        this.erro.set(true);
        this.carregando.set(false);
      },
    });
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

    this.carteiraApi.pendenciasDoCliente(this.produtorId, ['ENVIADA']).subscribe({
      next: (pendencias) => this.pendencias.set(pendencias),
      error: () => this.pendencias.set([]),
    });
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

  /** Documento, regime e praça, quando o backend os manda. */
  identificacao(cliente: ProdutorCarteira): string {
    return [cliente.cpfCnpj, cliente.regime, cliente.uf].filter(Boolean).join(' · ');
  }

  recarregar(): void {
    this.carregar();
  }
}
