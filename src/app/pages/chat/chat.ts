import { Component, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import {
  LucideBookOpen,
  LucideSend,
  LucideSparkles,
  LucideTriangleAlert,
  LucideUser,
} from '@lucide/angular';
import { LOGGED_PRODUCER_ID } from '@core/config/produtor-logado';
import type { ChatMessage } from '@models/chat-message.model';
import { AssistenteIndisponivelError, ChatApi } from '@services/chat/data-access/chat.service';
import { DashboardApi } from '@services/dashboard/data-access/dashboard.service';
import { NotasApi } from '@services/notas/data-access/notas.service';
import { UiButton } from '@shared/ui/ui-button';

/**
 * Assistente fiscal (#51) — **a casca visual**, por decisão do dono do projeto.
 *
 * `POST /chat` responde 404: não há LLM nem RAG no backend (issues #36 e #37 do
 * board, Sprint 6). Então esta tela monta a experiência inteira contra o contrato
 * que o backend vai expor, e **não finge resposta**: ao enviar, a mensagem entra
 * na conversa e o assistente responde com a verdade — que ainda não está ligado.
 *
 * Três decisões que valem registro:
 *
 * 1. **O contexto agora é real.** Antes o front mandava `estado: 'PR'` e culturas
 *    "Soja, Milho" fixas no código, enquanto o produtor é de **MT**. O painel da
 *    direita mostra exatamente o que seria enviado — nome, UF, período, saldo a
 *    pagar e notas pendentes, tudo vindo da API.
 * 2. **A coluna de conversas existe mas é honesta**: não há onde persistir
 *    histórico (issue #43), então ela mostra só a conversa atual e diz isso.
 * 3. **O espaço da citação de fonte** está reservado na resposta. O RAG do TCC
 *    prevê citar a legislação, e a interface precisa ter onde mostrar.
 */
@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [LucideBookOpen, LucideSend, LucideSparkles, LucideTriangleAlert, LucideUser, UiButton],
  // O shell (`main`) e um flex-col com rolagem propria; sem isto o host encolhe ate
  // a altura do conteudo e o campo de escrita sobe para o meio da tela.
  host: { class: 'flex min-h-0 flex-1 flex-col' },
  templateUrl: './chat.html',
})
export class ChatPage implements OnInit {
  private readonly chatApi = inject(ChatApi);
  private readonly dashboardApi = inject(DashboardApi);
  private readonly notasApi = inject(NotasApi);

  private readonly fimDaConversa = viewChild<ElementRef<HTMLDivElement>>('fimDaConversa');

  readonly entrada = signal('');
  readonly enviando = signal(false);
  readonly mensagens = signal<ChatMessage[]>([]);
  readonly notasPendentes = signal(0);

  readonly perguntasSugeridas = [
    'Quanto eu tenho que pagar este mês?',
    'Por que a nota 7 não pode ser emitida?',
    'O que muda para mim com o IBS e o CBS?',
    'Posso aproveitar crédito das minhas compras?',
  ];

  /** O que seria enviado ao assistente — mostrado na tela, sem nada inventado. */
  readonly contexto = computed(() => {
    const painel = this.dashboardApi.dashboard();
    const kpis = painel?.kpis;
    return {
      produtorId: LOGGED_PRODUCER_ID,
      nome: painel?.produtor.nome,
      uf: painel?.produtor.uf,
      periodo: painel?.periodo,
      saldoAPagar: (kpis?.saldoIbs ?? 0) + (kpis?.saldoCbs ?? 0),
      notasPendentes: this.notasPendentes(),
    };
  });

  readonly podeEnviar = computed(() => this.entrada().trim().length > 0 && !this.enviando());

  ngOnInit(): void {
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

  enviar(texto?: string): void {
    const mensagem = (texto ?? this.entrada()).trim();
    if (!mensagem || this.enviando()) return;

    this.entrada.set('');
    this.mensagens.update((lista) => [...lista, { role: 'user', content: mensagem }]);
    this.enviando.set(true);
    this.rolarParaOFim();

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
          this.rolarParaOFim();
        },
        error: (erro) => {
          this.enviando.set(false);
          // Nada de resposta simulada: a tela diz o que de fato aconteceu.
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
          this.rolarParaOFim();
        },
      });
  }

  aoTeclar(evento: KeyboardEvent): void {
    if (evento.key === 'Enter' && !evento.shiftKey) {
      evento.preventDefault();
      this.enviar();
    }
  }

  private rolarParaOFim(): void {
    setTimeout(() => {
      try {
        this.fimDaConversa()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'end' });
      } catch {
        /* rolagem é conveniência, não pode quebrar a tela */
      }
    }, 0);
  }

  formatCurrency(valor?: number): string {
    return (valor ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  /** `2026-09` e como o backend fala; quem le a tela entende "setembro de 2026". */
  formatPeriodo(periodo?: string): string {
    if (!periodo) return '—';
    const [ano, mes] = periodo.split('-');
    const data = new Date(Number(ano), Number(mes) - 1, 1);
    if (Number.isNaN(data.getTime())) return periodo;
    return data.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }
}
