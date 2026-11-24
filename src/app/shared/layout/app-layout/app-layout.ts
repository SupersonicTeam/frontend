import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import {
  LucideMenu,
  LucideX,
  LucideBell,
  LucideCheck,
  LucideTrash2,
  LucideSettings,
  LucideLayoutDashboard,
  LucideCalendar,
  LucideFileText,
  LucideMessageSquare,
  LucideCalculator,
  LucideReceipt,
  LucideLogOut,
  LucideSparkles,
  LucideClipboardList,
  LucideUsers,
  LucideListChecks,
  LucideBuilding2,
  LucideDynamicIcon,
  type LucideIcon,
} from '@lucide/angular';
import { NotificacoesService } from '@core/services/notificacoes.service';
import { SessaoService } from '@core/services/sessao.service';
import { EncerramentoService } from '@core/services/encerramento.service';
import { HttpErrorResponse } from '@angular/common/http';
import { EscritorioDoHostService } from '@core/services/escritorio-do-host.service';
import { EscritorioApi } from '@services/escritorio/data-access/escritorio.service';
import { MENSAGEM_SEM_ESCRITORIO, ehSemEscritorio } from '@core/interceptors/api.interceptor';
import {
  DOMINIO_BASE,
  ENDERECO_PROPRIO_NO_AR,
  LOCALIZACAO_ATUAL,
  avisoDeOutroEndereco,
  semProtocolo,
  urlDoHost,
} from '@core/utils/host-escritorio';
import { AssistenteDrawer } from '@shared/assistente/assistente-drawer';
import { AssistenteLauncher } from '@shared/assistente/assistente-launcher';
import { AssistenteStore } from '@shared/assistente/assistente.store';
import { AuthApi } from '@services/auth/data-access/auth.service';
import { ToastContainer } from '@shared/components/toast-container/toast-container';

/** Um item do menu: para onde vai, o que diz e o ícone. */
interface ItemDoMenu {
  rota: string;
  rotulo: string;
  icone: LucideIcon;
}

/**
 * O menu do produtor ("Minha operação"), um só para a barra lateral e o celular, na mesma ordem.
 * Escritos à mão, os dois tinham ordens diferentes. O Assistente fica fora: na barra lateral ele
 * tem grupo e acento próprios (#45), e no celular vem por último.
 */
const MENU_PRODUTOR: readonly ItemDoMenu[] = [
  { rota: '/dashboard', rotulo: 'Visão geral', icone: LucideLayoutDashboard },
  { rota: '/documentos', rotulo: 'Minhas notas', icone: LucideFileText },
  { rota: '/tributario', rotulo: 'Impostos', icone: LucideReceipt },
  { rota: '/calendario', rotulo: 'Prazos', icone: LucideCalendar },
  { rota: '/escritorio', rotulo: 'Meu escritório', icone: LucideBuilding2 },
];

/**
 * O menu do contador, **um só** para a barra lateral e o celular (#157).
 *
 * Os dois eram escritos à mão, cada um no seu bloco do template, e divergiram: o do celular
 * mostrava "Minhas notas" (a voz do produtor) e "Contador", sem Fechamento nem Prazos. Uma lista
 * desenhada pelos dois impede isso por construção.
 *
 * - "Notas do produtor", e não "Minhas notas": para o contador, as notas são do cliente dele.
 * - `/tributario` e `/calendario` são as mesmas rotas do produtor com telas diferentes
 *   (`ImpostosContador` para conferir e fechar, `PrazosContador` para cobrar).
 * - Equipe (#157) foi seção de Configurações até ficar evidente que ninguém a achava lá.
 * - Modelos e obrigações (#185) é o mesmo caso: o catálogo de obrigações também morava lá.
 */
const MENU_CONTADOR: readonly ItemDoMenu[] = [
  { rota: '/contador', rotulo: 'Acompanhamento', icone: LucideCalculator },
  { rota: '/documentos', rotulo: 'Notas do produtor', icone: LucideFileText },
  { rota: '/tributario', rotulo: 'Fechamento', icone: LucideReceipt },
  { rota: '/calendario', rotulo: 'Prazos e cobrança', icone: LucideCalendar },
  { rota: '/equipe', rotulo: 'Equipe', icone: LucideUsers },
  { rota: '/catalogo', rotulo: 'Modelos e obrigações', icone: LucideListChecks },
];

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [
    AssistenteDrawer,
    AssistenteLauncher,
    LucideSparkles,
    LucideClipboardList,
    LucideDynamicIcon,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    ToastContainer,
    LucideMenu,
    LucideX,
    LucideBell,
    LucideCheck,
    LucideTrash2,
    LucideSettings,
    LucideLayoutDashboard,
    LucideCalendar,
    LucideFileText,
    LucideMessageSquare,
    LucideCalculator,
    LucideReceipt,
    LucideLogOut,
  ],
  templateUrl: './app-layout.html',
})
export class AppLayout implements OnInit {
  private readonly router = inject(Router);
  readonly notificacoesService = inject(NotificacoesService);
  readonly sessao = inject(SessaoService);
  private readonly encerramento = inject(EncerramentoService);
  private readonly authApi = inject(AuthApi);
  private readonly host = inject(EscritorioDoHostService);
  private readonly escritorioApi = inject(EscritorioApi);
  private readonly enderecoNoAr = inject(ENDERECO_PROPRIO_NO_AR);
  private readonly base = inject(DOMINIO_BASE);
  private readonly localizacao = inject(LOCALIZACAO_ATUAL);

