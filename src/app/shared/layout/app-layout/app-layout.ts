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
} from '@lucide/angular';
import { NotificacoesService } from '@core/services/notificacoes.service';
import { SessaoService } from '@core/services/sessao.service';
import { EncerramentoService } from '@core/services/encerramento.service';
import { AssistenteDrawer } from '@shared/assistente/assistente-drawer';
import { AssistenteLauncher } from '@shared/assistente/assistente-launcher';
import { AssistenteStore } from '@shared/assistente/assistente.store';
import { AuthApi } from '@services/auth/data-access/auth.service';
import { ToastContainer } from '@shared/components/toast-container/toast-container';

export interface NavItem {
  title: string;
  path: string;
  icon: unknown;
  directive: string;
}

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [
    AssistenteDrawer,
    AssistenteLauncher,
    LucideSparkles,
    LucideClipboardList,
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

  readonly navItems = [
    { title: 'Dashboard', path: '/dashboard' },
    { title: 'Calendário', path: '/calendario' },
    { title: 'Documentos', path: '/documentos' },
    { title: 'Chat', path: '/chat' },
    { title: 'Contador', path: '/contador' },
  ];

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
    // `navigateByUrl`, e não `navigate([rota])`: a rota pode trazer fragmento
    // (`/configuracoes#escritorio`), e o `navigate` o trataria como parte do caminho.
    // `reload`: clicar no sino já estando nessa URL (o produtor subiu a página e chegou outro
    // convite) seria ignorado pelo roteador, e a tela não iria até a seção.
    void this.router.navigateByUrl(notif.rota, { onSameUrlNavigation: 'reload' });
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
