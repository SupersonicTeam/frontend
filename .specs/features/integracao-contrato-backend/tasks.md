# Integração Contrato Backend v1.1 — Tasks

Referências: `spec.md` (INT-01..INT-13), `design.md`. Contrato de execução: cada task = testes derivados da
spec → implementação → **gate verde** (`npm test`/`lint`/`build` conforme o caso) → **1 commit atômico**.
Nunca enfraquecer/pular testes. Verifier independente roda após a última task.

**Fases (4):** Fases 1–3 independentes entre si; **Fase 4 depende da Fase 3** (helper de download p/ o PDF).

- **Fase 1 — Financeiro no dashboard** (INT-01..INT-05)
- **Fase 2 — Interceptor Authorization** (INT-06..INT-09)
- **Fase 3 — Downloads robustos** (INT-10..INT-13)
- **Fase 4 — Tela Tributário** (TRIB-01..TRIB-09) — após a Fase 3

> **Delegação por sub-agentes:** com >3 fases, na entrada da execução o orquestrador **oferece** um worker
> por fase (sequencial, um commit atômico por task), com o Verifier independente ao final. Oferta-e-confirma
> — nada é despachado sem o aval do usuário.

Convenção de commit: `feat(<area>): … (#27)` / `test(...)` / `refactor(...)`. Branch: worktree atual
(`claude/issue-27-...`). CI = lint · build · test (Node 22).

---

## Fase 1 — Bloco `financeiro` no dashboard

### T1 — DTO `DashboardFinanceiro` + campo `financeiro?` (INT-01)
- **Arquivo:** `core/DTOs/dashboard/dashboard.response.ts`
- **Fazer:** adicionar `interface DashboardFinanceiro { totalEntradas; totalSaidas; saldo; lucroEstimado }`
  (todos `number`) e `financeiro?: DashboardFinanceiro` em `DashboardResponse` (opcional — A-3).
- **Verificação:** `npm run build` compila; tipo importável. (DTO puro — sem teste dedicado.)
- **Commit:** `feat(dashboard): tipa bloco financeiro do GET /api/dashboard (#27)`

### T2 — `computed` + formatação no componente (INT-02, INT-03, INT-04, INT-05)
- **Arquivos:** `pages/dashboard/dashboard.ts`, `pages/dashboard/dashboard.spec.ts`
- **Teste primeiro (deriva da spec):**
  - financeiro presente com `totalEntradas ≠ totalSaidas` (ex.: 12500 vs 3200) → `financeiro()` expõe os
    valores **sem troca** (mata re-inversão, INT-03);
  - `lucroEstimado` negativo → preservado (INT-04);
  - `financeiro` ausente → `financeiro()===null`, `temFinanceiro()===false`, sem throw (INT-05).
- **Fazer:** `financeiro = computed(() => this.dashboard()?.financeiro ?? null)`, `temFinanceiro`, helper
  `brl(v)` (Intl BRL).
- **Gate:** `npm test` (novos casos verdes + suíte do dashboard sem regressão).
- **Commit:** `feat(dashboard): expõe financeiro (fluxo de caixa R$) no componente (#27)`

### T3 — Card "Resumo financeiro" no template (INT-02, INT-04, INT-05)
- **Arquivo:** `pages/dashboard/dashboard.html`
- **Fazer:** card sob `@if (temFinanceiro())`, 4 valores BRL, rótulos "Entradas/Saídas/Saldo/Lucro
  estimado", lucro negativo com `text-destructive`, tokens do design system (sem cor hardcoded). Comentário
  marcando a semântica invertida (não re-inverter — INT-03).
- **Verificação:** `npm run build`; preview do dashboard renderiza o card (com e sem `financeiro` via mock).
- **Commit:** `feat(dashboard): card Resumo financeiro consumindo bloco financeiro (#27)`

---

## Fase 2 — Interceptor `Authorization`

### T4 — `TokenService` (fonte única, inócua) (INT-08 base)
- **Arquivo:** `core/services/token.service.ts` (novo)
- **Fazer:** `getToken(): string | null { return null; }` (`providedIn: 'root'`), documentado como
  placeholder de Sprint 8 (A-5).
- **Verificação:** `npm run build`. (Coberto indiretamente pelo teste do interceptor.)
- **Commit:** `feat(core): TokenService como fonte única de token (inócuo até Sprint 8) (#27)`

### T5 — `authInterceptor` + testes (INT-06, INT-07, INT-08)
- **Arquivos:** `core/interceptors/auth.interceptor.ts` (novo), `auth.interceptor.spec.ts` (novo)
- **Teste primeiro:** sem token → `next` recebe a req **inalterada** (sem `Authorization`); token `'abc'`
  → req com `Authorization: Bearer abc`; token `''` → sem header.
