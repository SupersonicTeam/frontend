# CLAUDE.md — Frontend AgroContábil (Angular)

Mapa de referência rápida do `frontend/`. **Consulte este arquivo antes de explorar o código** — ele evita
buscas caras. Mantenha-o atualizado quando criar features/services novos.

> Contexto do produto e dos 3 projetos irmãos: ver `../CLAUDE.md` (raiz). Aqui é só o frontend Angular.

## O que é

SPA Angular 21 (educacional sobre a reforma tributária 2026 — CBS/IBS/FUNRURAL para produtores rurais).
Port do `../agro-simples-vista` (React, referência visual). Domínio em **português** (produtor, nota fiscal,
imposto, contador, rascunho).

## Stack

- **Angular 21.1** — standalone (sem NgModules), **zoneless** (sem zone.js → use **signals**, não change
  detection por zona), bootstrap via `bootstrapApplication` em `src/main.ts`.
- **Tailwind CSS v4** via PostCSS (`@import "tailwindcss"` em `src/styles.css`; **não há** `tailwind.config.js`).
- **@lucide/angular** para ícones.
- **Sem Angular Material** (#41). Ele estava instalado inteiro, com o tema pré-pronto no `angular.json`, por
  causa de **dois usos**: `matTooltip` na topbar e `mat-slide-toggle` em Configurações. Substituídos pela
  utility `.dica` e por um checkbox nativo estilizado — o bundle inicial caiu de **495,25 kB para 406,99 kB**.
  `@angular/cdk` continua em `node_modules` só como dependência transitiva do `ng2-charts`; nada em `src/` o importa.
- **ng2-charts + chart.js** — gráficos. Registro **enxuto por componente** (`Chart.register(...)` no componente, não
  `provideCharts` no `app.config`) para o Chart.js ficar no **chunk lazy**, não no bundle inicial. Ex.: dashboard.
  **Cores vêm de `@core/utils/chart-tokens`**, nunca cravadas: o `<canvas>` não enxerga classe do Tailwind, então
  as cores são lidas das custom properties do tema. `options` e `data` são `computed()` que dependem de
  `themeService.tema()` — é isso que faz o gráfico acompanhar claro/escuro.
- RxJS 7.8, testes em **Vitest** (jsdom). TypeScript strict.

## Comandos (rodar dentro de `frontend/`)

| Ação | Comando |
|---|---|
| Dev server (porta 4200, com proxy `/api`) | `npm start` |
| Build de produção (`dist/`) | `npm run build` |
| Build dev (source-maps, watch) | `npm run watch` |
| Testes unitários (Vitest) | `npm test` |
| Scaffold de componente | `npx ng generate component pages/<nome>` |

## Environments e o build de produção (#175)

`environment.ts` (dev) e `environment.prod.ts` têm `apiUrl`, `dominioBase` (`localhost` /
`agroconia.com.br`) e `enderecoProprioNoAr` (`true` em dev, `false` em produção até o DNS curinga).
**A configuração `production` do `angular.json` tem o `fileReplacements`** — sem ele o build de
produção empacotava o `environment.ts` (só não fazia diferença porque os dois eram iguais). A CI roda
`node scripts/conferir-build-producao.mjs` depois do build: falha sem o par, sem o domínio no bundle ou
com o domínio escrito à mão num fonte de `src/app/`.

## Modo escritório: `{slug}.{base}` (#175)

O escritório com endereço próprio atende em `{slug}.agroconia.com.br`; o resto continua em www. A
regra do host mora em `core/utils/host-escritorio.ts` (ver Utilitários). O
`EscritorioDoHostService` (`core/services/escritorio-do-host.service.ts`) resolve o host **uma vez**,
num `provideAppInitializer`: no principal termina sem requisição; num subdomínio chama
`GET /publico/escritorios/{slug}` (público, 8 s de limite) e marca `modo()` = `escritorio` (título e
`noindex`), `nao-encontrado` (404 **com** `ENDERECO_NAO_ENCONTRADO`) ou `indisponivel` (todo o resto,
nunca o modo principal); com `slugAtual`, troca de host por `location.replace` e não resolve. Nunca
rejeita. O `App` mostra `shared/layout/endereco-do-host.ts` nos dois modos de falha.
**O `EscritorioDoHostService` fica fora da lista do `EncerramentoService`** (dado do host, não da
sessão). O `authInterceptor` trata `/publico/` e `/api/publico/` como públicos **pelo início do
caminho**. O `index.html` tem um esqueleto (escondido em www e `localhost` até o aval do Murillo) e
`<meta name="referrer" content="no-referrer">`.

**No modo escritório (PR C):** o `/login` leva a marca do escritório (monograma, "Entrar em {nome}",
"com AgroConIA"), manda `escritorio` no corpo e, no 401, mostra uma dica **fixa** para entrar por www
(igual para qualquer credencial, então não revela nada); "Criar conta" vira "Produtor? Entre por www".
`/cadastro` e `/equipe/convite` caem em `pages/aviso-www/` por um `canMatch`
(`noEnderecoDoEscritorio`), que leva ao mesmo caminho em www (o convite com o `#token=`). O
`AppLayout` mostra o nome do escritório na topbar e, ao abrir, confere o `meuEscritorio()`: no
subdomínio, slug diferente do host ou 403 `SEM_ESCRITORIO` encerra a sessão com um aviso que diz o
endereço certo (`EncerramentoService.encerrar(motivo, aviso)` leva o aviso no `state` do `/login`);
erro de rede não desloga. Em www, com a chave ligada, o contador cujo escritório tem endereço vê uma
faixa dispensável (localStorage `agrocontabil.aviso-endereco-dispensado:{slug}`). Trocar ou remover o
endereço estando no próprio subdomínio também encerra a sessão.

**Desenvolvimento local:** `http://ruraloeste.localhost:4300` (o navegador resolve `*.localhost`).
O `proxy.conf.json` tem `xfwd: true`, e o backend `dev` lê o `X-Forwarded-Host`. O slug local se
define na aba Equipe.

## Backend / API

- `environment.apiUrl = '/api'` (`src/environments/environment.ts`).
- `proxy.conf.json` → `http://localhost:8080` (backend **Spring Boot**, pacote `br.com.agrocontabil`; fonte de
  verdade dos contratos). Já existem `/api/notas`, `/api/dashboard` e `/api/assistente/chat[/stream]` (a **Ceres**,
  Sprint 6 do backend); onde faltar endpoint (calendário, contador, fluxo de caixa), **não inventar resposta** —
  deixar a chamada `/api` pronta e a tela dizer que o recurso ainda não existe.
- **O proxy reescreve o header `Origin` para `http://localhost:4200`.** O `allowed-origins` do backend
  (`application.yml`) só aceita a 4200; o navegador manda `Origin` em **todo POST/PUT/PATCH/DELETE**, então rodar
  o `ng serve` em qualquer outra porta fazia o Spring devolver **403 "Invalid CORS request"** em toda escrita
  (nova guia, criar nota, dar baixa) — só os GETs passavam. JSON não aceita comentário; o motivo mora aqui.

## Estrutura

Padrão por camadas (estilo Frimesa), adotado na issue #7. Arquivos de componente **sem** sufixo `.component`
(ex.: `dashboard.ts` + `dashboard.html`, classe `DashboardPage`).

```
src/
  main.ts                      # bootstrapApplication(App, appConfig)
  styles.css                   # Tailwind v4 + @theme (design tokens)
  environments/                # environment.ts (apiUrl), environment.prod.ts
  app/
    app.ts / app.html / app.css   # raiz (SEM sufixo .component)
    app.config.ts              # providers: router (+ recarga após deploy), tema, provideHttpClient(withFetch()), error listeners
    app.routes.ts              # rotas lazy via @pages (ver tabela abaixo)
    core/                      # infraestrutura cross-cutting
      models/*.model.ts        # tipos de domínio (1 arquivo por domínio)
      enums/*.enum.ts          # unions/enums (ex.: status-rascunho)
      DTOs/shared/responses/   # DTOs de API (ex.: api-error.response — envelope de erro)
      services/                # services CROSS-CUTTING (api, toast, theme, notificacoes-UI)
      guards/                  # sessao.guard (token), produtor.guard / contador.guard (rotas por papel)
      interceptors/            # auth.interceptor (Bearer + renovacao no 401), api.interceptor (baseURL, Accept, toast)
      utils/                   # nota-pdf
    services/<feat>/data-access/<feat>.service.ts   # services de NEGÓCIO, classes XxxApi (ver tabela)
    pages/<nome>/<nome>.ts + <nome>.html            # páginas rotáveis, classes XxxPage (lazy-loaded)
    shared/
      layout/app-layout/       # AppLayout (shell: header, sidebar, notificações)
      components/toast-container/   # ToastContainer
      ui/                      # UiButton, UiCard
```

### Path aliases (`tsconfig.json`)

Imports sempre via alias (sem `../../`): `@core/*` · `@services/*` · `@pages/*` · `@shared/*` ·
`@models/*` (= `core/models`) · `@dtos/*` (= `core/DTOs`) · `@env/*` (= `src/environments`).

## Rotas (`app.routes.ts`)

Tudo sob `AppLayout` e atrás do `sessaoGuard`, lazy via `loadComponent`. `''` → redirect `dashboard` (para quem tem sessão:
sem sessão, no www, o `/` é a **landing**, ver a seção dela);
`**` → página de não encontrada.

**`/login` é a exceção: fora do `AppLayout` e sem guard** (#93). O mesmo vale para `/cadastro`, `/esqueci-senha`, `/redefinir-senha` (#131) e **`/politica-dados`** (#137, `pages/politica-dados/`: a política de tratamento vinda de `GET /politica-dados`, linkada no cadastro, no login e em Configurações) e **`/equipe/convite`** (#148, `pages/equipe-convite/`): o convite de equipe chega com o token no fragmento (`#token=`); contador logado entra na equipe, quem não tem conta cria a de contador ali, e o token atravessa o login no `sessionStorage` da aba (o `returnUrl` é query e vazaria o token). O shell tem sidebar, sino e a gaveta da
Ceres, todos pedindo dado de um usuário que ainda não existe; e uma tela de login guardada mandaria ao
login quem não tem sessão — em volta. Sem sessão, o `sessaoGuard` manda para lá **com `returnUrl`**, para
que o endereço pedido (uma nota, um cliente da carteira) não se perca no caminho.

**As telas dos dois papéis são separadas, e isso é imposto por guard** — endereço é digitável, esconder o
link do menu não protege. O contador chegava em `/calendario` e `/tributario` e lia texto escrito para o
produtor, inclusive "procure o seu escritório de contabilidade" mostrado para o escritório. O que ele
precisa de apuração e de prazos está em `/contador`. `app.routes.spec.ts` reprova se um guard cair fora.

**Onde a tela só faz sentido para um papel, o guard devolve o outro. Onde os dois precisam dela, a
rota despacha para componentes diferentes** — não é o mesmo template com textos trocados, que é
exatamente o que produziu o bug acima.

| Rota | Papel | Componente |
|---|---|---|
| `/dashboard` | produtor (`produtorGuard`) | `pages/dashboard/dashboard.{ts,html}` |
| `/escritorio` | produtor (`produtorGuard`) | `pages/escritorio/escritorio.ts` — **Meu escritório** (`escritorio-produtor.ts`): convites para aceitar/recusar, quem atende (escritório, responsável, CRC, desde quando, suspenso), o que o escritório vê, **o que ele pediu** (`GET /pendencias?status=PENDENTE`, os 3 primeiros + link para Minhas notas) e encerrar o vínculo. Foi seção de Configurações (#147). Erro de `/vinculos` mostra "não carregou", nunca "nenhum escritório" (#107). **Histórico** (#166, backend#353): pede `situacao=ATIVO,SUSPENSO,ENCERRADO` e lista os encerrados com o período, **quem encerrou** e o motivo (#173, backend#402: `encerradoPor` nulo é "Encerramento não registrado", nunca "foi você"). Encerrar aceita um motivo opcional, que o escritório vê. O sino do convite leva para cá |
| `/chat` | produtor (`produtorGuard`) | `pages/chat/chat.{ts,html}` |
| `/contador` | **contador** (`contadorGuard`) | `pages/contador/contador.{ts,html}` — a **triagem da carteira**: quais clientes pedem atenção, em ordem de urgência (#95), com filtro de vínculo (ativos/suspensos/encerrados) e o cartão **Convidar cliente** (`convites-carteira.ts`, #147: só o administrador convida; `POST` responde 202 sempre) |
| `/contador/:produtorId` | **contador** (`contadorGuard`) | `pages/contador/cliente.{ts,html}` — **um cliente**: notas travadas (com as validações reais), guias a cobrar, documentos a conferir o **histórico de operações** (`historico-operacoes.ts`, #137: a auditoria de `GET /auditoria?produtorId=`, paginada pelo `X-Total-Count`; 404 = saiu da carteira), a **ficha editável** (`ficha-editavel.ts`, #149: responsável — só administrador ou o responsável atual trocam —, etiquetas com o catálogo como sugestão e observações internas, que nunca chegam ao produtor) e o **ciclo do vínculo** (`vinculo-cliente.ts`, #147: suspender/reativar/encerrar, só administrador; vínculo suspenso abre a ficha sem trabalho, porque as rotas do cliente dão 404) e, desde a #138, a **apuração do mês** (`apuracao-cliente.ts`: seletor de mês, créditos, relatório em PDF e reabrir só para administrador/contador) |
| `/equipe` | **contador** (`contadorGuard`) | `pages/equipe/equipe.ts` (#157) — **Escritório e equipe** (`equipe-escritorio.ts`, #148): dados do escritório, o **endereço próprio** (`endereco-escritorio.ts`, #175: `{slug}.{base}`, só com `ENDERECO_PROPRIO_NO_AR`; todo membro vê o link, só o administrador com CNPJ escolhe ou remove; formato conferido antes do envio, reservados só no servidor; caixa de ciência obrigatória que desmarca a cada mudança), membros com função e remoção, convite de equipe e o catálogo de etiquetas; os controles só para o administrador. Foi seção de Configurações até a #157 e ficava escondida; agora é aba do menu, no desktop e no celular. Não se confunde com `/equipe/convite`, pública e fora do shell |
| `/tributario` | **os dois** | `tributario.ts` escolhe: `ImpostosProdutor` (quanto eu pago, de onde vem, 6 meses) ou `ImpostosContador` (**Fechamento** de um cliente escolhido no topo: matriz IBS/CBS, notas que ficaram fora da apuração, variação decomposta, relatório em PDF e **reabrir**) |
| `/calendario` | **os dois** | `calendario.ts` escolhe: `PrazosProdutor` (o que vence pra mim + calendário) ou `PrazosContador` (**cobrança**: fila do que cobrar, lançar guia, dar baixa) |
| `/documentos` | **os dois** | `documentos-rota.ts` escolhe: `DocumentosPage` (produtor: as minhas notas, emissão e **"O que o escritório pediu"**, #180) ou `NotasContador` (as notas **da carteira inteira** ou de um cliente, #164: `GET /contador/notas` com `produtorId` opcional e as caixas contadas pelo `/contador/notas/resumo`, backend#341; o seletor ganha "Toda a carteira" com `[todaCarteira]`, e cada nota leva o `produtorId` dela às rotas por cliente: validações, prévia, aprovar/devolver). Até a #136 os dois abriam a mesma lista, e a do contador levava 403 em `/api/notas` |
| `/configuracoes` | os dois | `pages/configuracoes/configuracoes.{ts,html}`. Para os dois papéis traz **Privacidade e dados** (`privacidade-conta.ts`, #137): link para a política e **excluir minha conta** em duas etapas — a primeira explica que CPF/CNPJ, IE e UF ficam 5 anos (guarda fiscal), a segunda pede a senha; depois do 204, o mesmo `EncerramentoService` do sair de todos. Para o contador, só uma linha apontando para a aba **Equipe** (a seção morou aqui até a #157). Para o produtor, só uma linha apontando para a aba **Meu escritório** (a seção morou aqui, #147) |

**Tela do contador que lê dado de um produtor escolhe o cliente no topo** (#136): `<app-seletor-cliente>`
(`shared/contador/seletor-cliente.ts`), alimentado por `GET /contador/produtores`. O cliente vem do
`?cliente=` do endereço, senão do `ClienteEmFocoService` (a escolha sobrevive ao menu), senão do único
cliente da carteira; cada fonte só vale se estiver na carteira, e a que falha passa a vez à seguinte
(um `?cliente=` velho não apaga o cliente em foco). Ele emite `clienteChange` só **depois** de a
carteira responder (`undefined` = carregando, `null` = escolher). Sem cliente, a tela mostra um
`<ui-empty-state>` e **não chama nada** — com uma exceção: em **Notas** (#164, `[todaCarteira]`) o
`null` é "Toda a carteira" e a tela lista as notas de todos os clientes ativos. Usam o seletor: Notas,
Fechamento e, desde o roteiro da demo (06/11), **Prazos e cobrança** — que tinha seletor próprio e
abria sempre no primeiro cliente; o "Cobrar em Prazos" da ficha caía em outro cliente. A ficha
(`/contador/:produtorId`) grava o cliente em foco ao abrir, e seus links para as outras telas levam
`?cliente=`. As rotas do produtor (`/notas`, `/apuracao`, `/relatorios`,
`/creditos`, `/dashboard`, `/vinculos`, `/pendencias`, `/alertas`, `/assistente/*`, `/convites`)
derivam o produtor do token e dão **403 `PAPEL_NAO_AUTORIZADO`** ao contador — nunca as chame com
sessão de contador.

**Os menus saem de listas, não de markup copiado.** `MENU_PRODUTOR` e `MENU_CONTADOR` (em
`app-layout.ts`) desenham a barra lateral **e** o menu do celular, com `<svg [lucideIcon]>`. Escritos à mão,
os dois menus divergiram duas vezes (o do contador no celular dizia "Minhas notas"; o do produtor tinha
outra ordem). Rota nova de menu entra na lista, não no template. A barra **inferior** do celular é um
atalho curto e continua à parte.

**As guias moram em `/calendario` (contador), não no Acompanhamento.** Elas apareciam inteiras nas
duas telas. A triagem aponta para a cobrança; a cobrança é quem lança e dá baixa.

## Services

**Negócio** — `services/<feat>/data-access/<feat>.service.ts`, classes `XxxApi`, importados via `@services/...`:

| Classe | Import | Papel |
|---|---|---|
| `NotasApi` | `@services/notas/data-access/notas.service` | **Notas fiscais reais** contra `/api/notas` do backend Spring: CRUD paginado (`Page<T>`), ciclo de emissão (gerar-xml, xml, enviar-sefaz, status-sefaz, pdf, cancelar) e `validacoes`. Model `NotaFiscal` alinhado ao `NotaFiscalResponse`; status em `@core/enums/status-nota-fiscal.enum`. |
| `DashboardApi` | `@services/dashboard/data-access/dashboard.service` | **Dashboard real** contra `GET /api/dashboard` (KPIs IBS/CBS, notas por mês, distribuição de impostos, últimas notas), com cache local em Signal (`dashboard`). Sem fallback mock — erro propaga para a página tratar (estado de erro + retry). Rascunhos (`/dashboard/rascunhos/*`) ainda com fallback silencioso. |
| `CalendarioApi` | `@services/calendario/data-access/calendario.service` | Vencimentos/eventos fiscais (com fallback mock). |
| `CeresApi` | `@services/assistente/data-access/ceres.service` | **A Ceres**, assistente fiscal (issue #76). `perguntarEmStream()` em `POST /api/assistente/chat/stream` (SSE via `fetch`, padrão) e `perguntar()` em `POST /api/assistente/chat` (síncrono, timeout de 6 min — fallback de navegador sem `TextDecoderStream`). Erros viram `CeresError` com `codigo` (`CodigoCeres`) e `retryAfterSegundos`; cancelamento vira `CeresCancelada`. Nunca inventa texto de assistente. |
| `CarteiraApi` | `@services/contador/data-access/carteira.service` | **A carteira do escritório** (backend#177): `GET /contador/produtores` (array + `X-Total-Count`, nunca `Page<T>`), e o que o contador alcança de um cliente — notas (`notasDoCliente`, `notaDoCliente`; e, desde a #164, `notasDaCarteira` — `GET /contador/notas`, a carteira inteira ou um cliente, item `NotaCarteira` **sem `itens`** — e `resumoDasNotas`, as sete caixas numa consulta), validações, prévia da DANFE, aprovar/devolver, guias, pendências e, desde a backend#255, os **números do cliente**: `apuracaoDoCliente`, `apuracaoFaixaDoCliente`, `relatorioConformidadeDoCliente` (+`Pdf`), `creditosDoCliente`, `dashboardDoCliente` e `reabrirApuracao` (só ADMINISTRADOR/CONTADOR; ASSISTENTE 403). Convites e vínculo (#147): `convidar(email)`, `convitesEnviados()` e `mudarVinculo(id, 'suspender'|'reativar'|'encerrar', motivo?)` (o motivo só vai no encerrar e **aparece para o produtor**, #173); `obterCliente` procura entre os ativos e, sem achar, entre os suspensos. Revisão e pedido (#150): `revisoesDaNota` (histórico da revisão no lado do escritório, aberto sob demanda em `historico-revisao.ts`) e `editarPendencia` (`PUT`, só pedido `PENDENTE`; o modal `editar-pedido.ts` manda o pedido inteiro, inclusive as observações). Ficha editável (#149): `ficha`, `salvarObservacoes`, `definirEtiquetas` (`PUT` substitui a lista), `alterarResponsavel`, `etiquetasDoEscritorio` e `excluirEtiqueta` (só administrador; fica na aba **Equipe**, `/equipe`). As de um cliente ficam em `/contador/produtores/{id}/...`, com o **mesmo response** da rota do produtor. **Sem fallback silencioso**: 403 e 404 sobem para a tela. |
| `ContadorApi` | `@services/contador/data-access/contador.service` | Pendências/solicitações/documentos do contador. O cliente antigo: `?produtorId=` na query e `catchError(() => of([]))`. `/contador/pendencias?produtorId=` ainda responde 404 — a rota real virou `/contador/produtores/{id}/pendencias` (#180, issue #95). |
| `PendenciasApi` | `@services/pendencias/data-access/pendencias.service` | **Pedidos de documento do lado do produtor** (backend#180): `GET /api/pendencias`, detalhe e `POST /{id}/anexos` (multipart, parte `arquivo`, **sem** `Content-Type` — o boundary é do navegador). Erro sobe: a tela separa `ANEXO_INVALIDO`, `ANEXO_INFECTADO`, `LIMITE_ANEXOS` e `TRANSICAO_PENDENCIA_INVALIDA`. **A lista devolve `anexos: []`** — os metadados (e a `situacao` do antivírus) só vêm no detalhe. |
| `AuthApi` | `@services/auth/data-access/auth.service` | **Autenticação** (#93): `entrar()` (`POST /auth/login` → `{accessToken, tokenType, expiraEm, papel, usuarioId}`, e o nome vem de um `GET /auth/me` em seguida — o login **não** o devolve), `renovar()` (`POST /auth/refresh`, **fila de uma renovação por vez**), `sair()` (`POST /auth/logout`, nunca falha para quem chama) e `carregar()` (`/auth/me`, que responde da sessão quando já há uma). As três primeiras usam `HttpClient` direto com **`withCredentials`**: o refresh mora num cookie HttpOnly (`agro_refresh`, `Path=/api/auth`, `SameSite=Strict`) que o `ApiService` não saberia pedir. |
| `NotificacaoApi` | `@services/notificacao/data-access/notificacao.service` | Notificações externas (WhatsApp). |
| `PrivacidadeApi` | `@services/privacidade/data-access/privacidade.service` | `politica()` — `GET /politica-dados`, pública (#137). Desde a política `2026-11-17` ela traz **`operadoresExternos`** (#206, backend#586): Resend e Anthropic, cada um com finalidade, o que é enviado, **o que não é**, onde fica, base do art. 33 e retenção. O campo é **opcional** — backend mais antigo não o manda, e aí a seção simplesmente não aparece. A exclusão da conta mora no `AuthApi.excluirMinhaConta(senha)` (`DELETE /usuarios/{id}/dados`, 204; `SENHA_ATUAL_INCORRETA`; id de outro → 404), que reaproveita a tradução de erro de conta. A auditoria por cliente é `CarteiraApi.auditoriaDoCliente`. |
| `VinculosApi` | `@services/vinculos/data-access/vinculos.service` | **Lado do produtor** do vínculo com o escritório (backend#177): `listar(situacoes?)` (`GET /vinculos`; sem argumento, ativos e suspensos; com `ENCERRADO`, o histórico, backend#353), `encerrar(id)`, e os convites (`convites()`, `aceitarConvite(id)`, `recusarConvite(id)`, #147). **Rotas do produtor**: nunca com sessão de contador (403). |
| `EscritorioApi` | `@services/escritorio/data-access/escritorio.service` | Escritório e equipe (backend#228, #148). `meuEscritorio()` traz `minhaFuncao` (e, desde a #175, `slug`/`enderecoHost`/`enderecoAlteravelEm`; `definirEndereco(slug)` e `removerEndereco()`) (`ADMINISTRADOR`/`CONTADOR`/`ASSISTENTE` — o token só diz `CONTADOR`) **em cache na sessão** (falha não fica guardada; limpo no Sair e ao trocar de equipe). `ehAdministrador()`/`podeReabrirApuracao()` decidem os botões e, na falha, respondem `false`. Também: `atualizar`, `membros`, `alterarFuncao` (409 `ULTIMO_ADMINISTRADOR`), `removerMembro`, `convidarMembro` (202 sempre), `convitesDeEquipe`, `aceitarConvite(token)`. O 403 `SEM_ESCRITORIO` (membro removido) vira, no `apiInterceptor`, um aviso único de que a pessoa saiu do escritório. |

**Cross-cutting** — permanecem em `core/services/`, importados via `@core/services/...`:

| Classe | Papel |
|---|---|
| `ApiService` | **Cliente HTTP genérico** (get/post/put/patch/delete/uploadFile) sobre `environment.apiUrl`. Todo service de negócio o usa. |
| `NotificacoesService` | Estado **local** de notificações da UI (signal). Não confundir com `NotificacaoApi`. |
| `ToastService` | Toasts (auto-dismiss 4s), renderizados por `ToastContainer`. |
| `ThemeService` | Tema claro/escuro. |
| `PreferenciaMovimentoService` | **Pode animar?** (#174, itens 5.1 e 5.3). `reduzido()` é o **OU** entre `prefers-reduced-motion` do aparelho (acompanhado em tempo real) e a escolha do visitante no botão "Reduzir animações" (`localStorage` `agro-movimento`, só o lado "ligado" — desligar o botão **não** passa por cima da preferência do sistema). Põe a classe `movimento-reduzido` no `<html>`, que o CSS global observa, e nasce num `provideAppInitializer` junto do tema: esperando a primeira injeção, quem pediu menos movimento veria a animação de abertura. Fonte única — o `AnimacaoLandingService` (PR A) e o template leem este mesmo signal. |
| `SessaoService` | **Quem está logado** (#93): token, validade, `usuarioId`, `papel` e `nome`, persistidos em `localStorage` (`agrocontabil.sessao`). `ehProdutor()`/`ehContador()`/`logado()`/`homeDoPerfil()`/`expirado()`. Substituiu o `PerfilService` (papel escolhido num storage editável), o `TokenService` (devolvia `null`) e o `IdentidadeService` (o `X-Usuario-Id`, com o UUID do contador cravado). **O que vem do storage é validado** — sessão meia-boca vira ausência de sessão. Ouve o evento `storage` para acompanhar a outra aba, e **separa renovação de troca de usuário**: mesma pessoa com token novo é adotada; outra pessoa (ou ninguém) **recarrega a página**, porque trocar o signal deixaria os caches `root` com o dado de quem estava aqui — ver a nota abaixo. |
| `ClienteEmFocoService` | O cliente da carteira que o contador está atendendo, **entre telas** (#136). Só o id; quem valida contra a carteira é o `SeletorCliente`. |
| `EncerramentoService` | **Sair** — um lugar só, porque há dois caminhos (botão Sair e renovação que falhou). Avisa o servidor (`POST /auth/logout`), **limpa os caches de sessão** (`DashboardApi`, `AssistenteStore`, `NotificacoesService`, `ClienteEmFocoService`, `EscritorioApi`, `AuthApi`) e vai ao `/login`. Os services são `root` e sobrevivem à troca de usuário: era assim que a topbar do contador exibia o nome do produtor da sessão anterior. **Service `root` novo que guarde resposta do servidor em signal entra nesta lista.** |

**A identidade de demonstração morreu na #93.** `LOGGED_PRODUCER_ID`, `LOGGED_ACCOUNTANT_ID`, o
`@core/config/produtor-logado`, o header `X-Usuario-Id` e o remendo de identidade **por rota**
(`paraRota`) não existem mais: o papel e o id vêm do token, e o token vale em todas as rotas. Medido em
30/10 contra a API local, `GET /api/contador/produtores` responde **200 só com o `Bearer`** — era essa
rota que exigia o UUID cravado.

## Autenticação (issue #93)

O que o contrato impõe e o que foi **medido** contra a API local em 30/10:

| Regra | Medido |
|---|---|
| `POST /auth/login` → `{accessToken, tokenType, expiraEm, papel, usuarioId}` | token de **15 min**; cookie `agro_refresh` (7 dias) com `Path=/api/auth`, `HttpOnly`, `SameSite=Strict` |
| e-mail sem conta, senha errada e conta desativada → **o mesmo** 401 | `errors[0].code = CREDENCIAIS_INVALIDAS`; a mensagem do backend já é escrita para o usuário final (inclui o aviso de bloqueio por tentativas) e é usada como está |
| token vencido numa rota protegida | 401 `NAO_AUTENTICADO` → o `authInterceptor` **renova e repete**; a tela não vê o erro |
| refresh ausente/vencido/revogado | 401 `SESSAO_INVALIDA` → `EncerramentoService.encerrar('expirada')` |
| **reusar um refresh já trocado encerra toda a linhagem** | o cookie obtido na renovação anterior **também** passa a 401. É por isso que `AuthApi.renovar()` tem fila: um painel dispara 4 chamadas, logo 4 × 401 juntos, e sem fila a 2ª renovação derrubaria a sessão que a 1ª salvou. Verificado no navegador: 4 × 401 → **1** `POST /auth/refresh` → 4 repetições 200 |
| 401 **não** vira toast | o `apiInterceptor` o suprime: a renovação é bem-sucedida e um toast diria que falhou o que funcionou. Quem avisa é o `EncerramentoService` |

### Troca de usuário em outra aba recarrega a página

O `storage` avisa que outra aba mexeu na sessão, e são **duas** coisas: renovação (mesma pessoa, token
novo) e troca de usuário. A primeira versão do listener só trocava o signal, e isso vazava — a revisão
de segurança pegou. Os services de dados são `root` e guardam o painel, a conversa e o sino de **quem
estava naquela aba**; adotar a identidade de lá sem limpá-los deixa a aba mostrando o dado de um usuário
sob o nome de outro. **Nenhum guard roda numa troca de signal** e ninguém observa a sessão com
`effect()`, então nada se corrigiria sozinho: em `/configuracoes` seriam os dados cadastrais do produtor
anterior, e o contexto que vai para a Ceres sairia com o painel dele.

Por isso a troca de identidade **recarrega a página**, em vez de chamar a limpeza do
`EncerramentoService`: nenhum cache sobrevive a um reload, **nem os dos services que ainda não
existem**. Limpar por lista dependeria de alguém manter a lista em dia, que é exatamente como isto
voltaria. A identidade nova não é adotada antes do reload — se ele não acontecer, a aba continua
coerente com quem ela era, em vez de misturar as duas pessoas.

**O profile `dev` do backend ainda aceita `X-Usuario-Id` sem token** — e é por isso que a demonstração
funcionava local e morria publicada. O app não manda mais esse header em lugar nenhum.

**Em 30/10 a tabela `credencial_usuario` estava vazia:** o seed do backend cria produtor e contador mas
**nenhuma credencial**, então o produtor semente (o que tem notas e números) não tem como entrar. Para
testar, crie contas pelo `POST /api/auth/cadastro` (público; CPF/CNPJ só dígitos com DV, senha ≥ 10
caracteres). Pedido ao backend — ver o PR da #93.

Fora de escopo da #93, mas **já no contrato**: `/auth/cadastro`, `/auth/cadastro/equipe`,
`/auth/senha/esqueci`, `/auth/senha/redefinir`, `/auth/senha/alterar` e `/auth/logout-todos`.

## Models (`core/models/*.model.ts`, via `@models/...`)

Um arquivo por domínio: `produtor.model.ts` (`Produtor`, `ContatoProdutor`, `ProdutorContador`),
`nota-fiscal.model.ts` (`NotaFiscal`, `ItemNotaFiscal`; desde a #170 `origem` `PROPRIA`/`IMPORTADA` e o emitente da compra, backend#409, com `ehCompraImportada()` e `contraparteDaNota()` — na compra o produtor é o **destinatário**, a lista mostra o fornecedor e o modal não oferece "Cancelar"), `rascunho-nota.model.ts` (`RascunhoNota`,
`ItemRascunhoNota`), `solicitacao-contador.model.ts` (`SolicitacaoContador`, `DocumentoContador`),
`assistente-mensagem.model.ts` (`AssistenteMensagem` — texto, rota, citações, fontes e `falha`),
`vencimento-fiscal.model.ts`, `notificacao.model.ts`, `fluxo-caixa.model.ts`,
`carteira.model.ts` (`ProdutorCarteira`, `AtencaoCarteira`, `FiltroCarteira`),
`pendencia.model.ts` (`Pendencia`, `AnexoPendencia`, `StatusPendencia`, `SituacaoAnexo` — substitui o
`SolicitacaoContador`, que foi escrito contra um contrato imaginado).
`StatusRascunho` em `@core/enums/status-rascunho.enum`. Envelope de erro da API (`ApiErrorEnvelope`,
`FiscalError`) em `@dtos/shared/responses/api-error.response`. Campos de status são unions de string.

## Design system (`src/styles.css`, bloco `@theme`)

- **Cores** (HSL): `--color-primary` verde-agro `hsl(142 44% 32%)`; `--color-accent` laranja `hsl(33 55% 52%)`;
  `--color-sidebar`/`--color-topbar` verde-escuro `hsl(142 30% 22%)`; `--color-background` off-white;
  `--color-destructive` vermelho. Usar via classes Tailwind: `text-primary`, `bg-card`, `border-border`...
- **Fontes**: `Sora` (headings, classe `.font-heading`) + `Inter` (corpo). Carregadas no `src/index.html` com
  `preconnect` (#36) — **não** por `@import` no CSS, que bloqueia a renderização.
- **Utilities**: `.font-heading`, `.scrollbar-none`.
- **Reusar estes tokens** ao criar gráficos/novos componentes — não hardcodar cores.
- **Fundação de layout e legibilidade (#36)** — use estes em vez de inventar valor por tela:
  - `.page-container` — largura total até `--page-max` (90rem/1440px) e centraliza acima disso.
    **Substitui os `max-w-*` na raiz das páginas**; funciona com variantes (`lg:page-container`).
  - `.tap-target` — garante 44×44 mínimo (WCAG 2.5.5). Todo alvo tocável deve ter.
  - `text-apoio` (mín. **14px**) e `text-valor` (mín. **16px**) — escala fluida com `clamp()`.
    Não usar `text-[10px]` / `text-xs` em conteúdo.
  - Breakpoint extra **`3xl:`** (120rem) para monitores grandes e 4K. `sm`–`2xl` vêm do Tailwind.
  - `:focus-visible` e `prefers-reduced-motion` são **globais** — não precisa repetir por componente.
- **Design system v2 (#45)** — a remodelação (#35) acrescentou:
  - **Acento do assistente**: `assistente`, `assistente-soft`, `assistente-ink`, `assistente-borda`.
    Violeta, usado **só** onde o sistema interpreta, sugere ou explica algo. Nunca decoração — é o que
    dá presença visual à IA, que era a crítica da banca.
  - **Cores semânticas** com trio `soft`/`ink`/`borda`: `sucesso`, `aviso`, `info`, `perigo`. Usar no
    lugar de `bg-green-50`, `text-amber-800` e afins (eram 257 cravadas; em 29/10 restavam **101**, quase
    todas no fac-símile da DANFE, onde são intencionais).
  - **Classe de cor sem token não falha em lugar nenhum.** No Tailwind v4 ela simplesmente **não gera
    CSS** — sem erro de build, sem warning de lint, sem teste vermelho; o elemento fica com o valor padrão
    e ninguém nota. Foi o que aconteceu com `border-{info,sucesso,aviso,perigo}-borda`, usadas em **9
    lugares** enquanto só `assistente-borda` existia (corrigido na #115). Para conferir, conte no CSS
    **compilado**, não no fonte:

    ```bash
    grep -c "aviso-borda" dist/frontend/browser/styles-*.css   # 0 = a classe nao existe
    ```

    Tentei virar teste de unidade e **não dá**: o builder do Angular desvia `styles.css` para o próprio
    processador, então `import.meta.glob('/src/styles.css', {query:'?raw'})` devolve string vazia.
  - **Superfícies** `surface` e `surface-2` (neutros com viés verde), **sombras** `shadow-suave|media|alta|assistente`
    e **raios** `rounded-controle|card|destaque`.
- **Tokens de marca da landing (#174, PR 3)** — tirados da logo, em hex de propósito (converter para HSL
  arredondaria a cor da marca). **Nenhuma tela do app os usa**; são para a página pública:
  - `marca-profunda` (#1B4630; no escuro aponta para `surface-2`, porque verde quase preto sobre fundo
    quase preto não separa nada), `marca-lima`, `marca-lima-ink` (o texto que vai **sobre** o lima) e
    `marca-teal`.
  - Contrastes **medidos** (o script fica no histórico do PR; a tabela da issue dá 10,9:1 para o lima, mas
    esse número é do lima **escuro**): `marca-profunda`/branco 10,69:1; `marca-lima`/`marca-lima-ink`
    6,80:1 no claro e 10,84:1 no escuro; `marca-teal`/branco **3,48:1 no claro e 2,61:1 no escuro —
    reprova para texto normal**, então é decoração ou texto ≥ 24px. O `accent` laranja continua de fora
    (2,90:1 com branco e sem par no `.dark`).
  - Utility `bg-gradiente-marca` (135°, lima → teal). Só no brilho do hero, na borda do card recomendado,
    no fundo dos ícones dos diferenciais e num sublinhado do H1. **Nunca atrás de texto.**
- **Movimento reduzido tem dois gatilhos** (#174, item 5.1): o `@media (prefers-reduced-motion: reduce)` e a
  classe `.movimento-reduzido` no `<html>` (o `PreferenciaMovimentoService`). As declarações estão
  **repetidas** nos dois blocos de `styles.css` porque um `@media` não entra em lista de seletor — mexeu em
  um, mexa no outro. Entrou também `animation-delay: 0s`: com `fill-mode: both`, zerar só a duração deixava o
  item que espera a vez (entrada escalonada) **invisível** em vez de imediato. A linha `animation-timeline`
  da especificação **não** entra: nada aqui é ligado à rolagem por CSS.

## Animação da landing (`shared/animacao/`, #174 PR A)

A landing anima com o **Motion** (`motion@14.11.1`, MIT, versão **exata** no `package.json` — decisão do Murillo em 09/11, no lugar do GSAP).
Nenhuma tela importa o pacote direto:

- **`motion.lazy.ts`** é o **único** arquivo que importa `motion` (`animate`, `scroll`, `inView`). O `import()` dinâmico aponta para ele, e não
  para o pacote, porque num `import('motion')` o empacotador guarda o módulo inteiro: o chunk caiu de **188 kB para 80,5 kB** (29,6 kB gzip).
- **`CARREGAR_ANIMACAO`** (`carregar-animacao.ts`) é o token que faz esse `import()`. Os specs o trocam por um falso; trocar a fábrica por
  `async () => null` deixa a landing inteira estática numa linha (o último corte da N5.2).
- **`AnimacaoLandingService`**: `vaiAnimar()` (movimento liberado pelo `PreferenciaMovimentoService` **e** sem `saveData`) é o sinal único que o
  template e o código leem; `carregar()` devolve `null` **sem baixar nada** quando ele é falso, e senão espera o `load` + um momento ocioso antes
  do `import()`. Uma promessa por página; erro de import vira `null`. Quem chama trata `null` como "fique no estado final".
- **`Cena`** (`cena.ts`) junta o que uma cena criou — os controles do `animate()` e as limpezas do `scroll()`/`inView()` — e desfaz tudo num
  `concluir()`. É o `context().revert()` que o Motion não tem: usar no `DestroyRef` e quando "Reduzir animações" liga no meio da cena.
- **`movimento.ts`**: durações (em segundos) e curvas, **os mesmos valores** dos tokens `--duracao-*`/`--ease-*` do `styles.css`.
- **No zoneless, nunca escreva em signal dentro de callback de quadro** (`scroll()`, `onUpdate`): cada escrita agenda uma renderização.

A CI (`scripts/conferir-build-producao.mjs`) reprova se o Motion aparecer num `.js` do **carregamento inicial** (marcador
`transformPerspective`, conferido nos dois sentidos com uma sonda) e se o `public/licencas-terceiros.txt` não citar a versão instalada — ao
trocar a versão, releia a licença, atualize o arquivo e confira que o marcador continua no chunk.

## Landing (`pages/landing/landing.ts`, #174)

A landing completa: cabeçalho, hero, a jornada 3D, "O que muda", calendário da reforma, produtor, escritório, como funciona,
diferenciais, Ceres, pronto hoje, planos, perguntas, chamada final e rodapé. **Markup e CSS vêm da prévia estática da especificação**
(`rascunhos/previa-landing/previa-landing.html`, fora do git), que continua sendo a referência de texto e de layout.

- **CSS da página, não do app**: tokens próprios escopados em `.lp` (a raiz do template). **A landing é sempre escura** (pedido do Luiz, 12/11): a raiz é
  `.lp.dark`, o que também escurece os tokens do Tailwind da jornada, e a jornada recebe `temaFixo="escuro"` (marca escura). Voltar a
  seguir o `ThemeService` é tirar o `dark` da raiz e o `temaFixo`;
  movimento reduzido por `.movimento-reduzido`. `ViewEncapsulation.None`, para o CSS da prévia valer como está. Os seletores de elemento
  são `:where(.lp) h1`, `:where(.lp) a`…: com `.lp a` a regra ganhava do `.btn-primario` e o botão perdia o texto. O CSS está dividido
  por seção (`landing-*.css`) porque o orçamento é **por arquivo** (aviso em 4 kB).
- **`landing-interacoes.ts`**: o `<script>` da prévia em TypeScript, preso à raiz e desfeito no destroy (um `AbortSignal` para todos os
  ouvintes). As âncoras `href="#x"` rolam por código: numa rota que não é a raiz, o navegador iria para `/#x`.
- **`landing-dados.ts`**: planos e perguntas, desenhados pelo template. **Sem preços**: são proposta do Murillo; cada plano mostra
  "Valor de lançamento em definição" e um "Tenho interesse" por e-mail. Textos com "(Murillo)" seguem pendentes (CNPJ, encarregado).
- **Rota `/`** (`visitanteNoPrincipal`, em `app.routes.ts`): a landing é de quem chega **sem sessão** ao endereço **principal**
  (www). Com sessão, o `canMatch` recusa e o `/` cai no shell (painel). Num endereço de escritório, em qualquer modo, o `/` segue
  do escritório. A rota vem **antes** do shell, com `pathMatch: 'full'`. Fora de produção ela também abre em `/previa-landing`
  (útil logado).

## Jornada do milho em 3D (`pages/landing/jornada/`, #174 PR J)

Seção da landing que troca de quadro conforme a rolagem, nos dois sentidos: sequências de imagens renderizadas no Blender (repo
`Animation-Agroconia`), **fora do bundle**, descritas por um `manifesto.json` (a fonte da verdade: etapas, câmeras `16x9`/`9x18`, AVIF/WebP,
quadros parados, `alt`). Não é vídeo nem 3D em tempo real.

- **Rota `/previa-landing`** (carrega `pages/landing/landing.ts`, a landing completa): fora do `AppLayout`, sem guard, e **só fora de produção** — pela constante
  de compilação `PREVIA_LANDING` (`define` no `angular.json`), não por chave do `environment` (o objeto não é eliminado e a rota ia para o
  bundle). A CI reprova se `previa-landing` aparecer no carregamento inicial. O PR 9 troca a prévia pela landing em `/`.
- **Quadros**: `environment.baseJornada` (`/jornada/v0.1/`), lido só pelo token `BASE_JORNADA`. Em dev, o `proxy.conf.json` leva `/jornada`
  à porta **8765** (`jornada-quadros` no `launch.json`, servindo `rascunhos/jornada/`, fora do git). O manifesto é lido com `fetch` cru
  (não `ApiService`: levaria `Bearer` e toast a um host de estáticos); manifesto que falha ou não confere = **a seção não aparece**.
- **`percurso.ts`** (rolagem → etapa, quadro, fusão de 8% e a nota) e **`manifesto-jornada.ts`** (leitura defensiva: caminho relativo sem
  `..`, `etapasDoTema`, URLs) são funções puras, com spec. **`jornada.store.ts`** baixa por janela de etapa e mantém no máximo
  `LIMITE_DE_QUADROS_ABERTOS` quadros decodificados.
- **Modo estático** (`vaiAnimar()` falso): só o manifesto e os 9 quadros parados, em lista, **nenhuma sequência**; "Reduzir animações" no
  meio da seção desmonta a cena e volta ao topo dela. A etapa **marca** tem `marca-claro`/`marca-escuro`, com o fundo da página em cada tema:
  se o `--color-background` mudar, ela precisa de render novo. A nota fiscal é HTML por cima do último quadro da etapa `nota`.
- No `@defer (on viewport)` com HMR ligado (o `ng serve` padrão), o Angular carrega o chunk na hora (NG0751); para ver o adiamento de
  verdade, `ng serve --no-hmr`. Com o painel do navegador escondido, nem o `IntersectionObserver` nem o `requestAnimationFrame` rodam.

## Primitivos de UI (`shared/ui/`, #45)

Antes de escrever markup novo, veja se um destes resolve:

| Componente | Para quê |
|---|---|
| `<ui-modal>` | Diálogo acessível sobre CDK: foco preso, Esc, foco devolvido ao gatilho, rolagem travada. **Use sempre** — havia 14 modais à mão sem nada disso. Conteúdo por projeção, ações no slot `[rodape]`. |
| `<ui-stat>` | KPI. Rótulo em linguagem de produtor grande, termo fiscal como `apoio`. Nunca o contrário. |
| `<ui-insight>` | Superfície do assistente. **Só com conteúdo derivado de dado real** (ex.: `/notas/{id}/validacoes`). |
| `<ui-badge-status>` | Os 12 status da NF-e, sobre tokens semânticos. Rótulo vem de `STATUS_NOTA_META`. **É este que a UI usa.** O `STATUS_NOTA_META.badge` é outra lista de classes, com um único consumidor: a `nota-preview`. |
| `<ui-empty-state>` | Estado vazio com saída (slot `[acao]`), no lugar de texto solto. |
| `<ui-skeleton>` | Carregamento com a forma do conteúdo, no lugar de spinner. |
| `<ui-table>` | Moldura de tabela: rolagem na moldura, cabeçalho fixo, densidade por contexto. |
| `<ui-card>` / `<ui-button>` | Variantes `padrao/destaque/assistente/plano` e `primary/ghost/perigo/assistente/sutil/lima`. O botão já garante 44×44 e rótulo ≥14px. |
| `<a uiLinkBotao>` | **CTA de navegação com cara de botão** (#174, item 4.4). Link é link: `<button>` dentro de `<a>` é HTML inválido e o leitor de tela anuncia dois controles. A diretiva só veste as classes; as estáticas do elemento continuam valendo. |

**As classes do botão moram em `shared/ui/classes-botao.ts`** (`classesBotao(variante, tamanho, { blocoCompleto })`),
compartilhadas por três formas: o `<ui-button>`, o `a[uiLinkBotao]` e o **`<button>` nativo** de quem tem
`role`/`aria-pressed`/`aria-checked` próprios (abas, radiogroup) — o `UiButton` não repassa esses atributos ao
botão interno. Antes era um `Record` dentro do `UiButton`, e o CTA que copiava a lista à mão saía com outro
padding. A variante **`lima`** é só da faixa profunda da landing (`marca-lima` + `marca-lima-ink`).
O `directive-selector` do ESLint aceita os prefixos `app` **e** `ui`, como o `component-selector` já aceitava.

## Utilitários compartilhados (`core/utils/`)

| Arquivo | Para quê |
|---|---|
| `validacoes.ts` | Inconsistências fiscais de `/notas/{id}/validacoes`. O endpoint devolve o **histórico inteiro** — `apenasUltimaChecagem()` fica só com o lote mais recente, sem repetir `code`+`field`. `rotuloDoCampo()` traduz os 17 campos que o `FiscalRulesValidator` emite. `ehCampoDoProdutor()` separa o que se corrige na nota do que está no cadastro (que o app **não** edita). Usado no modal da nota **e** na gaveta do assistente. |
| `ceres.ts` | Vocabulário da Ceres em português: `rotuloRota()` (selo "das suas notas" se alguma fonte é do produtor, "da tabela oficial" se todas são dela, "do AgroConIA" no resto), `etapaDaRota()` (o que mostrar enquanto ela trabalha), `rotuloFonte()`/`descreverFonte()` (as consultas de `fontesDados`), `origemDaFonte()` (pelo campo `origem` do backend, backend#342: `PRODUTOR` → produtor, `TABELA_OFICIAL` → oficial, qualquer outro ou ausente → neutra, que **nunca** vira "das suas notas"; o `FONTES_OFICIAIS`, que decidia pelo nome da função, saiu na #166), `paragrafosDoTexto()` (parágrafos e listas `- ` da resposta) e `TAMANHO_MAXIMO_PERGUNTA` (1000). **`FUNCOES_CERES` lista as 13 funções** dos `@Tool` do backend e tipa o `ROTULO_FONTE`: função nova sem rótulo não compila, e o `ceres.spec.ts` reprova rótulo faltando (#132). Função que o backend mandar e não estiver na lista aparece com o nome cru — melhor que inventar rótulo. |
| `chart-tokens.ts` | Cores do Chart.js a partir das custom properties do tema. O `<canvas>` não enxerga Tailwind. |
| `guias.ts` | `statusDaGuia()` traduz `PENDENTE`/`PAGA`/`VENCIDA` para o vocabulário do modelo **e deriva o atraso da data** — o backend não devolve `VENCIDA` por conta própria em `/contador/guias`, mas a carteira conta a guia atrasada em `atencao.guiasVencidas`. Sem isso as duas telas discordavam sobre a mesma guia. |
| `mascaras.ts` | CPF/CNPJ e CEP nos campos (#102). `aplicarMascara()` formata **sem perder o cursor**: a âncora é quantos dígitos havia antes dele, não a posição no texto, que anda quando um ponto entra. Antes o cursor ia para o fim a cada tecla. O envio segue cru (`soDigitos` no payload). Desde a #156 também **confere e exibe**: `cpfCnpjValido()` (dígito verificador, espelho do `@ValidCpfCnpj` do backend — antes morava dentro de `documentos.ts`), `erroDoCpfCnpj()` (a frase do campo, ou `null`) e `formatarCpfCnpj()` (para mostrar; a carteira devolve só dígitos). Nos cadastros (`/cadastro`, `/equipe/convite`) o documento só é julgado **depois do blur** ou no envio — antes, com 6 dígitos, o campo já ficava vermelho —, e o 400 com `field: cpfCnpj` marca o campo em vez do topo. |
| `campo-cpf-cnpj.ts` | `criarCampoCpfCnpj()` — o estado de um campo de CPF/CNPJ digitado (#156), usado no `/cadastro`, no `/equipe/convite` e no destinatário da NF-e: `valor`, `erro`, `digitar(evento)` no `(input)`, `sair()` no `(blur)`, `conferir()` no envio e `recusadoPeloServidor()` no 400. **Sair do campo vazio não conta como tocado** — contava, e a frase vermelha voltava a cada tecla quando a pessoa voltava para digitar (achado do review). |
| `recarga-apos-deploy.ts` | Aba aberta antes de um deploy (#162). Cada tela é um `chunk-<hash>.js`, o CD publica a cada merge e o deploy apaga os arquivos antigos: a aba velha pedia um chunk que dava 404 e o clique (ex.: "Criar conta") não fazia nada. `recarregarSeChunkFaltou()` roda no `withNavigationErrorHandler` do `app.config`: se o erro é de módulo dinâmico que não carregou, recarrega **no destino**. **Uma vez até a próxima navegação que der certo**: a marca fica no `sessionStorage` e sai no `NavigationEnd` (uma janela de tempo no lugar dela voltava a entrar em laço em rede lenta). **Offline não recarrega** — o navegador dá a mesma frase quando o sinal cai, e recarregar trocaria o app pela página de erro. O ambiente (storage, rede, navegação) vem do token `AMBIENTE_DE_RECARGA`, que os testes trocam por um falso. Junto, o `nginx.conf` manda o `index.html` com `no-cache`, e o `ThemeService` nasce num `provideAppInitializer` — antes só no dashboard e em Configurações, e o login recarregado abria claro para quem escolheu escuro. |
| `encerramento-vinculo.ts` | `corpoDoEncerramento(motivo)` e `MOTIVO_ENCERRAMENTO_MAXIMO` (500), #173: o corpo opcional `{ motivo }` dos dois `POST .../encerrar` (produtor e escritório). Motivo em branco não vai, e o encerramento funciona como antes. |
| `host-escritorio.ts` | A regra do host (#175, compartilhada com a landing da #174), a mesma do backend (backend#464): `rotuloDeEscritorio`/`ehHostDeEscritorio` (um rótulo antes de `.` + base, diferente de `www`; o resto é o principal), `hostPrincipal` e `urlDoHost` — **toda URL de outro host sai dele**, a partir de um rótulo, nunca de host vindo de resposta. Tokens `HOST_ATUAL`, `DOMINIO_BASE`, `ENDERECO_PROPRIO_NO_AR` e `LOCALIZACAO_ATUAL` (no molde do `AMBIENTE_DE_RECARGA`): **ninguém lê `environment.dominioBase` nem `enderecoProprioNoAr` direto**. O domínio de produção não pode ser escrito à mão em `src/app/` (nem em comentário): o `scripts/conferir-build-producao.mjs` reprova na CI. |
| `download.ts` | Salvar blob (DANFE, XML, prévia). **A prévia vem do servidor**, não é montada aqui: `GET /notas/{id}/danfe-preview` devolve a DANFE do rascunho (o `nota-pdf.ts`, que desenhava uma aproximação com `jspdf`, foi apagado e a dependência saiu junto). Quem decide se o documento fiscal já existe é `temArquivosFiscais(status)`, no enum: é pergunta de **estado**, não de permissão — e as duas rotas nunca servem a mesma nota (a oficial dá 409 em rascunho, a prévia dá 409 em nota emitida). |

## Assistente — a Ceres (`shared/assistente/`, issue #76)

`AssistenteStore` guarda **uma** conversa, compartilhada pela gaveta flutuante (global, no `AppLayout`) e
pela página `/chat`. `AssistenteConversa` desenha as mensagens nas duas. `abrirSobreNota(nota)` abre a
gaveta com a nota à direita e busca as validações reais.

O que o contrato da Ceres impõe e onde isso mora:

| Regra do contrato | Onde |
|---|---|
| Citação legal **visível**, com link do Planalto e trecho expansível | `<app-ceres-citacoes>` (`<details>`, sem estado nem JS) |
| "Calculado a partir das suas notas", com as consultas feitas | `<app-ceres-fontes>` + `@core/utils/ceres`. A tabela oficial do IBS/CBS **não** é dado do produtor: vai num bloco à parte, "Consultado na tabela oficial do IBS/CBS" (#132). Desde a #166 quem decide é `fontesDados[].origem` (backend#342: `PRODUTOR`/`TABELA_OFICIAL`), não o nome da função; origem desconhecida ou ausente vai para um terceiro bloco, "Consultado pelo AgroConIA", e **nunca** para "das suas notas" |
| `atalhos` (botões "Onde ver isso agora") | aparecem sempre que vierem, **não só no fallback**: desde a backend#266 vêm também com `modoFallback: false`, quando a Ceres não identificou qual dado consultar. A frase "os trechos da lei estão como foram escritos" só aparece em fallback **com citação**. E o selo de rota some quando `fontesDados` vem vazio: sem consulta, a resposta não é "das suas notas" |
| `rota` (DADOS/LEGISLACAO/MISTO/FORA_DE_ESCOPO) | selo na mensagem; durante a espera vira "Consultando as suas notas…" (evento `rota` do SSE chega em segundos) |
| Uma pergunta por vez; 1 a 1000 caracteres | `podeEnviar`/`perguntaLonga` no store, contador no campo |
| `Retry-After` no 503 `ASSISTENTE_OCUPADO` | store reenvia **uma** vez (`TENTATIVAS_POR_PERGUNTA`) |
| `AbortController` ao sair da tela | `store.cancelar(false)` no `ngOnDestroy` da `ChatPage`; botão "Cancelar" durante a espera |
| Chat escondido para contador (403 `PAPEL_NAO_AUTORIZADO`) | `store.disponivel()` + `produtorGuard` na rota |
| `resposta` é texto puro | `<app-ceres-texto>`: parágrafos (`\n\n`) e linhas `- ` como `<ul>`, tudo por interpolação; **nunca** `[innerHTML]` |

Falha **não vira texto de assistente**: a mensagem carrega `falha` com o código do backend e a tela
escolhe o que dizer (`tituloDaFalha`/`detalheDaFalha` em `assistente-conversa.ts`). "Modelo fora do ar"
(`ASSISTENTE_INDISPONIVEL`) e "servidor fora do ar" (`SEM_CONEXAO`) são coisas diferentes e a tela diz qual é.

### Continuidade da conversa (#183, backend#499)

Cada pergunta chega isolada ao backend — era por isso que "tem certeza?" respondia "Não consegui
identificar qual dado consultar". Agora a tela manda de volta as últimas trocas:

- **O `turno` é opaco.** Vem na resposta (`CeresTurno`: pergunta, resposta e assinatura), é guardado
  **como veio** na mensagem (`AssistenteMensagem.turno`) e volta **como veio** no `historico`. Nada de
  `trim`, reformatação ou par montado com o texto da tela: a assinatura vale para os bytes exatos, e
  qualquer mudança faz o backend **ignorar o histórico em silêncio** — sem erro nenhum para avisar.
- **Quem monta o contexto é o store**, em `contextoDaConversa()`, **antes** de a pergunta nova entrar na
  lista. No `historico` vão os `turno` das últimas `MAX_TURNOS_HISTORICO` (3) respostas que os trouxeram;
  recusa, conversa leve, modo fallback, falha e cancelamento vêm **sem** `turno` e nunca entram. O
  `ultimaRespostaSemTurno` olha a **última** mensagem da Ceres (com `turno` ou sem) e é o que impede um
  "tem certeza?" depois de uma recusa de refazer a consulta de duas respostas atrás.
- **O reenvio do 503 manda o mesmo contexto**, não um recalculado: a conversa não andou entre o
  `ASSISTENTE_OCUPADO` e o reenvio.
- **Só na memória.** O `turno` leva valores, datas e os textos do escritório: nada de `localStorage`,
  `sessionStorage` nem `console.log`, e ele nunca aparece na tela. O `limpar()` do logout zera tudo.
- **Cancelar passou a custar o que já foi gasto**: o backend só percebe o cancelamento na chamada
  seguinte ao modelo, então a cota é recarregada ~5 s depois do botão (`ESPERA_USO_APOS_CANCELAR_MS`), e o
  valor é provisório até a próxima resposta. O `limpar()` desarma esse timer — senão ele pediria
  `/assistente/uso` depois do logout.
- **Aviso de envio ao provedor:** com `uso().conversaVaiAoProvedor`, a conversa mostra uma linha fixa
  dizendo que as últimas perguntas e respostas vão a um provedor de IA fora do Brasil. Ausente vale
  `false`. Junto, os quatro campos de texto que o escritório escreve e o produtor lê (motivo da devolução
  da nota, motivo no pedido e os dois títulos de pedido) levam o `AVISO_TEXTO_DO_ESCRITORIO`, de
  `@core/utils/ceres`.
- `perguntar()` passou a usar o **mesmo `normalizar`** do streaming: as duas portas da mesma pergunta
  entregavam formas diferentes à tela (lista ausente crua num caminho, `turno` `undefined` contra `null`).

**Medição:** `docs/ux-audit.js` — cole no console e rode `uxAudit()`. Devolve alvos abaixo de 44px, textos
abaixo de 14px, largura aproveitada, maior card e estouro horizontal. É o critério de aceite numérico das fases.

## Convenções (TypeScript strict)

- **Signals** para estado reativo (não há zone.js). `computed()` para derivados.
- Componentes **standalone** com `imports: [...]` explícito; declarar `LucideAngularModule`/ícones usados.
- `noPropertyAccessFromIndexSignature`: acessar propriedades de index-signature com **bracket** `obj['x']`.
- Prettier: `printWidth: 100`, `singleQuote: true` (config no `package.json`); HTML usa parser `angular`.
- Budgets (`angular.json`): bundle inicial warn 500 kB / erro 1 MB; estilos warn 4 kB / erro 8 kB.
  (Baseline medido em 27/10 na `main`: **469,81 kB**; com a carteira (#95): **486,10 kB**; com o login JWT
  (#93): **490,96 kB** / 119,99 kB gzip. Em 04/11 chegou a **502,75 kB** / 121,85 kB gzip, acima do teto de aviso.
  **Com o `@defer` da gaveta da Ceres (#143): 481,31 kB / 115,82 kB gzip** — folga de ~19 kB. A gaveta e a
  conversa saíram do bundle inicial (chunk `assistente-drawer`, 7,43 kB); o `AppLayout` só carrega o launcher.
  O bloco é `@defer (when assistente.aberto(); prefetch on idle)`: o estado mora no `AssistenteStore` (`root`),
  então o primeiro `abrir()`/`abrirSobreNota()` não se perde. Tem `@loading` (rede lenta) e `@error` (chunk
  que sumiu num deploy: oferece recarregar, porque o `@defer` não tenta de novo). Se apertar de novo, não
  corte a camada de IA.)
  **Medido em 12/11 na `main`: 499,43 kB / 124,95 kB gzip. Com o PR 3 da landing (#174): 501,50 kB /
  125,41 kB gzip** — `+2,07 kB` cru (`+0,46 kB` gzip), dos quais ~0,94 kB são CSS (os tokens nos dois temas,
  as utilities da variante `lima` e o segundo bloco de movimento reduzido) e ~1 kB é o service, que vai no
  inicial por nascer no `provideAppInitializer`. **Isso passa o aviso de 500 kB por 1,50 kB** — o build
  continua verde (o erro é em 1 MB), mas o teto precisa de decisão antes dos PRs 4 e 5. Os tokens de marca
  e as utilities da landing moram no `styles.css` global, então eles **sempre** contam no inicial, mesmo com
  a página inteira em chunk lazy.
  **O PR A não muda o inicial (501,50 kB). Com o PR J (jornada 3D): 504,35 kB / 126,83 kB gzip**, `+2,85 kB`,
  e nada disso é o player (ele está no chunk adiado `jornada-milho`, 20,5 kB): ~0,93 kB são as utilities
  Tailwind novas do template, que o Tailwind v4 põe no CSS global; ~0,99 kB é código do Angular que o chunk
  da jornada passou a dividir com o inicial; e ~0,9 kB é o `main` partido em chunks comuns (o
  `PreferenciaMovimentoService` e os helpers do esbuild saíram dele para serem compartilhados).
- **Lint está em zero** (`All files pass linting`), vindo de 63 warnings. Se voltar a aparecer warning,
  conserte o que ele aponta em vez de suprimir — as duas únicas supressões do projeto estão nos fundos
  de fechar painel do `app-layout`, e só depois de `Esc` passar a fechar os painéis de verdade.
- Evitar `?.` onde o tipo não é nullable (warning NG8107).

## Git / fluxo de trabalho

- **O contrato do backend está em `http://localhost:8080/v3/api-docs`** (OpenAPI, ~125 kB, 92 rotas).
  Leia-o **antes de supor que uma rota não existe** — duas vezes em 29/10 a rota que eu dava como
  futura já estava no ar (`/auth/me`, que fechou a #106, e os filtros `status`/`busca` de
  `/api/notas`, da #104). O proxy do `ng serve` só encaminha `/api/*`, então use `curl` direto na
  8080, não o navegador.
- Remote: `origin` → `github.com/SupersonicTeam/frontend`.
- **Fluxo:** uma **issue** por tarefa → branch **`feature/<n>-<slug>`** a partir de `main` → **PR para `main`**
  (corpo com `Closes #<n>`) → merge após CI verde. Branches mergeadas são deletadas.
- **CI** (`.github/workflows/ci.yml`): roda **lint · build · test** (Node 22). Garanta os três verdes
  localmente antes de abrir/mergear o PR. `dist/`, `node_modules/`, `.angular/cache` no `.gitignore`.

## Estado das sprints (frontend)

Frontend ~85-90% pronto. **Login JWT de verdade entrou na #93** (o `X-Usuario-Id` e os UUIDs cravados
saíram). Gaps reais (em ordem de sprint): ~~gráficos ng2-charts no dashboard (S1)~~ ✅ feito ·
filtros grupo/status em Documentos (S2) · ~~seletor multi-produtor no Contador~~ ✅ **feito** (#95):
a carteira (backend#177) existe e o Acompanhamento virou a triagem dela, com `/contador/:produtorId`
por cliente. ~~Leitura de números por cliente~~ ✅ **feita** (#136): a backend#255 entregou
`/contador/produtores/{id}/{apuracao,relatorios/conformidade,creditos,dashboard}` e o Fechamento e as
Notas do contador passaram a usá-las; a ficha do cliente com apuração e créditos é a #138 ·
download PDF/XML (S3) ·
dialog inline de anexar no Calendário · polir estados loading/erro/vazio (S5) · WCAG + README (S10).
Plano completo: `../../../.claude/plans/` (sessão de planejamento).
