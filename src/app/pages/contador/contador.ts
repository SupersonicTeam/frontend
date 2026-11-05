import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, map, switchMap } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  LucideChevronRight,
  LucideCircleCheck,
  LucideFileWarning,
  LucideHandCoins,
  LucideInbox,
  LucideSearch,
  LucideStamp,
  LucideTriangleAlert,
  LucideUsers,
} from '@lucide/angular';
import { CarteiraApi } from '@services/contador/data-access/carteira.service';
import {
  type AtencaoCarteira,
  type OrdemCarteira,
  type ProdutorCarteira,
  type SituacaoVinculo,
  totalDeAtencao,
} from '@models/carteira.model';
import { UiButton } from '@shared/ui/ui-button';
import { ConvitesCarteira } from './convites-carteira';
import { UiEmptyState } from '@shared/ui/ui-empty-state';
import { UiSkeleton } from '@shared/ui/ui-skeleton';
import { formatarCpfCnpj } from '@core/utils/mascaras';

/** Espera antes de consultar o servidor enquanto o contador digita. */
const DEBOUNCE_BUSCA_MS = 300;

/** Mínimo que o servidor aceita em `busca` por trecho de nome; menos que isso é 400. */
const MINIMO_BUSCA = 3;

/** Um indicador de atenção pronto para a tela: rótulo, contagem e para onde ele leva. */
export interface SinalDeAtencao {
  chave: keyof AtencaoCarteira;
  /**
   * Em linguagem de trabalho, não o nome do campo — e já no número certo.
   *
   * O plural é escrito, não derivado com um "s" no fim: "nota com inconsistência" pluraliza no
   * **substantivo** ("notas com inconsistência"), e "vence em até 7 dias" não pluraliza nunca.
   */
  rotulo: string;
  quantidade: number;
  /** Abre a tela do cliente já focada neste trabalho. */
  foco: string;
  /** Severidade visual: o que custa dinheiro hoje pesa mais que o que vence depois. */
  tom: 'perigo' | 'aviso' | 'info';
}

/**
 * Ordem fixa dos indicadores — é a ordem em que o contador trabalha, não a do contrato.
 *
 * Guia vencida primeiro porque já está rendendo multa e juros; nota com inconsistência depois,
 * porque trava a emissão; aprovação e documentos por último, que dependem de ida e volta.
 */
const SINAIS: readonly (Omit<SinalDeAtencao, 'quantidade' | 'rotulo'> & {
  singular: string;
  plural: string;
})[] = [
  {
    chave: 'guiasVencidas',
    singular: 'guia vencida',
    plural: 'guias vencidas',
    foco: 'guias',
    tom: 'perigo',
  },
  {
    chave: 'notasComInconsistencia',
    singular: 'nota com inconsistência',
    plural: 'notas com inconsistência',
    foco: 'inconsistencia',
    tom: 'perigo',
  },
  {
    chave: 'notasAguardandoAprovacao',
    singular: 'nota esperando a sua aprovação',
    plural: 'notas esperando a sua aprovação',
    foco: 'aprovacao',
    tom: 'aviso',
  },
  {
    chave: 'vencimentosProximos7Dias',
    singular: 'vence em até 7 dias',
    plural: 'vencem em até 7 dias',
    foco: 'guias',
    tom: 'aviso',
  },
  {
    chave: 'pendenciasEnviadas',
    singular: 'documento esperando conferência',
    plural: 'documentos esperando conferência',
    foco: 'documentos',
    tom: 'info',
  },
];