  /** No endereço do escritório (#175), o nome dele ao lado da logo. */
  readonly nomeDoEscritorioDoHost = computed(() =>
    this.host.modo() === 'escritorio' ? (this.host.escritorio()?.nome ?? null) : null,
  );
  /** Em www, o aviso de que o escritório tem endereço próprio (#175), até ser dispensado. */
  readonly avisoEndereco = signal<{ slug: string; url: string; host: string } | null>(null);

  /** Só para o `@defer` da gaveta: ela carrega no primeiro `aberto()` (#143). */
  protected readonly assistente = inject(AssistenteStore);

  /** Saída do `@error` da gaveta: um chunk que falhou não é baixado de novo pelo `@defer`. */
  protected recarregar(): void {
    window.location.reload();
  }

  mobileMenuOpen = signal(false);
  notificacoesOpen = signal(false);

  /**
   * Sair.
   *
   * A limpeza dos caches de sessao -- que e o que impedia a topbar de quem entra de mostrar o nome
   * de quem saiu -- mudou para o `EncerramentoService` na #93. Ela precisava existir tambem no
   * `authInterceptor`, quando a renovacao falha e a sessao morre sem ninguem clicar aqui, e duas
   * listas de caches para limpar significa uma delas esquecida.
   */
  sair(): void {
    this.closeMobileMenu();
    this.encerramento.encerrar();
  }

  readonly menuContador = MENU_CONTADOR;
  readonly menuProdutor = MENU_PRODUTOR;

  toggleMobileMenu(): void {
    this.mobileMenuOpen.update((v) => !v);
  }

  ngOnInit(): void {
    // O sino busca na fonte do papel atual (#113). Antes ele nascia com tres itens cravados
    // no codigo, com datas de 2025 e uma nota que nao existe.
    this.notificacoesService.carregar();

    // ── O nome na topbar vem de quem o servidor diz que eu sou (#93).
    //
    // Antes ele vinha do `GET /api/dashboard`, e isso custava uma requisicao de painel em CADA
    // navegacao do produtor fora do /dashboard -- so para preencher um nome. Pior, era um nome
    // que o contador nao tinha: o painel e do produtor (403 para contador), e usar aquele nome
    // para ele identificava o escritorio como o proprio cliente.
    //
    // Agora os dois papeis leem o mesmo `/auth/me`, e `carregar()` so vai a rede se o nome ainda
    // nao estiver na sessao -- o que, depois do login, nao acontece.
    this.authApi.carregar().subscribe({ error: () => undefined });

    this.conferirEnderecoDoEscritorio();
  }

  /**
   * O endereço do escritório e quem está nele (#175, seção 6).
   *
   * - **No subdomínio:** o membro que mudou de escritório (ou cujo administrador trocou ou removeu o
   *   endereço) sai com um aviso que diz o endereço certo. `SEM_ESCRITORIO` também sai. Erro de
   *   rede não derruba a sessão: instabilidade não é motivo para deslogar ninguém.
   * - **Em www, com o endereço no ar:** o contador cujo escritório tem endereço vê uma faixa com o
   *   link, até dispensar. Com a chave desligada não há chamada nenhuma.
   */
  private conferirEnderecoDoEscritorio(): void {
    if (!this.sessao.ehContador()) return;
    const rotulo = this.host.modo() === 'escritorio' ? this.host.rotulo() : null;
    if (!rotulo && !this.enderecoNoAr) return;

    this.escritorioApi.meuEscritorio().subscribe({
      next: (escritorio) => {
        const slug = escritorio.slug ?? null;
        if (rotulo) {
          if (slug !== rotulo) {
            this.encerramento.encerrar(
              'pedido',
              avisoDeOutroEndereco(escritorio.nome, semProtocolo(this.url(slug))),
            );
          }
          return;
        }
        if (slug && !AppLayout.dispensado(slug)) {
          const url = this.url(slug);
          this.avisoEndereco.set({ slug, url, host: semProtocolo(url) });
        }
      },
      error: (erro: unknown) => {
        if (rotulo && erro instanceof HttpErrorResponse && ehSemEscritorio(erro)) {
          this.encerramento.encerrar(
            'pedido',
            `${MENSAGEM_SEM_ESCRITORIO} Entre por ${semProtocolo(this.url(null))}.`,
          );
        }
      },
    });
  }

