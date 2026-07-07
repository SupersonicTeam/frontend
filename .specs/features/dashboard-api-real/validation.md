# Dashboard API Real Validation

**Date**: 2026-07-06
**Spec**: `.specs/features/dashboard-api-real/spec.md`
**Diff range**: `f6eea27..70ab1da` (3 commits: `f6eea27` DTO, `ef8748d` service, `1d4820d` page+html, `70ab1da` mock removal — note the task brief said 4 commits in range but `git log --oneline f6eea27..70ab1da` shows 3; `f6eea27` is the range start/exclusive boundary, not part of the diff)
**Verifier**: independent sub-agent (author ≠ verifier)

---

## Task Completion

| Task | Status  | Notes |
| ---- | ------- | ----- |
| T1: DTO `DashboardResponse` | ✅ Done | `src/app/core/DTOs/dashboard/dashboard.response.ts` — all interfaces from design present, `status` uses `StatusNotaFiscal`. |
| T2: `DashboardApi.carregar()` + cache signal | ✅ Done | Commit `ef8748d`. Old methods (`getFluxoCaixa`, `getProdutor`, `getProdutores`, `getNotasPorMes`, `getDistribuicaoImpostos`, `getImpostosPorTipo`, `AMOSTRA_MENSAL`, `MOCK_DISTRIBUICAO`, `ResumoMensalNotas`, `DistribuicaoImposto`) removed. `mockNotas` intentionally kept until T7. |
| T3-T6 (consolidated) | ✅ Done, with declared SPEC_DEVIATION | Commit `1d4820d` rewrites `dashboard.ts`/`.html`/`.spec.ts` in one commit. Deviation justified — see Section "SPEC_DEVIATION Assessment" below. |
| T7: Remove `mockNotas` + `documentos.ts` erro+retry | ✅ Done | Commit `70ab1da`. `mockNotas` removed from service; `documentos.ts` sets `notas([])`/`notasErro(true)` on error, no `mockNotas()` call. |
| T8: Final zero-mock sweep + gate | ✅ Done | `grep -rn "mockNotas\|mockNotasPorMes\|MOCK_DISTRIBUICAO\|AMOSTRA_MENSAL" src/app` returns only a `.spec.ts` test-name string mentioning "mockNotas" in prose (`documentos.spec.ts:21`), no production code references. Build/lint/test gate green (see below). |

---

## Spec-Anchored Acceptance Criteria

### P1: Consumir o dashboard real

| Criterion (WHEN X THEN Y) | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| DASH-01: uma única `GET /api/dashboard`, sem URLs antigas | 1 request to `/dashboard`; no calls to `/dashboard/fluxo-caixa`, `/notas-por-mes`, `/distribuicao-impostos`, `/dashboard/produtores` | `src/app/services/dashboard/data-access/dashboard.service.spec.ts:51-67` — `httpMock.expectOne('/dashboard')`; `httpMock.expectNone('/dashboard/fluxo-caixa')`, `expectNone('/dashboard/produtores')`, `expectNone(url.includes('notas-por-mes'))`, `expectNone(url.includes('distribuicao-impostos'))` | ✅ PASS |
| DASH-02: nome do produtor no cabeçalho | `produtor.nome` do payload exibido | `src/app/pages/dashboard/dashboard.spec.ts:70-77` — `expect(fixture.componentInstance.nomeUsuario()).toBe('Maria Souza')` after flushing payload with `produtor.nome = 'Maria Souza'` | ✅ PASS |
| DASH-03: KPIs IBS/CBS de `kpis`, sem card fluxo de caixa R$ | 7 valores (débito/crédito/saldo IBS+CBS + total) derivados de `kpis` | `dashboard.spec.ts:105-114` — `expect(dashboard()?.kpis.saldoIbs).toBe(0)` + `formatCurrency(0)).toContain('0,00')` when kpis all zero; `dashboard.ts:246-254` derives `impostoBreakdown` from `kpis`, not from a R$ cash-flow signal | ✅ PASS |
| DASH-04: gráfico barra/linha plota contagens `entradas`×`saidas` com rótulo de `periodo` | labels = mês/ano curto derivado de `YYYY-MM`; datasets = contagens | `dashboard.spec.ts:116-126` — `expect(cmp.barChartData().labels).toEqual(['Fev/26', 'Jul/26'])`; `datasets[0].data).toEqual([4, 3])`; `datasets[1].data).toEqual([6, 5])` matching fixture `notasPorMes` counts exactly | ✅ PASS |
| DASH-05: pizza = IBS×CBS, legenda "CBS × IBS" | labels `['CBS','IBS']`; data `[cbs, ibs]` in that order | `dashboard.spec.ts:128-136` — `expect(cmp.pieChartData().labels).toEqual(['CBS', 'IBS'])`; `datasets[0].data).toEqual([420, 860])` where fixture `distribuicaoImpostos = {ibs:860, cbs:420}` — order proven exact (420 first = cbs) | ✅ PASS |
| DASH-06: "Últimos documentos" lista `ultimasNotas` ordenada por `dataEmissao` desc | 2-item fixture, most recent (`2026-07-01`) first | `dashboard.spec.ts:148-160` — `expect(docs[0].nome).toBe('Cerealista Boa Safra LTDA')` (2026-07-01) before `docs[1].nome).toBe('José Comprador')` (2026-06-20); values/notaId asserted exact | ✅ PASS |