/**
 * Acompanhamento do contador — **a triagem da carteira** (backend#177, frontend#95).
 *
 * ## Por que a tela mudou de pergunta
 *
 * Até aqui esta tela mostrava, para um produtor só: o que impede fechar o mês, os números do mês e
 * um atalho para a cobrança. Era honesta, mas **repetia as outras três abas** — as notas com
 * problema são a aba de Notas, a guia vencida é a de Prazos, a apuração é a de Fechamento. Repetia
 * porque com um cliente só não há pergunta que seja desta tela.
 *
 * A carteira dá a pergunta: **quais dos meus clientes estão com problema, e qual eu atendo
 * primeiro.** Essa não é respondível em nenhuma outra aba, e é o ponto 1 da lista do grupo.
 *
 * Então os blocos de um produtor saíram daqui e o trabalho de um cliente mora em
 * `/contador/{produtorId}`. Esta tela ficou com a fila; aquela, com o atendimento.
 *
 * ## O que a tela não faz, e por quê
 *
 * Não mostra apuração nem relatório de conformidade. Eles têm rota por cliente desde a
 * backend#255 e moram no Fechamento (`/tributario`), que escolhe o cliente no topo (#136). Esta
 * tela é a fila: quem precisa de atenção, não os números de cada um.
 *
 * ## A lição que esta tela já aprendeu uma vez
 *
 * `aindaNaoSabe()` existe porque a versão anterior afirmava "nada impede fechar setembro" no
 * instante em que abria — a lista começa vazia, e vazio é exatamente o que uma soma zero entende
 * como "tudo certo". Um segundo depois o problema chegava e a tela se contradizia. Dizer "está
 * tudo bem" e voltar atrás é pior do que não dizer nada: o contador já fechou a aba.
 */
@Component({
  selector: 'app-contador',
  standalone: true,
  imports: [
    ConvitesCarteira,
    LucideChevronRight,
    LucideCircleCheck,
    LucideFileWarning,
    LucideHandCoins,
    LucideInbox,
    LucideSearch,
    LucideStamp,
    LucideTriangleAlert,
    LucideUsers,
    RouterLink,
    UiButton,
    UiEmptyState,
    UiSkeleton,
  ],
  templateUrl: './contador.html',
})
export class ContadorPage {
  private readonly carteiraApi = inject(CarteiraApi);

  // ── Filtros ──
  readonly busca = signal('');
  /**
   * Abre **desligado**. A fila já vem ordenada por urgência, então quem precisa de atenção está no
   * topo de qualquer forma; esconder o resto por padrão faria o contador perder a noção do tamanho
   * da carteira — e um escritório com tudo em dia veria uma tela vazia sem entender por quê.
   */
  readonly somenteAtencao = signal(false);
  readonly ordem = signal<OrdemCarteira>('urgencia');
  /**
   * Ativos por padrão (o padrão do servidor). Os suspensos precisam ser alcançáveis: é na ficha
   * deles que o administrador reativa ou encerra o vínculo (#147).
   */
  readonly situacao = signal<SituacaoVinculo>('ATIVO');

  // ── Resposta ──
  private readonly pagina = signal<{ itens: ProdutorCarteira[]; total: number } | null>(null);
  readonly carregando = signal(true);
  readonly erro = signal(false);

  readonly clientes = computed(() => this.pagina()?.itens ?? []);
  readonly total = computed(() => this.pagina()?.total ?? 0);

  /**
   * A tela ainda não tem resposta do servidor. Enquanto for verdade, nenhuma afirmação sobre o
   * estado da carteira pode aparecer.
   */
  readonly aindaNaoSabe = computed(() => this.pagina() === null && !this.erro());

  readonly quantosPedemAtencao = computed(
    () => this.clientes().filter((c) => totalDeAtencao(c.atencao) > 0).length,
  );

  /** Carteira inteira sem nenhum indicador — e já sabida. */
  readonly carteiraEmDia = computed(
    () => !this.aindaNaoSabe() && this.clientes().length > 0 && this.quantosPedemAtencao() === 0,
  );

  /** O filtro de busca só chega ao servidor com três caracteres; menos que isso ele recusa. */
  private readonly buscaEfetiva = computed(() => {
    const texto = this.busca().trim();
    return texto.length >= MINIMO_BUSCA ? texto : undefined;
  });

