# Project State — Frontend AgroContábil

Persistent memory for spec-driven work. Read on resume.

---

## Decisions Log

| ID | Decision | Rationale | Date |
| --- | --- | --- | --- |
| AD-001 | Dashboard consome o endpoint consolidado `GET /api/dashboard` (backend#65), removendo as chamadas separadas a `/dashboard/fluxo-caixa`, `/notas-por-mes`, `/distribuicao-impostos`, `/produtores`. | Contrato oficial do backend (frontend#20). | 2026-07-06 |
| AD-002 | O card "Resumo financeiro" (Entradas/Saídas/Lucro em R$) vira **KPIs de IBS/CBS em cards separados** (débito/crédito/saldo). Fluxo de caixa em R$ fica adiado no backend (issue backend#71). | Backend só modela IBS/CBS; DoD exige zero mocks. | 2026-07-06 |
| AD-003 | O card "Últimos documentos" passa a consumir `ultimasNotas` do `GET /api/dashboard`; o preview abre a nota completa sob demanda via `NotasApi.obter`. | Consolida chamadas; `ultimasNotas` já vêm reais. | 2026-07-06 |
| AD-004 | Período: MVP carrega apenas o mês corrente (`periodo` omitido). Seletor mês/ano ligado ao refetch fica **deferido** (P3). | Menor escopo, entrega mais rápida. | 2026-07-06 |
| AD-005 | Sem mocks de fallback: em falha o dashboard mostra **estado de erro com "Tentar novamente"**; vazio mostra estado neutro "sem dados no período". | DoD "zero mocks no código de produção Angular". | 2026-07-06 |
| AD-006 | `documentos.ts` deixa de usar `mockNotas()` como fallback offline; passa a estado de erro + retry (reusa `notasErro`). | `mockNotas` será removido (DoD zero mocks). | 2026-07-06 |
| AD-007 | #21: entrega do Tributário é **só service + models + testes** (`TributarioApi`), **sem tela** `/tributario`. | Bate com o título/tarefas da issue; UI consumidora é issue de outra sprint. | 2026-07-07 |
| AD-008 | #21 zera mock apenas no **núcleo + calendário**: remove `getMockVencimentos()`. `contador`/`chat`/`notificacao` (fallbacks neutros `of([])`/`of(null)`, sem dado falso) ficam para issues próprias. | Escopo atômico; único dado falso restante é o do calendário. | 2026-07-07 |
| AD-009 | `TributarioApi`: `periodo` **obrigatório e explícito** por método (`YYYY-MM`); service não infere mês corrente. | Coerente com AD-004 (sem seletor); mantém service puro. | 2026-07-07 |
| AD-010 | Tributário: **response == model, sem DTO intermediário** (records do backend já em PT, mapeamento 1:1). Tipos em `@models/tributario.model.ts` (BigDecimal→number, OffsetDateTime→string\|null). | Evita cerimônia/duplicação; único ponto de verdade. | 2026-07-07 |

---

## Handoff Snapshot

**Current feature:** `tributario-service-zero-mock` (issue #21) — ✅ **Done** (T1..T5 implementadas, testadas e commitadas; Verifier PASS).
**Branch:** `claude/relaxed-khorana-e3ac1e` (worktree). Commits: `71f7b10`, `fcceb5f`, `08e455b`, `33dbd34`.
**Verifier:** PASS — 10/10 ACs com evidência file:line, sensor de mutação 3/3 mortos (revertidos), gates
(lint/build/test) reconfirmados de forma independente. Relatório: `.specs/features/tributario-service-zero-mock/validation.md`.
**Entregue:** `TributarioApi` (`/api/apuracao`, `/api/creditos`, `/api/relatorios/conformidade` + PDF,
`reabrirApuracao`) com models/enum em `@models/tributario.model` e `@core/enums/status-apuracao.enum`;
remoção do `getMockVencimentos()` do calendário (erro propaga) + estado de erro/retry na página
(`vencimentosErro`/`retry()`); banner "dados de exemplo" obsoleto removido do `calendario.html`.
**Gaps não-bloqueantes (ver validation.md):** REQ-M3 satisfeito via `PREFIXOS_SEM_TOAST` pré-existente no
interceptor (não via `skipErrorNotify` explícito, mas sem toast duplicado); sem teste dedicado disso.
**Nota de ambiente:** `node_modules` deste worktree precisou de `npm install` (faltava `@angular/material`)
antes do primeiro gate — refletir isso em novos worktrees clonados sem instalação.
**Next step:** issue #21 pronta para PR/merge (ainda não commitado no repo remoto — decisão de push cabe
ao usuário). Sem tela `/tributario` (fora de escopo — AD-007); UI consumidora fica para outra sprint.

**Feature anterior:** `dashboard-api-real` — ✅ Done. Verifier PASS 16/16 ACs. Issue #20 pronta para PR/merge.
**Backend follow-up aberto:** SupersonicTeam/backend#71 (KPIs financeiros em R$).
**Deferred:** seletor de período com refetch (`?periodo=YYYY-MM`) — P3 (AD-004).
