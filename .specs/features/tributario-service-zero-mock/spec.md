# Spec — Integração Tributário + Zero Mock (issue #21)

> Sub-issue de `SupersonicTeam/Agrocontabil#34` (Integração completa) — lado frontend.
> Sprint 5. Garantir que o **núcleo** consuma endpoints Spring reais com tratamento global de erro
> e **zero dado hardcoded**.

## Contexto e estado atual (o que já existe — NÃO refazer)

Levantamento do código no início desta feature:

- ✅ **`NotasApi`** (`@services/notas/data-access/notas.service`) já consome `/api/notas` (+ pdf/xml/
  gerar-xml/cancelar). Tarefa `NotasFiscaisService` da issue = **feita**.
- ✅ **Interceptor global de erro + feedback amigável** já existe: `apiInterceptor`
  (`core/interceptors/api.interceptor.ts`) exibe toast derivado de `ApiError.errors[]`, com opt-out
  via `skipErrorNotify()` (`core/interceptors/error-notify.context.ts`). Entregue no PR #25. Tarefa
  "HTTP_INTERCEPTORS global de erro + Snackbar/feedback" = **feita**. Esta feature **reusa**, não reimplementa.
- ✅ **Dashboard** (`DashboardApi` + `dashboard.ts`) e **Documentos** (`documentos.ts`) já migraram de
  mock-fallback para **erro + "Tentar novamente"** (issue #20, decisões AD-005/AD-006). Núcleo já sem mock.
- ❌ **Tributário** (`/api/apuracao`, `/api/creditos`, `/api/relatorios/conformidade`) — endpoints reais
  existem no backend (`br.com.agrocontabil.controller.{Apuracao,Credito,RelatorioConformidade}Controller`),
  mas **nenhum service frontend os consome**. Gap principal desta issue.
- ❌ **`calendario.service`** ainda contém `getMockVencimentos()` — **único dado falso hardcodado** restante
  no app. Fere a DoD "zero dado hardcoded".

## Objetivo

Fechar os itens abertos da #21 no frontend:

1. Criar **`TributarioApi`** consumindo os 3 endpoints reais (apuração, créditos, relatório de
   conformidade + PDF), com models de domínio e testes de integração (`HttpTestingController`).
2. Remover o **mock silencioso do calendário**, substituindo por estado de erro + retry amigável
   (mesmo padrão de Dashboard/Documentos), zerando o dado hardcodado do app.

## Decisões de escopo (confirmadas com o usuário — ver STATE.md AD-007..AD-010)

- **Só service + DTOs/models + testes** para Tributário. **Sem tela nova** `/tributario` (UI consumidora
  é issue de outra sprint). O service nasce pronto para ser injetado.
- **Núcleo + mock do calendário**. Remover `getMockVencimentos()`. `contador`/`chat`/`notificacao`
  (fallbacks neutros `of([])`/`of(null)`, **sem dado falso**) ficam para issues próprias dos módulos.
- **`periodo` obrigatório e explícito** em cada método (`YYYY-MM`); o service não infere mês corrente
  (coerente com AD-004 — sem seletor de período ainda).
- **Response == Model (mapeamento 1:1, sem DTO intermediário)**: os records do backend já usam nomes de
  domínio em PT; duplicar em DTO+Model separados seria cerimônia. Define-se um único conjunto de tipos em
  `@models/tributario.model.ts` (BigDecimal → `number`, OffsetDateTime → `string` ISO). Ver AD-010.

## Contratos do backend (fonte de verdade — lidos em `br.com.agrocontabil`)

Todos exigem `?periodo=YYYY-MM` (regex `\d{4}-(0[1-9]|1[0-2])`; 400 `ApiError` se ausente/ inválido).
Recorte por produtor autenticado é feito no backend (anti-IDOR) — o frontend **não** envia `produtorId`.

| Método backend | Rota | Resposta |
| --- | --- | --- |
| `GET /api/apuracao?periodo=` | apuração mensal | `ApuracaoResponse` |
| `POST /api/apuracao/{id}/reabrir` | reabre apuração FECHADA | `ApuracaoResponse` (404/409/422) |
| `GET /api/creditos?periodo=` | saldo de crédito | `CreditoSaldoResponse` |
| `GET /api/relatorios/conformidade?periodo=` | consolidado débito×crédito | `RelatorioConformidadeResponse` |
| `GET /api/relatorios/conformidade/pdf?periodo=` | PDF (attachment) | `application/pdf` (binário) |

`ApuracaoResponse`: `periodo`, `status` (ABERTO\|EM_PROCESSAMENTO\|FECHADO), `debitoIbs`, `debitoCbs`,
`creditoIbs`, `creditoCbs`, `saldoIbs`, `saldoCbs`, `totalNotas` (long), `dataFechamento` (nullable).

`CreditoSaldoResponse`: `periodo`, `creditoIbs`, `creditoCbs`, `creditoTotal`, `quantidadeNotas` (long).

`RelatorioConformidadeResponse`: `periodo`, `debitoIbs`, `debitoCbs`, `debitoTotal`, `quantidadeSaidas`,
`creditoIbs`, `creditoCbs`, `creditoTotal`, `quantidadeEntradas`, `saldoIbs`, `saldoCbs`, `saldoAPagar`
(pode ser negativo = saldo credor).

## Requisitos com IDs rastreáveis

### Tributário — `TributarioApi`

- **REQ-T1** — `apuracao(periodo: string)` faz `GET /apuracao` com param `periodo` e retorna `Apuracao`.
- **REQ-T2** — `saldoCredito(periodo: string)` faz `GET /creditos` com param `periodo` e retorna `CreditoSaldo`.
- **REQ-T3** — `relatorioConformidade(periodo: string)` faz `GET /relatorios/conformidade` com param
  `periodo` e retorna `RelatorioConformidade`.
- **REQ-T4** — `relatorioConformidadePdf(periodo: string)` faz `GET /relatorios/conformidade/pdf` com
  param `periodo` e `responseType: 'blob'`, retornando `Blob` de PDF.
- **REQ-T5** — `reabrirApuracao(id: string)` faz `POST /apuracao/{id}/reabrir` e retorna `Apuracao`.
- **REQ-T6** — Models de domínio (`Apuracao`, `CreditoSaldo`, `RelatorioConformidade`) e enum
  `StatusApuracao` definidos em `@models`/`@core/enums`; campos monetários são `number`, `dataFechamento`
  é `string | null`. Nenhum valor de exemplo/hardcode no código de produção.
- **REQ-T7** — Todas as chamadas passam pelo `ApiService`/`apiInterceptor` (prefixo `/api`, headers,
  toast global de erro). Nenhuma chamada faz `catchError` para fallback com dado falso.

### Zero mock — Calendário

- **REQ-M1** — `calendario.service` **não contém** `getMockVencimentos()` nem qualquer literal de
  vencimento fiscal; `getVencimentos()` **não** faz `catchError(() => of(mock))` — o erro propaga.
- **REQ-M2** — A página `calendario.ts` trata falha de carga com **estado de erro + "Tentar novamente"**
  (signal `vencimentosErro`), sem renderizar dado falso; o retry refaz a busca.
- **REQ-M3** — Feedback de erro alinhado a Dashboard/Documentos (uma via de feedback — sem toast global
  duplicado quando a página já mostra banner próprio; usar `skipErrorNotify()` na chamada se necessário).

### Qualidade / DoD

- **REQ-Q1** — Testes de integração com `HttpTestingController` cobrem cada método de `TributarioApi`
  (URL, param `periodo`, verbo, `responseType` do PDF, mapeamento) e o novo caminho de erro do calendário.
- **REQ-Q2** — `npm run lint`, `npm run build` e `npm test` verdes (CI: lint · build · test).
- **REQ-Q3** — Segue convenções do CLAUDE.md: standalone, signals, path aliases (`@services`/`@models`/
  `@dtos`/`@core`), classe `TributarioApi` em `services/tributario/data-access/`, Prettier
  `printWidth:100` / `singleQuote`.

## Critérios de aceitação (verificáveis)

| AC | Deriva de | Como verificar |
| --- | --- | --- |
| AC-1 | REQ-T1 | Teste: `apuracao('2026-07')` → `expectOne` URL `/apuracao` com `params.periodo='2026-07'`, GET; flush `ApuracaoResponse` → objeto `Apuracao` com os mesmos campos. |
| AC-2 | REQ-T2 | Teste: `saldoCredito('2026-07')` → GET `/creditos?periodo=2026-07`; mapeia `creditoTotal`, `quantidadeNotas`. |
| AC-3 | REQ-T3 | Teste: `relatorioConformidade('2026-07')` → GET `/relatorios/conformidade?periodo=...`; mapeia `saldoAPagar` (inclui negativo). |
| AC-4 | REQ-T4 | Teste: `relatorioConformidadePdf('2026-07')` → GET `/relatorios/conformidade/pdf?periodo=...`, `responseType:'blob'`; flush Blob → recebe Blob. |
| AC-5 | REQ-T5 | Teste: `reabrirApuracao('id-1')` → POST `/apuracao/id-1/reabrir`; flush `ApuracaoResponse`. |
| AC-6 | REQ-T6 | `grep` não encontra literais monetários/exemplo em `tributario.*`; tipos compilam (build). |
| AC-7 | REQ-T7 | Nenhum `catchError`/`of(` em `tributario.service.ts`. |
| AC-8 | REQ-M1 | `grep -i "getMockVencimentos\|FUNRURAL\|SPED"` em `calendario.service.ts` → vazio; método de mock ausente. |
| AC-9 | REQ-M2 | Teste de página: falha em `getVencimentos` → `vencimentosErro()===true` e `vencimentos().length===0`; `retry()` refaz o forkJoin e limpa o erro no sucesso. |
| AC-10 | REQ-Q1/Q2 | `npm test` verde com os specs novos; `npm run lint` e `npm run build` verdes. |

## Não-objetivos (fora de escopo desta issue)

- Página/tela `/tributario` e qualquer UI que exiba apuração/créditos/relatório.
- Seletor de período (mês/ano) com refetch — deferido (AD-004).
- Remover fallbacks `of([])`/`of(null)` de `contador`, `chat`, `notificacao` (sem dado falso; issues próprias).
- Alterar `calendario.getResumo` (retorna `null` neutro em erro — não é dado falso).
- Reimplementar interceptor/Snackbar (já entregue no PR #25).