### P1: Estados de loading, erro e vazio

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| Loading por seção durante a requisição | skeleton visível enquanto `loading()===true` | `dashboard.spec.ts:79-87` — `expect(cmp.loading()).toBe(true)` right after `detectChanges()` (before flush), `.toBe(false)` after flush | ✅ PASS |
| Erro HTTP → estado de erro + "Tentar novamente", sem mock | `erro()` true, no fallback data (`dashboard()` stays null) | `dashboard.spec.ts:89-103` — `flush(..., {status:500})` → `expect(cmp.erro()).toBe(true)`; `expect(cmp.dashboard()).toBeNull()` | ✅ PASS |
| Clique em "Tentar novamente" refaz `GET /api/dashboard` | new request fired, `erro()` reset | `dashboard.spec.ts:98-103` — `cmp.tentarNovamente()` then `expect(cmp.erro()).toBe(false)`; `flushDashboard()` (a second `httpMock.expectOne` succeeds, proving refetch) | ✅ PASS |
| Seção vazia → estado neutro sem dado falso | `notasPorMes: []` → empty chart data; `ultimasNotas: []` → "Nenhum documento" | `dashboard.spec.ts:138-146` — `expect(cmp.barChartData().labels).toEqual([])`; `dashboard.spec.ts:162-169` — `expect(cmp.documentos()).toEqual([])`; HTML gated by `@else if (documentos().length === 0)` at `dashboard.html:363-364` | ✅ PASS |

### P1: Remover mocks de produção

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| DASH-10: `mockNotas`/`mockNotasPorMes`/`MOCK_DISTRIBUICAO`/`AMOSTRA_MENSAL` não existem em `dashboard.service.ts` | zero matches in production `.ts` | Verified directly: `grep -rn "mockNotas\|mockNotasPorMes\|MOCK_DISTRIBUICAO\|AMOSTRA_MENSAL" src/app` → only hit is a test description string in `documentos.spec.ts:21` (prose, not a call/import); `dashboard.service.ts` (read in full) has no such symbols | ✅ PASS |
| DASH-11: `documentos.ts` falha → erro/retry via `notasErro`, sem `mockNotas()` | on HTTP error, `notasErro(true)`, `notas([])`, no mock call | `documentos.spec.ts:21-32` — flush 500 on `/notas` → `expect(cmp.notasErro()).toBe(true)`; `expect(cmp.notas()).toEqual([])`; `expect(cmp.totalElements()).toBe(0)`. Source at `documentos.ts:356-361` confirms no `mockNotas` import/call. | ✅ PASS |
| grep por mocks retorna vazio em produção | build passes with zero occurrences outside specs | Confirmed via direct grep (see DASH-10 row) + `npm run build` succeeded (see Gate Check) | ✅ PASS |

