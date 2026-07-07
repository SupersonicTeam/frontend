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

---

## Handoff Snapshot

**Current feature:** `dashboard-api-real` — ✅ **Done** (todas as 8 tasks + fix pós-validação implementadas, testadas e commitadas).
**Branch:** `claude/trusting-mendel-a1bc6d` (worktree). Commits: `f6eea27`, `ef8748d`, `1d4820d`, `70ab1da`, `c807be9`.
**Verifier:** PASS — 16/16 ACs verificadas, 28/28 testes, sensor de mutação 3/3 mortos. Relatório: `.specs/features/dashboard-api-real/validation.md`.
**Next step:** Nenhum pendente nesta feature. Issue #20 pronta para PR/merge (ainda não commitado no repo remoto — decisão de push cabe ao usuário).
**Backend follow-up aberto:** SupersonicTeam/backend#71 (KPIs financeiros em R$).
**Deferred (fora de escopo, ver context.md):** seletor de período com refetch (`?periodo=YYYY-MM`) — P3.
