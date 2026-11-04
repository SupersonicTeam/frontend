import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { SessaoService } from '@core/services/sessao.service';
import { TAMANHO_MAXIMO_PERGUNTA, etapaDaRota } from '@core/utils/ceres';
import { apenasUltimaChecagem } from '@core/utils/validacoes';
import type { CeresResposta, RotaCeres } from '@dtos/assistente/ceres.response';
import type { NotaValidacaoResponse } from '@dtos/notas/sefaz.response';
import type { CeresUso } from '@dtos/assistente/ceres.response';
import type { AssistenteMensagem, AtalhoCeres } from '@models/assistente-mensagem.model';
import type { NotaFiscal } from '@models/nota-fiscal.model';
import {
  CeresApi,
  CeresCancelada,
  CeresError,
} from '@services/assistente/data-access/ceres.service';
import { DashboardApi } from '@services/dashboard/data-access/dashboard.service';
import { NotasApi } from '@services/notas/data-access/notas.service';

/** Quantas vezes uma pergunta é reenviada quando a Ceres está sem vaga. */
const TENTATIVAS_POR_PERGUNTA = 2;

/** Espera padrão quando o 503 `ASSISTENTE_OCUPADO` vem sem `Retry-After`. */
const ESPERA_PADRAO_SEGUNDOS = 5;

/**
 * Estado único da conversa com a **Ceres**, a assistente fiscal (issue #76).
 *
 * Existe para que a **gaveta flutuante** e a **página `/chat`** sejam a mesma
 * conversa, e não duas. Quem começa a perguntar sobre uma nota na gaveta e
 * depois abre a página continua de onde parou.
 *
 * Três regras que o contrato impõe e que vivem aqui:
 *
 * 1. **Uma pergunta por vez.** O backend responde `503 ASSISTENTE_OCUPADO` para a
 *    segunda pergunta do mesmo usuário; `podeEnviar` já barra antes de sair.
 * 2. **Reenvio único no `ASSISTENTE_OCUPADO`**, respeitando o `Retry-After`.
 * 3. **`AbortController` sempre à mão** — sair da tela ou cancelar fecha a
 *    conexão, e o backend libera a vaga.
 *
 * A Ceres **não recebe o produtor como parâmetro**: ela só enxerga os dados de
 * quem está autenticado, resolvidos no servidor. Por isso o `contexto` daqui é o
 * que a *tela* mostra sobre o produtor, não um payload — nada daqui é enviado.
 */
/**
 * O codigo da tela que o backend manda vira rota e rotulo aqui.
 *
 * Quem sabe para onde cada tela aponta e o frontend -- o backend fala em dominio (`APURACAO`),
 * nao em rota (`/tributario`). Codigo desconhecido e **ignorado**: uma tela nova do backend nao
 * pode quebrar a conversa, e um atalho que nao leva a lugar nenhum e pior que atalho nenhum.
 */
const TELAS: Record<string, { rota: string; rotulo: string }> = {
  NOTAS: { rota: '/documentos', rotulo: 'Minhas notas' },
  APURACAO: { rota: '/tributario', rotulo: 'Impostos' },
  CREDITOS: { rota: '/tributario', rotulo: 'Impostos' },
  CALENDARIO: { rota: '/calendario', rotulo: 'Prazos' },
};

function traduzirAtalhos(codigos: readonly string[] | undefined): AtalhoCeres[] {
  const vistos = new Set<string>();
  return (
    (codigos ?? [])
      .map((c) => TELAS[c])
      .filter((t): t is { rota: string; rotulo: string } => !!t)
      // CREDITOS e APURACAO levam a mesma tela: dois botoes iguais lado a lado confundem.
      .filter((t) => (vistos.has(t.rota) ? false : (vistos.add(t.rota), true)))
  );
}

@Injectable({ providedIn: 'root' })
export class AssistenteStore {
  private readonly ceres = inject(CeresApi);
  private readonly dashboardApi = inject(DashboardApi);
  private readonly notasApi = inject(NotasApi);
  private readonly sessao = inject(SessaoService);

  /** A gaveta flutuante está aberta? A página `/chat` não usa isto. */
  readonly aberto = signal(false);
  readonly mensagens = signal<AssistenteMensagem[]>([]);
  /** Cota da semana. `null` enquanto nao chegou ou quando a consulta falhou. */
  readonly uso = signal<CeresUso | null>(null);
  readonly enviando = signal(false);
  readonly entrada = signal('');

