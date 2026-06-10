# CLAUDE.md — Frontend AgroPainel (Angular)

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
| Scaffold de componente | `npx ng generate component features/<nome>` |

## Backend / API

- `environment.apiUrl = '/api'` (`src/environments/environment.ts`).
- `proxy.conf.json` → `http://localhost:3001` (backend NestJS). **Backend ainda não está pronto** — onde faltar
  endpoint, usar mock/estado no service e deixar a chamada `/api` pronta. Não bloquear o frontend.

## Estrutura

```
src/
  main.ts                      # bootstrapApplication(App, appConfig)
  styles.css                   # Tailwind v4 + @theme (design tokens)
  environments/                # environment.ts (apiUrl), environment.prod.ts
  app/
    app.ts / app.html / app.css   # raiz (note: SEM sufixo .component no root)
    app.config.ts              # providers: router, provideHttpClient(withFetch()), error listeners
    app.routes.ts              # rotas (ver tabela abaixo)
    core/
      models/types.ts          # TODOS os tipos de domínio
      services/                # services HTTP + estado (ver tabela)
    features/<nome>/           # *.component.ts + *.component.html (lazy-loaded)
    shared/
      layout/app-layout/       # AppLayoutComponent (shell: header, sidebar, notificações)
      components/toast-container/
```

## Rotas (`app.routes.ts`)

Tudo sob `AppLayoutComponent`, lazy via `loadComponent`. `''` → redirect `dashboard`; `**` → `dashboard`.

| Rota | Componente | Arquivos |
|---|---|---|
| `/dashboard` | DashboardComponent | `features/dashboard/dashboard.component.{ts,html}` |
| `/calendario` | CalendarioComponent | `features/calendario/calendario.component.{ts,html}` |
| `/documentos` | DocumentosComponent | `features/documentos/documentos.component.{ts,html}` |
| `/chat` | ChatComponent | `features/chat/chat.component.{ts,html}` |
| `/contador` | ContadorComponent | `features/contador/contador.component.{ts,html}` |
| `/configuracoes` | ConfiguracoesComponent | `features/configuracoes/configuracoes.component.{ts,html}` |

## Services (`core/services/`)

| Service | Papel |
|---|---|
| `api.service.ts` | **Cliente HTTP genérico** (get/post/put/patch/delete/uploadFile) sobre `environment.apiUrl`. Todo service novo deve usá-lo. |
| `dashboard.service.ts` | Notas, fluxo de caixa, rascunhos, impostos. |
| `calendario.service.ts` | Vencimentos/eventos fiscais (com fallback mock). |
| `chat.service.ts` | Chat com o assistente (POST /chat). |
| `contador.service.ts` | Pendências/solicitações/documentos do contador (mapeia backend→frontend). |
| `notificacao.service.ts` | Notificações externas (WhatsApp). |
| `notificacoes.service.ts` | Estado **local** de notificações da UI (signal). |
| `toast.service.ts` | Toasts (auto-dismiss 4s), renderizados por `ToastContainerComponent`. |

## Models (`core/models/types.ts`)

Domínio: `Produtor`, `NotaFiscal` + `ItemNotaFiscal`, `FluxoCaixa`, `RascunhoNota` + `ItemRascunhoNota`,
`SolicitacaoContador`, `DocumentoContador`, `ChatMessage`, `VencimentoFiscal`, `Notificacao`,
`ContatoProdutor`, `ProdutorContador`. Campos de status são unions de string (ex.: rascunho|enviado|revisao...).

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

- `master` = protegida (só scaffold) — **nunca commitar nela**.
- `dev` = integração (baseline do port + sprints mergeadas).
- `feature/sprintN-*` = uma branch por sprint, sai de `dev`, revisada antes do merge.
- Repo é **local, sem remote** por enquanto. `dist/`, `node_modules/`, `.angular/cache` já no `.gitignore`.

## Estado das sprints (frontend)

Frontend ~85-90% pronto. Gaps reais (em ordem de sprint): ~~gráficos ng2-charts no dashboard (S1)~~ ✅ feito ·
filtros grupo/status em Documentos (S2) · seletor multi-produtor no Contador · download PDF/XML (S3) ·
dialog inline de anexar no Calendário · polir estados loading/erro/vazio (S5) · WCAG + README (S10).
Plano completo: `../../../.claude/plans/` (sessão de planejamento).
