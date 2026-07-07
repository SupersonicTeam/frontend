# Integração Contrato Backend v1.1 — Specification

> Issue #27 — "contrato integração frontend + backend". Fecha os **gaps de conformidade** do frontend
> Angular contra o contrato oficial do backend AgroContábil **v1.1 (2026-07-07)**.

## Problem Statement

O contrato do backend (issue #27) é a fonte de verdade da integração da Sprint 5. As três features
anteriores (`dashboard-api-real` #20, `tributario-service-zero-mock` #21, `contador-fluxo-documentos` #28)
já cobrem a maior parte dos endpoints, mas restam **quatro lacunas reais** entre o contrato v1.1 e o
código atual: (1) o bloco `financeiro` — fluxo de caixa em R$ — que a **v1.1 reintroduziu** no
`GET /api/dashboard` (backend#71/PR#72) não é consumido nem exibido (AD-002 o havia removido quando o
backend só modelava IBS/CBS); (2) não existe o **interceptor `Authorization`** que o contrato (Seção 2 e
checklist Seção 10) exige estruturar já agora para a Sprint 8; (3) os **downloads binários** (XML/PDF) não
leem o header `Content-Disposition` para o nome do arquivo nem tratam o caso de erro em que o corpo é um
`Blob` de `ApiError` em vez do binário esperado (Seção 9); e (4) **não há tela** consumindo `TributarioApi`
— Apuração, Créditos e Relatório de conformidade (§7.4/7.5/7.6) têm service testado (#21) mas nenhuma
rota/UI. A jornada de emissão de NF-e já está construída em `documentos.ts` (#12/#14) — não é reconstruída.

## Goals

- [ ] Dashboard consome e exibe o bloco `financeiro` (`totalEntradas`/`totalSaidas`/`saldo`/`lucroEstimado`)
      do `GET /api/dashboard`, respeitando a **semântica invertida** documentada na Seção 8.5 do contrato.
- [ ] Cliente HTTP com **interceptor `Authorization` estruturado** — inócuo hoje (sem token → sem header,
      nenhuma chamada atual quebra), pronto para ativar `Bearer <token>` na Sprint 8.
- [ ] Downloads de XML/PDF **robustos**: nome do arquivo lido de `Content-Disposition` e erro-como-blob
      (`ApiError` JSON) tratado pela mesma via de `errors[].code` do resto da app.
- [ ] **Tela Tributário** (`/tributario`) consumindo `TributarioApi`: Apuração (+ reabrir), Créditos e
      Relatório de conformidade (JSON + PDF), com seletor de período e ramificação de erros por `code`.
- [ ] Zero regressão: build, lint e os 68+ testes existentes continuam verdes; bundle inicial dentro do
      budget de erro (1 MB).

## Out of Scope

Explicitamente excluído. Documentado para evitar scope creep.

| Feature | Reason |
| --- | --- |
| Re-implementar a jornada de emissão de NF-e na UI | Já construída em `documentos.ts` (#12/#14): criar/editar/excluir, gerar-XML, SEFAZ, consultar status, cancelar, importar XML, validações. Aqui ela só **ganha robustez de download** (Frente C). |
| Seletor de período no **dashboard** com refetch | Deferido em AD-004 (P3); o dashboard segue no mês corrente. (A tela Tributário **tem** seu próprio seletor — os endpoints exigem `periodo`, ver TRIB-02.) |
| Ativação real do JWT / fluxo de login-logout | Auth real é débito da Sprint 8 (contrato Seção 2). Aqui só se estrutura o interceptor inócuo. |
| Upload multipart com barra de progresso | `NotasApi.importar` já envia o multipart; UX de progresso não é exigida pelo contrato. |
| Endpoint dedicado de calendário fiscal | Não existe no contrato; calendário permanece client-side (ver Assumção A-4). |
| Consultoria por IA (`Conversa`/`Diagnostico`/`Feedback`) | Scaffolding sem endpoint no backend (contrato Seção 11); sprint futura. |

---

## Assumptions & Open Questions

Toda ambiguidade está resolvida ou registrada aqui — nada fica silenciosamente indefinido.

| Assumption / decisão | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| **A-1 — Escopo de #27 inclui as telas consumidoras faltantes.** | Além das 3 frentes de integração, construir a **tela Tributário** (`/tributario`): Apuração + Créditos + Relatório de conformidade (JSON + PDF). A jornada de NF-e já existe em `documentos.ts` (#12/#14) e não é reconstruída. | Decisão do usuário na aprovação da spec: incluir as telas. `TributarioApi` já existe (#21) mas não tinha tela; esta é a lacuna de UI real. | **y** |
| **A-2 — Semântica invertida de `financeiro`** é responsabilidade do backend; o frontend apenas exibe os campos com rótulos diretos. | `financeiro.totalEntradas` → rótulo "Entradas (R$)"; `totalSaidas` → "Saídas (R$)". Nenhuma re-inversão no cliente. | Contrato 8.5: backend já computa `totalEntradas`=PROPRIA(vendas), `totalSaidas`=IMPORTADA(compras). Re-inverter no cliente = bug. | y (contrato) |
| **A-3 — `financeiro` pode faltar** em respostas de backend antigo/mock (a mudança é aditiva, mas não garantida em toda instância). | Card tolera `financeiro` ausente/`null`: não renderiza (ou mostra "—"), sem quebrar o resto do dashboard. | Robustez defensiva; consistente com "tolerar `null`" do contrato (3.3/3.4). | n |
| **A-4 — Calendário fiscal permanece client-side** (checklist Seção 10, último item). | Ratificar como decisão (AD nova em STATE.md); nenhum endpoint novo. Nenhuma mudança de código. | Não há endpoint no contrato; frontend já resolve client-side. Ratificação é registro, não código. | n |
| **A-5 — Fonte do token para o interceptor** `Authorization`. | Ler de um ponto único ainda-inexistente (ex.: `localStorage`/futuro `AuthService`); hoje retorna `null` → header ausente. Estruturar sem persistência real de sessão. | Sprint 8 introduz o auth real; hoje o header deve ser inócuo. | n |
| **A-6 — Seletor de período da tela Tributário.** | A tela tem seletor mês/ano próprio (default = mês corrente `America/Sao_Paulo`) que dispara os 3 fetches (`apuracao`/`creditos`/`relatorio`). É obrigatório porque esses endpoints **exigem** `periodo` (contrato 7.4/7.5/7.6; AD-009). | Sem seletor a tela não funciona. Não conflita com AD-004 (que só deferiu o seletor do **dashboard**). | y |
| **A-7 — Reabrir apuração é não-conectável hoje (CONFIRMADO na API real).** | `POST /api/apuracao/{id}/reabrir` exige `@PathVariable UUID id` (verificado em `ApuracaoController.java:102-104`), mas **nenhum** endpoint devolve esse `id`: `ApuracaoResponse` (`ApuracaoResponse.java`) não tem campo `id` e o único `GET` é por `periodo`. → A UI de reabrir é entregue **preparada mas desabilitada**, com aviso e link para o follow-up de backend; a **lógica de ramificação de erro por `code` (409/422) é implementada e testada com mocks**. | Confirmado contra a fonte real (não só o contrato). Não inventar id. Ativa-se sozinha quando o backend expuser o `id`. | **y (confirmado na fonte)** |

**Open questions:**
- **OQ-1 (A-7) — CONFIRMADO como lacuna do backend, não do frontend.** Verificado direto na API real:
  `ApuracaoController.reabrir` exige `UUID id` no path; `ApuracaoResponse` não tem `id` e não há endpoint
  que o devolva. **Resolução: abrir issue no backend** — expor `id` em `ApuracaoResponse` **ou** aceitar
  `POST /api/apuracao/reabrir?periodo=YYYY-MM`. Até lá, TRIB-04 entrega a UI preparada+desabilitada (A-7);
  TRIB-05 (ramificação 409/422 por `code`) é implementada/testada com mocks e ativa quando o `id` existir.
- A-4 (calendário client-side) permanece uma **ratificação** de decisão (registro em STATE.md), não código.

---

## User Stories

### P1: Resumo financeiro (fluxo de caixa em R$) no dashboard ⭐ MVP

**User Story**: Como produtor rural, quero ver no dashboard o **fluxo de caixa do período em R$**
(entradas, saídas, saldo e lucro estimado) para entender o resultado financeiro além dos impostos.

**Why P1**: É a mudança concreta que a v1.1 do contrato trouxe (backend#71) e o item de dashboard mais
visível ainda pendente da Sprint 5; reintroduz um card que os usuários já esperavam.

**Acceptance Criteria**:

1. WHEN `DashboardResponse` é tipado THEN o sistema SHALL incluir o bloco `financeiro` com os campos
   `totalEntradas`, `totalSaidas`, `saldo`, `lucroEstimado` (todos `number`).
2. WHEN o `GET /api/dashboard` retorna com `financeiro` preenchido THEN o dashboard SHALL exibir um card
   "Resumo financeiro" com os quatro valores formatados em BRL (`pt-BR`, `Intl.NumberFormat` só na exibição).
3. WHEN `financeiro.totalEntradas` é exibido THEN o sistema SHALL rotulá-lo como "Entradas" e
   `financeiro.totalSaidas` como "Saídas" **sem re-inverter** os valores (backend já aplicou a semântica).
4. WHEN `financeiro.lucroEstimado` for **negativo** THEN o sistema SHALL exibi-lo (com sinal/estilo de
   valor negativo), sem suprimir nem zerar.
5. WHEN a resposta **não contém** `financeiro` (ausente/`null`) THEN o dashboard SHALL renderizar o restante
   normalmente e o card SHALL degradar graciosamente (não renderiza ou mostra "—"), sem lançar erro.

**Independent Test**: Mockar `DashboardApi.carregar` retornando um `DashboardResponse` com `financeiro`
(incluindo `lucroEstimado` negativo) e sem `financeiro`; verificar os valores/labels renderizados e a
ausência de erro no segundo caso.

---

### P1: Interceptor `Authorization` estruturado (Sprint 8-ready) ⭐ MVP

**User Story**: Como time de frontend, quero o cliente HTTP já estruturado para enviar
`Authorization: Bearer <token>` para que a ativação do JWT na Sprint 8 não exija mudar rotas nem DTOs.

**Why P1**: Exigência explícita do contrato (Seção 2 e checklist Seção 10, item 2).

**Acceptance Criteria**:

1. WHEN existe um `authInterceptor` registrado no `provideHttpClient` THEN toda requisição SHALL passar por
   ele antes de sair.
2. WHEN **não há token** disponível (estado atual) THEN o interceptor SHALL **não** adicionar o header
   `Authorization` e SHALL deixar a requisição inalterada (nenhuma chamada atual quebra).
3. WHEN **há um token** disponível THEN o interceptor SHALL adicionar `Authorization: Bearer <token>` à
   requisição.
4. WHEN o interceptor roda junto ao `apiInterceptor` THEN a ordem SHALL preservar o comportamento atual do
   `apiInterceptor` (prefixo de baseURL, `Accept`, tratamento de erro) sem regressão.

**Independent Test**: Testar o interceptor isolado com fonte de token vazia (assert: sem header
`Authorization`) e com token presente (assert: `Authorization: Bearer <token>`), usando um `HttpRequest`
mock e um `next` espião.

---

### P1: Downloads binários robustos (Content-Disposition + erro-como-blob) ⭐ MVP

**User Story**: Como produtor, quero baixar XML/DANFE/relatório com o **nome de arquivo correto** e receber
uma **mensagem de erro amigável** quando o download falha, em vez de um arquivo corrompido.

**Why P1**: Contrato Seção 9 + checklist Seção 10 (downloads via blob + `Content-Disposition`; erro ainda
vem como JSON `ApiError`).

**Acceptance Criteria**:

1. WHEN um endpoint de download responde com sucesso THEN o sistema SHALL extrair o nome do arquivo do
   header `Content-Disposition` (ex.: `attachment; filename="danfe-{id}.pdf"`) e usá-lo ao salvar.
2. WHEN o header `Content-Disposition` está ausente/ilegível THEN o sistema SHALL usar um **nome de fallback
   determinístico** (ex.: `danfe-{id}.pdf`, `conformidade-{periodo}.pdf`) sem falhar.
3. WHEN um endpoint de download **falha** e o corpo do erro é um `Blob` de `ApiError` JSON THEN o sistema
   SHALL desserializar o blob para `ApiErrorEnvelope` e derivar a mensagem via `errors[].code`/`message`
   (mesma via do `mensagemAmigavel`), exibindo-a ao usuário.
4. WHEN o `HttpClient` é chamado para download THEN ele SHALL usar `responseType: 'blob'` e
   `observe: 'response'` (para acessar os headers).

**Independent Test**: Mockar respostas de blob com e sem `Content-Disposition` e um erro cujo `error` é um
`Blob` de `ApiError`; verificar filename resolvido, fallback, e mensagem derivada do `code`.

---

### P1: Tela Tributário — Apuração, Créditos e Relatório de conformidade ⭐ MVP

**User Story**: Como produtor rural, quero uma tela que mostre a **apuração mensal de IBS/CBS**, meu
**saldo de créditos** e o **relatório de conformidade** (débitos × créditos) do período, com opção de
baixar o relatório em PDF, para acompanhar minha situação fiscal.

**Why P1**: É a lacuna de UI real do contrato — `TributarioApi` existe (#21) mas nenhuma tela o consome
(não há rota `/tributario`). Cobre os itens de checklist §10: Apuração+reabertura, Créditos, Relatório
(JSON+PDF).

**Acceptance Criteria**:

1. WHEN o usuário acessa `/tributario` THEN o sistema SHALL carregar, para o período selecionado (default =
   mês corrente), a apuração (`GET /api/apuracao`), os créditos (`GET /api/creditos`) e o relatório
   (`GET /api/relatorios/conformidade`).
2. WHEN a apuração é exibida THEN o sistema SHALL mostrar `debitoIbs/Cbs`, `creditoIbs/Cbs`, `saldoIbs/Cbs`,
   `totalNotas`, o `status` (badge ABERTO/EM_PROCESSAMENTO/FECHADO) e `dataFechamento` quando presente.
3. WHEN o usuário troca o período no seletor mês/ano THEN o sistema SHALL refazer os três fetches com o novo
   `periodo` (`YYYY-MM`).
4. WHEN a apuração está `FECHADO` THEN o sistema SHALL apresentar a ação "Reabrir" **desabilitada com aviso**
   ("indisponível — backend não expõe o id da apuração", A-7/OQ-1), já que nenhum response traz o `id`; a
   ação SHALL habilitar automaticamente quando/se o `id` passar a existir. WHEN `status≠FECHADO` THEN a ação
   SHALL ficar oculta.
5. WHEN o usuário reabre e o backend responde **409 `APURACAO_NAO_REABRIVEL`** THEN o sistema SHALL exibir
   mensagem específica ("apuração não está fechada"); WHEN responde **422 `REABERTURA_FORA_PRAZO`** THEN
   SHALL exibir "fora do prazo de 3 meses" — ambos **ramificados por `errors[].code`**, não por texto.
6. WHEN os créditos são exibidos THEN o sistema SHALL mostrar `creditoIbs`, `creditoCbs`, `creditoTotal` e
   `quantidadeNotas`; WHEN não há notas de entrada THEN SHALL exibir estado zerado (não erro).
7. WHEN o relatório é exibido THEN o sistema SHALL mostrar débitos (`quantidadeSaidas`), créditos
   (`quantidadeEntradas`) e `saldoAPagar`, sinalizando **`saldoAPagar` negativo como "saldo credor"** (estilo
   distinto de "a pagar").
8. WHEN o usuário clica em "Baixar PDF" THEN o sistema SHALL baixar `GET /api/relatorios/conformidade/pdf`
   via blob, com nome de `Content-Disposition` (fallback `conformidade-{periodo}.pdf`), e em erro-como-blob
   SHALL exibir mensagem amigável derivada do `code` (reusa a Frente C).
9. WHEN qualquer fetch está carregando / falha / vem vazio THEN a seção correspondente SHALL exibir estado
   de **loading / erro-com-retry / vazio** independente (falha num não esconde os outros).

**Independent Test**: Navegar para `/tributario` com `TributarioApi` mockado; verificar render dos 3 blocos,
refetch ao trocar período, ramificação 409 vs 422 por `code` no reabrir, rótulo "saldo credor" para
`saldoAPagar<0`, e download do PDF com filename/fallback.

---

## Edge Cases

- WHEN `financeiro.saldo` = 0 e todos os campos = 0 THEN o card SHALL exibir "R$ 0,00" (não estado vazio).
- WHEN `financeiro` presente mas `lucroEstimado` negativo THEN valor renderizado com sinal negativo (AC P1.A-4).
- WHEN `Content-Disposition` traz `filename*=UTF-8''...` (RFC 5987) THEN o parser SHALL, no mínimo, não
  quebrar e cair no fallback se não souber decodificar (não é requisito decodificar RFC 5987).
- WHEN o token existe mas é string vazia THEN o interceptor SHALL tratar como "sem token" (não enviar header).
- WHEN um download retorna 404 `RESOURCE_NOT_FOUND` como blob THEN a mensagem amigável SHALL ser derivada do
  envelope, não do texto bruto do blob.
- WHEN a apuração do mês corrente ainda não foi consolidada THEN a tela Tributário SHALL exibir a **projeção
  ao vivo** (`status=ABERTO`, `dataFechamento=null`) sem tratá-la como erro (contrato 7.4).
- WHEN `GET /api/apuracao` retorna **400 `VALIDATION_ERROR`** (periodo inválido) THEN a tela SHALL exibir
  estado de erro na seção; o seletor mês/ano deve, na prática, impedir períodos malformados.
- WHEN o `id` da apuração não está disponível no response (OQ-1/A-7) THEN a ação "Reabrir" SHALL informar
  indisponibilidade em vez de enviar uma requisição malformada.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| INT-01 | P1: Financeiro | Design | Pending |
| INT-02 | P1: Financeiro | Design | Pending |
| INT-03 | P1: Financeiro | Design | Pending |
| INT-04 | P1: Financeiro | Design | Pending |
| INT-05 | P1: Financeiro | Design | Pending |
| INT-06 | P1: Authorization | Design | Pending |
| INT-07 | P1: Authorization | Design | Pending |
| INT-08 | P1: Authorization | Design | Pending |
| INT-09 | P1: Authorization | Design | Pending |
| INT-10 | P1: Downloads | Design | Pending |
| INT-11 | P1: Downloads | Design | Pending |
| INT-12 | P1: Downloads | Design | Pending |
| INT-13 | P1: Downloads | Design | Pending |
| TRIB-01 | P1: Tributário | Design | Pending |
| TRIB-02 | P1: Tributário | Design | Pending |
| TRIB-03 | P1: Tributário | Design | Pending |
| TRIB-04 | P1: Tributário | Design | Pending |
| TRIB-05 | P1: Tributário | Design | Pending |
| TRIB-06 | P1: Tributário | Design | Pending |
| TRIB-07 | P1: Tributário | Design | Pending |
| TRIB-08 | P1: Tributário | Design | Pending |
| TRIB-09 | P1: Tributário | Design | Pending |

**Mapa AC → ID:** Financeiro AC1→INT-01, AC2→INT-02, AC3→INT-03, AC4→INT-04, AC5→INT-05 ·
Authorization AC1→INT-06, AC2→INT-07, AC3→INT-08, AC4→INT-09 ·
Downloads AC1→INT-10, AC2→INT-11, AC3→INT-12, AC4→INT-13 ·
Tributário AC1→TRIB-01, AC2→TRIB-03, AC3→TRIB-02, AC4→TRIB-04, AC5→TRIB-05, AC6→TRIB-06, AC7→TRIB-07,
AC8→TRIB-08, AC9→TRIB-09.

**ID format:** `INT-[NUMBER]` (integração) / `TRIB-[NUMBER]` (tela Tributário).
**Status:** Pending → In Design → In Tasks → Implementing → Verified.

**Coverage:** 22 total, 0 mapped to tasks (tasks.md pendente), 0 unmapped.

---

## Success Criteria

- [ ] Card "Resumo financeiro" visível no dashboard com valores reais de `financeiro`, incluindo lucro negativo.
- [ ] Nenhuma re-inversão de entrada/saída (validado por teste que fixa valores distintos).
- [ ] `authInterceptor` registrado; suíte prova header ausente (sem token) e presente (com token).
- [ ] Downloads resolvem filename via `Content-Disposition` e mostram mensagem amigável em erro-como-blob.
- [ ] Tela `/tributario` acessível pelo menu, exibindo Apuração + Créditos + Relatório do período, com
      seletor mês/ano, reabrir ramificando 409/422 por `code`, "saldo credor" para `saldoAPagar<0` e download
      do PDF de conformidade.
- [ ] Estados loading/erro-com-retry/vazio independentes por seção na tela Tributário.
- [ ] `npm run build`, `npm run lint`, `npm test` verdes; bundle inicial < 1 MB.
