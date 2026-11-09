import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SessaoService } from './sessao.service';
import { NotificacoesService } from './notificacoes.service';
import { ClienteEmFocoService } from './cliente-em-foco.service';
import { ToastService } from './toast.service';
import { AuthApi } from '@services/auth/data-access/auth.service';
import { DashboardApi } from '@services/dashboard/data-access/dashboard.service';
import {
  CHAVE_TOKEN_CONVITE_EQUIPE,
  EscritorioApi,
} from '@services/escritorio/data-access/escritorio.service';
import { AssistenteStore } from '@shared/assistente/assistente.store';

/** Por que a sessão acabou — muda o que se diz ao usuário, não o que se limpa. */
export type MotivoDaSaida = 'pedido' | 'expirada';

/**
 * **Sair** — um lugar só, porque há dois caminhos de saída (issue #93).
 *
 * O usuário clica em "Sair", **ou** a renovação falha e a sessão morre sem ele pedir. Antes da #93
 * só o primeiro existia, e a limpeza morava no `AppLayout`; agora o `authInterceptor` também
 * precisa encerrar — e duas listas de caches para limpar significa uma delas desatualizada.
 *
 * ## Limpar cache não é zelo: já vazou
 *
 * Os services de dados são `providedIn: 'root'` e **sobrevivem à troca de usuário** — o Angular
 * não os recria, porque a aplicação não recarrega. Sem esta limpeza, o painel e a conversa de quem
 * saiu seguiam em memória para quem entrou: era assim que a topbar do contador exibia o nome do
 * produtor da sessão anterior.
 *
 * Então aqui ficam **todos** os caches com dado de usuário. Ao criar um service `root` que guarde
 * resposta do servidor em signal, acrescente-o a esta lista. **Exceção:** o `EscritorioDoHostService`
 * (#175) fica de fora: ele guarda o escritório do **endereço**, público e igual para qualquer
 * visitante, e não da sessão. Limpo aqui, o `/login` do subdomínio perderia a marca, porque ele só é
 * resolvido na carga da página. A lista:
 *
 * - `DashboardApi` — KPIs, notas e o **nome do produtor** (a origem do vazamento acima);
 * - `AssistenteStore` — a conversa com a Ceres, que é dado do usuário por definição;
 * - `NotificacoesService` — o sino, carregado da fonte do papel anterior;
 * - `AuthApi` — a identidade resolvida e as requisições em voo;
 * - `ClienteEmFocoService` — o cliente da carteira que o contador atendia (#136). É só um id, mas
 *   de um cliente de **outro** escritório: não pode virar o ponto de partida de quem entra;
 * - `EscritorioApi` — o escritório e a função de quem estava logado (#148), guardados em cache:
 *   sem limpar, quem entra herdaria os botões de administrador de quem saiu.
 *
 * Os outros services de `@services/*` não guardam estado: buscam e devolvem.
 */
@Injectable({ providedIn: 'root' })
export class EncerramentoService {
  private readonly router = inject(Router);
  private readonly sessao = inject(SessaoService);
  private readonly toast = inject(ToastService);
  private readonly authApi = inject(AuthApi);
  private readonly dashboardApi = inject(DashboardApi);
  private readonly assistenteStore = inject(AssistenteStore);
  private readonly notificacoes = inject(NotificacoesService);
  private readonly clienteEmFoco = inject(ClienteEmFocoService);
  private readonly escritorioApi = inject(EscritorioApi);

  /**
   * Encerra a sessão e volta ao `/login`.
   *
   * Avisa o servidor primeiro (para o refresh ser revogado de verdade), mas **não espera** por ele
   * para limpar: `AuthApi.sair()` nunca falha para quem chama, e a saída local acontece de
   * qualquer forma. A ordem importa num ponto — o `POST /auth/logout` precisa sair **antes** de o
   * token ser descartado, porque é o cookie desta sessão que ele revoga.
   */
  encerrar(motivo: MotivoDaSaida = 'pedido'): void {
    this.authApi.sair().subscribe();

    this.dashboardApi.limpar();
    this.assistenteStore.limpar();
    this.notificacoes.limpar();
    this.clienteEmFoco.limpar();
    this.escritorioApi.limpar();
    // O token de um convite de equipe aberto nesta aba e de quem estava aqui, nao de quem entra.
    try {
      sessionStorage.removeItem(CHAVE_TOKEN_CONVITE_EQUIPE);
    } catch {
      // Navegacao privada pode recusar o storage; nao ha o que limpar.
    }
    this.authApi.limpar();
    this.sessao.encerrar();

    if (motivo === 'expirada') {
      // Sem isto a pessoa é jogada no /login no meio de uma tarefa sem saber por quê.
      this.toast.error('Sua sessão expirou. Entre de novo para continuar.');
    }

    void this.router.navigateByUrl('/login');
  }
}