  dispensarAvisoEndereco(): void {
    const aviso = this.avisoEndereco();
    if (!aviso) return;
    // Com o slug na chave: um endereço novo aparece de novo.
    try {
      localStorage.setItem(`${AppLayout.CHAVE_AVISO_ENDERECO}${aviso.slug}`, '1');
    } catch {
      // Navegação privada pode recusar o storage: o aviso só some até a próxima carga.
    }
    this.avisoEndereco.set(null);
  }

  private static readonly CHAVE_AVISO_ENDERECO = 'agrocontabil.aviso-endereco-dispensado:';

  private static dispensado(slug: string): boolean {
    try {
      return localStorage.getItem(`${AppLayout.CHAVE_AVISO_ENDERECO}${slug}`) === '1';
    } catch {
      return false;
    }
  }

  private url(slug: string | null): string {
    return urlDoHost(slug, this.base, {
      protocolo: this.localizacao.protocolo,
      porta: this.localizacao.porta,
    });
  }

  /**
   * Esc fecha os paineis sobrepostos.
   *
   * E o que de fato resolve o teclado aqui: o fundo escuro atras deles e um
   * atalho de ponteiro, nao um controle -- por isso leva `aria-hidden` no
   * template em vez de fingir um botao.
   */
  @HostListener('document:keydown.escape')
  aoPressionarEsc(): void {
    if (this.notificacoesOpen()) this.closeNotificacoes();
    if (this.mobileMenuOpen()) this.closeMobileMenu();
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  toggleNotificacoes(): void {
    this.notificacoesOpen.update((v) => !v);
  }

  closeNotificacoes(): void {
    this.notificacoesOpen.set(false);
  }

  handleNotificacaoClick(notif: { id: string; rota: string }): void {
    this.notificacoesService.marcarLida(notif.id);
    this.notificacoesOpen.set(false);
    // `navigateByUrl`, e não `navigate([rota])`: uma rota com query ou fragmento seria tratada
    // pelo `navigate` como parte do caminho.
    void this.router.navigateByUrl(notif.rota);
  }

  /**
   * Cor do ícone da notificação, sobre os tokens semânticos (#59).
   *
   * Antes cada tipo era um **emoji** no meio do painel. Renderizam diferente em
   * cada sistema, ignoram o tema e não têm nada a ver com a identidade visual —
   * o ícone agora é do mesmo conjunto do resto do produto.
   */
  /**
   * Nome mostrado no chip da topbar — o que o servidor respondeu em `/auth/me` (#93).
   *
   * Era aqui o vazamento. O nome vinha do `GET /api/dashboard`, que é do **produtor**, e o
   * `DashboardApi` é `providedIn: 'root'`: trocando de usuário sem recarregar a página, o chip do
   * contador exibia o produtor da sessão anterior. Havia ainda um "nome digitado" do login de
   * demonstração, que podia ser qualquer coisa — a mesma tela saudava "Olá, João da Silva" com
   * outro nome em cima.
   *
   * Agora é um nome só, dos dois papéis, da mesma fonte que emite o token. O rótulo do papel só
   * entra se o `/auth/me` não tiver respondido ainda.
   */
  readonly nomeExibido = computed(() => this.sessao.nome().trim() || this.rotuloDoPapel());

  /**
   * Segunda linha do chip.
   *
   * **Sem "Atendendo X".** Ela lia o nome do painel do produtor — outra pessoa — e para o
   * escritório nem existe "o" cliente: ele tem uma carteira. Fica vazia quando a primeira linha
   * já diz o papel, para não gaguejar "Contador / Contador" enquanto o nome não chegou.
   */
  readonly papelExibido = computed(() => {
    if (this.nomeExibido() === this.rotuloDoPapel()) return '';
    return this.sessao.ehContador() ? 'Contador' : 'Produtor rural';
  });

  /** O que mostrar enquanto o nome da conta não chegou. */
  private rotuloDoPapel(): string {
    return this.sessao.ehContador() ? 'Contador' : 'Produtor';
  }

  readonly inicialDoPerfil = computed(
    () => this.nomeExibido().trim().charAt(0).toUpperCase() || '?',
  );

  classeTipo(tipo: string): string {
    const map: Record<string, string> = {
      Solicitação: 'bg-info-soft text-info',
      Documento: 'bg-assistente-soft text-assistente-ink',
      Pagamento: 'bg-aviso-soft text-aviso-ink',
    };
    return map[tipo] ?? 'bg-surface-2 text-muted-foreground';
  }

  isNavPath(path: string): string {
    return path;
  }
}
