# Design — Integração Tributário + Zero Mock (issue #21)

## Arquitetura (segue camadas do CLAUDE.md)

```
core/
  enums/
    status-apuracao.enum.ts        # NOVO — union StatusApuracao
  models/
    tributario.model.ts            # NOVO — Apuracao, CreditoSaldo, RelatorioConformidade
services/
  tributario/
    data-access/
      tributario.service.ts        # NOVO — classe TributarioApi
      tributario.service.spec.ts   # NOVO — testes HttpTestingController
  calendario/
    data-access/
      calendario.service.ts        # EDIT — remove getMockVencimentos + catchError
      calendario.service.spec.ts   # NOVO/EDIT — erro propaga (sem mock)
pages/
  calendario/
    calendario.ts                  # EDIT — signal vencimentosErro + retry()
    calendario.html                # EDIT — banner erro + "Tentar novamente"
    calendario.spec.ts             # NOVO/EDIT — AC-9
```

Reusa sem alterar: `ApiService` (get com params, base `/api`), `apiInterceptor` (toast global),
`skipErrorNotify()`, `Page`/`ApiError` DTOs.

## 1. Models e enum (REQ-T6)

`core/enums/status-apuracao.enum.ts`:
```ts
export type StatusApuracao = 'ABERTO' | 'EM_PROCESSAMENTO' | 'FECHADO';
```

`core/models/tributario.model.ts` — espelha os records do backend 1:1 (BigDecimal → number,
OffsetDateTime → string ISO). Um arquivo por domínio (Tributário):
```ts
import { StatusApuracao } from '@core/enums/status-apuracao.enum';

export interface Apuracao {
  periodo: string;                 // YYYY-MM
  status: StatusApuracao;
  debitoIbs: number;  debitoCbs: number;
  creditoIbs: number; creditoCbs: number;
  saldoIbs: number;   saldoCbs: number;
  totalNotas: number;
  dataFechamento: string | null;   // ISO; null enquanto ABERTO
}

export interface CreditoSaldo {
  periodo: string;
  creditoIbs: number; creditoCbs: number; creditoTotal: number;
  quantidadeNotas: number;
}

export interface RelatorioConformidade {
  periodo: string;
  debitoIbs: number; debitoCbs: number; debitoTotal: number; quantidadeSaidas: number;
  creditoIbs: number; creditoCbs: number; creditoTotal: number; quantidadeEntradas: number;
  saldoIbs: number; saldoCbs: number;
  saldoAPagar: number;             // negativo = saldo credor
}
```
Como response == model (nomes idênticos), **não há DTO intermediário nem mapeamento** — o service tipa a
resposta HTTP diretamente como o model (AD-010). Isso mantém "zero cerimônia" e um único ponto de verdade.

## 2. `TributarioApi` (REQ-T1..T7)

`services/tributario/data-access/tributario.service.ts`. Segue o padrão de `NotasApi`: `ApiService` para
JSON; `HttpClient` direto para o binário (PDF), como já feito no PDF de notas.

```ts
@Injectable({ providedIn: 'root' })
export class TributarioApi {
  private readonly api = inject(ApiService);
  private readonly http = inject(HttpClient);

  /** GET /api/apuracao?periodo=YYYY-MM. */
  apuracao(periodo: string): Observable<Apuracao> {
    return this.api.get<Apuracao>('/apuracao', { periodo });
  }
  /** POST /api/apuracao/{id}/reabrir. */
  reabrirApuracao(id: string): Observable<Apuracao> {
    return this.api.post<Apuracao>(`/apuracao/${id}/reabrir`);
  }
  /** GET /api/creditos?periodo=YYYY-MM. */
  saldoCredito(periodo: string): Observable<CreditoSaldo> {
    return this.api.get<CreditoSaldo>('/creditos', { periodo });
  }
  /** GET /api/relatorios/conformidade?periodo=YYYY-MM. */
  relatorioConformidade(periodo: string): Observable<RelatorioConformidade> {
    return this.api.get<RelatorioConformidade>('/relatorios/conformidade', { periodo });
  }
  /** GET /api/relatorios/conformidade/pdf?periodo=YYYY-MM — binário. */
  relatorioConformidadePdf(periodo: string): Observable<Blob> {
    return this.http.get('/relatorios/conformidade/pdf', {
      params: { periodo }, responseType: 'blob',
    });
  }
}
```
- URL do PDF é relativa (`/relatorios/...`); o `apiInterceptor` prefixa `/api` — mesma convenção do PDF de
  notas (confirmar no `notas.service.ts` como o `pdf()` monta a URL e replicar exatamente).
- **Sem `catchError`** (REQ-T7): erro sobe ao interceptor (toast global). Chamador decide tratamento fino.

## 3. Calendário zero-mock (REQ-M1..M3)

