# Dashboard API Real — Context

**Gathered:** 2026-07-06
**Spec:** `.specs/features/dashboard-api-real/spec.md`
**Status:** Ready for design

---

## Feature Boundary

Rewire da página `DashboardPage` e do `DashboardApi` para consumir o endpoint agregador real
`GET /api/dashboard`, adaptando os cards à nova semântica (KPIs IBS/CBS, contagens, IBS×CBS,
últimas notas reais), adicionando estados de loading/erro/vazio e removendo todos os mocks de produção.
Não é redesign visual nem expansão de escopo do dashboard.

---

## Implementation Decisions

### Resumo financeiro → KPIs IBS/CBS (AD-002)
- Remover o card de Entradas/Saídas/Lucro em R$ e o consumo de `FluxoCaixa`.
- Exibir KPIs a partir de `kpis`: Débito IBS, Crédito IBS, Saldo IBS, Débito CBS, Crédito CBS, Saldo CBS
  e Total de notas — em cards separados.
- Fluxo de caixa em R$ adiado no backend (issue backend#71) — não reintroduzir mock.

### Fonte das "últimas notas" (AD-003)
- Card "Últimos documentos" consome `ultimasNotas` do dashboard (número, origem, contraparte, data,
  valor, status).
- O preview (modal) busca a nota completa sob demanda via `NotasApi.obter(id)` — não pré-carrega 100 notas.

### Período (AD-004)
- MVP: carregar mês corrente (omitir `?periodo`). O seletor mês/ano existente no card Simulador deixa de
  disparar refetch — vira P3/deferido (ver Deferred Ideas).

### Fallback sem mock (AD-005, AD-006)
- Falha HTTP → estado de erro por dashboard com botão "Tentar novamente".
- Resposta ok mas seção vazia → estado neutro "sem dados no período".
- `documentos.ts` deixa de usar `mockNotas()`; em falha usa `notasErro` (erro + retry) com lista vazia.

### Cache com Signals (P2)
- Signal singleton root no `DashboardApi` guarda o último `DashboardResponse`; ao revisitar exibe cache
  e revalida em background.

### Agent's Discretion
- Layout exato/grid dos cards de KPI (quantos por linha, ícones) — dentro dos tokens de design atuais.
- Formatação dos rótulos de mês (`YYYY-MM` → `Mai/26`).
- Estrutura interna do simulador: derivar breakdown IBS/CBS de `kpis`/`distribuicaoImpostos`
  (sem somar notas, já que `ultimasNotas` não traz IBS/CBS por nota).

### Declined / Undiscussed Gray Areas → Assumptions
- Todas as áreas cinzentas foram discutidas e resolvidas (ver Assumptions & Open Questions no spec.md).

---

## Specific References

- Contrato do endpoint (comentário de `luizGervazio` na issue #20):
  `GET /api/dashboard?periodo=YYYY-MM` → `{ produtor, periodo, kpis, notasPorMes, distribuicaoImpostos, ultimasNotas }`.
- Padrões de projeto: `CLAUDE.md` (Signals, standalone, path aliases, tokens de design, DTOs em `core/DTOs`).

---

## Deferred Ideas

- **Seletor de período com refetch** (`?periodo=YYYY-MM`) — ligar os selects mês/ano a uma nova chamada
  do dashboard. Deferido para P3 / issue futura.
- **KPIs financeiros em R$** (fluxo de caixa) — depende de backend#71.
