# Validation — Integração Contrato Backend v1.1 (#27)

**Veredito: ✅ PASS** · Validação independente (fresh-eyes standalone; o usuário optou por execução
inline sem sub-agentes). Diff coberto: `fd0d8b8..HEAD` (14 commits, `a51be24`→`cc08de8` + specs `086c7b7`).

## Gates (reconfirmados de forma independente)

| Gate | Comando | Resultado |
| --- | --- | --- |
| Build | `ng build` | ✅ OK — bundle inicial **509.67 kB** (< 1 MB de erro) |
| Lint | `ng lint` | ✅ 0 erros (63 warnings, todos pré-existentes: app-layout a11y + `any` legados) |
| Test | `ng test` | ✅ **97 passed** (14 arquivos) |

## Cobertura por AC (evidence-or-zero)

| AC | Evidência (`file:line` + asserção) | Outcome esperado | ✅ |
| --- | --- | --- | --- |
| INT-01 | `dashboard.response.ts:36` — `DashboardFinanceiro`/`financeiro?` (build compila) | tipo com 4 campos | ✅ |
| INT-02 | `dashboard.spec.ts` INT-02/03 — `financeiro()?.totalEntradas` `.toBe(12500)` | bloco exposto | ✅ |
| INT-03 | `dashboard.spec.ts` — `totalEntradas 12500` / `totalSaidas 3200` distintos | sem re-inversão | ✅ |
| INT-04 | `dashboard.spec.ts` INT-04 — `lucroEstimado` `.toBe(-2500)` | negativo preservado | ✅ |
| INT-05 | `dashboard.spec.ts` INT-05 — `financeiro()` `toBeNull` + `temFinanceiro() false` + `nomeUsuario()` ok | degrada sem quebrar | ✅ |
| INT-06/07/08 | `auth.interceptor.spec.ts` — sem token→`has('Authorization') false`; token→`'Bearer abc.def.ghi'`; `''`→sem header | inócuo/ativo | ✅ |
| INT-09 | `api.interceptor.spec.ts` verde após ordem `[auth, api]` | sem regressão | ✅ |
| INT-10/11 | `download.spec.ts` — `filenameDeContentDisposition(...)` `.toBe('danfe-42.pdf')`; `null`→fallback; `filename*=`→fallback | filename+fallback | ✅ |
| INT-12 | `download.spec.ts` `apiErrorDeBlob` → `errors[0].code`; `api.interceptor.spec.ts` `mensagemDeEnvelope` 3 ramos | envelope→mensagem | ✅ |
| INT-13 | `notas.service.spec.ts`/`tributario.service.spec.ts` — `resp.headers.get('Content-Disposition')` acessível | observe:response | ✅ |
| TRIB-01/02/03 | `tributario.spec.ts` — 3 fetches; `periodo` no request; troca de mês refaz com `-03` | carga + refetch | ✅ |
| TRIB-04 | `tributario.spec.ts` — `podeReabrir()` `false`(ABERTO)/`true`(FECHADO) | só FECHADO | ✅ |
| TRIB-05 | `tributario.spec.ts` — 409→"não está fechada"; 422→"fora do prazo" por `code` | ramifica por code | ✅ |
| TRIB-06 | `tributario.spec.ts` — créditos zerados → `erroCreditos() false`, `creditoTotal 0` | zero-state | ✅ |
| TRIB-07 | `tributario.spec.ts` — `saldoAPagar -60` → `saldoCredor() true`, valor intacto | rótulo credor | ✅ |
| TRIB-08 | `tributario.spec.ts` — filename de `Content-Disposition`; erro-como-blob → toast "Período inválido" | download+erro | ✅ |
| TRIB-09 | `tributario.spec.ts` — apuração 500 não esconde créditos/relatório | fetches independentes | ✅ |

**22/22 requisitos com evidência.**

## Sensor de discriminação (mutação em estado descartável)

| # | Mutação | Alvo | Resultado |
| --- | --- | --- | --- |
| 1 | inverter `if (!token)` | INT-08/07 | ✅ morto (2 testes falharam) |
| 2 | quebrar `code === 'APURACAO_NAO_REABRIVEL'` | TRIB-05 | ✅ morto (1 falhou) |
| 3 | `filenameDeContentDisposition` sempre fallback | INT-11 | ✅ morto (2 falharam) |
| 4 | `temFinanceiro` sempre `true` | INT-05 | ✅ morto (cascata) |

**4/4 mutantes mortos** — os testes discriminam regressões de comportamento nos 4 focos.

## Spec-precision gaps / observações (não-bloqueantes)

- **INT-03 (template):** os testes provam que o `computed financeiro()` não inverte, mas a asserção é no
  componente — a troca de rótulo/binding no `dashboard.html` não é verificada por teste (só por comentário
  anti-inversão). Gap de precisão aceitável; o valor vem direto do backend já invertido.
- **TRIB-04/05 (A-7/OQ-1):** a ação "Reabrir" é entregue **desabilitada com aviso** — `ApuracaoResponse`
  não expõe `id` (confirmado na API real). A ramificação por `code` é testada com mocks e ativa quando o
  backend expuser o `id`. **Follow-up de backend recomendado** (expor `id` ou reabrir por `periodo`).
- **Verificação em browser:** não executada — o dashboard/tributário exigem o backend em `localhost:8080`;
  sem ele as telas caem no estado de erro. Cobertura garantida pelos testes de unidade (TestBed + HttpTestingController).

## Código morto pré-existente notado (não tocado — fora de escopo)

- `app-layout.ts:72` `navItems` — array definido e **nunca usado** no template (nav é hardcoded). Pré-existente.
