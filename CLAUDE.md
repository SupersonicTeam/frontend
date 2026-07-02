# CLAUDE.md — Frontend AgroContábil (Angular)

Mapa de referência rápida do `frontend/`. **Consulte este arquivo antes de explorar o código** — ele evita
buscas caras. Mantenha-o atualizado quando criar features/services novos.

> Contexto do produto e dos 3 projetos irmãos: ver `../CLAUDE.md` (raiz). Aqui é só o frontend Angular.

## O que é

SPA Angular 21 (educacional sobre a reforma tributária 2026 — CBS/IBS/FUNRURAL para produtores rurais).
Port do `../agro-simples-vista` (React, referência visual). Domínio em **português** (produtor, nota fiscal,
imposto, contador, rascunho).

## Stack

- **Angular 21.1** — standalone (sem NgModules), **zoneless** (sem zone.js → use **signals**, não change
  detection por zona), bootstrap via `bootstrapApplication` em `src/main.ts`.
- **Tailwind CSS v4** via PostCSS (`@import "tailwindcss"` em `src/styles.css`; **não há** `tailwind.config.js`).
- **@lucide/angular** para ícones.
- **Angular Material** — uso **híbrido/pontual** (datepicker, tabela paginada, select), Tailwind continua a base.
- **ng2-charts + chart.js** — gráficos. Registro **enxuto por componente** (`Chart.register(...)` no componente, não
  `provideCharts` no `app.config`) para o Chart.js ficar no **chunk lazy**, não no bundle inicial. Ex.: dashboard.
- RxJS 7.8, testes em **Vitest** (jsdom). TypeScript strict.

## Comandos (rodar dentro de `frontend/`)

| Ação | Comando |
|---|---|
| Dev server (porta 4200, com proxy `/api`) | `npm start` |
| Build de produção (`dist/`) | `npm run build` |
| Build dev (source-maps, watch) | `npm run watch` |
| Testes unitários (Vitest) | `npm test` |
| Scaffold de componente | `npx ng generate component pages/<nome>` |

## Backend / API

- `environment.apiUrl = '/api'` (`src/environments/environment.ts`).
- `proxy.conf.json` → `http://localhost:8080` (backend **Spring Boot**, pacote `br.com.agrocontabil`; fonte de
  verdade dos contratos). O módulo de notas fiscais (`/api/notas`) já existe; onde faltar endpoint (chat, calendário,
  contador, fluxo de caixa), usar mock/estado no service e deixar a chamada `/api` pronta. Não bloquear o frontend.

## Estrutura

Padrão por camadas (estilo Frimesa), adotado na issue #7. Arquivos de componente **sem** sufixo `.component`
(ex.: `dashboard.ts` + `dashboard.html`, classe `DashboardPage`).

```
src/
  main.ts                      # bootstrapApplication(App, appConfig)
  styles.css                   # Tailwind v4 + @theme (design tokens)
  environments/                # environment.ts (apiUrl), environment.prod.ts
  app/
    app.ts / app.html / app.css   # raiz (SEM sufixo .component)
    app.config.ts              # providers: router, provideHttpClient(withFetch()), error listeners
    app.routes.ts              # rotas lazy via @pages (ver tabela abaixo)
    core/                      # infraestrutura cross-cutting
      models/*.model.ts        # tipos de domínio (1 arquivo por domínio)
      enums/*.enum.ts          # unions/enums (ex.: status-rascunho)
      DTOs/shared/responses/   # DTOs de API (ex.: api-error.response — envelope de erro)
      config/                  # constantes (ex.: produtor-logado → LOGGED_PRODUCER_ID)
      services/                # services CROSS-CUTTING (api, toast, theme, notificacoes-UI)
      interceptors/            # api.interceptor
      utils/                   # nota-pdf
    services/<feat>/data-access/<feat>.service.ts   # services de NEGÓCIO, classes XxxApi (ver tabela)
    pages/<nome>/<nome>.ts + <nome>.html            # páginas rotáveis, classes XxxPage (lazy-loaded)
    shared/
      layout/app-layout/       # AppLayout (shell: header, sidebar, notificações)
      components/toast-container/   # ToastContainer
      ui/                      # UiButton, UiCard
```

### Path aliases (`tsconfig.json`)

Imports sempre via alias (sem `../../`): `@core/*` · `@services/*` · `@pages/*` · `@shared/*` ·
`@models/*` (= `core/models`) · `@dtos/*` (= `core/DTOs`) · `@env/*` (= `src/environments`).

## Rotas (`app.routes.ts`)

Tudo sob `AppLayout`, lazy via `loadComponent`. `''` → redirect `dashboard`; `**` → `dashboard`.

| Rota | Classe | Arquivos |
|---|---|---|
| `/dashboard` | DashboardPage | `pages/dashboard/dashboard.{ts,html}` |
| `/calendario` | CalendarioPage | `pages/calendario/calendario.{ts,html}` |
| `/documentos` | DocumentosPage | `pages/documentos/documentos.{ts,html}` |
| `/chat` | ChatPage | `pages/chat/chat.{ts,html}` |
| `/contador` | ContadorPage | `pages/contador/contador.{ts,html}` |
| `/configuracoes` | ConfiguracoesPage | `pages/configuracoes/configuracoes.{ts,html}` |

## Services

**Negócio** — `services/<feat>/data-access/<feat>.service.ts`, classes `XxxApi`, importados via `@services/...`:

