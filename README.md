# AgroContábil — Frontend (Angular)

SPA educacional sobre a **reforma tributária 2026** (CBS/IBS/FUNRURAL) para produtores rurais: assistente
fiscal com IA ("João"), calculadora de impostos, leitura/geração de nota fiscal e dashboard financeiro.
Consome a API NestJS do diretório irmão `backend/` em `/api`.

## Stack

- **Angular 21** — standalone (sem NgModules), **zoneless** (sem `zone.js` → estado reativo com **signals**).
- **Tailwind CSS v4** via PostCSS (`@import "tailwindcss"` em `src/styles.css`; sem `tailwind.config.js`).
- **Angular Material** (uso híbrido/pontual), **@lucide/angular** (ícones), **ng2-charts + chart.js** (gráficos).
- **Vitest** (jsdom) para testes unitários. TypeScript strict.

## Comandos (rodar dentro de `frontend/`)

| Ação | Comando |
|---|---|
| Dev server (porta 4200, proxy `/api` → `http://localhost:3001`) | `npm start` |
| Build de produção (`dist/`) | `npm run build` |
| Build dev (source-maps, watch) | `npm run watch` |
| Testes unitários (Vitest) | `npm test` |
| Lint | `npm run lint` |
| Scaffold de página | `npx ng generate component pages/<nome>` |

A app sobe em `http://localhost:4200/` e recarrega ao salvar. O backend (`backend/`, porta 3001) precisa estar
no ar para os dados reais; onde o endpoint ainda não existe, os services usam mock/estado local.

## Estrutura de pastas

Organização por camadas (path aliases no `tsconfig.json` eliminam imports relativos):

```
src/app/
  app.ts / app.config.ts / app.routes.ts   # raiz, providers e rotas lazy
  core/                                     # infraestrutura cross-cutting
    models/*.model.ts                       # tipos de domínio (1 por domínio)   → @models
    enums/ · DTOs/ · config/                # unions, DTOs de API, constantes     → @core/...
    services/                               # ApiService, ToastService, ThemeService, NotificacoesService → @core/services
    interceptors/ · utils/
  services/<feat>/data-access/<feat>.service.ts   # services de negócio, classes XxxApi   → @services
  pages/<nome>/<nome>.{ts,html}             # páginas rotáveis, classes XxxPage    → @pages
  shared/ layout/ · components/ · ui/       # AppLayout, ToastContainer, UiButton, UiCard → @shared
```

**Aliases:** `@core` `@services` `@pages` `@shared` `@models` (= `core/models`) `@dtos` (= `core/DTOs`)
`@env` (= `src/environments`).

## Rotas

Todas sob o shell `AppLayout`, lazy via `loadComponent`: `/dashboard`, `/calendario`, `/documentos`,
`/chat`, `/contador`, `/configuracoes`. `''` e `**` redirecionam para `dashboard`.

## Fluxo de contribuição

Uma **issue** por tarefa → branch `feature/<n>-<slug>` a partir de `main` → **PR para `main`**
(`Closes #<n>`) → merge após o **CI** (`lint · build · test`) ficar verde. Garanta os três verdes
localmente antes de abrir o PR.