- **Fazer:** `HttpInterceptorFn` injetando `TokenService` (design.md §Componente 2).
- **Gate:** `npm test` (3 casos verdes).
- **Commit:** `feat(core): authInterceptor estrutura Authorization Bearer (Sprint 8-ready) (#27)`

### T6 — Registrar no `app.config` + regressão (INT-09)
- **Arquivos:** `app.config.ts`, `core/interceptors/api.interceptor.spec.ts` (reconfirmar)
- **Fazer:** `withInterceptors([authInterceptor, apiInterceptor])` (auth antes).
- **Gate:** `npm test` — `api.interceptor.spec.ts` **sem regressão** (prefixo baseURL/Accept/erro intactos);
  `npm run build`.
- **Commit:** `feat(core): registra authInterceptor antes do apiInterceptor (#27)`

---

## Fase 3 — Downloads robustos

### T7 — Util `download.ts` + testes (INT-10, INT-11, INT-12)
- **Arquivos:** `core/utils/download.ts` (novo), `core/utils/download.spec.ts` (novo)
- **Teste primeiro (deriva da spec/edge cases):**
  - `filenameDeContentDisposition('attachment; filename="danfe-x.pdf"', fb)` → `danfe-x.pdf`;
  - header `null` → `fb`; só `filename*=UTF-8''...` → `fb` (não quebra);
  - `apiErrorDeBlob(blob JSON ApiError)` → envelope; blob não-parseável → `null`.
- **Fazer:** as 3 funções puras (design.md §Componente 3). `salvarBlob` coberto minimamente (mock de
  `URL.createObjectURL`/`<a>`), foco nas puras.
- **Gate:** `npm test`.
- **Commit:** `feat(core): util de download (Content-Disposition + ApiError de Blob) (#27)`

### T8 — Extrair `mensagem(envelope)` reusável do interceptor (INT-12)
- **Arquivos:** `core/interceptors/api.interceptor.ts`, `api.interceptor.spec.ts`
- **Fazer:** extrair a lógica "envelope → mensagem" de `mensagemAmigavel` para função que aceite
  `ApiErrorEnvelope` (reusável no fluxo de blob); `mensagemAmigavel` passa a chamá-la.
- **Gate:** `npm test` — `api.interceptor.spec.ts` sem regressão.
- **Commit:** `refactor(core): mensagem de ApiError reusável fora do HttpErrorResponse (#27)`

### T9 — Services de download com `observe:'response'` (INT-13)
- **Arquivos:** `services/notas/data-access/notas.service.ts` (+spec),
  `services/tributario/data-access/tributario.service.ts` (+spec)
- **Fazer:** `baixarPdf`/`obterXml`/`relatorioConformidadePdf` retornam `HttpResponse<Blob|string>`
  (`observe:'response'`).
- **Teste:** header `Content-Disposition` acessível na resposta mockada; assinatura nova.
- **Gate:** `npm test`.
- **Commit:** `feat(notas,tributario): downloads expõem headers (observe:response) (#27)`

### T10 — Chamadores usam o helper (filename + erro-como-blob) (INT-10, INT-12)
- **Arquivos:** `pages/documentos/documentos.ts` (`baixarDanfe`, `baixarXmlGerado`) e quaisquer outros que
  quebrem no build após T9. (A tela Tributário usa o helper já na Fase 4.)
- **Fazer:** no `next`, `salvarBlob(resp.body!, filenameDeContentDisposition(...))`; no `error`, se
  `err.error instanceof Blob` → `apiErrorDeBlob` → `mensagem(envelope)` → `toast.error`. Fallback de nome
  determinístico por endpoint (`danfe-{numero}.pdf`, `nota-{numero}.xml`).
- **Gate:** `npm test` + `npm run build` (TypeScript strict garante que todos os chamadores foram ajustados).
- **Commit:** `feat(documentos): download por blob com nome de arquivo e erro amigável (#27)`

---

## Fase 4 — Tela Tributário (após a Fase 3)

### T11 — Rota `/tributario` + item de menu (TRIB-01)
- **Arquivos:** `app.routes.ts`, `shared/layout/app-layout/app-layout.{ts,html}`, `pages/tributario/tributario.{ts,html}` (stub inicial)
- **Fazer:** rota lazy `/tributario` sob `AppLayout`/`perfilGuard`; item "Tributário" no menu desktop+mobile
  (ícone lucide livre, ex. `LucideReceipt`); página stub que renderiza um título (para a rota resolver).
