# Dashboard API Real — Specification

Issue: [SupersonicTeam/frontend#20](https://github.com/SupersonicTeam/frontend/issues/20) · Épico: SupersonicTeam/Agrocontabil#33 · Sprint 5

## Problem Statement

O dashboard exibe hoje dados mockados (fluxo de caixa em R$, notas por mês, distribuição de impostos)
com um banner "dados de exemplo — integração em breve". O backend agora expõe o endpoint agregador
`GET /api/dashboard` (backend#65/#68), com **semântica diferente**: KPIs de IBS/CBS (não fluxo em R$),
contagens de notas por mês (não valores) e distribuição só IBS×CBS. Precisamos consumir esse endpoint
real, adaptar os cards à nova semântica e **remover todos os mocks de produção**.

## Goals

- [ ] Consumir `GET /api/dashboard` via `HttpClient` num único DTO tipado (`DashboardResponse`).
- [ ] Cache local do resultado com **Signals** (sobrevive à re-navegação, singleton root).
- [ ] Loading / erro-com-retry / vazio por seção do dashboard.
- [ ] Remover `mockNotas`, `mockNotasPorMes`, `MOCK_DISTRIBUICAO` e todo consumo deles em produção.
- [ ] Dashboard exibe dados reais do produtor logado sem nenhum dado falso.

## Out of Scope

| Feature | Reason |
| --- | --- |
| Seletor mês/ano ligado ao refetch (`?periodo=YYYY-MM`) | AD-004 — MVP carrega mês corrente; refetch por período é P3 (deferido). |
| Card de fluxo de caixa em R$ (entradas/saídas/lucro) | Backend não modela; adiado em backend#71. Substituído por KPIs IBS/CBS. |
| Endpoints de rascunho (`/dashboard/rascunhos/*`) | Não fazem parte do agregador `GET /api/dashboard`; issue própria. |
| FUNRURAL/ICMS/IPI na distribuição/simulador | Backend só calcula IBS/CBS (LC 214/2025). Narrativa educativa em texto permanece. |
| Redesign visual dos cards além do necessário | Feature é rewire de dados, não redesign. Reusa tokens/estilos atuais. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Resumo financeiro → KPIs IBS/CBS em cards separados | Débito/Crédito/Saldo de IBS e CBS + Total de notas | AD-002; backend só modela IBS/CBS | y |
| Fonte de "últimos documentos" | `ultimasNotas` do dashboard; preview via `NotasApi.obter(id)` | AD-003 | y |
| Período | Mês corrente (omitir `periodo`) | AD-004 | y |
| Fallback sem mock | Erro + "Tentar novamente"; vazio neutro | AD-005 | y |
| `documentos.ts` sem `mockNotas` | Erro + retry (reusa `notasErro`) | AD-006 | y |
| "Loading por seção" com 1 chamada consolidada | Skeleton por card ligado a um único `loading`; erro num banner de retry | Endpoint é único; granularidade por seção é visual | y |
| Precisão de valores `BigDecimal` (JSON number) | Exibir via `toLocaleString('pt-BR', BRL)`; sem arredondar antes | Contrato #27 §3.3 | y |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: Consumir o dashboard real ⭐ MVP

**User Story**: Como produtor rural, quero que o dashboard mostre meus números reais (IBS/CBS, notas do
período e últimas notas) para confiar nos dados em vez de ver exemplos.

**Why P1**: É o núcleo da issue e da DoD ("dados reais", "zero mocks").

**Acceptance Criteria**:

1. WHEN o dashboard é inicializado THEN o sistema SHALL fazer **uma** requisição `GET /api/dashboard`
   (sem `periodo`) e não chamar `/dashboard/fluxo-caixa`, `/notas-por-mes`, `/distribuicao-impostos`
   nem `/dashboard/produtores`.
2. WHEN a resposta chega THEN o sistema SHALL exibir o nome do produtor (`produtor.nome`) no cabeçalho.
3. WHEN a resposta chega THEN o sistema SHALL exibir KPIs de IBS/CBS a partir de `kpis`
   (débito/crédito/saldo de IBS e CBS + total de notas), sem card de fluxo de caixa em R$.
4. WHEN a resposta chega THEN o gráfico de barras/linha SHALL plotar **contagens** de `notasPorMes`
   (`entradas` × `saidas`) com rótulos de mês derivados de `periodo` (`YYYY-MM`).
5. WHEN a resposta chega THEN o gráfico de pizza SHALL plotar `distribuicaoImpostos` como **IBS × CBS**
   (legenda "CBS × IBS", sem FUNRURAL).
6. WHEN a resposta chega THEN o card "Últimos documentos" SHALL listar `ultimasNotas`
   (número, contraparte, data, valor, status) ordenadas por `dataEmissao` desc.

**Independent Test**: Mockar `GET /api/dashboard` com um payload conhecido e verificar que cada card
renderiza os valores desse payload e que nenhuma das URLs antigas é chamada.

---

### P1: Estados de loading, erro e vazio ⭐ MVP

**User Story**: Como produtor, quero ver que o dashboard está carregando, e poder tentar de novo se
falhar, para nunca ver dados falsos nem uma tela quebrada.

**Why P1**: DoD exige zero mocks; sem fallback mock, os estados são a rede de segurança.

**Acceptance Criteria**:

1. WHEN a requisição está em andamento THEN cada seção SHALL exibir seu skeleton de loading.
2. WHEN a requisição falha (erro HTTP) THEN o sistema SHALL exibir estado de erro com botão
   **"Tentar novamente"** e NÃO SHALL exibir dados mockados.
3. WHEN o usuário clica em "Tentar novamente" THEN o sistema SHALL refazer `GET /api/dashboard`.
4. WHEN a resposta é bem-sucedida mas uma seção vem vazia (ex.: `notasPorMes: []`, `ultimasNotas: []`)
   THEN a seção SHALL exibir um estado neutro ("sem dados no período"), sem dados falsos.

**Independent Test**: Simular `error` na chamada → ver estado de erro + botão; clicar → nova chamada.
Simular resposta com arrays vazios → ver estados vazios.

---

### P1: Remover mocks de produção ⭐ MVP

**User Story**: Como time, queremos zero dados falsos no código Angular de produção para cumprir a DoD.

**Why P1**: Item explícito da DoD.

**Acceptance Criteria**:

1. WHEN o código é compilado THEN `mockNotas`, `mockNotasPorMes`, `MOCK_DISTRIBUICAO` e
   `AMOSTRA_MENSAL` SHALL não existir em `dashboard.service.ts`.
2. WHEN `documentos.ts` falha ao listar notas THEN SHALL exibir estado de erro/retry (via `notasErro`),
   **sem** chamar `mockNotas()`.
3. WHEN se busca por `mockNotas|mockNotasPorMes|MOCK_DISTRIBUICAO` no `src/` THEN não SHALL haver
   ocorrências em código de produção (specs de teste podem referenciar apenas o novo contrato).

**Independent Test**: `grep -r "mockNotas\|mockNotasPorMes\|MOCK_DISTRIBUICAO" src/app` retorna vazio
(fora de arquivos `.spec.ts` que testam o novo comportamento); build passa.

---

### P2: Cache local com Signals

**User Story**: Como produtor, quero que ao voltar para o dashboard os dados apareçam imediatamente
(do cache) enquanto revalidam, para uma navegação fluida.

**Why P2**: Melhora UX e cumpre "cache local com Signals" da issue; não bloqueia o MVP de dados reais.

**Acceptance Criteria**:

1. WHEN o dashboard já foi carregado uma vez e o usuário retorna THEN o sistema SHALL exibir o último
   `DashboardResponse` cacheado (signal singleton root) imediatamente.
2. WHEN há cache exibido THEN o sistema SHALL revalidar em background com nova requisição e atualizar
   o signal ao concluir.

**Independent Test**: Chamar `carregar()` duas vezes; após a primeira, o signal exposto pelo service
retém o valor entre navegações.

---

## Edge Cases

- WHEN `kpis` tem valores zero THEN os cards SHALL exibir `R$ 0,00` / `0`, não vazio.
- WHEN `notasPorMes` tem menos de 6 meses THEN o gráfico SHALL plotar só os meses recebidos.
- WHEN um `status` de `ultimasNotas` é desconhecido THEN o badge SHALL cair no rótulo padrão (`statusNotaLabel`).
- WHEN o preview de uma nota é aberto e `NotasApi.obter(id)` falha THEN o modal SHALL exibir erro sem quebrar.
- WHEN valores `BigDecimal` chegam com muitas casas THEN a formatação BRL SHALL arredondar só na exibição.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| DASH-01 | P1: Consumir dashboard real | Execute | ✅ Verified |
| DASH-02 | P1: Consumir (produtor no header) | Execute | ✅ Verified |
| DASH-03 | P1: KPIs IBS/CBS em cards | Execute | ✅ Verified |
| DASH-04 | P1: Gráfico barras/linha = contagens | Execute | ✅ Verified |
| DASH-05 | P1: Pizza = IBS×CBS | Execute | ✅ Verified |
| DASH-06 | P1: Últimas notas reais | Execute | ✅ Verified |
| DASH-07 | P1: Loading por seção | Execute | ✅ Verified |
| DASH-08 | P1: Erro + "Tentar novamente" | Execute | ✅ Verified |
| DASH-09 | P1: Estados vazios neutros | Execute | ✅ Verified |
| DASH-10 | P1: Remover mocks do service | Execute | ✅ Verified |
| DASH-11 | P1: `documentos.ts` sem mock | Execute | ✅ Verified |
| DASH-12 | P2: Cache Signals singleton | Execute | ✅ Verified |

**ID format:** `DASH-[NUMBER]`
**Status values:** Pending → In Design → In Tasks → Implementing → Verified
**Coverage:** 12 total, 12 mapped to tasks, 0 unmapped. Verified by independent Verifier — see `.specs/features/dashboard-api-real/validation.md`.

---

## Success Criteria

- [ ] Dashboard renderiza 100% dos valores a partir de um único `GET /api/dashboard`.
- [ ] `grep` por mocks removidos retorna zero em código de produção.
- [ ] Falha de backend produz estado de erro + retry (nenhum dado falso exibido).
- [ ] `npm run lint`, `npm run build` e `npm test` verdes.
