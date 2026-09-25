import { Injectable, computed, inject, signal } from '@angular/core';
import { LOGGED_PRODUCER_ID } from '@core/config/produtor-logado';
import type { NotaValidacaoResponse } from '@dtos/notas/sefaz.response';
import type { ChatMessage } from '@models/chat-message.model';
import type { NotaFiscal } from '@models/nota-fiscal.model';
import { apenasUltimaChecagem } from '@core/utils/validacoes';
import { AssistenteIndisponivelError, ChatApi } from '@services/chat/data-access/chat.service';
import { DashboardApi } from '@services/dashboard/data-access/dashboard.service';
import { NotasApi } from '@services/notas/data-access/notas.service';

/**
 * Estado único da conversa com o assistente.
 *
 * Existe para que a **gaveta flutuante** e a **página `/chat`** sejam a mesma
 * conversa, e não duas. Quem começa a perguntar sobre uma nota na gaveta e
 * depois abre a página continua de onde parou — que é o comportamento que o
 * dono do projeto pediu ao descrever o assistente "que nem o do Claude".
 *
 * O contexto enviado é sempre o real (produtor, UF, período, saldo, pendências),
 * mais a nota em foco quando a pergunta parte de uma nota específica. Nada aqui
 * inventa resposta: `/chat` não existe no backend e o erro é propagado para a
 * interface dizer isso com todas as letras.
 */
@Injectable({ providedIn: 'root' })
export class AssistenteStore {
  private readonly chatApi = inject(ChatApi);
  private readonly dashboardApi = inject(DashboardApi);
  private readonly notasApi = inject(NotasApi);

  /** A gaveta flutuante está aberta? A página `/chat` não usa isto. */
  readonly aberto = signal(false);
  readonly mensagens = signal<ChatMessage[]>([]);
  readonly enviando = signal(false);
  readonly entrada = signal('');

  /** Nota que motivou a pergunta — vira o painel da direita. */
  readonly notaEmFoco = signal<NotaFiscal | null>(null);
  readonly validacoesDaNota = signal<NotaValidacaoResponse[]>([]);

  private readonly notasPendentes = signal(0);
  private carregou = false;

  readonly perguntasSugeridas = [
    'Quanto eu tenho que pagar este mês?',
    'O que muda para mim com o IBS e o CBS?',
    'Posso aproveitar crédito das minhas compras?',
  ];

  /** Sugestões trocam quando há uma nota na tela — a pergunta passa a ser sobre ela. */
  readonly sugestoes = computed(() => {
    const nota = this.notaEmFoco();
    if (!nota) return this.perguntasSugeridas;
    return [
      `Por que a nota ${nota.numero} está ${this.rotuloSituacao(nota)}?`,
      'O que eu preciso corrigir para emitir?',
      'Quanto de IBS e CBS essa nota gera?',
    ];
  });

  readonly contexto = computed(() => {
    const painel = this.dashboardApi.dashboard();
    const kpis = painel?.kpis;
    const nota = this.notaEmFoco();
    return {
      produtorId: LOGGED_PRODUCER_ID,
      nome: painel?.produtor.nome,
      uf: painel?.produtor.uf,
      periodo: painel?.periodo,
      saldoAPagar: (kpis?.saldoIbs ?? 0) + (kpis?.saldoCbs ?? 0),
      notasPendentes: this.notasPendentes(),
      notaId: nota?.id,
      notaNumero: nota?.numero,
    };
  });

  readonly podeEnviar = computed(() => this.entrada().trim().length > 0 && !this.enviando());

  /** Busca dashboard e notas uma vez por sessão — a gaveta abre em qualquer tela. */
  carregarContexto(): void {
    if (this.carregou) return;
    this.carregou = true;

    this.dashboardApi.carregar().subscribe({ error: () => undefined });
    this.notasApi.listar({ size: 50, sort: 'dataEmissao,desc' }).subscribe({
      next: (pagina) =>
        this.notasPendentes.set(
          pagina.content.filter(
            (n) => n.status === 'COM_INCONSISTENCIAS' || n.status === 'REJEITADA',
          ).length,
        ),
      error: () => this.notasPendentes.set(0),
    });
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

  fechar(): void {
    this.aberto.set(false);
  }

  limparNota(): void {
    this.notaEmFoco.set(null);
    this.validacoesDaNota.set([]);
  }

  enviar(texto?: string): void {
    const mensagem = (texto ?? this.entrada()).trim();
    if (!mensagem || this.enviando()) return;

    this.entrada.set('');
    this.mensagens.update((lista) => [...lista, { role: 'user', content: mensagem }]);
    this.enviando.set(true);

    this.chatApi
      .enviarMensagem({
        mensagem,
        contexto: this.contexto(),
        history: this.mensagens().map((m) => ({ role: m.role, content: m.content })),
      })
      .subscribe({
        next: (res) => {
          this.enviando.set(false);
          this.mensagens.update((lista) => [
            ...lista,
            { role: 'assistant', content: res.resposta },
          ]);
        },
        error: (erro) => {
          this.enviando.set(false);
          // Nada de resposta simulada: a interface diz o que de fato aconteceu.
          this.mensagens.update((lista) => [
            ...lista,
            {
              role: 'assistant',
              content:
                erro instanceof AssistenteIndisponivelError
                  ? 'INDISPONIVEL'
                  : 'Houve uma falha ao falar com o assistente. Tente de novo em instantes.',
            },
          ]);
        },
      });
  }

  private rotuloSituacao(nota: NotaFiscal): string {
    if (nota.status === 'COM_INCONSISTENCIAS') return 'com inconsistência';
    if (nota.status === 'REJEITADA') return 'rejeitada';
    if (nota.status === 'RASCUNHO') return 'em rascunho';
    return 'nessa situação';
  }
}
