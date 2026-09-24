import { Component, computed, inject, signal } from '@angular/core';
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
export class AppLayout {
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

  closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  toggleNotificacoes(): void {
    this.notificacoesOpen.update(v => !v);
  }

  closeNotificacoes(): void {
    this.notificacoesOpen.set(false);
  }

  handleNotificacaoClick(notif: { id: number; rota: string }): void {
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
    return this.dashboardApi.dashboard()?.produtor.nome ?? padrao;
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
