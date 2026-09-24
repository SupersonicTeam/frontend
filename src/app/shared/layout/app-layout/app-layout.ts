import { Component, inject, signal } from '@angular/core';
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
} from '@lucide/angular';
import { NotificacoesService } from '@core/services/notificacoes.service';
import { PerfilService } from '@core/services/perfil.service';
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
    LucideSparkles,
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

  tipoIcon(tipo: string): string {
    const map: Record<string, string> = {
      'Solicitação': '📋',
      'Documento': '📄',
      'Pagamento': '💰',
    };
    return map[tipo] ?? '🔔';
  }

  isNavPath(path: string): string {
    return path;
  }
}
