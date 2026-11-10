import { Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { Observable } from 'rxjs';
import {
  LucideChevronDown,
  LucideChevronRight,
  LucideFileText,
  LucideRefreshCw,
  LucideSearch,
} from '@lucide/angular';
import {
  CarteiraApi,
  type StatusNotaFiltro,
} from '@services/contador/data-access/carteira.service';
import { contraparteDaNota, ehCompraImportada, type NotaFiscal } from '@models/nota-fiscal.model';
import type { NotaCarteira, ProdutorCarteira, ResumoNotasCarteira } from '@models/carteira.model';
import type { NotaValidacaoResponse } from '@dtos/notas/sefaz.response';
import { ToastService } from '@core/services/toast.service';
import { filenameDeContentDisposition, salvarBlob } from '@core/utils/download';
import { apenasUltimaChecagem, rotuloDoCampo } from '@core/utils/validacoes';
import { SeletorCliente } from '@shared/contador/seletor-cliente';
import { UiBadgeStatus } from '@shared/ui/ui-badge-status';
import { UiButton } from '@shared/ui/ui-button';
import { UiEmptyState } from '@shared/ui/ui-empty-state';
import { UiModal } from '@shared/ui/ui-modal';
import { UiSkeleton } from '@shared/ui/ui-skeleton';

/** Uma caixa da triagem: um recorte de trabalho que vira filtro de `status` no servidor. */
export interface CaixaTriagem {
  /** É também a chave do `/contador/notas/resumo` que conta a caixa. */
  chave: keyof ResumoNotasCarteira;
  rotulo: string;
  /** Vazio = todas as notas do recorte (a carteira inteira ou o cliente escolhido). */
  status: StatusNotaFiltro[];
}

/**
 * As caixas da triagem, na ordem do trabalho do contador.
 *
 * Eram recortes feitos **em memória** sobre as 100 notas que `/api/notas` devolvia — e essa rota
 * responde 403 para o contador (#136). Cada caixa é o filtro `status` de `/api/contador/notas`
 * (backend#341), e a contagem de todas vem do `/resumo`, numa consulta só.
 *
 * "Precisam de revisão" espera **o escritório** (a nota que o produtor mandou aprovar, backend#178);
 * "Travadas pelo fisco" espera **o produtor** corrigir. São pilhas de donos diferentes, e por isso
 * não se misturam.
 */
export const CAIXAS_TRIAGEM: readonly CaixaTriagem[] = [
  { chave: 'revisao', rotulo: 'Precisam de revisão', status: ['AGUARDANDO_APROVACAO'] },
  {
    chave: 'travadas',
    rotulo: 'Travadas pelo fisco',
    status: ['COM_INCONSISTENCIAS', 'REJEITADA'],
  },
  { chave: 'rascunhos', rotulo: 'Rascunhos do produtor', status: ['RASCUNHO'] },
  { chave: 'devolvidas', rotulo: 'Devolvidas ao produtor', status: ['DEVOLVIDA'] },
  { chave: 'autorizadas', rotulo: 'Autorizadas', status: ['AUTORIZADA'] },
  { chave: 'canceladas', rotulo: 'Canceladas', status: ['CANCELADA'] },
  { chave: 'todas', rotulo: 'Todas', status: [] },
];

/** Notas por página. A lista cresce com "Mostrar mais", sem trocar de página. */
const POR_PAGINA = 20;

/** O mínimo que o backend aceita em `busca` — abaixo disso ele responde 400. */
const BUSCA_MINIMA = 3;

/**
 * `/documentos` na visão do **contador**: as notas da carteira (#136, #164).
 *
 * ## A carteira inteira ou um cliente (#164)
 *
 * Até a #164 a tela exigia escolher um cliente antes de mostrar qualquer nota: o escritório com
 * 40 clientes abria sete caixas vazias e tinha de procurar cliente por cliente quem mandou nota
 * para revisão. Com a backend#341, `GET /api/contador/notas` devolve as notas de **todos** os
 * clientes ativos, e o seletor ganhou "Toda a carteira" (o `null`). Escolher um cliente é o mesmo
 * pedido com `produtorId`. Cada nota traz o `produtorId` dela, e é ele que vai às rotas por
 * cliente (validações, prévia, aprovar, devolver) — com a carteira inteira não há "o" cliente.
 *
 * ## Por que não é a tela do produtor
 *
 * Era. O contador abria a mesma `DocumentosPage`, com outro título, e ela chamava `/api/notas`,
 * `/api/vinculos` e `/api/pendencias` — rotas que derivam o produtor do token e respondem **403**
 * para o escritório. Resultado: toast de erro duplicado e lista vazia, em produção. Não há o que
 * consertar trocando texto: o escritório não tem "as minhas notas", tem as notas **de cada
 * cliente**. Então a rota despacha para este componente (ver `documentos-rota.ts`), como
 * `/tributario` e `/calendario` já faziam.
 *
 * O que ele faz: escolher o cliente, triar pelas caixas, conferir o que o fisco apontou, e
 * aprovar ou devolver a nota que espera o escritório. Emitir, editar e anexar são do produtor.
 */
@Component({
  selector: 'app-notas-contador',
  standalone: true,
  imports: [
    LucideChevronDown,
    LucideChevronRight,
    LucideFileText,
    LucideRefreshCw,
    LucideSearch,
    RouterLink,
    SeletorCliente,
    UiBadgeStatus,
    UiButton,
    UiEmptyState,
    UiModal,
    UiSkeleton,
  ],
  templateUrl: './notas-contador.html',
})
export class NotasContador {
  private readonly carteiraApi = inject(CarteiraApi);
  private readonly toast = inject(ToastService);
  private readonly rota = inject(ActivatedRoute);

  readonly caixas = CAIXAS_TRIAGEM;
  protected readonly rotuloDoCampo = rotuloDoCampo;
  protected readonly contraparteDaNota = contraparteDaNota;
  protected readonly ehCompraImportada = ehCompraImportada;

  /** `undefined` enquanto a carteira não respondeu; `null` = toda a carteira (#164). */
  readonly cliente = signal<ProdutorCarteira | null | undefined>(undefined);
  readonly todaCarteira = computed(() => this.cliente() === null);
  /**
   * A caixa aberta. Abre em "Precisam de revisão" (o que espera o escritório), a menos que o
   * endereço peça outra (`?caixa=`): o Fechamento manda para cá as notas que ficaram fora da
   * apuração, e elas não estão na pilha de revisão.
   */
  readonly caixa = signal<CaixaTriagem['chave']>(this.caixaPedida());
  readonly busca = signal('');
  /** A busca que está valendo — a do campo só vale ao enviar, para não pedir a cada tecla. */
  readonly buscaAplicada = signal('');

  readonly notas = signal<NotaCarteira[]>([]);
  readonly total = signal(0);
  readonly pagina = signal(0);
  readonly carregando = signal(false);
  readonly carregandoMais = signal(false);
  /**
   * A falha da lista: `'fora-da-carteira'` é o 404 de um cliente que deixou de ser ativo depois que
   * a tela abriu (tentar de novo não adianta); `'falha'` é o resto.
   */
  readonly erro = signal<false | 'falha' | 'fora-da-carteira'>(false);
  /** Quantas notas há em cada caixa. `null` = ainda não sabe (ou não conseguiu saber). */
  readonly contagens = signal<Record<string, number | null>>({});

  readonly temMais = computed(() => this.notas().length < this.total());
  readonly buscaCurta = computed(() => {
    const termo = this.busca().trim();
    return termo.length > 0 && termo.length < BUSCA_MINIMA;
  });

  /**
   * Cada troca de cliente, caixa ou busca abre uma "vez"; resposta de uma vez antiga é
   * descartada. Sem isto, trocar de cliente com a lista em voo punha as notas de um sob o nome
   * do outro.
   */
  private vez = 0;
  /** O mesmo, para as contagens: uma rodada nova invalida as respostas da anterior. */
  private vezDaContagem = 0;

  private caixaPedida(): CaixaTriagem['chave'] {
    const pedida = this.rota.snapshot.queryParamMap.get('caixa');
    return CAIXAS_TRIAGEM.find((c) => c.chave === pedida)?.chave ?? 'revisao';
  }

  aoTrocarCliente(cliente: ProdutorCarteira | null): void {
    const atual = this.cliente();
    if (atual !== undefined && (atual?.id ?? null) === (cliente?.id ?? null)) return;
    this.cliente.set(cliente);
    this.fecharNota();
    this.busca.set('');
    this.buscaAplicada.set('');
    this.notas.set([]);
    this.total.set(0);
    this.contagens.set({});
    // Sem cliente não é mais "nada a mostrar": é a carteira inteira (#164).
    this.contar();
    this.recarregar();
  }

  trocarCaixa(chave: CaixaTriagem['chave']): void {
    if (this.caixa() === chave) return;
    this.caixa.set(chave);
    this.fecharNota();
    this.recarregar();
  }

  /** Aplica o que está no campo de busca. Vazio limpa; curto demais o servidor recusaria. */
  buscar(): void {
    const termo = this.busca().trim();
    if (termo.length > 0 && termo.length < BUSCA_MINIMA) return;
    if (termo === this.buscaAplicada()) return;
    this.buscaAplicada.set(termo);
    this.contar();
    this.recarregar();
  }

  /**
   * Volta à primeira página da caixa escolhida.
   *
   * `silencioso` é para depois de aprovar ou devolver: a lista é trocada quando a resposta chega,
   * sem o esqueleto no meio, e uma falha deixa a lista que já estava na tela.
   */
  recarregar(silencioso = false): void {
    if (this.cliente() === undefined) return;
    const vez = ++this.vez;
    if (!silencioso) {
      this.carregando.set(true);
      this.erro.set(false);
    }
    this.pedirPagina(0).subscribe({
      next: ({ itens, total }) => {
        if (vez !== this.vez) return;
        this.notas.set(itens);
        this.total.set(total);
        this.pagina.set(0);
        this.carregando.set(false);
      },
      error: (falha: HttpErrorResponse) => {
        if (vez !== this.vez || silencioso) return;
        this.notas.set([]);
        this.total.set(0);
        this.erro.set(falha.status === 404 && this.cliente() ? 'fora-da-carteira' : 'falha');
        this.carregando.set(false);
      },
    });
  }

  mostrarMais(): void {
    if (this.cliente() === undefined || this.carregandoMais() || !this.temMais()) return;
    const vez = this.vez;
    const proxima = this.pagina() + 1;
    this.carregandoMais.set(true);
    this.pedirPagina(proxima).subscribe({
      next: ({ itens, total }) => {
        this.carregandoMais.set(false);
        if (vez !== this.vez) return;
        this.notas.update((atuais) => [...atuais, ...itens]);
        this.total.set(total);
        this.pagina.set(proxima);
      },
      error: () => {
        this.carregandoMais.set(false);
        if (vez === this.vez) this.toast.error('Não foi possível carregar mais notas.');
      },
    });
  }

  private pedirPagina(pagina: number) {
    const caixa = this.caixas.find((c) => c.chave === this.caixa()) ?? this.caixas[0];
    return this.carteiraApi.notasDaCarteira({
      status: caixa.status,
      produtorId: this.cliente()?.id,
      busca: this.buscaAplicada() || undefined,
      page: pagina,
      size: POR_PAGINA,
      sort: 'dataEmissao,desc',
    });
  }

  /**
   * A contagem de cada caixa, do `/contador/notas/resumo` (backend#341): uma consulta só, com a
   * busca e o cliente da lista. Eram sete consultas de uma nota cada, lendo o `X-Total-Count`.
   *
   * Conta sobre a busca, não sobre a caixa escolhida: no instante em que o contador clicasse numa
   * caixa, as outras não podem zerar, senão a triagem deixa de servir para triar. Se o resumo
   * falhar, as caixas ficam sem número; a lista não depende dele.
   */
  private contar(limpar = true): void {
    if (this.cliente() === undefined) return;
    const vez = ++this.vezDaContagem;
    // Depois de aprovar, os números de antes continuam na tela até os novos chegarem: zerar faria
    // as sete caixas piscarem a cada nota.
    if (limpar) this.contagens.set({});
    this.carteiraApi
      .resumoDasNotas({ busca: this.buscaAplicada() || undefined, produtorId: this.cliente()?.id })
      .subscribe({
        next: (resumo) => {
          if (vez === this.vezDaContagem) this.contagens.set({ ...resumo });
        },
        error: () => undefined,
      });
  }

  // ── O que o fisco apontou ──

  readonly notaAberta = signal<string | null>(null);
  readonly validacoes = signal<NotaValidacaoResponse[]>([]);
  readonly carregandoValidacoes = signal(false);

  /** Só nota travada tem o que mostrar: as outras nunca passaram pelo validador com erro. */
  temValidacoes(nota: NotaCarteira): boolean {
    return nota.status === 'COM_INCONSISTENCIAS' || nota.status === 'REJEITADA';
  }

  alternarNota(nota: NotaCarteira): void {
    if (this.notaAberta() === nota.id) {
      this.fecharNota();
      return;
    }
    this.notaAberta.set(nota.id);
    this.validacoes.set([]);
    this.carregandoValidacoes.set(true);
    this.carteiraApi.validacoesDaNota(nota.produtorId, nota.id).subscribe({
      next: (lista) => {
        if (this.notaAberta() !== nota.id) return;
        this.validacoes.set(apenasUltimaChecagem(lista));
        this.carregandoValidacoes.set(false);
      },
      error: () => {
        if (this.notaAberta() === nota.id) this.carregandoValidacoes.set(false);
      },
    });
  }

  private fecharNota(): void {
    this.notaAberta.set(null);
    this.validacoes.set([]);
    this.carregandoValidacoes.set(false);
  }

  // ── A revisão: aprovar ou devolver (backend#178) ──

  readonly executando = signal<string | null>(null);
  /** A nota que está sendo devolvida — o motivo é obrigatório e é o que o produtor vai ler. */
  readonly devolvendo = signal<NotaCarteira | null>(null);
  readonly motivo = signal('');
  readonly motivoValido = computed(() => {
    const tamanho = this.motivo().trim().length;
    return tamanho >= 5 && tamanho <= 500;
  });

  esperaOEscritorio(nota: NotaCarteira): boolean {
    return nota.status === 'AGUARDANDO_APROVACAO';
  }

  /** Aprovar destrava a emissão: até aqui `gerar-xml` responde 409 `APROVACAO_EXIGIDA` a ele. */
  aprovar(nota: NotaCarteira): void {
    this.executarNaNota(nota, () => this.carteiraApi.aprovarNota(nota.produtorId, nota.id));
  }

  abrirDevolucao(nota: NotaCarteira): void {
    this.devolvendo.set(nota);
    this.motivo.set('');
  }

  fecharDevolucao(): void {
    if (this.executando()) return;
    this.devolvendo.set(null);
    this.motivo.set('');
  }

  confirmarDevolucao(): void {
    const nota = this.devolvendo();
    if (!nota || !this.motivoValido()) return;
    const motivo = this.motivo().trim();
    this.executarNaNota(nota, () =>
      this.carteiraApi.devolverNota(nota.produtorId, nota.id, motivo),
    );
  }

  /**
   * Troca o status da nota pelo que o servidor devolveu, recarrega a caixa e reconta. A resposta
   * é a nota completa da rota do cliente; a lista guarda o resumo da carteira, então só o status
   * é copiado.
   *
   * Recarregar não é zelo: aprovada ou devolvida, a nota sai de "Precisam de revisão" **no
   * servidor**, e a página seguinte (paginação por deslocamento) pularia a nota que subiu para o
   * lugar dela. A troca imediata mostra o resultado enquanto a lista nova não chega.
   */
  private executarNaNota(nota: NotaCarteira, chamada: () => Observable<NotaFiscal>): void {
    this.executando.set(nota.id);
    chamada().subscribe({
      next: (atualizada) => {
        this.executando.set(null);
        this.devolvendo.set(null);
        this.motivo.set('');
        this.notas.update((lista) =>
          lista.map((n) => (n.id === atualizada.id ? { ...n, status: atualizada.status } : n)),
        );
        this.toast.success(
          atualizada.status === 'DEVOLVIDA'
            ? `Nota ${atualizada.numero} devolvida ao produtor.`
            : `Nota ${atualizada.numero} aprovada. O produtor já pode emitir.`,
        );
        this.recarregar(true);
        this.contar(false);
      },
      error: (erro: HttpErrorResponse) => {
        this.executando.set(null);
        // O 403 tem dono: a função ASSISTENTE lê a carteira mas não aprova nota (#111).
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

  /** A DANFE do rascunho, com marca d'água, para conferir antes de aprovar. */
  verPreviaDanfe(nota: NotaCarteira): void {
    this.carteiraApi.previewDanfe(nota.produtorId, nota.id).subscribe({
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

  moeda(valor?: number | null): string {
    return (valor ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  data(iso?: string | null): string {
    if (!iso) return '—';
    const soData = /^\d{4}-\d{2}-\d{2}$/.test(iso);
    const d = new Date(soData ? `${iso}T12:00:00` : iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('pt-BR');
  }
}