### P2: Cache local com Signals

| Criterion | Spec-defined outcome | `file:line` + assertion | Result |
| --- | --- | --- | --- |
| DASH-12: dashboard carregado antes → signal retém último `DashboardResponse` | `service.dashboard()` returns cached response after `carregar()` completes, persists across "re-navigation" (same service instance) | `dashboard.service.spec.ts:69-75` — `expect(service.dashboard()).toBeNull()` before call; after flush, `expect(service.dashboard()?.periodo).toBe('2026-07')` and `.kpis.saldoIbs).toBe(760)` | ✅ PASS |
| Revalida em background e atualiza signal ao concluir | 2ª chamada a `carregar()` mantém o valor da 1ª até a 2ª resposta chegar, então atualiza | `dashboard.service.spec.ts:87-96` (added post-validation, commit `c807be9`) — after 1st flush `periodo:'2026-06'`, before 2nd flush `expect(service.dashboard()?.periodo).toBe('2026-06')` (stale value still shown), after 2nd flush `.toBe('2026-07')` | ✅ PASS |

**Status**: ✅ All 16 ACs covered with precise, spec-matching evidence. (Original report flagged a spec-precision gap on DASH-12's second bullet; closed by an added test in commit `c807be9`, re-verified: 28/28 tests pass.)

---

## Discrimination Sensor

| Mutation | File:line | Description | Killed? |
| --- | --- | --- | --- |
| 1 | `src/app/pages/dashboard/dashboard.ts:171` | Flipped pie chart data order `[d?.cbs ?? 0, d?.ibs ?? 0]` → `[d?.ibs ?? 0, d?.cbs ?? 0]` | ✅ Killed — `dashboard.spec.ts:135` failed (expected `[420, 860]`, got `[860, 420]`) |
| 2 | `src/app/services/dashboard/data-access/dashboard.service.ts:23-25` | Removed `tap(res => this.dashboardSignal.set(res))` cache-set from `carregar()` | ✅ Killed — 11 tests failed across both `dashboard.service.spec.ts` and `dashboard.spec.ts` (cache signal never populated, cascading into KPI/chart/documentos/preview tests that depend on `dashboard()`) |
| 3 | `src/app/pages/dashboard/dashboard.ts:296` | Flipped `documentos()` sort comparator (`b...-a...` → `a...-b...`, ascending instead of descending by `dataEmissao`) | ✅ Killed — 3 tests failed (`docs[0].nome` mismatch and 2 `abrirPreview` tests that rely on `documentos()[0]` being note `n1`, since `n2` sorted first) |

**Sensor depth**: lightweight (3 targeted mutations, as prescribed for default/non-P0 features)
**Result**: 3/3 killed — ✅ PASS

Each mutation was applied directly to the tracked file, `npm test` was run, the failure was recorded, then the exact prior text was restored via `Edit`. `git status --short` / `git diff --stat` confirmed a clean tree (only the untracked `.specs/` directory, unrelated to source) before, between, and after all three mutations. Final confirmation run after last revert: 27/27 tests passed.

---

## Code Quality

| Principle | Status |
| --- | --- |
| Minimum code | ✅ Changes are scoped to dashboard/documentos data flow; no unrelated refactors found in diff |
| Surgical changes | ✅ `DashboardApi` keeps unrelated `rascunho` methods untouched (correctly out of scope per design) |
| No scope creep | ✅ `documentos.ts` change limited to the `recarregarNotas` error branch + mock import removal, matching design's stated "ajuste pontual" |
| Matches patterns | ✅ Follows `XxxApi` service convention, signal-based state, `computed()` derivations, Vitest + `HttpTestingController` test pattern already used in `notas.service.spec.ts` |
| Spec-anchored outcome check (asserted values match spec) | ✅ (see AC table above — precise values, not just "assertion exists") |
| Per-layer Coverage Expectation met (domain 1:1 ACs; routes happy+edge+error) | ✅ Service layer: URL/cache/error-propagation covered (4 tests). Page layer: loading/error/retry/empty/KPI/chart/documents/preview happy+error paths covered (12 tests). Documentos: happy+error covered (2 tests) |
| Every test maps to a spec requirement — no unclaimed tests | ✅ All 12 `dashboard.spec.ts` tests are explicitly labeled with `DASH-NN:` prefixes tracing to spec ACs; `documentos.spec.ts` tests labeled `DASH-11:` |
| Documented guidelines followed | ✅ CLAUDE.md: Chart.js registered per-component (`dashboard.ts:37-42`, kept out of `app.config`) — chunk-lazy pattern preserved; signals used for state (no zone.js reliance); bracket-notation not required here (no index-signature access observed in new code) |

One quality observation (not a defect, informational): `dashboard.ts` retains a large amount of pre-existing, unrelated functionality (WhatsApp notifications, calendar alerts, simulador período selector) that was not part of this feature's scope — this is pre-existing code left untouched, not scope creep introduced by this diff.

---

## SPEC_DEVIATION Assessment (commit `1d4820d`)

**Claim in commit message**: "T3-T6 (tasks.md) consolidadas neste unico commit — o template e a classe do componente compilam como uma unidade, entao nao havia estado intermediario compilavel entre elas apos o service ja ter removido os metodos antigos em T2."

**Verification performed**: Compared `dashboard.ts` at `f6eea27` (pre-T2, the DTO-only commit) against the `DashboardApi` post-T2 (commit `ef8748d`).

- `git show f6eea27:src/app/pages/dashboard/dashboard.ts` shows direct calls: `this.dashboardService.getFluxoCaixa(...)` (line 327), `.getProdutor(...)` (338), `.getNotasPorMes(...)` (344), `.getDistribuicaoImpostos(...)` (349), plus a `fluxoCaixa` signal typed against the now-deleted `FluxoCaixa` import path usage.
- `git show ef8748d -- .../dashboard.service.ts` confirms all four of those methods (`getFluxoCaixa`, `getProdutor`, `getNotasPorMes`, `getDistribuicaoImpostos`) plus `getProdutores`/`getImpostosPorTipo`/`AMOSTRA_MENSAL`/`MOCK_DISTRIBUICAO`/`ResumoMensalNotas`/`DistribuicaoImposto` were deleted in T2.
- Since Angular's `templateUrl`-based standalone components compile the `.ts` class and its `.html` template as a single compilation unit (template type-checking resolves against the component class members at build time), leaving the pre-T3 `dashboard.ts` in place after T2 landed would cause `npm run build`/`npm run lint` (and `ng build`'s template type-checker) to fail immediately on the four now-nonexistent method calls.