  /** Rota anunciada pelo SSE — é o que troca "pensando" por "consultando suas notas". */
  readonly rotaEmCurso = signal<RotaCeres | null>(null);
  /** Segundos de espera enquanto a Ceres está sem vaga, do `Retry-After`. */
  readonly aguardandoVaga = signal<number | null>(null);
  /** `403 PAPEL_NAO_AUTORIZADO`: a Ceres atende produtor, não contador. */
  readonly bloqueadoPorPapel = signal(false);

  /** Nota que motivou a pergunta — vira o painel da direita. */
  readonly notaEmFoco = signal<NotaFiscal | null>(null);
  readonly validacoesDaNota = signal<NotaValidacaoResponse[]>([]);

  private readonly notasPendentes = signal(0);
  private carregou = false;

  private controle: AbortController | null = null;
  private esperaDeVaga: ReturnType<typeof setTimeout> | null = null;

  readonly limiteDeCaracteres = TAMANHO_MAXIMO_PERGUNTA;

  /**
   * A Ceres só atende produtor (`403 PAPEL_NAO_AUTORIZADO`). Para o contador a
   * conversa não existe — nem a gaveta, nem o botão, nem a rota `/chat`.
   */
  readonly disponivel = computed(() => this.sessao.ehProdutor() && !this.bloqueadoPorPapel());

  /**
   * A primeira é a vitrine: "O que eu preciso saber?" cai no `resumoDoProdutor` e traz, numa
   * resposta só, atraso, prazos, notas paradas, pedidos do escritório e notas a conferir
   * (backend#266). A do feijão mostra a tabela oficial do IBS/CBS, com o artigo citado
   * (backend#283).
   */
  readonly perguntasSugeridas = [
    'O que eu preciso saber?',
    'Quanto eu tenho que pagar este mês?',
    'O que muda para mim com o IBS e o CBS?',
    'Quando vence a minha próxima guia?',
    'O feijão tem redução de IBS e CBS?',
  ];

  /**
   * Sugestões trocam quando há uma nota na tela — a pergunta passa a ser sobre ela.
   *
   * "Tem algo para conferir" vem primeiro porque a `consultarNota` devolve os sinais da
   * nota (produto que parece serviço, possível duplicidade, valor unitário fora do padrão),
   * sempre como "confira com seu contador" (backend#276).
   */
  readonly sugestoes = computed(() => {
    const nota = this.notaEmFoco();
    if (!nota) return this.perguntasSugeridas;
    return [
      `Tem algo para conferir na nota ${nota.numero}?`,
      `Por que a nota ${nota.numero} está ${this.rotuloSituacao(nota)}?`,
      `O que eu preciso corrigir na nota ${nota.numero} para emitir?`,
      `Quanto de IBS e CBS a nota ${nota.numero} gera?`,
    ];
  });

  /**
   * O que a tela mostra sobre o produtor. **Não é o corpo da requisição**: a
   * pergunta vai sozinha e a Ceres resolve o produtor pela identidade.
   */
  readonly contexto = computed(() => {
    const painel = this.dashboardApi.dashboard();
    const kpis = painel?.kpis;
    const nota = this.notaEmFoco();
    return {
      nome: painel?.produtor.nome,
      uf: painel?.produtor.uf,
      periodo: painel?.periodo,
      saldoAPagar: (kpis?.saldoIbs ?? 0) + (kpis?.saldoCbs ?? 0),
      notasPendentes: this.notasPendentes(),
      notaId: nota?.id,
      notaNumero: nota?.numero,
    };
  });

  readonly caracteresUsados = computed(() => this.entrada().trim().length);
  readonly perguntaLonga = computed(() => this.caracteresUsados() > TAMANHO_MAXIMO_PERGUNTA);

  readonly podeEnviar = computed(
    () =>
      this.caracteresUsados() > 0 && !this.perguntaLonga() && !this.enviando() && this.disponivel(),
  );

  /** Texto do indicador de progresso, na ordem em que a Ceres trabalha. */
  readonly etapa = computed<string | null>(() => {
    if (!this.enviando()) return null;

    const espera = this.aguardandoVaga();
    if (espera !== null) return `Ceres ocupada, tentando de novo em ${espera} s…`;

    const rota = this.rotaEmCurso();
    return rota ? etapaDaRota(rota) : 'Entendendo a sua pergunta…';
  });

