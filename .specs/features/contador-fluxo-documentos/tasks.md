# Fluxo de Documentos e Obrigações do Contador — Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow
and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth
for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/contador-fluxo-documentos/design.md`
**Status**: Approved — user confirmed "aprovado, pode iniciar a implementação" (2026-07-07)

---

## Test Coverage Matrix

> Generated from codebase (Vitest + Angular TestBed, no dedicated testing guideline doc found beyond
> CLAUDE.md's command table). Guidelines found: `CLAUDE.md` (commands: `npm test`/`npm run lint`/`npm run build`).
> Existing samples: `calendario.service.spec.ts`, `calendario.spec.ts`, `dashboard.service.spec.ts`, `documentos.spec.ts`.

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| Service (`ContadorApi`) | unit | All branches; 1:1 to spec ACs (CTD-01..03, 05, 06, 09, 10) incl. fixture-fallback vs. real-success passthrough | `src/app/services/contador/data-access/contador.service.spec.ts` | `npm test` |
| Page component (`ContadorPage`, `CalendarioPage`, `DocumentosPage`) | unit (component, TestBed + `HttpTestingController`) | Happy path + edge cases per AC (guia flow, checklist, calendar merge resilience, anexo real) | `src/app/pages/**/*.spec.ts` | `npm test` |
| Model (`GuiaFiscal`, `TipoGuia`, `CreateGuiaDto`) | none | Type-only — build gate only | `src/app/core/models/solicitacao-contador.model.ts` | `npm run build` |

## Parallelism Assessment

> Generated from codebase.

| Test Type | Parallel-Safe? | Isolation Model | Evidence |
| --- | --- | --- | --- |
| Service unit (Vitest + TestBed) | Yes (cross-file) | Fresh `TestBed.configureTestingModule` per test in `beforeEach`, `httpMock.verify()` in `afterEach` — no shared/global mutable state | `calendario.service.spec.ts:11-19` |
| Component unit (Vitest + TestBed) | Yes (cross-file) | Same isolation model; each spec file owns its own `HttpTestingController` instance | `calendario.spec.ts:9-17` |

## Gate Check Commands

> Generated from codebase (`package.json` scripts, matches CLAUDE.md command table).

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | After tasks touching only one service/component's own tests | `npm test` |
| Full | After tasks touching cross-file behavior (calendar merge, page↔service wiring) | `npm run lint && npm test` |
| Build | After phase completion | `npm run build && npm run lint && npm test` |

---

**Tools for all tasks** (confirmed implicitly by "pode iniciar a implementação" — no external MCP needed):
file edit tools (Read/Edit/Write) + Bash for `npm test`/`npm run lint`/`npm run build`. No Context7/web
search needed — this is pure Angular/RxJS code already established in the codebase.

---

## Execution Plan

### Phase 1: Foundation (Sequential)

```
T1 → T2 → T3 → T4
```

### Phase 2: Core Implementation (Parallel OK)

```
        ┌→ T5 ─┐
T4 ─────┼→ T6 ─┼
        └→ T9 ─┘