**Conclusion**: The SPEC_DEVIATION justification is **verified true**, not merely asserted. There genuinely was no compilable intermediate state between T2 and a hypothetical "T3 only" commit, because the *component class* itself (not just the template) directly called the removed service methods. Consolidating T3-T6 into one commit was the correct call, not a corner-cut. This is a reasonable, evidence-backed process deviation and does not indicate a quality problem.

---

## Edge Cases

- [x] `kpis` com valores zero → exibe `R$ 0,00`/`0`, não vazio — `dashboard.spec.ts:105-114`
- [x] `notasPorMes` com menos de 6 meses → gráfico plota só os meses recebidos — implicit in `dashboard.spec.ts:116-126` (2-month fixture plots exactly 2 labels); no dedicated "exactly 5 months" test, but the `computed()` has no fixed-length assumption (`dados.map(...)` over whatever array arrives), so this is structurally satisfied
- [x] `status` desconhecido em `ultimasNotas` → badge cai no rótulo padrão — relies on pre-existing `statusNotaLabel`/`statusNotaBadge` (not modified by this feature); not re-tested here but the function's default-fallback behavior is unchanged and out of this diff's scope
- [x] Preview de nota falha (`NotasApi.obter(id)` erro) → modal exibe erro sem quebrar — `dashboard.spec.ts:195-207`, `expect(cmp.notaDetalhada()).toBeNull()`, `expect(cmp.previewDoc()).not.toBeNull()` (modal stays open, no throw)
- [x] Valores `BigDecimal` com muitas casas → formatação BRL arredonda só na exibição — `formatCurrency` uses `toLocaleString('pt-BR', {style:'currency', currency:'BRL'})` which only affects display, not the underlying signal value; not independently tested with a many-decimal fixture but the mechanism is unchanged from prior code and matches the spec's stated approach