- **Verificação:** `npm run build`; preview navega para `/tributario` pelo menu.
- **Commit:** `feat(tributario): rota e item de menu da tela Tributário (#27)`

### T12 — Apuração + seletor de período (TRIB-02, TRIB-03) + Créditos (TRIB-06)
- **Arquivos:** `pages/tributario/tributario.{ts,html}`, `tributario.spec.ts`
- **Teste primeiro:** ao carregar, `apuracao()`/`creditos()` populados via mock; trocar período dispara
  refetch com o novo `YYYY-MM`; créditos sem notas → estado zerado (não erro); apuração mês corrente
  `ABERTO`/`dataFechamento=null` não é tratada como erro.
- **Fazer:** signals + `carregar()` (3 fetches independentes), seletor mês/ano, cards Apuração e Créditos
  com loading/erro-retry/vazio; badge de status; BRL na exibição.
- **Gate:** `npm test`.
- **Commit:** `feat(tributario): apuração + créditos com seletor de período (#27)`

### T13 — Reabrir apuração ramificando por `code` (TRIB-04, TRIB-05)
- **Arquivos:** `pages/tributario/tributario.{ts,html}`, `tributario.spec.ts`
- **Teste primeiro:** botão "Reabrir" só quando `status=FECHADO` (e com `id` — senão aviso A-7); erro **409
  `APURACAO_NAO_REABRIVEL`** → mensagem "não está fechada"; **422 `REABERTURA_FORA_PRAZO`** → "fora do prazo"
  (asserção pela **ramificação por `code`**, com mensagens de textos diferentes p/ matar mutação de troca).
- **Fazer:** ação reabrir + tratamento por `errors[].code`; degradação A-7 quando não há `id`.
- **Gate:** `npm test`.
- **Commit:** `feat(tributario): reabrir apuração tratando 409/422 por code (#27)`

### T14 — Relatório de conformidade + download PDF (TRIB-07, TRIB-08, TRIB-09)
- **Arquivos:** `pages/tributario/tributario.{ts,html}`, `tributario.spec.ts`
- **Teste primeiro:** `relatorio()` populado; `saldoAPagar<0` → rótulo "saldo credor" (valor **não** negado);
  "Baixar PDF" resolve filename de `Content-Disposition` (fallback `conformidade-{periodo}.pdf`) e trata
  erro-como-blob; erro de uma seção não esconde as outras (TRIB-09).
- **Fazer:** card Relatório (débitos×créditos, saldoAPagar destacado), botão PDF usando o helper da Fase 3.
- **Gate:** `npm test` + `npm run build`.
- **Commit:** `feat(tributario): relatório de conformidade + download PDF (#27)`

---

## Fecho

### T15 — Gate final + ratificações
- **Fazer:** `npm run lint && npm run build && npm test` verdes; conferir bundle inicial < 1 MB.
- **Ratificar em `STATE.md` (Decisions):** AD-013 (calendário fiscal client-side — A-4) e AD-014 (escopo de
  #27 inclui a tela Tributário; NF-e já existe em `documentos.ts` — A-1). Abrir **follow-up no backend
  (OQ-1/A-7):** expor `id` em `ApuracaoResponse` ou reabrir por `periodo`.
- **Verificação:** três gates verdes; STATE.md atualizado (Handoff).
- **Commit:** `docs(specs): fecha integração contrato v1.1 (#27)` (após Verifier PASS)

> Depois de T14, o **Verifier independente** roda automaticamente (author ≠ verifier): spec-anchored
> outcome check por AC + sensor de mutação (ex.: trocar entradas/saídas deve matar teste de INT-03; remover
> header `Authorization` deve matar teste de INT-08; trocar o branch 409/422 do reabrir deve matar TRIB-05)
> → `validation.md`.

## Cobertura de requisitos

| ID | Task(s) |
| --- | --- |
| INT-01 | T1 |
| INT-02 | T2, T3 |
| INT-03 | T2, T3 |
| INT-04 | T2, T3 |
| INT-05 | T2, T3 |
| INT-06 | T5 |
| INT-07 | T5 |
| INT-08 | T4, T5 |
| INT-09 | T6 |
| INT-10 | T7, T10 |
| INT-11 | T7 |
| INT-12 | T7, T8, T10 |
| INT-13 | T9 |
| TRIB-01 | T11 |
| TRIB-02 | T12 |
| TRIB-03 | T12 |
| TRIB-04 | T13 |
| TRIB-05 | T13 |
| TRIB-06 | T12 |
| TRIB-07 | T14 |
| TRIB-08 | T14 |
| TRIB-09 | T12, T14 |

**22/22 requisitos mapeados. 0 órfãos.** 15 tasks, 4 fases.
