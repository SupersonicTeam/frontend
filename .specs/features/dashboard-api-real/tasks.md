# Dashboard API Real — Tasks

## Execution Protocol (MANDATORY — do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow
and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth
for the full flow (per-task cycle, gate, atomic commit, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/dashboard-api-real/design.md`
**Status**: Draft

---

## Test Coverage Matrix

> Generated from codebase + spec. Guidelines found: `CLAUDE.md` (Vitest/jsdom, TS strict, budgets),
> `.github/workflows/ci.yml` (lint · build · test). Existing test samples:
> `dashboard.service.spec.ts`, `notas.service.spec.ts` (padrão `HttpTestingController`).

| Code Layer | Required Test Type | Coverage Expectation | Location Pattern | Run Command |
| --- | --- | --- | --- | --- |
| DTO / interface (`core/DTOs/**`) | none | Só build gate (só tipos) | `src/app/core/DTOs/**/*.ts` | build gate |
| Service de negócio (`DashboardApi`) | unit | Todas as ACs de DASH-01/02/12: URL única, sem URLs antigas, cache signal, sem catchError | `src/app/services/**/data-access/*.spec.ts` | `npm test` |
| Página (`DashboardPage`, `documentos.ts`) | unit | ACs de render/estado: KPIs, gráficos (contagens), pizza IBS×CBS, últimas notas, loading/erro/retry/vazio, sem mock | `src/app/pages/**/*.spec.ts` | `npm test` |

**Coverage Expectation** segue o forte-default (mapear 1:1 às ACs do spec e cada edge case listado),
já que o repo tem cobertura pontual e o CI só roda `lint · build · test` sem threshold.

## Parallelism Assessment

> Vitest (jsdom) com `TestBed` isolado por teste (`HttpTestingController`), sem store compartilhado.

| Test Type | Parallel-Safe? | Isolation Model | Evidence |
| --- | --- | --- | --- |
| unit (service) | Yes | `TestBed.configureTestingModule` + `provideHttpClientTesting` por teste | `dashboard.service.spec.ts` |
| unit (component) | Yes | `TestBed` por teste; signals locais | `app.spec.ts` |

## Gate Check Commands

| Gate Level | When to Use | Command |
| --- | --- | --- |
| Quick | Após tarefas com testes unitários | `npm test` |
| Full | Igual ao quick (não há e2e/integration) | `npm test` |
| Build | Fim de fase / tarefas só-tipo | `npm run lint && npm run build && npm test` |

---

## Execution Plan

### Phase 1: Contrato de dados (Sequential)
```
T1
```

### Phase 2: Camada de serviço (Sequential)
```
T1 → T2
```

### Phase 3: UI do dashboard (Sequential — mesmo arquivo)
```
T2 → T3 → T4 → T5 → T6
```

### Phase 4: Limpeza de mocks (Sequential)
```
T6 → T7 → T8
```

---

## Task Breakdown

### T1: Criar DTO `DashboardResponse`

**What**: Interface tipada do payload de `GET /api/dashboard` (produtor, kpis, notasPorMes, distribuicaoImpostos, ultimasNotas).
**Where**: `src/app/core/DTOs/dashboard/dashboard.response.ts` (+ alias `@dtos/dashboard/...`)
**Depends on**: None
**Reuses**: `StatusNotaFiscal` (`@core/enums/status-nota-fiscal.enum`)
**Requirement**: DASH-01

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Todas as interfaces do design (`DashboardResponse`, `DashboardKpis`, `DashboardNotasPorMes`, `DashboardDistribuicaoImpostos`, `DashboardUltimaNota`, `DashboardProdutorResumo`, `OrigemNota`) exportadas.
- [ ] `status` usa `StatusNotaFiscal`; sem erros TS.
- [ ] Build gate passa: `npm run build`.

**Tests**: none · **Gate**: build
**Commit**: `feat(dashboard): DTO DashboardResponse para /api/dashboard (#20)`

---

### T2: Refatorar `DashboardApi` — `carregar()` + cache Signal, remover mocks/métodos obsoletos

**What**: Substituir os métodos separados por `carregar(periodo?)` (`GET /api/dashboard`, sem `catchError`) que cacheia num signal singleton `dashboard`; remover `getFluxoCaixa/getProdutor/getProdutores/getNotasPorMes/getDistribuicaoImpostos/getImpostosPorTipo`, `mockNotasPorMes`, `MOCK_DISTRIBUICAO`, `AMOSTRA_MENSAL`, tipos `ResumoMensalNotas`/`DistribuicaoImposto`. (`mockNotas` sai em T7, após Documentos migrar.)
**Where**: `src/app/services/dashboard/data-access/dashboard.service.ts` + `dashboard.service.spec.ts`
**Depends on**: T1
**Reuses**: `ApiService.get`, padrão `XxxApi`
**Requirement**: DASH-01, DASH-12

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `carregar()` faz **um** `GET /api/dashboard` sem `periodo`; teste garante que nenhuma URL antiga (`/dashboard/fluxo-caixa`, `/dashboard/*/notas-por-mes`, `/dashboard/*/distribuicao-impostos`, `/dashboard/produtores`) é chamada.
- [ ] Em sucesso, o signal `dashboard()` retém o `DashboardResponse` (teste de cache).
- [ ] Em erro HTTP, o observable **propaga** o erro (teste `expectOne(...).error(...)` → subscribe `error`).
- [ ] Métodos/const/tipos obsoletos (exceto `mockNotas`) removidos; sem referências pendentes que quebrem o build.
- [ ] Gate quick passa: `npm test`. Test count: ≥ 3 novos/atualizados.

**Tests**: unit · **Gate**: quick
**Commit**: `refactor(dashboard): consumir /api/dashboard com cache Signals (#20)`

---

### T3: `DashboardPage` — orquestração (carregar/loading/erro/retry) + produtor no header

**What**: Injetar `DashboardApi.carregar()` no `ngOnInit`; signals `loading`/`erro`; `tentarNovamente()`; nome do produtor de `dashboard().produtor.nome`. Remover consumo de `getFluxoCaixa/getProdutor/getNotasPorMes/getDistribuicaoImpostos` e o signal `fluxoCaixa`.
**Where**: `src/app/pages/dashboard/dashboard.ts` + `dashboard.html` + `dashboard.spec.ts` (novo)
**Depends on**: T2
**Reuses**: `ToastService`, ícones Lucide
**Requirement**: DASH-02, DASH-07, DASH-08

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `ngOnInit` chama `carregar()` uma vez; `loading` true durante, false ao fim.
- [ ] Erro → `erro(true)` e banner com "Tentar novamente"; clique re-chama `carregar()` (teste).
- [ ] Header mostra `produtor.nome` do payload.
- [ ] Gate quick passa: `npm test`. Test count: ≥ 3.

**Tests**: unit · **Gate**: quick
**Commit**: `feat(dashboard): carga real com loading/erro/retry e produtor real (#20)`

---

### T4: KPIs de IBS/CBS em cards separados (substitui Resumo financeiro em R$)

**What**: Substituir o card Entradas/Saídas/Lucro por cards de `kpis` (Débito/Crédito/Saldo IBS, Débito/Crédito/Saldo CBS, Total de notas), com skeleton e estado zero (`R$ 0,00`).
**Where**: `src/app/pages/dashboard/dashboard.ts` + `dashboard.html` + `dashboard.spec.ts`
**Depends on**: T3
**Reuses**: `formatCurrency`, tokens de design
**Requirement**: DASH-03, DASH-09

**Tools**: MCP: NONE · Skill: `frontend-design` (layout dos cards)

**Done when**:
- [ ] `computed` de KPIs deriva de `dashboard().kpis`; cards renderizam os 7 valores.
- [ ] Valores zero exibem `R$ 0,00`/`0` (não vazio) — teste.
- [ ] Banner "dados de exemplo" removido do topo.
- [ ] Gate quick passa: `npm test`. Test count: ≥ 2.

**Tests**: unit · **Gate**: quick
**Commit**: `feat(dashboard): KPIs de IBS/CBS a partir do endpoint real (#20)`

---

### T5: Gráficos — barras/linha (contagens) + pizza (IBS×CBS)

**What**: Ligar `barChartData`/`lineChartData` a `notasPorMes` (contagens; rótulo de mês de `periodo` `YYYY-MM`) e `pieChartData` a `distribuicaoImpostos` (`ibs`,`cbs`); atualizar legenda para "CBS × IBS"; estados vazios quando arrays vazios.
**Where**: `src/app/pages/dashboard/dashboard.ts` + `dashboard.html` + `dashboard.spec.ts`
**Depends on**: T4
**Reuses**: registro Chart.js do componente, `BaseChartDirective`
**Requirement**: DASH-04, DASH-05, DASH-09

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Barras/linha plotam `entradas`/`saidas` de `notasPorMes`; labels derivados de `periodo` (teste de mapeamento `YYYY-MM`→rótulo).
- [ ] Pizza plota `[ibs, cbs]`; legenda/subtítulo "CBS × IBS" (sem FUNRURAL) — teste de dados.
- [ ] `notasPorMes: []` / distribuição zero → estado vazio.
- [ ] Gate quick passa: `npm test`. Test count: ≥ 3.

**Tests**: unit · **Gate**: quick
**Commit**: `feat(dashboard): graficos de contagem e distribuicao IBS/CBS reais (#20)`

---

### T6: Últimas notas reais + preview sob demanda + simulador de `kpis`

**What**: Card "Últimos documentos" consome `dashboard().ultimasNotas`; `abrirPreview` busca a nota completa via `NotasApi.obter(id)` (loading/erro no modal). Simulador rederiva o breakdown de `kpis` (débito IBS/CBS), removendo a soma de `NotasApi.listar` e as linhas FUNRURAL estimadas do cálculo.
**Where**: `src/app/pages/dashboard/dashboard.ts` + `dashboard.html` + `dashboard.spec.ts`
**Depends on**: T5
**Reuses**: `NotasApi.obter`, `NotaPreview`, `statusNotaLabel/Badge`
**Requirement**: DASH-06, DASH-09

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] Lista renderiza `ultimasNotas` (número, contraparte, valor, data, badge de status) ordenada por `dataEmissao` desc.
- [ ] `abrirPreview` chama `NotasApi.obter(id)`; sucesso mostra `NotaPreview`, falha mostra erro sem quebrar (teste dos dois caminhos).
- [ ] `impostoBreakdown`/`totalImpostoCalculado` derivam de `kpis`; sem `NotasApi.listar` no dashboard.
- [ ] `ultimasNotas: []` → estado vazio "Nenhum documento".
- [ ] Gate quick passa: `npm test`. Test count: ≥ 4.

**Tests**: unit · **Gate**: quick
**Commit**: `feat(dashboard): ultimas notas reais e preview sob demanda (#20)`

---

### T7: Remover `mockNotas` do service e migrar `documentos.ts` para erro+retry

**What**: Remover a função `mockNotas` (e seu teste) de `dashboard.service`; em `documentos.ts` trocar o fallback `mockNotas()` por `notas([])` + `notasErro(true)` no `error` de `recarregarNotas`; remover o import.
**Where**: `src/app/services/dashboard/data-access/dashboard.service.ts` (+ `.spec.ts`) · `src/app/pages/documentos/documentos.ts` (+ `documentos.spec.ts` se existir/necessário)
**Depends on**: T6
**Reuses**: `notasErro` (já existente), banner de erro de Documentos
**Requirement**: DASH-10, DASH-11

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `mockNotas` não existe mais em `dashboard.service.ts`; teste de `mockNotas` removido/substituído.
- [ ] `documentos.ts` não importa nem chama `mockNotas`; em erro mostra lista vazia + `notasErro` (teste do caminho de erro).
- [ ] Gate quick passa: `npm test`. Test count: mantém/ajusta sem deleções silenciosas.

**Tests**: unit · **Gate**: quick
**Commit**: `refactor(dashboard,documentos): remover mockNotas e usar erro+retry (#20)`

---

### T8: Varredura final "zero mocks" + build/lint/test

**What**: Garantir que `grep` por `mockNotas|mockNotasPorMes|MOCK_DISTRIBUICAO|AMOSTRA_MENSAL` em `src/app` retorna vazio em código de produção; rodar o gate de build completo.
**Where**: `src/app/**` (verificação) — sem novo código além de ajustes residuais
**Depends on**: T7
**Reuses**: —
**Requirement**: DASH-10

**Tools**: MCP: NONE · Skill: NONE

**Done when**:
- [ ] `grep -rn "mockNotas\|mockNotasPorMes\|MOCK_DISTRIBUICAO\|AMOSTRA_MENSAL" src/app` → sem ocorrências em `.ts` de produção (permitido só em `.spec.ts` que validem o novo contrato, se houver).
- [ ] Build gate passa: `npm run lint && npm run build && npm test`.
- [ ] Bundle inicial dentro do budget (sem regressão do chunk lazy do Chart.js).

**Tests**: none (verificação) · **Gate**: build
**Commit**: `chore(dashboard): verificacao final zero mocks + gate (#20)`

---

## Parallel Execution Map

```
Phase 1: T1
Phase 2: T1 → T2
Phase 3: T2 → T3 → T4 → T5 → T6   (mesmo arquivo dashboard.ts/html — sequencial)
Phase 4: T6 → T7 → T8
```

Nenhuma tarefa marcada `[P]`: T3–T6 mutam o mesmo `dashboard.ts`/`dashboard.html` (estado compartilhado) → sequenciais por design.

---

## Task Granularity Check

| Task | Scope | Status |
| --- | --- | --- |
| T1: DTO DashboardResponse | 1 arquivo de tipos | ✅ Granular |
| T2: Refatorar service | 1 service + spec | ✅ Granular |
| T3: Orquestração da página | 1 concern (carga/estado) | ✅ Granular |
| T4: Cards KPI | 1 seção | ✅ Granular |
| T5: Gráficos | 1 concern (charts) | ✅ Granular |
| T6: Últimas notas + preview + simulador | 1 concern (dados de notas) coeso | ✅ Granular |
| T7: Remover mock + Documentos | 1 remoção + 1 ajuste acoplado | ✅ Coeso (mesma remoção) |
| T8: Varredura + gate | 1 verificação | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (body) | Diagram Shows | Status |
| --- | --- | --- | --- |
| T1 | None | (raiz) | ✅ Match |
| T2 | T1 | T1→T2 | ✅ Match |
| T3 | T2 | T2→T3 | ✅ Match |
| T4 | T3 | T3→T4 | ✅ Match |
| T5 | T4 | T4→T5 | ✅ Match |
| T6 | T5 | T5→T6 | ✅ Match |
| T7 | T6 | T6→T7 | ✅ Match |
| T8 | T7 | T7→T8 | ✅ Match |

---

## Test Co-location Validation

| Task | Code Layer | Matrix Requires | Task Says | Status |
| --- | --- | --- | --- | --- |
| T1 | DTO/interface | none | none | ✅ OK |
| T2 | Service de negócio | unit | unit | ✅ OK |
| T3 | Página | unit | unit | ✅ OK |
| T4 | Página | unit | unit | ✅ OK |
| T5 | Página | unit | unit | ✅ OK |
| T6 | Página | unit | unit | ✅ OK |
| T7 | Service + Página | unit | unit | ✅ OK |
| T8 | Verificação (nenhuma camada nova) | none | none | ✅ OK |

---

## Tools per task (MCPs & Skills)

- MCP: nenhum necessário (sem MCP de projeto ativo relevante).
- Skills: `frontend-design` em T4 para o layout dos cards de KPI (opcional). Demais tarefas seguem os padrões do `CLAUDE.md`.
- Preview: usar `preview_*` (dev server porta 4200) para verificação visual do dashboard ao fim de T4–T6.
