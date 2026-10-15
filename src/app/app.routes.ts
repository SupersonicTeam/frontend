import { Routes } from '@angular/router';
import { AppLayout } from '@shared/layout/app-layout/app-layout';
import { perfilGuard } from '@core/guards/perfil.guard';
import { produtorGuard } from '@core/guards/produtor.guard';
import { contadorGuard } from '@core/guards/contador.guard';

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
      // ── Do produtor. Falam na voz dele ("você tem a pagar", "procure o seu escritório de
      // contabilidade") e o contador chegava nelas pela navegação: o escritório lia um conselho
      // para procurar o escritório. O que o contador precisa de apuração e de prazos está em
      // /contador, escrito para ele.
      {
        path: 'dashboard',
        canActivate: [produtorGuard],
        loadComponent: () => import('@pages/dashboard/dashboard').then((m) => m.DashboardPage),
      },
      {
        // A Ceres atende produtor (403 PAPEL_NAO_AUTORIZADO para contador).
        path: 'chat',
        canActivate: [produtorGuard],
        loadComponent: () => import('@pages/chat/chat').then((m) => m.ChatPage),
      },

      // ── Do contador.
      {
        path: 'contador',
        canActivate: [contadorGuard],
        loadComponent: () => import('@pages/contador/contador').then((m) => m.ContadorPage),
      },

      // ── Dos dois, com **telas diferentes** por papel. Não é o mesmo componente com textos
      // trocados: `/tributario` escolhe entre dois componentes próprios, porque produtor e contador
      // perguntam coisas diferentes ao mesmo dado. `/documentos` ainda compartilha a lista.
      {
        path: 'tributario',
        loadComponent: () => import('@pages/tributario/tributario').then((m) => m.TributarioPage),
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
        path: 'configuracoes',
        loadComponent: () =>
          import('@pages/configuracoes/configuracoes').then((m) => m.ConfiguracoesPage),
      },
    ],
  },
  // Cada papel tem a sua home; mandar todo mundo para /dashboard jogava o contador
  // numa rota que o guard devolve na hora.
  { path: '**', redirectTo: '' },
];
