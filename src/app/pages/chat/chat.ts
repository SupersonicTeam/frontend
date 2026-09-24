import { Component, OnInit, inject } from '@angular/core';
import { LucideSparkles } from '@lucide/angular';
import { AssistenteConversa } from '@shared/assistente/assistente-conversa';
import { AssistenteStore } from '@shared/assistente/assistente.store';

/**
 * Assistente fiscal em tela cheia (#51) — **a casca visual**, por decisão do
 * dono do projeto.
 *
 * `POST /chat` responde 404: não há LLM nem RAG no backend (Sprint 6). Então a
 * tela monta a experiência inteira contra o contrato que o backend vai expor e
 * **não finge resposta** — ao enviar, a mensagem entra na conversa e o
 * assistente responde com a verdade, que ainda não está ligado.
 *
 * A conversa em si vive no `AssistenteStore` e é desenhada pelo
 * `AssistenteConversa`, os mesmos usados pela gaveta flutuante. Quem começa a
 * perguntar sobre uma nota na gaveta e abre esta página continua de onde parou.
 *
 * Duas decisões que valem registro:
 *
 * 1. **O contexto é real.** Antes o front mandava `estado: 'PR'` e culturas
 *    "Soja, Milho" fixas no código, enquanto o produtor é de **MT**. O painel da
 *    direita mostra exatamente o que seria enviado, vindo da API.
 * 2. **A coluna de conversas é honesta**: não há onde persistir histórico
 *    (issue #43), então ela mostra só a conversa atual e diz isso.
 */
@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [AssistenteConversa, LucideSparkles],
  // O shell (`main`) é um flex-col com rolagem própria; sem isto o host encolhe
  // até a altura do conteúdo e o campo de escrita sobe para o meio da tela.
  host: { class: 'flex min-h-0 flex-1 flex-col' },
  templateUrl: './chat.html',
})
export class ChatPage implements OnInit {
  protected readonly store = inject(AssistenteStore);

  ngOnInit(): void {
    this.store.carregarContexto();
    // Em tela cheia a gaveta não faz sentido: seria a mesma conversa duas vezes.
    this.store.fechar();
  }

  formatCurrency(valor?: number): string {
    return (valor ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  /** `2026-09` é como o backend fala; quem lê a tela entende "setembro de 2026". */
  formatPeriodo(periodo?: string): string {
    if (!periodo) return '—';
    const [ano, mes] = periodo.split('-');
    const data = new Date(Number(ano), Number(mes) - 1, 1);
    if (Number.isNaN(data.getTime())) return periodo;
    return data.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }
}
