# Status das Sprints — Frontend (reconciliação board × código)

Documento vivo que reconcilia o board `agroContabilScrum` (GitHub, org SupersonicTeam, projeto #2)
com o estado **real** do código do frontend. Auditoria por evidência (leitura de código + build + runtime).

## Princípio de reconciliação

O board foi escrito assumindo **Angular 18 + NgModules + Angular Material + OnPush**. O código real está
**à frente**: **Angular 21 + standalone + zoneless + signals + Tailwind v4**. Por decisão do dono do projeto
(`luizGervazio`), **não recodamos** para casar com o texto antigo do board — itens divergentes são marcados como
*"feito de outra forma (stack mais moderno)"*. Gaps reais pendentes são realocados para a sprint onde fazem sentido.

Legenda: ✅ feito · ✅* feito de outra forma (stack moderno) · ⚠️ parcial · ❌ pendente

---

## Sprint 0 — auditoria (itens do frontend, responsável: luizGervazio)

### #9 — Migrar frontend de Next.js para Angular 18+
| Tarefa | Status | Evidência / nota |
|---|---|---|
| Remover Next.js de `/frontend` | ✅ | Sem resíduo de Next.js |
| Criar projeto Angular (`ng new`) | ✅ | Angular **21** (`package.json`) |
| Angular Material + Tailwind | ⚠️ | Tailwind ✅ · Material ❌ (adiado p/ 1º uso — S2/Contador) |
| Estrutura de módulos lazy (NgModules) | ✅* | **Standalone components** lazy via `loadComponent` (`app.routes.ts`), não NgModules |
| Angular Router com lazy loading | ✅ | `app.routes.ts` |
| Interceptor HTTP para baseURL | ❌ | Sem interceptor (`grep`=0). baseURL via `environment.apiUrl`+proxy+`ApiService`. → realocado p/ **S5 #34** |
| OnPush como padrão | ✅* | **Zoneless + signals** (`grep ChangeDetectionStrategy`=0) — supera OnPush |

DoD: serve sem erros ✅ · roteamento funcional ✅ · HttpClient configurado ⚠️ (configurado, mas sem interceptor e backend offline).

### #4 — Setup repositórios (parte frontend)
| Tarefa | Status | Evidência / nota |
|---|---|---|
| Inicializar Angular CLI | ✅ | Angular 21 |
| Angular Material + Tailwind | ⚠️ | Tailwind ✅ · Material ❌ (adiado) |
| Signals como state management | ✅ | App zoneless baseado em signals |
| OnPush como padrão | ✅* | Zoneless (ver #9) |

DoD: `ng serve` funciona ✅ · strict sem erros ✅ (build limpo, TS strict).

### #7 — CI/CD básico com GitHub Actions (parte frontend)
| Tarefa | Status | Evidência / nota |
|---|---|---|
| Workflow CI frontend (`ng lint` + `ng build`) | ❌ | Sem `.github/workflows` no projeto; sem eslint; sem script `lint` no `package.json` |
| Rodar em PRs | ❌ | Repo frontend é **local, sem remote** — CI inviável por ora |

Obs.: `ng build` roda local e passa, mas não há pipeline. Pendente real (depende de remote + eslint).

### #8 — Usuário mockado fixo (parte frontend)
| Tarefa | Status | Evidência / nota |
|---|---|---|
| Frontend usa produtor logado | ✅ | `LOGGED_PRODUCER_ID` em `core/services/dashboard.service.ts:6`, usado nos componentes |

---

## Veredito Sprint 0 (frontend)

**Funcionalmente concluída e superada** no essencial (migração, lazy routing, app rodando e validado em runtime).
**Não 100%** no checklist literal. Pendências reais, realocadas:

| Gap real | Para onde vai |
|---|---|
| Angular Material (instalação + 1º uso) | Sprint 2 (tabela Documentos) / Contador / Calendário |
| Interceptor HTTP (baseURL + erros globais) | Sprint 5 (#34) |
| CI/CD frontend (`ng lint` + `ng build`) + eslint + remote | Sprint 10 / quando houver remote |

## Itens para atualizar no board (GitHub) — quando houver scope `project` no token

- #9, #4: marcar tarefas de módulos/OnPush como "feito via standalone+zoneless"; mover Material p/ S2; mover interceptor p/ S5.
- #7: explicitar que CI frontend depende de remote + eslint (S10).
- #8: marcar tarefa frontend como concluída.

> Hoje o token tem só `read:project` (leitura). Atualizar issues exige scope `project` (escrita) — fora do escopo de código.
