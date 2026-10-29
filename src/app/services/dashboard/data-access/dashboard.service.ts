import { Injectable, inject, signal } from '@angular/core';
import { EMPTY, type Observable } from 'rxjs';
import { finalize, shareReplay, tap } from 'rxjs';
import { ApiService } from '@core/services/api.service';
import type { DashboardResponse } from '@dtos/dashboard/dashboard.response';

/**
 * O painel do produtor (`GET /api/dashboard`).
 *
 * ## Por que os rascunhos saíram (issue #107)
 *
 * Havia seis métodos para `/dashboard/rascunhos/*`, cada um com `catchError(() => of(null))` ou
 * `of([])`. Conferido em 28/10: **a rota não existe no backend** — não há nada em
 * `br.com.agrocontabil` que a sirva, e o servidor responde 404. Nenhum deles tinha chamador.
 *
 * Eram fallbacks escondendo um 404 permanente: a tela nunca saberia que pediu algo inexistente.
 * Apagar é melhor do que consertar o tratamento de erro de uma chamada que não deveria acontecer.
 *
 * ## Por que há controle de concorrência aqui (issue #114)
 *
 * Quatro lugares chamam este service, e só um deles se importa com período: a página do painel. Os
 * outros três — a topbar (nome do produtor), a store da Ceres (contexto) e Configurações — só
 * querem *algum* painel carregado.
 *
 * Os três já tentavam ser educados com `if (!dashboardApi.dashboard())`. **Não bastava**: esse
 * guard olha o resultado, não se já existe pedido em voo. O `AppLayout` e a `DashboardPage` montam
 * no mesmo tick, nenhuma resposta voltou ainda, as duas veem `null` e as duas disparam — medido no
 * navegador em 29/10: **dois `GET /api/dashboard` em toda abertura do painel**.
 *
 * Pior que o desperdício era o efeito no número da tela. Todos escrevem no **mesmo signal**, e os
 * três de fora pedem **sem período**. Então bastava a topbar responder depois de o produtor
 * escolher "Setembro" para os KPIs voltarem calados ao padrão do backend, com o seletor ainda
 * dizendo Setembro. É esse o "período inconsistente" da issue.
 *
 * Duas regras resolvem, e elas moram aqui porque o estado compartilhado é daqui:
 *
 * 1. **Pedido igual em voo não vira pedido novo** (`emVoo`, por período).
 * 2. **Quem não pediu período nunca sobrescreve quem pediu** (`garantirCarregado`), e resposta
 *    atrasada não passa à frente da mais recente (`sequencia`/`aceita`) — é o que preserva a
 *    correção da #108 agora que o `switchMap` da página não é mais o único a cancelar.
 */
@Injectable({ providedIn: 'root' })
export class DashboardApi {
  private readonly api = inject(ApiService);

  private readonly dashboardSignal = signal<DashboardResponse | null>(null);
  /** Último `DashboardResponse` carregado (cache local — sobrevive à re-navegação). */
  readonly dashboard = this.dashboardSignal.asReadonly();

  /** Pedidos em voo, por período. A chave `''` é o pedido sem período. */
  private readonly emVoo = new Map<string, Observable<DashboardResponse>>();

  /** Ordem de chegada: resposta de um pedido mais velho não sobrescreve a de um mais novo. */
  private sequencia = 0;
  private aceita = 0;

  /**
   * `GET /api/dashboard` — o agregador (KPIs IBS/CBS, notas por mês, distribuição de impostos e
   * últimas notas do produtor autenticado). `periodo` opcional (`AAAA-MM`); omitido, o backend usa
   * o mês corrente.
   *
   * **Sem tratamento de erro aqui, de propósito:** quem chama decide o estado de erro e o retry.
   * Nunca houve fallback mock neste método, e é o modelo que o resto do service passou a seguir.
   *
   * Dois subscribes para o mesmo período, com o primeiro ainda em voo, compartilham **uma**
   * requisição.
   *
   * O `refCount: true` é deliberado e faz as duas coisas certas ao mesmo tempo: quando a página
   * troca de mês e o `switchMap` cancela, se ela era a única interessada a requisição é **abortada
   * de verdade** (é a garantia da #108, e há teste para isso); mas se a topbar estiver pendurada
   * no mesmo período, a contagem não zera e o pedido dela sobrevive ao cancelamento da página.
   */
  carregar(periodo?: string): Observable<DashboardResponse> {
    const chave = periodo ?? '';
    const jaEmVoo = this.emVoo.get(chave);
    if (jaEmVoo) return jaEmVoo;

    const minhaVez = ++this.sequencia;
    const pedido = this.api
      .get<DashboardResponse>('/dashboard', periodo ? { periodo } : undefined)
      .pipe(
        tap((res) => this.guardar(res, minhaVez)),
        finalize(() => this.emVoo.delete(chave)),
        shareReplay({ bufferSize: 1, refCount: true }),
      );

    this.emVoo.set(chave, pedido);
    return pedido;
  }

  /**
   * Para quem só precisa que **algum** painel exista — o nome do produtor na topbar, o contexto da
   * Ceres, Configurações.
   *
   * Não compete com a página: se já há painel carregado ou pedido em voo, aproveita; e a resposta
   * dela **nunca** sobrescreve um painel que alguém pediu com período, porque não entra na fila de
   * `sequencia`. Sem isso, a topbar terminando de carregar depois de o produtor escolher um mês
   * jogava os KPIs de volta para o padrão do backend.
   */
  garantirCarregado(): Observable<DashboardResponse> {
    if (this.dashboardSignal()) return EMPTY;
    // Qualquer período serve: quem chama aqui só quer o produtor, não um mês. Pegar carona no que
    // já está em voo é o que impede a segunda requisição quando duas telas sobem juntas.
    const qualquerEmVoo = this.emVoo.values().next().value;
    if (qualquerEmVoo) return qualquerEmVoo;

    const pedido = this.api
      .get<DashboardResponse>('/dashboard')
      .pipe(
        // `0` nunca vence uma `sequencia` real: este pedido só preenche o vazio.
        tap((res) => this.guardar(res, 0)),
        finalize(() => this.emVoo.delete('')),
        shareReplay({ bufferSize: 1, refCount: true }),
      );

    this.emVoo.set('', pedido);
    return pedido;
  }

  /**
   * Esquece o painel carregado. Chamado ao **sair** (trocar de perfil).
   *
   * O signal é `providedIn: 'root'` e sobrevive à troca: medido em 29/10, entrando como produtor,
   * saindo e entrando como contador **sem recarregar a página**, a topbar do escritório exibia
   * "Atendendo João da Silva Produtor" — o nome que sobrou da sessão anterior. Pior que mostrar
   * nada: parece dado, então se acredita nele.
   */
  limpar(): void {
    this.dashboardSignal.set(null);
    this.emVoo.clear();
    this.sequencia = 0;
    this.aceita = 0;
  }

  /** Só escreve se este pedido ainda for o mais recente — ou se não houver nada escrito. */
  private guardar(res: DashboardResponse, minhaVez: number): void {
    if (minhaVez === 0) {
      if (this.aceita > 0) return;
      this.dashboardSignal.set(res);
      return;
    }
    if (minhaVez < this.aceita) return;
    this.aceita = minhaVez;
    this.dashboardSignal.set(res);
  }
}
