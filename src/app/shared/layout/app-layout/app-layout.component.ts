import { Component, inject, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import {
  LucideSprout,
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
} from '@lucide/angular';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NotificacoesService } from '../../../core/services/notificacoes.service';
import { ToastContainerComponent } from '../../components/toast-container/toast-container.component';

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
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    ToastContainerComponent,
    MatTooltipModule,
    LucideSprout,
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
  ],
  templateUrl: './app-layout.component.html',
})
export class AppLayoutComponent {
  private readonly router = inject(Router);
  readonly notificacoesService = inject(NotificacoesService);

  mobileMenuOpen = signal(false);
  notificacoesOpen = signal(false);

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