  readonly buscaCurta = computed(() => {
    const texto = this.busca().trim();
    return texto.length > 0 && texto.length < MINIMO_BUSCA;
  });

  private readonly gatilho = new Subject<void>();

  constructor() {
    this.gatilho
      .pipe(
        map(() => ({
          busca: this.buscaEfetiva(),
          precisaAtencao: this.somenteAtencao() ? true : undefined,
          sort: this.ordem(),
          situacao: this.situacao(),
        })),
        // Dois filtros diferentes que produzem a mesma consulta não gastam requisição: digitar
        // "jo" e apagar volta ao mesmo pedido de antes.
        distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
        debounceTime(DEBOUNCE_BUSCA_MS),
        switchMap((filtro) => {
          this.carregando.set(true);
          this.erro.set(false);
          return this.carteiraApi.listar(filtro);
        }),
        takeUntilDestroyed(),
      )
      .subscribe({
        next: (pagina) => {
          this.pagina.set(pagina);
          this.carregando.set(false);
        },
        error: () => {
          this.erro.set(true);
          this.carregando.set(false);
        },
      });

    // A primeira carga não espera o debounce: a tela abre pedindo.
    this.carteiraApi.listar({ sort: this.ordem() }).subscribe({
      next: (pagina) => {
        this.pagina.set(pagina);
        this.carregando.set(false);
      },
      error: () => {
        this.erro.set(true);
        this.carregando.set(false);
      },
    });

    // A primeira execução do effect é só para registrar as dependências: a carga inicial já foi
    // pedida acima, sem debounce. Sem este `primeira` a tela abriria pedindo duas vezes.
    let primeira = true;
    effect(() => {
      // Lê os três para registrar a dependência; o valor é montado no `map` acima.
      this.buscaEfetiva();
      this.somenteAtencao();
      this.ordem();
      this.situacao();
      if (primeira) {
        primeira = false;
        return;
      }
      this.gatilho.next();
    });
  }

  /** Um cliente ativo com todos os indicadores em zero. */
  estaEmDia(cliente: ProdutorCarteira): boolean {
    return cliente.atencao !== null && totalDeAtencao(cliente.atencao) === 0;
  }

  /**
   * Os indicadores deste cliente que estão acima de zero, na ordem de trabalho.
   *
   * Zero **não aparece**. Um "0 guias vencidas" cinza ao lado de um "2 notas" vermelho obriga o
   * contador a ler os dois para descobrir que só um importa.
   */
  sinaisDe(cliente: ProdutorCarteira): SinalDeAtencao[] {
    const atencao = cliente.atencao;
    if (!atencao) return [];
    return SINAIS.filter((s) => atencao[s.chave] > 0).map(({ singular, plural, ...s }) => ({
      ...s,
      quantidade: atencao[s.chave],
      rotulo: atencao[s.chave] === 1 ? singular : plural,
    }));
  }

  /** Rótulo da situação do vínculo, para quem não está ativo. */
  rotuloSituacao(cliente: ProdutorCarteira): string {
    switch (cliente.situacaoVinculo) {
      case 'SUSPENSO':
        return 'Suspenso — o escritório não alcança os dados dele';
      case 'ENCERRADO':
        return 'Encerrado — histórico; atender de novo exige convite novo';
      default:
        return '';
    }
  }

  /** Documento e praça, quando o backend os manda (ele omite em vínculo encerrado). */
  identificacao(cliente: ProdutorCarteira): string {
    // O documento vem só com dígitos; sem a máscara saía "34524970894" (#156).
    return [formatarCpfCnpj(cliente.cpfCnpj), cliente.regime, cliente.uf]
      .filter(Boolean)
      .join(' · ');
  }

  limparBusca(): void {
    this.busca.set('');
  }

  recarregar(): void {
    this.gatilho.next();
  }
}