  /**
   * Busca dashboard e notas uma vez por sessão — a gaveta abre em qualquer tela.
   *
   * Só para produtor: `/api/dashboard`, `/api/notas` e `/api/assistente/uso` derivam o produtor do
   * token e respondem 403 para o contador (#136). A gaveta já não aparece para ele, mas quem chama
   * isto não precisa saber disso.
   */
  carregarContexto(): void {
    if (this.carregou || !this.sessao.ehProdutor()) return;
    this.carregou = true;

    // A Ceres quer contexto, nao um periodo: nao pode derrubar o mes que o produtor escolheu.
    this.dashboardApi.garantirCarregado().subscribe({ error: () => undefined });
    this.notasApi.listar({ size: 50, sort: 'dataEmissao,desc' }).subscribe({
      next: (pagina) =>
        this.notasPendentes.set(
          pagina.content.filter(
            (n) => n.status === 'COM_INCONSISTENCIAS' || n.status === 'REJEITADA',
          ).length,
        ),
      error: () => this.notasPendentes.set(0),
    });
    this.ceres.uso().subscribe((u) => this.uso.set(u));
  }

  /** Recarrega a cota depois de cada pergunta -- e o unico momento em que ela muda. */
  private atualizarUso(): void {
    if (!this.sessao.ehProdutor()) return;
    this.ceres.uso().subscribe((u) => this.uso.set(u));
  }

  abrir(): void {
    this.carregarContexto();
    this.aberto.set(true);
  }

  /**
   * Abre a gaveta com a nota à direita. Se a nota tem pendência, já busca as
   * validações do backend — é dado fiscal real (`code`, `field`, `message`),
   * não texto escrito por mim.
   */
  abrirSobreNota(nota: NotaFiscal): void {
    this.notaEmFoco.set(nota);
    this.validacoesDaNota.set([]);
    if (nota.status === 'COM_INCONSISTENCIAS' || nota.status === 'REJEITADA') {
      this.notasApi.listarValidacoes(nota.id).subscribe({
        next: (lista) => this.validacoesDaNota.set(apenasUltimaChecagem(lista)),
        error: () => this.validacoesDaNota.set([]),
      });
    }
    this.abrir();
  }

  /**
   * Abre a gaveta com a pergunta já enviada — o atalho de "me explica isto aqui" das telas.
   *
   * Existe porque a tela sabe sobre o que o produtor está olhando (o período, a nota, a guia) e
   * fazê-lo redigir isso de novo é trabalho jogado fora. A pergunta entra pelo mesmo `enviar`,
   * então respeita limite de caracteres, papel e fila igual a qualquer outra.
   */
  abrirPerguntando(pergunta: string): void {
    this.abrir();
    this.enviar(pergunta);
  }

  fechar(): void {
    this.aberto.set(false);
  }

  /**
   * Esquece a conversa e o contexto. Chamado ao **sair** (trocar de perfil).
   *
   * `mensagens`, `notasPendentes` e `carregou` são estado de sessão num service `root`: sem isto,
   * a conversa de quem saiu continuava na tela para quem entrou.
   */
  limpar(): void {
    this.cancelar(false);
    this.mensagens.set([]);
    this.entrada.set('');
    this.aberto.set(false);
    this.enviando.set(false);
    this.bloqueadoPorPapel.set(false);
    this.notasPendentes.set(0);
    this.carregou = false;
    this.limparNota();
  }

  limparNota(): void {
    this.notaEmFoco.set(null);
    this.validacoesDaNota.set([]);
  }

  enviar(texto?: string): void {
    const pergunta = (texto ?? this.entrada()).trim();
    if (!pergunta || this.enviando() || !this.disponivel()) return;
    if (pergunta.length > TAMANHO_MAXIMO_PERGUNTA) return;

    this.entrada.set('');
    this.mensagens.update((lista) => [...lista, { autor: 'produtor', texto: pergunta }]);
    void this.perguntar(pergunta, TENTATIVAS_POR_PERGUNTA);
  }

  /**
   * Interrompe a pergunta em andamento. Chamado ao sair da tela (sem aviso, para
   * não deixar recado numa conversa que ninguém está vendo) e pelo botão de
   * cancelar durante a espera, que aí sim registra o desfecho.
   *
   * @param registrar deixa "Pergunta cancelada" na conversa
   */
  cancelar(registrar = true): void {
    const havia = this.enviando();

    if (this.esperaDeVaga !== null) {
      clearTimeout(this.esperaDeVaga);
      this.esperaDeVaga = null;
    }
    this.controle?.abort();
    this.controle = null;

    this.enviando.set(false);
    this.rotaEmCurso.set(null);
    this.aguardandoVaga.set(null);

    if (havia && registrar) {
      this.mensagens.update((lista) => [
        ...lista,
        { autor: 'ceres', texto: '', falha: 'CANCELADA' },
      ]);
    }
  }