| Classe | Import | Papel |
|---|---|---|
| `NotasApi` | `@services/notas/data-access/notas.service` | **Notas fiscais reais** contra `/api/notas` do backend Spring: CRUD paginado (`Page<T>`), ciclo de emissão (gerar-xml, xml, enviar-sefaz, status-sefaz, pdf, cancelar) e `validacoes`. Model `NotaFiscal` alinhado ao `NotaFiscalResponse`; status em `@core/enums/status-nota-fiscal.enum`. |
| `DashboardApi` | `@services/dashboard/data-access/dashboard.service` | Fluxo de caixa, rascunhos, impostos (endpoints `/dashboard/*` ainda mock). Exporta `mockNotas` (fallback offline de Documentos), `ResumoMensalNotas`, `DistribuicaoImposto`. |
| `CalendarioApi` | `@services/calendario/data-access/calendario.service` | Vencimentos/eventos fiscais (com fallback mock). |
| `ChatApi` | `@services/chat/data-access/chat.service` | Chat com o assistente (POST /chat). |
| `ContadorApi` | `@services/contador/data-access/contador.service` | Pendências/solicitações/documentos do contador. |
| `NotificacaoApi` | `@services/notificacao/data-access/notificacao.service` | Notificações externas (WhatsApp). |

**Cross-cutting** — permanecem em `core/services/`, importados via `@core/services/...`:

| Classe | Papel |
|---|---|
| `ApiService` | **Cliente HTTP genérico** (get/post/put/patch/delete/uploadFile) sobre `environment.apiUrl`. Todo service de negócio o usa. |
| `NotificacoesService` | Estado **local** de notificações da UI (signal). Não confundir com `NotificacaoApi`. |
| `ToastService` | Toasts (auto-dismiss 4s), renderizados por `ToastContainer`. |
| `ThemeService` | Tema claro/escuro. |

`LOGGED_PRODUCER_ID` mora em `@core/config/produtor-logado`.

## Models (`core/models/*.model.ts`, via `@models/...`)

Um arquivo por domínio: `produtor.model.ts` (`Produtor`, `ContatoProdutor`, `ProdutorContador`),
`nota-fiscal.model.ts` (`NotaFiscal`, `ItemNotaFiscal`), `rascunho-nota.model.ts` (`RascunhoNota`,
`ItemRascunhoNota`), `solicitacao-contador.model.ts` (`SolicitacaoContador`, `DocumentoContador`),
`chat-message.model.ts`, `vencimento-fiscal.model.ts`, `notificacao.model.ts`, `fluxo-caixa.model.ts`.
`StatusRascunho` em `@core/enums/status-rascunho.enum`. Envelope de erro da API (`ApiErrorEnvelope`,
`FiscalError`) em `@dtos/shared/responses/api-error.response`. Campos de status são unions de string.

## Design system (`src/styles.css`, bloco `@theme`)

- **Cores** (HSL): `--color-primary` verde-agro `hsl(142 44% 32%)`; `--color-accent` laranja `hsl(33 55% 52%)`;
  `--color-sidebar`/`--color-topbar` verde-escuro `hsl(142 30% 22%)`; `--color-background` off-white;
  `--color-destructive` vermelho. Usar via classes Tailwind: `text-primary`, `bg-card`, `border-border`...
- **Fontes**: `Sora` (headings, classe `.font-heading`) + `Inter` (corpo). Importadas via Google Fonts no topo.
- **Utilities**: `.font-heading`, `.scrollbar-none`.
- **Reusar estes tokens** ao criar gráficos/novos componentes — não hardcodar cores.

## Convenções (TypeScript strict)

- **Signals** para estado reativo (não há zone.js). `computed()` para derivados.
- Componentes **standalone** com `imports: [...]` explícito; declarar `LucideAngularModule`/ícones usados.
- `noPropertyAccessFromIndexSignature`: acessar propriedades de index-signature com **bracket** `obj['x']`.
- Prettier: `printWidth: 100`, `singleQuote: true` (config no `package.json`); HTML usa parser `angular`.
- Budgets (`angular.json`): bundle inicial warn 500 kB / erro 1 MB; estilos warn 4 kB / erro 8 kB.
  (Baseline atual: ~378 kB inicial — folga grande.)
- Evitar `?.` onde o tipo não é nullable (warning NG8107).

## Git / fluxo de trabalho

- Remote: `origin` → `github.com/SupersonicTeam/frontend`.
- **Fluxo:** uma **issue** por tarefa → branch **`feature/<n>-<slug>`** a partir de `main` → **PR para `main`**
  (corpo com `Closes #<n>`) → merge após CI verde. Branches mergeadas são deletadas.
- **CI** (`.github/workflows/ci.yml`): roda **lint · build · test** (Node 22). Garanta os três verdes
  localmente antes de abrir/mergear o PR. `dist/`, `node_modules/`, `.angular/cache` no `.gitignore`.

## Estado das sprints (frontend)

Frontend ~85-90% pronto. Gaps reais (em ordem de sprint): ~~gráficos ng2-charts no dashboard (S1)~~ ✅ feito ·
filtros grupo/status em Documentos (S2) · seletor multi-produtor no Contador · download PDF/XML (S3) ·
dialog inline de anexar no Calendário · polir estados loading/erro/vazio (S5) · WCAG + README (S10).
Plano completo: `../../../.claude/plans/` (sessão de planejamento).
