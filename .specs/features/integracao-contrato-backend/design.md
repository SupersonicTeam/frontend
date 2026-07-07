# Integração Contrato Backend v1.1 — Design

Referência: `spec.md` (IDs `INT-01..INT-13`). Stack: Angular 21 zoneless + signals, Tailwind v4,
Vitest. Convenções: `CLAUDE.md`. Segue o Knowledge Verification Chain (código existente é a Step 1).

## Visão geral da arquitetura

Quatro frentes isoladas, reusando padrões já presentes no repo (Frentes 1–3 = integração; Frente 4 = tela):

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. financeiro (dashboard)                                             │
│   dashboard.response.ts  ──(+ bloco financeiro)                       │
│   dashboard.ts           ──(computed financeiro())                    │
│   dashboard.html         ──(card "Resumo financeiro")                 │
├─────────────────────────────────────────────────────────────────────┤
│ 2. authInterceptor (cross-cutting)                                    │
│   core/interceptors/auth.interceptor.ts   (novo, inócuo hoje)         │
│   core/services/token.service.ts          (novo, fonte única, null)   │
│   app.config.ts  ──(withInterceptors([authInterceptor, apiInterceptor]))│
├─────────────────────────────────────────────────────────────────────┤
│ 3. downloads robustos (util + services)                               │
│   core/utils/download.ts   (novo: salvar blob + parse Content-Disp.   │
│                             + desserializar ApiError de Blob)          │
│   notas.service.ts / tributario.service.ts ──(observe:'response')     │
│   documentos.ts (DANFE/XML) + tributario.ts (PDF) usam o helper       │
├─────────────────────────────────────────────────────────────────────┤
│ 4. Tela Tributário (NOVA)                                             │
│   pages/tributario/tributario.{ts,html,spec}  (consome TributarioApi) │
│   app.routes.ts        ──(+ rota lazy /tributario)                    │
│   app-layout.{ts,html} ──(+ item de menu "Tributário")                │
│   depende da Frente 3 p/ o download do PDF de conformidade            │
└─────────────────────────────────────────────────────────────────────┘
```

Frentes 1–3 são independentes entre si. A Frente 4 **depende da Frente 3** (helper de download) para o PDF
do relatório — sequenciar Frente 4 após a Frente 3. As demais podem virar commits independentes.

---

## Componente 1 — Bloco `financeiro` no dashboard (INT-01..INT-05)

### DTO (INT-01)
`core/DTOs/dashboard/dashboard.response.ts`: novo `DashboardFinanceiro` e campo **opcional** em
`DashboardResponse` (A-3 — tolerar ausência):

```ts
export interface DashboardFinanceiro {
  totalEntradas: number;  // PROPRIA (vendas) — dinheiro entra. NÃO re-inverter.
  totalSaidas: number;    // IMPORTADA (compras) — dinheiro sai.
  saldo: number;          // totalEntradas − totalSaidas
  lucroEstimado: number;  // saldo − (saldoIbs + saldoCbs); pode ser negativo
}
export interface DashboardResponse {
  /* ...campos atuais... */
  financeiro?: DashboardFinanceiro; // opcional: backend antigo/mock pode omitir (v1.1 aditiva)
}
```
> Reusa o padrão dos demais sub-DTOs do arquivo. **Não** reaproveitar `fluxo-caixa.model.ts` (`FluxoCaixa`
> tem campos a mais/nomes diferentes — `totalImpostos`, `qtd*`); o contrato define só 4 campos. Manter o
> DTO fiel ao contrato evita mapeamento espúrio (AD-010: response == model quando 1:1).

### Componente (INT-02..INT-05)
`pages/dashboard/dashboard.ts`: `computed` derivado do signal existente `this.dashboard()`:

```ts
readonly financeiro = computed(() => this.dashboard()?.financeiro ?? null);
readonly temFinanceiro = computed(() => this.financeiro() != null);
```
Formatação BRL: reusar o mesmo padrão `Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'})`
já usado na página (só na exibição — precisão preservada, contrato 3.3). Um helper `brl(v)` local ou
método do componente.

### Template (INT-02, INT-04, INT-05)
`dashboard.html`: card "Resumo financeiro" no mesmo estilo do card de KPIs (`bg-card`, `border-border`,
tokens do design system — sem cores hardcoded). Envolto em `@if (temFinanceiro())`. Quatro linhas:
Entradas / Saídas / Saldo / Lucro estimado. Lucro negativo recebe classe de destaque
(`text-destructive`) via binding condicional. Rótulos **diretos** (INT-03): `financeiro().totalEntradas`
sob "Entradas", `financeiro().totalSaidas` sob "Saídas".

