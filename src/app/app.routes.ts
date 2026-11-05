import { Routes } from '@angular/router';
import { AppLayout } from '@shared/layout/app-layout/app-layout';
import { sessaoGuard } from '@core/guards/sessao.guard';
import { produtorGuard } from '@core/guards/produtor.guard';
import { contadorGuard } from '@core/guards/contador.guard';

export const routes: Routes = [
  // A tela de entrada fica FORA do `AppLayout`: o shell tem sidebar, sino de notificacoes e a
  // gaveta da Ceres, todos pedindo dado de um usuario que ainda nao existe. Ela tambem e a unica
  // rota sem `sessaoGuard` -- se estivesse guardada, quem nao tem sessao seria mandado para o
  // login pelo proprio login, em volta.
  {
    path: 'login',
    loadComponent: () => import('@pages/login/login').then((m) => m.LoginPage),
  },
  // As outras tres portas da conta (#131), publicas pela mesma razao que o `/login`: quem chega
  // aqui ainda **nao tem** sessao, e guarda-las mandaria ao login quem veio justamente porque nao
  // consegue entrar. Com o basic auth do Caddy fora do ar, sao elas a entrada de quem nao tem conta.
  {
    path: 'cadastro',
    loadComponent: () => import('@pages/cadastro/cadastro').then((m) => m.CadastroPage),
  },
  {
    path: 'esqueci-senha',
    loadComponent: () => import('@pages/senha/esqueci-senha').then((m) => m.EsqueciSenhaPage),
  },
  {
    // O backend monta o link como `.../redefinir-senha#token=...`; o token vive no FRAGMENTO e e
    // lido de `location.hash` pela pagina -- nunca como query param, que vazaria em log e Referer.
    path: 'redefinir-senha',
    loadComponent: () => import('@pages/senha/redefinir-senha').then((m) => m.RedefinirSenhaPage),
  },
  {
    // Politica de dados (#137, LGPD art. 9): publica, porque quem ainda nao tem conta precisa le-la
    // antes de se cadastrar.
    path: 'politica-dados',
    loadComponent: () =>
      import('@pages/politica-dados/politica-dados').then((m) => m.PoliticaDadosPage),
  },
  {
    // Convite de equipe (#148): publica pela mesma razao do `/cadastro` -- quem chega pode ainda
    // nao ter conta. O token vem no FRAGMENTO (`#token=...`), lido pela pagina, nunca em query.
    path: 'equipe/convite',
    loadComponent: () =>
      import('@pages/equipe-convite/equipe-convite').then((m) => m.EquipeConvitePage),
  },
  {
    path: '',
    component: AppLayout,
    canActivate: [sessaoGuard],
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
      {
        // Um cliente da carteira (#95). Rota filha e não query param: o endereço de um cliente é
        // compartilhável e volta no histórico, e `/contador` continua sendo a fila de trabalho.
        // O guard é o mesmo — a carteira é do escritório.
        path: 'contador/:produtorId',
        canActivate: [contadorGuard],
        loadComponent: () => import('@pages/contador/cliente').then((m) => m.ClientePage),
      },

      // ── Dos dois, com **telas diferentes** por papel. Não é o mesmo componente com textos
      // trocados: `/tributario` escolhe entre dois componentes próprios, porque produtor e contador
      // perguntam coisas diferentes ao mesmo dado. `/documentos` tambem: o contador abria a lista do
      // produtor e levava 403 em `/api/notas` (#136); agora ve as notas de um cliente da carteira.
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
        loadComponent: () =>
          import('@pages/documentos/documentos-rota').then((m) => m.DocumentosRotaPage),
      },
      {
        path: 'configuracoes',
        loadComponent: () =>
          import('@pages/configuracoes/configuracoes').then((m) => m.ConfiguracoesPage),
      },
    ],
  },
  // Endereco desconhecido mostra uma PAGINA, nao um redirect mudo (#112). Com `redirectTo: ''`
  // quem clicava num link quebrado ia parar no painel sem aviso, achando que o link nao tinha
  // funcionado. A pagina fica fora do `AppLayout` de proposito: ela responde tambem a quem ainda
  // nao escolheu perfil, e o botao dela leva ao inicio do papel certo.
  {
    path: '**',
    loadComponent: () =>
      import('@pages/nao-encontrada/nao-encontrada').then((m) => m.NaoEncontradaPage),
  },
];
