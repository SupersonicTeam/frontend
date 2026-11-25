import { HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { Observable, catchError, map, of } from 'rxjs';
import { EscritorioDoHostService } from '@core/services/escritorio-do-host.service';
import { SessaoService } from '@core/services/sessao.service';
import { AuthApi } from '@services/auth/data-access/auth.service';
import { AppLayout } from '@shared/layout/app-layout/app-layout';
import { sessaoGuard } from '@core/guards/sessao.guard';
import { produtorGuard } from '@core/guards/produtor.guard';
import { contadorGuard } from '@core/guards/contador.guard';

/** O app abriu num endereço de escritório já resolvido (#175)? */
function noEnderecoDoEscritorio(): boolean {
  return inject(EscritorioDoHostService).modo() === 'escritorio';
}

/**
 * A landing (#174) é de quem chega ao endereço **principal** (www) e não tem uma sessão que ainda
 * sirva. Com sessão válida, o `/` segue para o shell e o painel, como sempre foi. Num endereço de
 * escritório (#175), em qualquer modo dele (inclusive o de erro), o `/` continua sendo do
 * escritório: a landing é do www.
 *
 * **Sessão vencida no `localStorage` não é sessão** (#213). A versão anterior perguntava só
 * `logado()`, que é `estado() !== null` e não olha a validade: quem entrou uma vez e deixou vencer
 * nunca mais via a landing — o `/` recusava a landing, caía no shell, redirecionava para
 * `/dashboard`, o `sessaoGuard` tentava renovar e, com o refresh também vencido, terminava no
 * `/login`. Isso pega justamente quem testou o sistema e volta semanas depois pelo endereço
 * principal: a banca, o Show Rural, os contadores convidados.
 *
 * Com a sessão local vencida, **uma** renovação decide:
 *
 * - deu certo: o token foi trocado, a pessoa continua logada e o `/` segue para o painel;
 * - recusada: a sessão local é esquecida e o visitante vê a **landing**, não o login.
 *
 * A renovação é a do `AuthApi`, que tem fila de uma por vez: o refresh é rotativo, e reusar um
 * já trocado encerra a linhagem inteira. Por isso aqui não se abre uma chamada própria.
 */
export function visitanteNoPrincipal(): Observable<boolean> | boolean {
  if (inject(EscritorioDoHostService).modo() !== 'principal') return false;

  const sessao = inject(SessaoService);
  if (!sessao.logado()) return true;
  if (!sessao.expirado()) return false;

  return inject(AuthApi)
    .renovar()
    .pipe(
      map(() => false),
      catchError((erro: unknown) => {
        // **Recusa e indisponibilidade não são a mesma coisa.** Com 401 (ou 403), o refresh
        // venceu ou foi revogado: não há sessão para onde voltar, e esquecê-la aqui é o que
        // evita repetir a chamada a cada navegação para o `/`. Já um erro de rede ou um 5xx
        // dizem que o **servidor** não respondeu: a sessão pode estar inteira, e apagá-la
        // deslogaria quem só pegou o backend reiniciando. Nos dois casos o visitante vê a
        // landing, que é uma página estática e não depende de nada disso.
        if (erro instanceof HttpErrorResponse && (erro.status === 401 || erro.status === 403)) {
          sessao.encerrar();
        }
        return of(true);
      }),
    );
}

/**
 * A prévia da landing (#174) existe? **Só fora de produção.**
 *
 * `PREVIA_LANDING` é uma constante de **compilação** (`define` no `angular.json`: `true` na
 * configuração `development`, `false` na `production`). Tem de ser assim, e não uma chave do
 * `environment`: o empacotador troca a constante pelo valor antes de eliminar código morto, então
 * em produção a rota, a página e o texto do caminho **somem do bundle**. Com a chave no
 * `environment` (a primeira versão), o `false` ficava dentro de um objeto, nada era eliminado, e a
 * prévia ia para o ar escondida atrás de um `if`. A CI confere (`conferir-build-producao.mjs`).
 *
 * O `typeof` cobre onde o `define` não chega (os testes): lá a constante não existe, e a prévia
 * fica desligada em vez de estourar um `ReferenceError`.
 */
declare const PREVIA_LANDING: boolean | undefined;

/** As rotas da prévia. Exportada para o spec conferir a rota sem depender da constante. */
export function rotasDaPrevia(): Routes {
  return [
    {
      path: 'previa-landing',
      title: 'Prévia da landing | AgroConIA',
      loadComponent: () => import('@pages/landing/landing').then((m) => m.LandingPage),
    },
  ];
}

export const routes: Routes = [
  ...(typeof PREVIA_LANDING !== 'undefined' && PREVIA_LANDING ? rotasDaPrevia() : []),
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
  // No endereço do escritório (#175) o cadastro e o convite são de www: a página de aviso entra
  // pelo `canMatch`, e o chunk do cadastro nem baixa no subdomínio.
  {
    path: 'cadastro',
    canMatch: [noEnderecoDoEscritorio],
    data: { aviso: 'cadastro' },
    loadComponent: () => import('@pages/aviso-www/aviso-www').then((m) => m.AvisoWwwPage),
  },
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
    // Termos de uso (#211): publica pela mesma razao que a politica. O cadastro exige marcar
    // "Li e aceito" -- ate agora, de um texto que nao estava em lugar nenhum.
    path: 'termos-de-uso',
    loadComponent: () =>
      import('@pages/termos-de-uso/termos-de-uso').then((m) => m.TermosDeUsoPage),
  },
  {
    path: 'equipe/convite',
    canMatch: [noEnderecoDoEscritorio],
    data: { aviso: 'convite' },
    loadComponent: () => import('@pages/aviso-www/aviso-www').then((m) => m.AvisoWwwPage),
  },
  {
    // Convite de equipe (#148): publica pela mesma razao do `/cadastro` -- quem chega pode ainda
    // nao ter conta. O token vem no FRAGMENTO (`#token=...`), lido pela pagina, nunca em query.
    path: 'equipe/convite',
    loadComponent: () =>
      import('@pages/equipe-convite/equipe-convite').then((m) => m.EquipeConvitePage),
  },
  {
    // A landing em `/` (#174, PR 9). Vem antes do shell: quando o `canMatch` recusa (há sessão, ou o
    // endereço é de escritório), o `/` cai no shell abaixo, que leva ao painel ou ao login.
    path: '',
    pathMatch: 'full',
    canMatch: [visitanteNoPrincipal],
    // Sem `title`: o login e as outras telas públicas não definem o seu, e o da landing ficaria
    // preso na aba depois do "Entrar". Vale o "AgroConIA" do index.html.
    loadComponent: () => import('@pages/landing/landing').then((m) => m.LandingPage),
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
        // O escritorio de contabilidade do produtor: convites, quem o atende e o que pediu. Era
        // uma secao de Configuracoes (#147) e ficava escondida.
        path: 'escritorio',
        canActivate: [produtorGuard],
        loadComponent: () => import('@pages/escritorio/escritorio').then((m) => m.EscritorioPage),
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
      {
        // O escritorio e a equipe (#157). Era uma secao de Configuracoes e ficava escondida.
        // Nao se confunde com `equipe/convite`, la em cima: aquela e publica, fora do shell, e
        // casa o caminho inteiro; esta so casa `/equipe`.
        path: 'equipe',
        canActivate: [contadorGuard],
        loadComponent: () => import('@pages/equipe/equipe').then((m) => m.EquipePage),
      },
      {
        // Modelos e obrigacoes (#185): o que o escritorio cobra e pede dos clientes. O catalogo
        // de obrigacoes morava em Configuracoes, entre o tema e a senha, e ninguem o achava.
        path: 'catalogo',
        canActivate: [contadorGuard],
        loadComponent: () => import('@pages/catalogo/catalogo').then((m) => m.CatalogoPage),
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
