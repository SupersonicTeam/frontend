import { Routes } from '@angular/router';
import { AppLayoutComponent } from './shared/layout/app-layout/app-layout.component';

export const routes: Routes = [
  {
    path: '',
    component: AppLayoutComponent,
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
      },
      {
        path: 'calendario',
        loadComponent: () =>
          import('./features/calendario/calendario.component').then(m => m.CalendarioComponent),
      },
      {
        path: 'documentos',
        loadComponent: () =>
          import('./features/documentos/documentos.component').then(m => m.DocumentosComponent),
      },
      {
        path: 'chat',
        loadComponent: () =>
          import('./features/chat/chat.component').then(m => m.ChatComponent),
      },
      {
        path: 'contador',
        loadComponent: () =>
          import('./features/contador/contador.component').then(m => m.ContadorComponent),
      },
      {
        path: 'configuracoes',
        loadComponent: () =>
          import('./features/configuracoes/configuracoes.component').then(m => m.ConfiguracoesComponent),
      },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
