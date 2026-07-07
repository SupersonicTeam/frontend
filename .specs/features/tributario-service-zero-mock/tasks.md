# Tasks — Integração Tributário + Zero Mock (issue #21)

Cada task = 1 commit atômico. Gate = testes/lint/build verdes conforme a task. Testes derivam dos AC do
spec, não da implementação. Não enfraquecer/pular testes.

Branch: worktree atual (`claude/relaxed-khorana-e3ac1e`). PR final para `main` com `Closes #21`.

## Fase 1 — Tributário (service + tipos + testes)

### T1 ✅ — Models e enum de Tributário  ·  REQ-T6
- Criar `core/enums/status-apuracao.enum.ts` (`StatusApuracao`).
- Criar `core/models/tributario.model.ts` (`Apuracao`, `CreditoSaldo`, `RelatorioConformidade`).
- **Gate:** `npm run build` compila (tipos válidos, sem uso ainda). `npm run lint` verde.
- **Commit:** `feat(tributario): models e enum de apuração/créditos/conformidade (#21)`

### T2 ✅ — `TributarioApi` + testes de integração  ·  REQ-T1..T5, T7, Q1 (AC-1..AC-5, AC-7)
- Criar `services/tributario/data-access/tributario.service.ts` (métodos apuracao, reabrirApuracao,
  saldoCredito, relatorioConformidade, relatorioConformidadePdf). Espelhar `NotasApi.pdf()` para a URL do PDF.
- Criar `services/tributario/data-access/tributario.service.spec.ts` (`HttpTestingController`): um teste
  por AC-1..AC-5 (URL, param `periodo`, verbo, `responseType:'blob'`, mapeamento) + assert `httpMock.verify()`.
  Teste extra: `tributario.service.ts` não contém `catchError`/`of(` (AC-7 — via revisão; o Verifier confirma).
- **Gate:** `npm test` (novos specs verdes). `npm run lint` + `npm run build` verdes.
- **Commit:** `feat(tributario): TributarioApi consumindo /api/apuracao,/creditos,/relatorios (#21)`

## Fase 2 — Zero mock no calendário

### T3 ✅ — Remover mock do `calendario.service` + teste de propagação de erro  ·  REQ-M1, Q1 (AC-8)
- Excluir `getMockVencimentos()`; remover `catchError(() => of(mock))` de `getVencimentos()` (mantém `map`).
- Criar/atualizar `calendario.service.spec.ts`: sucesso mapeia response real; erro (500) faz o observable
  **errar** (sem fallback). Assert AC-8 (nenhum literal de vencimento no arquivo).
- **Gate:** `npm test` verde. `npm run lint` + `npm run build` verdes.
- **Commit:** `refactor(calendario): remover mock silencioso; erro propaga (#21)`

### T4 ✅ — Estado de erro + retry na página de calendário  ·  REQ-M2, M3, Q1 (AC-9)
- `calendario.ts`: extrair `carregar()`, add `vencimentosErro` signal, `retry()`, tratar `error` do forkJoin.
  Espelhar escolha de `skipErrorNotify` de Documentos (REQ-M3).
- `calendario.html`: banner "Não foi possível carregar os vencimentos." + botão "Tentar novamente"
  (reusar markup/tokens do banner de Documentos/Dashboard).
- Criar/atualizar `calendario.spec.ts` (AC-9): falha → `vencimentosErro()===true`, lista vazia; `retry()`
  no sucesso limpa erro e preenche a lista. Seguir estilo `documentos.spec.ts`.
- **Gate:** `npm test` verde. `npm run lint` + `npm run build` verdes.
- **Commit:** `feat(calendario): estado de erro + retry sem dado mockado (#21)`

## Fase 3 — Fechamento

### T5 ✅ — Verificação final + DoD  ·  REQ-Q2, Q3 (AC-10)
- Rodar `npm run lint`, `npm run build`, `npm test` — os três verdes (CI). ✅ 40/40 testes, 0 erros de lint
  (54 warnings pré-existentes), build ok.
- `grep` de sanidade: nenhum `getMockVencimentos`/`FUNRURAL`/`SPED` no app; nenhum `catchError` novo com
  dado falso. ✅ Ambos vazios (confirmado). Checkboxes da issue #21 — atualização no GitHub pendente de
  confirmação do usuário (ação visível externa).
- **Gate:** trio verde; sem regressões. ✅
- **Commit:** sem ajustes de código necessários — nenhum commit adicional.

> Após T5, o **Verifier** roda automaticamente (author ≠ verifier): checagem por AC, sensor de mutação e
> `validation.md`. Gaps viram fix-tasks (loop ≤3).

## Dependências

```
T1 → T2         (service usa os models)
T3 → T4         (página depende do service sem mock)
T1/T2 ⟂ T3/T4   (Tributário e Calendário são independentes; Fase 1 e Fase 2 podem paralelizar)
T5 depende de T2 e T4
```

## Mapa de rastreabilidade

| Task | Requisitos | ACs |
| --- | --- | --- |
| T1 | REQ-T6 | AC-6 (parcial) |
| T2 | REQ-T1..T5, T7, Q1 | AC-1..AC-5, AC-7 |
| T3 | REQ-M1, Q1 | AC-8 |
| T4 | REQ-M2, M3, Q1 | AC-9 |
| T5 | REQ-Q2, Q3 | AC-10, AC-6 (final) |