**Armadilha crítica (INT-03):** a semântica é invertida em relação a `notasPorMes` (contrato 8.5). O card
apenas exibe os campos do backend — **nenhuma** troca/negação. Comentário no template/TS marcando isso.

---

## Componente 2 — `authInterceptor` (INT-06..INT-09)

### TokenService (fonte única — A-5)
`core/services/token.service.ts` (novo, `providedIn: 'root'`):
```ts
@Injectable({ providedIn: 'root' })
export class TokenService {
  /** Token de acesso atual. Sprint 8 ligará à sessão real; hoje sempre null. */
  getToken(): string | null { return null; } // placeholder inócuo (A-5)
}
```
Fonte única testável — o interceptor injeta o service, não lê `localStorage` direto. Isso permite o teste
com token presente (INT-08) via mock do service.

### Interceptor (INT-06..INT-09)
`core/interceptors/auth.interceptor.ts` (novo, `HttpInterceptorFn`):
```ts
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(TokenService).getToken();
  if (!token) return next(req);                        // INT-07: inócuo hoje
  return next(req.clone({                              // INT-08
    setHeaders: { Authorization: `Bearer ${token}` },
  }));
};
```
String vazia → `!token` falso? `''` é falsy → `!token` true → sem header (edge case coberto).

### Registro (INT-09)
`app.config.ts`: `withInterceptors([authInterceptor, apiInterceptor])`. **Ordem:** `authInterceptor`
primeiro (adiciona header à req relativa), `apiInterceptor` depois (prefixa baseURL, `Accept`, erro). Como
o `apiInterceptor` faz `req.clone` preservando headers, a ordem não conflita; o teste de regressão
(`api.interceptor.spec.ts`) reconfirma.

---

## Componente 3 — Downloads robustos (INT-10..INT-13)

### Util (novo) `core/utils/download.ts`
Três responsabilidades puras e testáveis:

```ts
/** Nome do arquivo a partir do header Content-Disposition, ou fallback. */
export function filenameDeContentDisposition(header: string | null, fallback: string): string { /* ... */ }

/** Dispara o download de um Blob no browser (cria <a>, revoga objectURL). */
export function salvarBlob(blob: Blob, filename: string): void { /* ... */ }

/** Desserializa um Blob de erro (ApiError JSON) em ApiErrorEnvelope. */
export async function apiErrorDeBlob(blob: Blob): Promise<ApiErrorEnvelope | null> { /* blob.text()→JSON.parse */ }
```
- `filenameDeContentDisposition`: regex sobre `filename="..."`; se vier só `filename*=` (RFC 5987) e não
  souber decodificar → fallback (edge case da spec; decodificar RFC 5987 **não** é requisito).
- `apiErrorDeBlob`: `await blob.text()` → `JSON.parse` dentro de try/catch → `null` se não parseável.

### Services (INT-13)
`notas.service.ts` (`baixarPdf`, `obterXml`) e `tributario.service.ts` (`relatorioConformidadePdf`) passam
a usar `observe: 'response'` para expor os headers ao chamador:
```ts
baixarPdf(id: string): Observable<HttpResponse<Blob>> {
  return this.http.get(`/notas/${id}/pdf`, { responseType: 'blob', observe: 'response' });
}
```
> Mudança de assinatura (`Blob` → `HttpResponse<Blob>`). Ajustar chamadores. Alternativa considerada e
> descartada: manter `Observable<Blob>` e um segundo método para headers — duplica chamada HTTP. `xml`
> permanece `text` mas idem `observe:'response'` para o filename (contrato lista `/xml` como download).

### Chamadores (INT-10..INT-12)
Chamadores atuais de download: **`documentos.ts`** (`baixarDanfe` linha ~543 e `baixarXmlGerado` ~858 fazem
o `<a>`+`URL.createObjectURL` manual, sem `Content-Disposition`) e a nova **`tributario.ts`** (PDF de
conformidade). Todos passam a mapear a resposta para
`salvarBlob(resp.body!, filenameDeContentDisposition(resp.headers.get('Content-Disposition'), fallback))`.
No `error`, se `err.error instanceof Blob` → `apiErrorDeBlob` → `mensagemAmigavel`-like → `toast.error`.
Para evitar repetição, um helper de orquestração `baixarComToast(obs$, fallback, toast)` pode encapsular
o subscribe (opcional; decidir em tasks conforme nº de chamadores).

> **Nota de acoplamento:** `mensagemAmigavel` hoje vive em `api.interceptor.ts` e recebe
> `HttpErrorResponse`. Para reuso no fluxo de blob, extrair a lógica de "envelope → mensagem" para uma
> função que aceite `ApiErrorEnvelope` (o interceptor passa a chamá-la também). Refactor pequeno, coberto
> pelo `api.interceptor.spec.ts` existente.