**Service** (`calendario.service.ts`):
- Excluir o método privado `getMockVencimentos()` inteiro.
- `getVencimentos()`: remover `catchError(() => of(this.getMockVencimentos()))`. Mantém apenas
  `map(items => items.map(mapToVencimento))`. Erro propaga.
- `getResumo()` fica intacto (fora de escopo; `of(null)` neutro).

**Página** (`calendario.ts`) — hoje `ngOnInit` faz `forkJoin({ vencimentos, pendencias })` e no `error`
apenas zera `loading`. Ajuste:
```ts
vencimentosErro = signal(false);

ngOnInit(): void { this.carregar(); }

carregar(): void {
  this.loading.set(true);
  this.vencimentosErro.set(false);
  forkJoin({
    vencimentos: this.calendarioService.getVencimentos(LOGGED_PRODUCER_ID),
    pendencias: this.contadorService.getPendencias(LOGGED_PRODUCER_ID),
  }).subscribe({
    next: ({ vencimentos, pendencias }) => {
      this.vencimentos.set([...vencimentos, ...this.mapPendenciasParaEventos(pendencias)]);
      this.loading.set(false);
    },
    error: () => { this.vencimentosErro.set(true); this.loading.set(false); },
  });
}

retry(): void { this.carregar(); }
```
Decisão de feedback (REQ-M3): como a página passa a exibir **banner próprio**, evitar toast global
duplicado — envolver a chamada `getVencimentos` com `skipErrorNotify()` **se** o padrão de Documentos
também suprimir. Verificar `documentos.ts`/`documentos.service` no início da task e **espelhar a mesma
escolha** (consistência > preferência). Se Documentos deixa o toast global aparecer, manter igual aqui.

**Template** (`calendario.html`) — banner condicional acima da grade, no padrão de Documentos/Dashboard:
```html
@if (vencimentosErro()) {
  <div class="... estado-erro ...">
    <p>Não foi possível carregar os vencimentos.</p>
    <button (click)="retry()">Tentar novamente</button>
  </div>
}
```
Reusar as classes/tokens do banner de erro já existente em `documentos.html`/`dashboard.html` (não
hardcodar cores; usar `text-destructive`, `UiButton`, etc.). Copiar o markup existente para consistência.

## 4. Estratégia de testes (REQ-Q1)

`tributario.service.spec.ts` — `HttpTestingController`, provider `provideHttpClient(withFetch())` +
`provideHttpClientTesting()`; **sem** interceptor (testa o service isolado, URLs relativas ao `apiUrl`).
Um teste por AC-1..AC-5: `expectOne` com match de `req.url` e `req.params.get('periodo')`, verbo, e para o
PDF `req.responseType === 'blob'`; `flush` do payload de exemplo e `expect` do retorno mapeado. Verificar
`httpMock.verify()` no `afterEach`.

`calendario.service.spec.ts` — sucesso: `getVencimentos` mapeia response real. Erro: `flush(null,{status:500})`
→ observable **erra** (assert no callback `error`), provando ausência de fallback mock.

`calendario.spec.ts` (página) — AC-9: mockar `CalendarioApi.getVencimentos` para `throwError`, disparar
`ngOnInit`, assertar `vencimentosErro()===true` e `vencimentos().length===0`; então trocar o mock para
sucesso, chamar `retry()`, assertar `vencimentosErro()===false` e lista preenchida. Seguir o estilo do
`documentos.spec.ts` (mock de httpMock em todo teste — ver lição do commit `7fb70e3`).

## Verificação de fatos (Knowledge Chain)

- Contratos: lidos direto nos controllers/records do backend `br.com.agrocontabil` (fonte de verdade). ✅
- Padrões frontend: `NotasApi` (PDF binário), `dashboard.service`/`documentos.ts` (erro+retry),
  `error-notify.context.ts` (skip), `api.service.get` (params). Todos verificados no código. ✅
- Sem suposição de API inexistente: todos os 5 endpoints existem e estão testados no backend
  (`*ControllerTest.java`). ✅

## Riscos / pontos de atenção

- **URL do PDF via HttpClient direto**: confirmar que o `apiInterceptor` prefixa `/api` em chamada
  `http.get('/relatorios/...')` (como faz para o PDF de notas). Se o `notas.pdf()` usa `apiUrl` explícito,
  replicar. Mitigação: espelhar exatamente o método `pdf()` de `NotasApi`.
- **Duplo feedback de erro no calendário**: resolver espelhando Documentos (REQ-M3).
- **`forkJoin` acopla vencimentos+pendências**: falha em qualquer um seta `vencimentosErro`. Aceitável
  (ambos necessários para o calendário); pendências têm fallback `of([])` próprio, então na prática só
  `getVencimentos` derruba o forkJoin — o que é o comportamento desejado.
