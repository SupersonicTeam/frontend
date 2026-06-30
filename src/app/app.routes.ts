import { Routes } from '@angular/router';
import { AppLayout } from '@shared/layout/app-layout/app-layout';

export const routes: Routes = [
  {
    path: '',
    component: AppLayout,
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
