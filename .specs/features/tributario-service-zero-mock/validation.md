# Validação — Integração Tributário + Zero Mock (issue #21)

**Verdict: PASS**

Verificação independente (Verifier != autor) sobre os commits `71f7b10`, `fcceb5f`, `08e455b`, `33dbd34`.
Todos os 10 ACs têm evidência de teste com file:line. Três mutantes injetados foram todos mortos
(sensor de discriminação funcionando). Os três gates (lint/build/test) foram re-executados do zero,
independentemente do relatório do autor, com resultado verde. Um gap menor de precisão de spec foi
encontrado (ver seção de gaps) — não bloqueia o merge.

## 1. Cobertura por critério de aceitação (evidência-ou-zero)

| AC | file:line | Assertion | Outcome definido no spec | Veredito |
| --- | --- | --- | --- | --- |
| AC-1 | `tributario.service.spec.ts:64-75` | `expectOne(r => r.url === '/apuracao')`; `expect(req.request.method).toBe('GET')`; `expect(req.request.params.get('periodo')).toBe('2026-07')`; `expect(resultado).toEqual(buildApuracao())` | GET `/apuracao` com `periodo` e retorno `Apuracao` idêntico ao response | **COBERTO** |
| AC-2 | `tributario.service.spec.ts:90-102` | `expectOne(r => r.url === '/creditos')`; `expect(req.request.method).toBe('GET')`; `params.get('periodo')).toBe('2026-07')`; `expect(resultado?.creditoTotal).toBe(125)`; `expect(resultado?.quantidadeNotas).toBe(3)` | GET `/creditos?periodo=` mapeando `creditoTotal`/`quantidadeNotas` | **COBERTO** |
| AC-3 | `tributario.service.spec.ts:104-125` (positivo em 104-115, negativo em 117-125) | `expect(resultado?.saldoAPagar).toBe(60)` (positivo) e `expect(resultado?.saldoAPagar).toBe(-60)` (AC-3b, negativo) | GET `/relatorios/conformidade?periodo=` mapeando `saldoAPagar` incl. negativo | **COBERTO** |
| AC-4 | `tributario.service.spec.ts:127-140` | `expect(req.request.method).toBe('GET')`; `expect(req.request.responseType).toBe('blob')`; `req.flush(blob)`; `expect(resultado).toBeInstanceOf(Blob)` | GET `/relatorios/conformidade/pdf?periodo=` com `responseType:'blob'`, retorno `Blob` | **COBERTO** — confirmado por mutação (ver §2, mutante 1): flipar para `'json'` já quebra a **compilação** (`ng test`/`build` falha com TS2322 antes mesmo do teste rodar), então o contrato é garantido em dois níveis (tipo + teste). |
| AC-5 | `tributario.service.spec.ts:77-88` | `expectOne(r => r.url === '/apuracao/id-1/reabrir')`; `expect(req.request.method).toBe('POST')`; `req.flush(reaberta)`; `expect(resultado).toEqual(reaberta)` | POST `/apuracao/{id}/reabrir` retornando `Apuracao` | **COBERTO** |
| AC-6 | `tributario.model.ts` (todo arquivo) + `status-apuracao.enum.ts:8` + `npm run build` (verificado nesta sessão, exit 0) | Nenhum literal monetário/exemplo de produção nos models; tipos compilam | Grep sem literais + build ok | **COBERTO** — grep manual em `tributario.model.ts`/`status-apuracao.enum.ts` não encontrou valores de exemplo hardcoded (só comentários JSDoc); build verificado verde nesta sessão. |
| AC-7 | `tributario.service.ts` (arquivo inteiro, 46 linhas) — confirmado por leitura direta, não por comentário | Nenhum `catchError`/`of(` — grep `grep -in "catchError\|of("` retornou vazio (exit 1) | Nenhuma chamada faz `catchError` para fallback com dado falso | **COBERTO** — verificado por leitura do arquivo real (não apenas comentário/doc), e reforçado pelo mutante 2 (ver §2). |
| AC-8 | `calendario.service.ts` (arquivo inteiro) + `calendario.service.spec.ts:49-63` | Grep `getMockVencimentos\|FUNRURAL\|SPED\|DCTF` vazio (exit 1); teste: erro 500 → `expect(erro).toBeTruthy(); expect(resultado).toBeUndefined()` (sem fallback) | Método de mock ausente; erro propaga sem `catchError(() => of(mock))` | **COBERTO** — grep confirma ausência; teste comprova propagação real via `HttpTestingController`. |
| AC-9 | `calendario.spec.ts:23-37` (erro), `calendario.spec.ts:39-48` (sucesso), `calendario.spec.ts:50-78` (retry) | Erro: `expect(cmp.vencimentosErro()).toBe(true); expect(cmp.vencimentos()).toEqual([])`. Retry: após `cmp.retry()`, novo `httpMock.expectOne(...)` é obrigatório (senão `httpMock.verify()` no `afterEach` falharia) — prova que retry **refaz a chamada HTTP real**; ao flush com sucesso, `expect(cmp.vencimentosErro()).toBe(false); expect(cmp.vencimentos().length).toBe(1)` | Falha → `vencimentosErro()===true`, lista vazia; retry refaz o forkJoin e limpa o erro no sucesso | **COBERTO** — usa `HttpTestingController` real (não mock do serviço); `retry()` de fato dispara uma nova requisição HTTP interceptável, e o teste falharia com "expected one matching request" se `retry()` não recriasse a chamada. |
| AC-10 | Gate re-run desta sessão (ver §3) | `npm run lint` exit 0 (0 erros, 54 warnings pré-existentes); `npm run build` exit 0; `npm test` → 9 arquivos / 40 testes passed, exit 0 | Trio verde | **COBERTO** — re-executado de forma independente nesta sessão (não apenas números reportados pelo autor). |

