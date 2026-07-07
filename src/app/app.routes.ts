import { Routes } from '@angular/router';
import { AppLayout } from '@shared/layout/app-layout/app-layout';
import { perfilGuard } from '@core/guards/perfil.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('@pages/login/login').then((m) => m.LoginPage),
  },
  {
    path: '',
    component: AppLayout,
    canActivate: [perfilGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () => import('@pages/dashboard/dashboard').then((m) => m.DashboardPage),
      },
      {
        path: 'calendario',
        loadComponent: () => import('@pages/calendario/calendario').then((m) => m.CalendarioPage),
      },
      {
        path: 'documentos',
        loadComponent: () => import('@pages/documentos/documentos').then((m) => m.DocumentosPage),
      },
      {
        path: 'tributario',
        loadComponent: () => import('@pages/tributario/tributario').then((m) => m.TributarioPage),
      },
      {
        path: 'chat',
        loadComponent: () => import('@pages/chat/chat').then((m) => m.ChatPage),
      },
      {
        path: 'contador',
        loadComponent: () => import('@pages/contador/contador').then((m) => m.ContadorPage),
      },
      {
        path: 'configuracoes',
        loadComponent: () =>
          import('@pages/configuracoes/configuracoes').then((m) => m.ConfiguracoesPage),
      },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