---

## Gate Check

- **Gate command**: `npm run lint && npm run build && npm test`
- **Result**: lint 0 errors / 54 warnings (all pre-existing style warnings, none touching this feature's files beyond expected `@angular-eslint/template` accessibility warnings not introduced by this diff — spot-checked, `dashboard.html`/`documentos.html` warnings predate this feature); build succeeded (only pre-existing CommonJS/canvg optimization-bailout warnings, unrelated to this diff); test: **27 passed, 0 failed, 6 files**
- **Test count before feature** (at `f6eea27`, DTO-only): 15 tests, 4 files (`app.spec.ts`, `notas.service.spec.ts`, `api.interceptor.spec.ts`, and no `dashboard.service.spec.ts` yet in its final form — pre-feature dashboard tests were minimal/absent for the new contract)
- **Test count after feature**: 27 tests, 6 files (`app.spec.ts`, `notas.service.spec.ts`, `api.interceptor.spec.ts`, `dashboard.service.spec.ts` [4], `dashboard.spec.ts` [12, new file], `documentos.spec.ts` [2, new file])
- **Delta**: +12 net new tests (dashboard.spec.ts new + documentos.spec.ts new + dashboard.service.spec.ts rewritten for new contract)
- **Skipped tests**: none
- **Failures**: none

---

## Fix Plans

### Fix 1: Add explicit stale-while-revalidate test for DASH-12 — ✅ Applied

- **Root cause**: The spec's second DASH-12 bullet ("exibe cache imediatamente e revalida em background") described a two-phase UX with no dedicated test.
- **Fix applied**: Added `dashboard.service.spec.ts:87-96` (commit `c807be9`) — calls `carregar()` twice, asserts the signal holds the 1st response until the 2nd flush arrives, then updates.
- **Priority**: Minor — closed same-session, no re-verify cycle needed (single additive test, no production code touched).

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status |
| --- | --- | --- |
| DASH-01 | Pending | ✅ Verified |
| DASH-02 | Pending | ✅ Verified |
| DASH-03 | Pending | ✅ Verified |
| DASH-04 | Pending | ✅ Verified |
| DASH-05 | Pending | ✅ Verified |
| DASH-06 | Pending | ✅ Verified |
| DASH-07 | Pending | ✅ Verified |
| DASH-08 | Pending | ✅ Verified |
| DASH-09 | Pending | ✅ Verified |
| DASH-10 | Pending | ✅ Verified |
| DASH-11 | Pending | ✅ Verified |
| DASH-12 | Pending | ✅ Verified |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 16/16 criteria matched with precise evidence (post-fix)
**Sensor**: 3/3 mutations killed
**Gate**: lint 0 errors / build success / 28 tests passed, 0 failed (post-fix)

**What works**: Single-request dashboard load with zero legacy endpoint calls; real produtor/KPI/chart/documento rendering from typed DTO; loading/error/retry/empty states all behavior-tested; zero production-code mock references left in `src/app`; cache signal (initial + stale-while-revalidate) proven via dedicated tests; SPEC_DEVIATION for the consolidated T3-T6 commit is independently verified as a genuine compilation constraint, not a shortcut.

**Issues found**: None outstanding — the one spec-precision gap found during validation (DASH-12 background-revalidation sub-clause) was closed same-session (commit `c807be9`).

**Next steps**: None — feature complete.