## 2. Sensor de discriminação (mutação)

Três mutações foram injetadas na árvore real, testadas, e revertidas (`git status` confirma árvore
limpa ao final — apenas `.specs/STATE.md` pré-existente e a nova pasta de specs, nenhum código mutado
restante).

| # | Mutante | Arquivo:linha alterada | Resultado esperado | Resultado observado | Veredito |
| --- | --- | --- | --- | --- | --- |
| 1 | `responseType: 'blob'` → `'json'` em `relatorioConformidadePdf` | `tributario.service.ts:43` | Teste AC-4 falha (Blob esperado) | Build já falha antes do teste rodar: `TS2322: Type 'Observable<Object>' is not assignable to type 'Observable<Blob>'` (o método declara retorno `Observable<Blob>`, e o overload de `HttpClient.get` amarra `responseType` ao tipo de retorno) | **MORTO** (nível de tipo, mais forte que nível de teste) |
| 2 | Reintroduzir `catchError(() => of([]))` em `getVencimentos()` | `calendario.service.ts` (pipe do `getVencimentos`) | Testes de propagação de erro falham | 3 testes falharam: `calendario.service.spec.ts` "AC-8: em falha do backend, o erro propaga..." (`expected undefined to be truthy`) e 2 testes de `calendario.spec.ts` (AC-9 erro e retry) | **MORTO** |
| 3 | `saldoAPagar: Math.abs(r.saldoAPagar)` injetado via `map()` em `relatorioConformidade()` | `tributario.service.ts` (novo `.pipe(map(...))`) | Teste AC-3b (valor negativo) falha | `AC-3b: ... expected 60 to be -60` — falhou como esperado | **MORTO** |

Todos os 3 mutantes foram revertidos com `Edit` (não `git checkout`, pois eram edições pontuais) e a
suíte completa voltou a 40/40 passed após cada reversão (confirmado com `npm test` após a última
reversão).

## 3. Re-execução dos gates (independente do autor)

Executado do zero nesta sessão, nesta árvore de trabalho:

| Gate | Comando | Exit code | Resultado |
| --- | --- | --- | --- |
| Lint | `npm run lint` | **0** | 0 erros, 54 warnings (pré-existentes, não relacionados à feature — confirmado por leitura do output: `contador.ts`, `app-layout.html`, etc.) |
| Build | `npm run build` | **0** | Build de produção completo; apenas warnings de terceiros (`canvg`/`core-js` não-ESM, pré-existentes) |
| Test | `npm test` | **0** | `Test Files 9 passed (9)` / `Tests 40 passed (40)` |

Números batem com o que a task T5 reportou (40/40, 0 erros de lint), mas foram confirmados de forma
independente nesta sessão, não apenas aceitos do relatório do autor.

## 4. Gaps de precisão do spec (não bloqueiam, mas registrados)

Ranqueados do mais para o menos relevante:

1. **REQ-M3 / skipErrorNotify — não implementado literalmente, mas satisfeito por mecanismo alternativo.**
   O spec sugere "usar `skipErrorNotify()` na chamada se necessário" para evitar toast duplicado no
   calendário. Nem `calendario.service.ts` nem `calendario.ts` chamam `skipErrorNotify()` explicitamente.
   Em vez disso, `/api/calendario-fiscal` já está listado em `PREFIXOS_SEM_TOAST` dentro de
   `api.interceptor.ts:15-22` (mecanismo pré-existente, não introduzido por esta feature) — o que também
   suprime o toast global. O efeito observável (uma via de feedback, sem toast duplicado) é alcançado,
   mas por um caminho diferente do sugerido no spec. Não há teste que comprove diretamente "nenhum toast
   duplicado apareceu" (nem via spy em `ToastService`, nem via assert de ausência de chamada) — a
   cobertura de REQ-M3 é estrutural/por leitura de código, não por teste automatizado explícito. Isso é
   uma lacuna de precisão do spec (não define exatamente qual mecanismo/teste prova REQ-M3), então trato
   como gap de teste ausente, não como falha de AC (REQ-M3 não tem AC próprio na tabela do spec.md —
   apenas AC-9 cobre REQ-M2).
2. **AC-6 "nenhum valor de exemplo/hardcode"** é verificado por grep manual + build nesta sessão, não por
   um teste automatizado dedicado (o spec também não define um teste específico para isso, apenas
   "grep não encontra literais... tipos compilam"). Confirmado manualmente, mas não há guard automatizado
   no CI que impeça reintrodução futura de literais nos models.
3. **`getResumo()` mantém `catchError(() => of(null))`** em `calendario.service.ts:34-38`. Isso é
   explicitamente fora de escopo pelo spec ("Não-objetivos": "Alterar `calendario.getResumo`... não é
   dado falso"), então não é um gap real — apenas confirmando que o autor não tocou nele, como esperado.

## Conclusão

PASS. Todos os 10 ACs têm evidência de teste rastreável por file:line, os testes resistem a mutação
nos pontos de maior risco (blob/responseType, ausência de fallback mock, mapeamento de valor negativo),
e os três gates de CI foram re-verificados de forma independente com sucesso. O único gap é de precisão
do spec quanto ao mecanismo exato de REQ-M3 (resolvido via prefixo pré-existente no interceptor, não via
`skipErrorNotify()` explícito) — recomendo não bloquear o merge por isso, mas considerar um teste futuro
que verifique explicitamente ausência de toast duplicado no calendário.
