import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { AssistenteConversa } from '@shared/assistente/assistente-conversa';
import { CeresAvatar } from '@shared/assistente/ceres-avatar';
import { AssistenteStore } from '@shared/assistente/assistente.store';

/**
 * A **Ceres** em tela cheia (#51, ligada ao backend na #76): conversas à
 * esquerda, conversa no meio, o que ela vê do produtor à direita.
 *
 * A conversa vive no `AssistenteStore` e é desenhada pelo `AssistenteConversa`,
 * os mesmos usados pela gaveta flutuante. Quem começa a perguntar sobre uma nota
 * na gaveta e abre esta página continua de onde parou.
 *
 * Duas decisões que valem registro:
 *
 * 1. **O painel da direita não é o payload.** A Ceres recebe apenas a pergunta;
 *    quem ela é e o que pode ver sai da identidade da requisição, no servidor
 *    (RN007). O painel mostra os mesmos números do dashboard para quem lê a tela
 *    saber de que operação a resposta está falando.
 * 2. **A coluna de conversas é honesta**: não há onde persistir histórico
 *    (issue #43), então ela mostra só a conversa atual e diz isso.
 *
 * Sair da tela aborta a pergunta em andamento (`AbortController`), como o
 * contrato pede — o backend percebe a saída, interrompe e libera a vaga. Só não
 * aborta se a gaveta estiver aberta: aí a mesma conversa continua visível.
 */
@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [AssistenteConversa, CeresAvatar],
  // O shell (`main`) é um flex-col com rolagem própria; sem isto o host encolhe
  // até a altura do conteúdo e o campo de escrita sobe para o meio da tela.
  host: { class: 'flex min-h-0 flex-1 flex-col' },
  templateUrl: './chat.html',
})
export class ChatPage implements OnInit, OnDestroy {
  protected readonly store = inject(AssistenteStore);

  ngOnInit(): void {
    this.store.carregarContexto();
    // Em tela cheia a gaveta não faz sentido: seria a mesma conversa duas vezes.
    this.store.fechar();
  }

  ngOnDestroy(): void {
    if (!this.store.aberto()) this.store.cancelar(false);
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