  /**
   * Envia a pergunta. Usa o streaming quando o navegador sabe ler o corpo como
   * stream — é o que permite dizer *o que* a Ceres está fazendo antes de a
   * resposta chegar, que pode levar mais de um minuto. Sem isso, cai no síncrono.
   */
  private async perguntar(pergunta: string, tentativasRestantes: number): Promise<void> {
    const controle = new AbortController();
    this.controle = controle;
    this.enviando.set(true);
    this.rotaEmCurso.set(null);
    this.aguardandoVaga.set(null);

    try {
      const resposta = this.ceres.suportaStream()
        ? await this.emStream(pergunta, controle.signal)
        : await firstValueFrom(this.ceres.perguntar(pergunta));

      this.mensagens.update((lista) => [
        ...lista,
        {
          autor: 'ceres',
          texto: resposta.resposta,
          rota: resposta.rota,
          citacoes: resposta.citacoes,
          fontesDados: resposta.fontesDados,
          modoFallback: resposta.modoFallback,
          atalhos: traduzirAtalhos(resposta.atalhos),
        },
      ]);
      this.atualizarUso();
      this.encerrar(controle);
    } catch (erro) {
      if (erro instanceof CeresCancelada || controle.signal.aborted) return; // `cancelar()` cuidou.

      if (
        erro instanceof CeresError &&
        erro.codigo === 'ASSISTENTE_OCUPADO' &&
        tentativasRestantes > 1
      ) {
        this.reenviarQuandoLiberar(pergunta, erro, tentativasRestantes - 1, controle);
        return;
      }

      if (erro instanceof CeresError && erro.codigo === 'PAPEL_NAO_AUTORIZADO') {
        this.bloqueadoPorPapel.set(true);
      }

      this.mensagens.update((lista) => [
        ...lista,
        {
          autor: 'ceres',
          texto: erro instanceof CeresError ? erro.message : '',
          falha: erro instanceof CeresError ? erro.codigo : 'DESCONHECIDO',
        },
      ]);
      this.encerrar(controle);
    }
  }

  /** Consome o SSE e devolve a resposta final do evento `resposta`. */
  private async emStream(pergunta: string, sinal: AbortSignal): Promise<CeresResposta> {
    // Caixa em vez de variável solta: o TypeScript não acompanha atribuição feita
    // dentro do callback e estreitaria o tipo para `null` depois do `await`.
    const capturado: { resposta?: CeresResposta } = {};

    await this.ceres.perguntarEmStream(
      pergunta,
      (evento) => {
        if (evento.evento === 'rota') this.rotaEmCurso.set(evento.dado.rota);
        else if (evento.evento === 'resposta') capturado.resposta = evento.dado;
      },
      sinal,
    );

    if (!capturado.resposta) {
      throw new CeresError('DESCONHECIDO', 0, 'A Ceres encerrou sem enviar a resposta.');
    }
    return capturado.resposta;
  }

  /** `503 ASSISTENTE_OCUPADO`: espera o `Retry-After` e reenvia uma vez. */
  private reenviarQuandoLiberar(
    pergunta: string,
    erro: CeresError,
    tentativasRestantes: number,
    controle: AbortController,
  ): void {
    const segundos = erro.retryAfterSegundos ?? ESPERA_PADRAO_SEGUNDOS;
    this.aguardandoVaga.set(segundos);

    this.esperaDeVaga = setTimeout(() => {
      this.esperaDeVaga = null;
      if (controle.signal.aborted) return;
      void this.perguntar(pergunta, tentativasRestantes);
    }, segundos * 1000);
  }

  /** Só zera o estado se ainda for a pergunta desta tentativa. */
  private encerrar(controle: AbortController): void {
    if (this.controle !== controle) return;
    this.controle = null;
    this.enviando.set(false);
    this.rotaEmCurso.set(null);
    this.aguardandoVaga.set(null);
  }

  private rotuloSituacao(nota: NotaFiscal): string {
    if (nota.status === 'COM_INCONSISTENCIAS') return 'com inconsistência';
    if (nota.status === 'REJEITADA') return 'rejeitada';
    if (nota.status === 'RASCUNHO') return 'em rascunho';
    return 'nessa situação';
  }
}