```

### Phase 3: Integration (Sequential)

```
T6 → T7
```

---

## Task Breakdown

### T1: Add `GuiaFiscal`/`TipoGuia`/`CreateGuiaDto` model

**What**: Add the new types to the contador domain model file (per design's Data Models section).
**Where**: `src/app/core/models/solicitacao-contador.model.ts`
**Depends on**: None
**Reuses**: Existing `SolicitacaoContador`/`DocumentoContador` union-string status convention in the same file
**Requirement**: CTD-06, CTD-07, CTD-09

**Done when**:

- [ ] `TipoGuia`, `GuiaFiscal`, `CreateGuiaDto` exported with fields from design.md
- [ ] `npm run build` passes (no TS errors)

**Tests**: none
**Gate**: build (`npm run build`)

---

### T2: `ContadorApi` — fixture fallback for existing reads

**What**: Replace `catchError(() => of([]))` with fixture-returning fallbacks in `getPendencias`,
`getRecebidos`, `getDocumentos`; create `contador.service.spec.ts`.
**Where**: `src/app/services/contador/data-access/contador.service.ts` (modify), `contador.service.spec.ts` (new)
**Depends on**: None
**Reuses**: `calendario.service.spec.ts` test pattern (TestBed + `HttpTestingController`)
**Requirement**: CTD-01, CTD-02, CTD-03, CTD-05

**Done when**:

- [ ] `getPendencias()` returns fixture data on HTTP error, real data on HTTP success (incl. empty-array success — no override)
- [ ] `getRecebidos()` same contract
- [ ] `getDocumentos()` same contract
- [ ] Tests: AC-CTD-01/02/03 (error → fixture) + AC-CTD-05 (success incl. empty → real, untouched) — minimum 6 tests (2 per method)
- [ ] Gate check passes: `npm test`

**Tests**: unit
**Gate**: quick

---

### T3: `ContadorApi` — guia CRUD (mock signal fallback) [P after T2 file exists — sequential in practice, same file]

**What**: Add `getGuias`, `anexarGuia`, `marcarGuiaPaga` with real-HTTP-attempt + in-memory signal fallback
(seeded lazily from fixtures), per design's Approach 2.
**Where**: `src/app/services/contador/data-access/contador.service.ts` (modify), `contador.service.spec.ts` (append)
**Depends on**: T1 (model), T2 (spec file scaffolding)
**Reuses**: `DashboardApi.dashboardSignal` cache pattern
**Requirement**: CTD-06, CTD-07, CTD-08, CTD-09, CTD-10

**Done when**:

- [ ] `getGuias()` tries `GET /contador/guias`, falls back to signal (seeded with fixtures on first failure)
- [ ] `anexarGuia()` tries `POST /contador/guias`, falls back to creating locally in the signal with computed `status` (`vencido` if `dataVencimento` < today, else `pendente`)
- [ ] `marcarGuiaPaga()` tries `PATCH /contador/guias/:id/pagar`, falls back to updating the item in the signal to `status: 'pago'`
- [ ] Status computation uses relative dates in tests (not fixed absolute dates) to stay deterministic
- [ ] Tests: create → appears in `getGuias()`; overdue date → `vencido`; `marcarGuiaPaga` → reflects `pago` on next read; real HTTP success passthrough — minimum 6 tests
- [ ] Gate check passes: `npm test`

**Tests**: unit
**Gate**: quick

---

### T4: `ContadorApi` — `anexarDocumento` fallback

**What**: Add a fixture-based fallback (mock `DocumentoContador`) to `anexarDocumento()` on HTTP error,
replacing the current `catchError(() => of(null))`.
**Where**: `src/app/services/contador/data-access/contador.service.ts` (modify), `contador.service.spec.ts` (append)
**Depends on**: T2
**Reuses**: Same fixture-fallback pattern as T2
**Requirement**: CTD-13, CTD-14, CTD-15

**Done when**:

- [ ] `anexarDocumento()` returns a mock `DocumentoContador` (not `null`) on HTTP error, using the given `pendenciaId`/`tipoDocumento`
- [ ] Real HTTP success still passes through untouched
- [ ] Tests: error → mock document returned; success → real document returned — minimum 2 tests
- [ ] Gate check passes: `npm test`

**Tests**: unit
**Gate**: quick

---

### T5: `calendario.ts` — decouple sources (no more `forkJoin`) [P]

**What**: Replace the current `forkJoin({vencimentos, pendencias})` with two independently-erroring reads
(real vencimentos + `ContadorApi` pendências+guias), merged incrementally; add `mapGuiasParaEventos()`.
**Where**: `src/app/pages/calendario/calendario.ts` (modify), `calendario.spec.ts` (modify existing 3 tests + add guia cases)
**Depends on**: T3
**Reuses**: `mapPendenciasParaEventos()` as the template for `mapGuiasParaEventos()`
**Requirement**: CTD-07, CTD-11

**Done when**:

- [ ] Failure in `CalendarioApi.getVencimentos()` zeroes only the real vencimentos — solicitações/guias from `ContadorApi` still render (no full-page error state when only the calendar backend is down)
- [ ] Guias appear as `VencimentoFiscal` with `tipo: 'imposto'`, correct `valor`/`status`
- [ ] Existing 3 tests in `calendario.spec.ts` (AC-9) still pass, adapted to the new merge strategy (same assertions, no regression)
- [ ] New tests: guia renders in calendar; guia's overdue status shows as `vencido`; calendar-backend failure does not hide contador-sourced items — minimum 3 new tests
- [ ] Gate check passes: `npm run lint && npm test`

**Tests**: unit (component)
**Gate**: full

---

### T6: `contador.ts`/`.html` — categories + "Anexar guia" dialog + WhatsApp "em breve" [P]

**What**: Add the 5 new categories to `categorias`; add the "Anexar guia" dialog/form (`tipoGuia`,
`dataVencimento`, `valor`) wired to `ContadorApi.anexarGuia()`; add a local "WhatsApp — em breve" toast on
both guia-attach and nova-solicitação submit (zero HTTP call); create `contador.spec.ts`.
**Where**: `src/app/pages/contador/contador.ts` (modify), `contador.html` (modify), `contador.spec.ts` (new)
**Depends on**: T3
**Reuses**: `novaSolicitacaoForm` (Reactive Forms + `Validators`) and the existing dialog markup pattern (overlay + `stopPropagation`)
**Requirement**: CTD-06, CTD-12, CTD-23, CTD-24

**Done when**:

- [ ] `categorias` includes "Guia de imposto", "Balancete", "Balanço", "Extrato bancário", "Documento para IR"
- [ ] "Anexar guia" dialog validates `valor > 0` client-side (submit blocked otherwise, no HTTP call)
- [ ] Submitting the guia form calls `ContadorApi.anexarGuia()` and shows a success toast + the "WhatsApp — em breve" toast, with zero network request for the WhatsApp part (verified in test via `HttpTestingController` — no matching request)
- [ ] Same "em breve" toast fires on `salvarSolicitacao()` (nova solicitação), zero HTTP call
- [ ] Tests: categories present; guia creation happy path; validation blocks invalid valor; no HTTP call for WhatsApp toast — minimum 4 tests
- [ ] Gate check passes: `npm test`

**Tests**: unit (component)
**Gate**: quick

---

### T7: `contador.ts`/`.html` — Docs Oficiais populado + marcar paga + checklist

**What**: Render guias (via `getGuias()`) in the "Docs Oficiais" tab replacing the empty placeholder; add
`marcarPaga(guiaId)` action; add the fechamento checklist (period selector + `checklistState` signal +
`toggleChecklistItem`) inside the same tab; explicit empty state when no items for the selected period.
**Where**: `src/app/pages/contador/contador.ts` (modify), `contador.html` (modify), `contador.spec.ts` (append)
**Depends on**: T6 (same files)
**Reuses**: Existing tab-content pattern (`@if (activeTab() === 'documentos')` block), existing empty-state markup style
**Requirement**: CTD-09, CTD-19, CTD-20, CTD-21, CTD-22

**Done when**:

- [ ] "Docs Oficiais" tab shows guia fixtures/created guias instead of the static placeholder
- [ ] `marcarPaga(id)` updates the guia's status to `pago` and re-renders (reflected in both this tab and, on next calendar load, `/calendario`)
- [ ] Checklist for the selected período lists Balancete/Balanço/Extrato bancário/Guia de imposto/Documento para IR with recebido/pendente state, toggleable
- [ ] Selecting a período with no items shows an explicit "Nenhum item para este período" message (never a blank section)
- [ ] Tests: guias render; marcarPaga flips status; checklist toggle persists in-session; empty period shows explicit message — minimum 4 tests
- [ ] Gate check passes: `npm run lint && npm test`

**Tests**: unit (component)
**Gate**: full

**Commit**: `feat(contador): checklist de fechamento e guias em Docs Oficiais (#28)`

---

### T9: `documentos.ts` — wire `salvarAnexo()` to real `anexarDocumento()` [P]

**What**: Replace the current toast-only `salvarAnexo()` with a real call to
`ContadorApi.anexarDocumento(solicitacaoId, file, categoria)`, updating the solicitação's status to
`enviado` on success.
**Where**: `src/app/pages/documentos/documentos.ts` (modify), `documentos.spec.ts` (modify)
**Depends on**: T4
**Reuses**: Existing `subscribe({next, error})` pattern already used throughout `documentos.ts`
**Requirement**: CTD-13, CTD-14, CTD-15

**Done when**:

- [ ] `salvarAnexo()` calls `contadorService.anexarDocumento()` with the selected file and the solicitação's `categoria`
- [ ] On success (real or mock fallback), the corresponding solicitação's status flips to `enviado` locally
- [ ] On a genuine unrecoverable error, shows an error toast and leaves the previous status untouched
- [ ] Tests: successful anexo flips status; error path shows toast without mutating status — minimum 2 tests
- [ ] Gate check passes: `npm run lint && npm test`

**Tests**: unit (component)
**Gate**: full

**Commit**: `feat(documentos): ligar salvarAnexo() ao ContadorApi.anexarDocumento() (#28)`

---

## Parallel Execution Map

```
Phase 1 (Sequential):
  T1 ──→ T2 ──→ T3 ──→ T4

Phase 2 (Parallel):
  T4 complete, then:
    ├── T5 [P]  (calendario.ts)
    ├── T6 [P]  (contador.ts guia dialog)
    └── T9 [P]  (documentos.ts wiring)

Phase 3 (Sequential):
  T6 complete, then:
    T7 (contador.ts Docs Oficiais + checklist)
```

**Note on `[P]` in this run**: Execution is inline (3 phases ≤ 3 → no sub-agent offer per the skill's
threshold), so `[P]` here just means "no inter-task dependency" — tasks are still executed one at a time
in the main loop, in the order T5, T6, T9, T7, with a fresh gate + atomic commit after each.

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1: Add GuiaFiscal model | 1 file, types only | ✅ Granular |
| T2: Fixture fallback (3 methods, 1 file + 1 new spec) | 1 service, cohesive (same fallback pattern×3) | ✅ Granular |
| T3: Guia CRUD (3 methods, 1 file) | 1 service, cohesive (same signal×3 methods) | ✅ Granular |
| T4: anexarDocumento fallback | 1 method | ✅ Granular |
| T5: Calendar merge decouple | 1 component + its test file | ✅ Granular |
| T6: Categories + guia dialog + WhatsApp toast | 1 component, cohesive (all toast/dialog additions) | ✅ Granular |
| T7: Docs Oficiais + checklist | 1 component (same file as T6, next increment) | ✅ Granular |
| T9: salvarAnexo wiring | 1 method | ✅ Granular |

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | None | ✅ Match |
| T2 | None | T1→T2 | ✅ Match (T2 has no functional dependency on T1's types, but runs after in sequence for file ordering) |
| T3 | T1, T2 | T2→T3 | ✅ Match |
| T4 | T2 | T3→T4 | ✅ Match (T4 depends on T2 only; placed after T3 in the sequential chain since both touch the same file) |
| T5 | T3 | T4→T5 (after Phase 1 completes) | ✅ Match |
| T6 | T3 | T4→T6 (after Phase 1 completes) | ✅ Match |
| T9 | T4 | T4→T9 (after Phase 1 completes) | ✅ Match |
| T7 | T6 | T6→T7 | ✅ Match |

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | Model (types) | none | none | ✅ OK |
| T2 | Service | unit | unit | ✅ OK |
| T3 | Service | unit | unit | ✅ OK |
| T4 | Service | unit | unit | ✅ OK |
| T5 | Page component | unit | unit | ✅ OK |
| T6 | Page component | unit | unit | ✅ OK |
| T7 | Page component | unit | unit | ✅ OK |
| T9 | Page component | unit | unit | ✅ OK |

All ✅ — no restructuring needed before execution.