---

## Componente 4 — Tela Tributário `/tributario` (TRIB-01..TRIB-09)

Nova página rotável consumindo `TributarioApi` (já existente, #21). Segue o padrão das páginas atuais:
standalone, signals + `computed`, estados loading/erro/vazio por seção, tokens do design system, lucide.

### Rota + navegação (TRIB-01)
- `app.routes.ts`: novo filho sob `AppLayout` (dentro do `perfilGuard`), lazy:
  `{ path: 'tributario', loadComponent: () => import('@pages/tributario/tributario').then(m => m.TributarioPage) }`.
- `shared/layout/app-layout/app-layout.{ts,html}`: novo item de menu "Tributário" (desktop + mobile). A nav
  é renderizada por `<a routerLink>` explícitos no HTML (não por loop) — adicionar nos dois blocos e importar
  um ícone lucide livre (ex.: `LucideReceipt` ou `LucideScale`; **não** reusar `LucideCalculator`, já é do
  Contador). Atualizar também o array `navItems` (se usado em algum ponto) por consistência.

### Componente `pages/tributario/tributario.ts` (TRIB-02..TRIB-09)
Estado por signals — **três fetches independentes** (falha isolada, AD-012-style decoupling):
```ts
readonly periodo = signal(mesCorrenteYYYYMM());     // 'YYYY-MM', default mês corrente (A-6)
readonly apuracao = signal<Apuracao | null>(null);
readonly creditos = signal<CreditoSaldo | null>(null);
readonly relatorio = signal<RelatorioConformidade | null>(null);
// loading/erro por seção:
readonly loadingApuracao/creditos/relatorio = signal(false); readonly erroApuracao/... = signal(false);
```
- `carregar()` dispara os 3 em paralelo, cada um com seu `subscribe` next/error próprio (um erro não
  derruba os outros — TRIB-09). Chamado no `ngOnInit` e ao trocar período (TRIB-03).
- **Seletor de período (TRIB-02):** mês (1–12) + ano, monta `YYYY-MM` e chama `carregar()`. Reusa o padrão
  `periodoMes`/`periodoAno` que o dashboard já tem (`dashboard.ts:272`). Só emite período bem-formado
  (impede 400).
- **Reabrir (TRIB-04, TRIB-05):** botão visível só quando `apuracao()?.status === 'FECHADO'` **e** há `id`.
  ⚠️ **OQ-1/A-7:** `ApuracaoResponse` **não traz `id`** (contrato 8.6) e o endpoint é por `{id}`. Enquanto o
  backend não expõe `id`, o botão exibe aviso "reabertura indisponível (contrato sem id)". Se/quando o `id`
  existir, `reabrirApuracao(id)` → em erro, ramificar por `errors[].code`:
  `APURACAO_NAO_REABRIVEL`→"não está fechada"; `REABERTURA_FORA_PRAZO`→"fora do prazo de 3 meses". Reusa a
  função `mensagem(envelope)` extraída na Frente C, mas o **branch é por `code`**, não por mensagem.
- **Relatório saldoAPagar (TRIB-07):** `computed` `saldoCredor = relatorio()?.saldoAPagar! < 0`. Rótulo e
  estilo condicional ("saldo credor" vs "a pagar"); nunca negar/inverter o número, só o rótulo.
- **PDF (TRIB-08):** `relatorioConformidadePdf(periodo)` (agora `HttpResponse<Blob>`, Frente C) →
  `salvarBlob(resp.body!, filenameDeContentDisposition(header, `conformidade-${periodo}.pdf`))`; erro-como-blob
  → `apiErrorDeBlob` → `mensagem` → `toast.error`.

### Template `tributario.html`
Três cards no padrão do dashboard (`bg-card`, `border-border`): **Apuração** (débito/crédito/saldo IBS/CBS,
status badge reusando o padrão de `statusApuracao` do dashboard, `dataFechamento`, botão Reabrir),
**Créditos** (creditoIbs/cbs/total, quantidadeNotas, zero-state), **Relatório de conformidade** (débitos ×
créditos, saldoAPagar com destaque credor, botão "Baixar PDF"). Cada card com seu loading/erro-retry/vazio.
Valores em BRL via `Intl.NumberFormat` (só exibição). Cabeçalho com o seletor de período.

> **Reuso:** extrair o badge de status de apuração (hoje inline em `dashboard.ts:275`) só se trivial; caso
> contrário, replicar o pequeno mapa status→classe (evitar acoplar dashboard↔tributário por um helper novo
> sem necessidade). Decisão de baixo risco, resolver na task.

## Arquivos afetados

| Arquivo | Mudança | IDs |
| --- | --- | --- |
| `core/DTOs/dashboard/dashboard.response.ts` | + `DashboardFinanceiro`, campo `financeiro?` | INT-01 |
| `pages/dashboard/dashboard.ts` | + `computed` financeiro + `brl()` | INT-02..INT-05 |
| `pages/dashboard/dashboard.html` | + card "Resumo financeiro" | INT-02..INT-05 |
| `core/services/token.service.ts` | **novo** — fonte única de token (null hoje) | INT-08 |
| `core/interceptors/auth.interceptor.ts` | **novo** — `Authorization` inócuo | INT-06..INT-08 |
| `app.config.ts` | registrar `authInterceptor` antes do `apiInterceptor` | INT-09 |
| `core/utils/download.ts` | **novo** — filename + salvarBlob + apiErrorDeBlob | INT-10..INT-12 |
| `core/interceptors/api.interceptor.ts` | extrair `mensagem(envelope)` reusável | INT-12 |
| `services/notas/data-access/notas.service.ts` | `observe:'response'` em `baixarPdf`/`obterXml` | INT-13 |
| `services/tributario/data-access/tributario.service.ts` | `observe:'response'` em `relatorioConformidadePdf` | INT-13 |
| `pages/documentos/documentos.ts` | `baixarDanfe`/`baixarXmlGerado` passam a usar o helper (filename + erro-como-blob) | INT-10..INT-12 |
| `pages/tributario/tributario.{ts,html}` | **novo** — tela Apuração/Créditos/Relatório + seletor período | TRIB-02..TRIB-09 |
| `pages/tributario/tributario.spec.ts` | **novo** — testes da tela | TRIB-02..TRIB-09 |
| `app.routes.ts` | + rota lazy `/tributario` | TRIB-01 |
| `shared/layout/app-layout/app-layout.{ts,html}` | + item de menu "Tributário" (desktop+mobile) | TRIB-01 |

## Testes (arquivos `.spec.ts`)

| Alvo | Casos-chave |
| --- | --- |
| `dashboard.ts` (spec existente) | financeiro presente (valores/labels, **entradas≠saídas** p/ pegar re-inversão), lucro negativo, `financeiro` ausente → sem erro |
| `auth.interceptor.spec.ts` (novo) | sem token → sem header; token → `Bearer <token>`; token `''` → sem header |
| `api.interceptor.spec.ts` (existente) | regressão: prefixo/Accept/erro inalterados após adicionar authInterceptor |
| `download.spec.ts` (novo) | filename de `Content-Disposition`; fallback; só `filename*=` → fallback; `apiErrorDeBlob` parseável e não-parseável |
| `notas.service.spec.ts` / `tributario.service.spec.ts` (existentes) | assinatura `HttpResponse<Blob>`; header acessível |
| `tributario.ts` (novo spec) | render dos 3 blocos; refetch ao trocar período; **reabrir ramifica 409 `APURACAO_NAO_REABRIVEL` vs 422 `REABERTURA_FORA_PRAZO` por `code`**; `saldoAPagar<0`→"saldo credor"; erro isolado por seção (um falha, outros renderizam); PDF filename/fallback |

## Riscos & mitigações

- **Re-inversão de entrada/saída (INT-03):** teste com `totalEntradas ≠ totalSaidas` e asserção por rótulo
  mata a mutação de troca. Comentário no código. (Padrão anti-armadilha; candidato a lição.)
- **Quebra de assinatura de download (`Blob`→`HttpResponse<Blob>`):** poucos chamadores hoje; TypeScript
  strict acusa todos em build. Ajustar todos no mesmo commit da task de downloads.
- **Ordem de interceptors:** reconfirmada por teste de regressão do `apiInterceptor`.
- **Bundle:** Frentes 1–3 são pequenas; a Frente 4 é uma **página lazy** (chunk próprio, fora do bundle
  inicial) — sem novas libs. Monitorar budget (inicial já em ~697 kB, < 1 MB de erro).
- **OQ-1 — reabrir sem `id` (A-7):** o contrato tem `POST /apuracao/{id}/reabrir` mas `ApuracaoResponse` não
  traz `id`. Mitigação: UI degrada (aviso) em vez de enviar request malformado; abrir follow-up no backend.
  A ramificação 409/422 por `code` é implementada e **testável com mocks** mesmo antes do backend expor `id`.
- **Semântica de status de apuração:** projeção ao vivo (mês corrente) vem `ABERTO`/`dataFechamento=null` —
  não é erro (contrato 7.4); teste cobre para não tratar como vazio/erro.
