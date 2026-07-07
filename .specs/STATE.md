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
| AD-011 | #28: `ContadorApi` (getPendencias/getRecebidos/getDocumentos/anexarDocumento/criarSolicitacao) e o novo CRUD de guias (getGuias/anexarGuia/marcarGuiaPaga) tentam a rota real primeiro e caem para **fixtures/signal em memória** em erro — reintroduz mock no domínio contador, especificamente autorizado pelo escopo próprio anunciado em AD-008. | Backend real não existe (endpoints `/contador/*`); backend#74 aberto para a persistência real de guias; produto precisa do painel demonstrável enquanto isso. | 2026-07-07 |
| AD-012 | `calendario.ts` **desacopla** a leitura de `/calendario-fiscal` (real, zero-mock) da leitura do `ContadorApi` (mock): falha isolada em um não esconde o outro. | Necessário para a guia (mock) aparecer no calendário mesmo com o backend de vencimentos fora do ar; sem isso o DoD da #28 não seria demonstrável. | 2026-07-07 |

---

## Handoff Snapshot

**Current feature:** `integracao-contrato-backend` (issue #27) — 📝 **Specs prontas, aguardando aprovação
para executar.** Worktree: `claude/issue-27-specs-planning-6b73f6`. Escopo confirmado pelo usuário:
**inclui as telas** (não só integração). 4 frentes / 22 requisitos (`INT-01..13`, `TRIB-01..09`), 15 tasks
em 4 fases: (1) bloco `financeiro` (fluxo de caixa R$) no dashboard — v1.1/backend#71 reverte AD-002, atenção
à semântica invertida vs. `notasPorMes`; (2) `authInterceptor` inócuo (Sprint 8-ready) + `TokenService`;
(3) downloads robustos (`Content-Disposition` + erro-como-blob), chamadores = `documentos.ts`; (4) **tela
`/tributario` NOVA** (Apuração+reabrir/Créditos/Relatório JSON+PDF, seletor de período, erros por `code`),
depende da Fase 3. **Descoberta:** a jornada de emissão de NF-e já existe em `documentos.ts` (#12/#14) — não
reconstruir. **OQ-1/A-7:** `ApuracaoResponse` não tem `id` mas `reabrir` é por `{id}` — abrir follow-up no
backend; UI degrada até lá. **Next step:** aprovação → oferecer delegação por sub-agentes (>3 fases) →
executar. Specs em `.specs/features/integracao-contrato-backend/`.

---

**Feature anterior:** `contador-fluxo-documentos` (issue #28) — ✅ **Done** (T1..T7,T9 implementadas — T8
foi dobrado em T6 —, testadas e commitadas; 1 rodada de fix→re-verify; Verifier PASS na 2ª iteração).
**Branch:** `claude/lucid-swartz-a13e3d` (worktree). Commits: `6f4af77`, `63d61f2`, `4d94cdb`, `f8d8167`,
`c6fcc7e`, `6047f39`, `8dde054`, `bd3612e`, `edef908`.
**Backend follow-up aberto:** SupersonicTeam/backend#74 (persistência real de guias fiscais —
`POST/GET /contador/guias`, `PATCH /contador/guias/:id/pagar`).
**Verifier:** 1ª rodada FAIL (3 gaps: notificação ausente em CTD-17, AC CTD-22 arquiteturalmente
inatingível, teste de resiliência do calendário dependente de ordem de flush). Todos os 3 corrigidos no
commit `edef908`; 2ª rodada PASS — 24 ACs (19 limpos + 3 spec-precision gaps documentados como aceitáveis
+ 2 corrigidos), sensor de mutação 3/3 mortos após a correção, gates (build/lint/test) reconfirmados de
forma independente (68/68 testes). Relatório completo: `.specs/features/contador-fluxo-documentos/validation.md`.
**Entregue:** `GuiaFiscal`/`TipoGuia`/`CreateGuiaDto` (model); `ContadorApi` com fallback de fixtures em
`getPendencias`/`getRecebidos`/`getDocumentos`/`anexarDocumento`/`criarSolicitacao` + CRUD de guias
(`getGuias`/`anexarGuia`/`marcarGuiaPaga`, signal em memória, seed lazy); `calendario.ts` desacoplado
(falha em `/calendario-fiscal` não esconde mais itens do `ContadorApi`) + guias no calendário;
`contador.ts`/`.html`: 5 novas categorias, dialog "Anexar guia", toast "WhatsApp — em breve" (guia +
nova solicitação, zero HTTP), notificação via `NotificacoesService.adicionar()` (novo método) ao criar
solicitação, guias populadas em "Docs Oficiais" com ação "Marcar como paga", checklist de fechamento
mensal por período; `documentos.ts`: `salvarAnexo()` ligado de fato a `anexarDocumento()`.
**Gaps não-bloqueantes (ver validation.md):** CTD-04 (banner estático, pré-existente, não testado nesta
feature), CTD-15 (branch de erro defensivo em `anexarDocumento` tecnicamente inatingível — o fallback
sempre sucede), CTD-16 (cobertura das 3 abas via fixture, sem assertion dedicada).
**Lições candidatas registradas:** L-001..L-004 em `.specs/lessons.json` (notificação como side-effect
de AC, estado vazio "sem seleção" vs. "seleção vazia", teste de decoupling precisa de ordem de flush
invertida, estender fallback mock a métodos irmãos no mesmo service).
**Next step:** issue #28 pronta para PR/merge (ainda não pushado para o remoto — decisão de push cabe ao
usuário). Bundle inicial em 696.97 kB, ainda dentro do budget de erro (1 MB) mas acima do warn (500 kB) —
crescimento cumulativo de várias features recentes, não investigado a fundo nesta sessão (fora de escopo
da #28); vale revisar/otimizar em uma issue própria se continuar crescendo.

**Feature anterior:** `tributario-service-zero-mock` (issue #21) — ✅ Done. Verifier PASS 10/10 ACs.
**Feature anterior a essa:** `dashboard-api-real` — ✅ Done. Verifier PASS 16/16 ACs. Issue #20 pronta para PR/merge.
**Deferred:** seletor de período com refetch (`?periodo=YYYY-MM`) — P3 (AD-004). Upload de arquivo (PDF)
para a guia fiscal — extensão natural do backend#74, fora do escopo da #28.
