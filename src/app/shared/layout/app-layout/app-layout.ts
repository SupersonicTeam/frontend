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
import { PerfilService } from '@core/services/perfil.service';
import { DashboardApi } from '@services/dashboard/data-access/dashboard.service';
import { AssistenteDrawer } from '@shared/assistente/assistente-drawer';
import { AssistenteLauncher } from '@shared/assistente/assistente-launcher';
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
  readonly perfilService = inject(PerfilService);
  private readonly dashboardApi = inject(DashboardApi);

  mobileMenuOpen = signal(false);
  notificacoesOpen = signal(false);

  /** Sai do perfil demonstrativo e volta ao /login (issue #23). */
  sair(): void {
    this.closeMobileMenu();
    this.perfilService.sair();
    this.router.navigateByUrl('/login');
  }

  readonly navItems = [
    { title: 'Dashboard', path: '/dashboard' },
    { title: 'Calendário', path: '/calendario' },
    { title: 'Documentos', path: '/documentos' },
    { title: 'Chat', path: '/chat' },
    { title: 'Contador', path: '/contador' },
  ];

  toggleMobileMenu(): void {
    this.mobileMenuOpen.update(v => !v);
  }

  ngOnInit(): void {
    // O sino busca na fonte do papel atual (#113). Antes ele nascia com tres itens cravados
    // no codigo, com datas de 2025 e uma nota que nao existe.
    this.notificacoesService.carregar();
    // O nome do produtor vem do dashboard. Sem esta carga, quem entra direto em
    // /documentos ve "Produtor" na topbar enquanto o painel mostra "Joao da
    // Silva Produtor" -- duas identidades para a mesma pessoa, dependendo de
    // por onde se entrou. O service guarda em signal, entao nao repete.
    // O nome do produtor sai do painel, mas **a topbar nao e quem deve busca-lo no painel** (#114).
    //
    // O shell monta antes da pagina filha, entao o guard antigo (`if (!dashboard())`) olhava o
    // resultado quando resposta nenhuma tinha voltado: a topbar pedia, a pagina pedia logo atras, e
    // mediam-se **dois GET /api/dashboard** em toda abertura do painel. Pior, o pedido da topbar vai
    // SEM periodo -- chegando depois de o produtor escolher um mes, jogava os KPIs de volta para o
    // padrao do backend com o seletor ainda dizendo outra coisa.
    //
    // Em /dashboard a propria pagina busca, com o periodo certo, e o signal e compartilhado: a
    // topbar so precisa esperar. Nas outras rotas ninguem busca, e aí sim ela pede.
    if (!this.router.url.startsWith('/dashboard')) {
      this.dashboardApi.garantirCarregado().subscribe({ error: () => undefined });
    }
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
    this.notificacoesOpen.update(v => !v);
  }

  closeNotificacoes(): void {
    this.notificacoesOpen.set(false);
  }

  handleNotificacaoClick(notif: { id: string; rota: string }): void {
    this.notificacoesService.marcarLida(notif.id);
    this.notificacoesOpen.set(false);
    this.router.navigate([notif.rota]);
  }

  /**
   * Cor do ícone da notificação, sobre os tokens semânticos (#59).
   *
   * Antes cada tipo era um **emoji** no meio do painel. Renderizam diferente em
   * cada sistema, ignoram o tema e não têm nada a ver com a identidade visual —
   * o ícone agora é do mesmo conjunto do resto do produto.
   */
  /**
   * Nome mostrado no chip da topbar.
   *
   * O "login" da demo (#23) aceita o nome em branco e cai no rótulo do perfil,
   * o que fazia o chip ler **"Produtor · Produtor"** enquanto a mesma tela
   * saudava "Olá, João da Silva Produtor". Quando quem entrou não digitou nada,
   * usamos o nome do produtor que veio do backend — o mesmo da saudação.
   */
  readonly nomeExibido = computed(() => {
    const digitado = this.perfilService.nome().trim();
    const padrao = this.perfilService.perfil()
      ? this.perfilService.rotuloPadrao(this.perfilService.perfil()!)
      : '';
    if (digitado && digitado !== padrao) return digitado;

    // O nome do backend e o do PRODUTOR. Usa-lo para o contador o identificava
    // como o proprio cliente: a topbar dizia "Joao da Silva Produtor" com
    // "Contador" embaixo -- duas pessoas diferentes no mesmo chip.
    if (!this.perfilService.ehProdutor()) return padrao;
    return this.dashboardApi.dashboard()?.produtor.nome ?? padrao;
  });

  /**
   * Segunda linha do chip.
   *
   * Para o produtor e o papel. Para o contador, dizer "Contador" embaixo de
   * "Contador" e gaguejo -- o espaco rende mais mostrando de quem sao os
   * numeros que ele esta vendo.
   */
  readonly papelExibido = computed(() => {
    if (this.perfilService.ehContador()) {
      const produtor = this.dashboardApi.dashboard()?.produtor.nome;
      return produtor ? `Atendendo ${produtor}` : 'Contador';
    }
    return 'Produtor rural';
  });

  readonly inicialDoPerfil = computed(() => this.nomeExibido().trim().charAt(0).toUpperCase() || '?');

  classeTipo(tipo: string): string {
    const map: Record<string, string> = {
      'Solicitação': 'bg-info-soft text-info',
      Documento: 'bg-assistente-soft text-assistente-ink',
      Pagamento: 'bg-aviso-soft text-aviso-ink',
    };
    return map[tipo] ?? 'bg-surface-2 text-muted-foreground';
  }

  isNavPath(path: string): string {
    return path;
  }
}
