# Fluxo de Documentos e Obrigações do Contador — Specification

**Issue:** [frontend#28](https://github.com/SupersonicTeam/frontend/issues/28)
**Backend follow-up filed:** [SupersonicTeam/backend#74](https://github.com/SupersonicTeam/backend/issues/74) (persistência real de guias fiscais)

## Problem Statement

Um contador que testou o sistema deu feedback: o painel `/contador` (6 abas) existe, mas não tem um
**fluxo de documentos/obrigações coerente e demonstrável** — as listas ficam vazias silenciosamente
porque `/contador/*` e `/calendario-fiscal` ainda não existem no backend Spring, não há como o contador
cobrar uma guia com vencimento do produtor, o anexo de documentos não distingue categorias contábeis
reais (balancete, balanço, extrato, IR), e não existe um checklist de fechamento mensal. Sem isso, o
painel não é demonstrável para um contador real.

## Goals

- [ ] Painel do Contador **populado** (fallback mock com aviso "em breve") e navegável nas 6 abas — nenhuma tela vazia sem explicação.
- [ ] Contador registra uma **guia com vencimento + valor** e ela aparece no **calendário do produtor** como `imposto`, com status pendente/pago/vencido; produtor marca como paga.
- [ ] Fluxo **solicitar → enviar → receber** (mão dupla) demonstrável de ponta a ponta com dados de exemplo.
- [ ] Anexo de documento por **categoria contábil real** (Guia de imposto, Balancete, Balanço, Extrato bancário, Documento para IR, além das já existentes), efetivamente ligado ao `ContadorApi`.
- [ ] Checklist de fechamento mensal/IR e badge "WhatsApp — em breve" presentes e claramente identificados como mock.

## Out of Scope

Explicitamente excluído desta issue (herdado do frontend#28). Documentado para prevenir scope creep.

| Feature | Reason |
| --- | --- |
| Backend real dos endpoints `/contador/*` e `/calendario-fiscal` | Time de backend; guia já tem follow-up filed em [backend#74](https://github.com/SupersonicTeam/backend/issues/74) |
| Cobrança/integração real com WhatsApp | Só mock "em breve" — gancho para issue futura |
| Redesign visual amplo do layout (6 abas) | Fora de escopo; scrollbars são a #26 |
| Geração/validação fiscal real da guia (DARF/GPS/FUNRURAL oficiais) | É só registro manual de vencimento + valor pelo contador, não emissão oficial |
| Upload de arquivo (PDF) da guia | "Anexar guia" = registrar metadado (tipo/vencimento/valor); upload de comprovante fica para outra issue |
| Seletor multi-produtor no Contador | Sprint própria (ver CLAUDE.md — gaps do frontend) |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Persistência da guia | `ContadorApi` tenta chamadas reais (`POST/GET/PATCH /contador/guias`) e cai para fallback mock (signal em memória, escopo de sessão — some ao dar F5) em erro, igual ao padrão já usado em `getPendencias`/`getRecebidos` | Usuário pediu rota real de API; endpoint ainda não existe → issue backend#74 aberta; fallback em memória segue o padrão já usado no restante do `ContadorApi` (sem `localStorage` em nenhum outro service do projeto) | y (parcial — rota real confirmada pelo usuário; fallback em memória é default do agente, não perguntado explicitamente) |
| Resiliência do calendário | `calendario.ts` desacopla as fontes: falha em `/calendario-fiscal` não derruba o calendário inteiro — vencimentos reais somem, mas solicitações/guias do `ContadorApi` continuam aparecendo (erro tratado por fonte, não em `forkJoin` único) | Confirmado pelo usuário — necessário para a demo do DoD funcionar mesmo com o backend de vencimentos fora do ar | y |
| Gancho "WhatsApp — em breve" | 100% local (toast/badge), sem chamada HTTP | Confirmado pelo usuário — mais simples, zero risco de mascarar erro real | y |
| Local do checklist de fechamento | Dentro da aba "Docs Oficiais" (mesma aba populada com guias de exemplo) | Confirmado pelo usuário | y |
| Enum `tipoGuia` | `ICMS \| FUNRURAL \| DARF \| GPS \| OUTRO` | Espelha os exemplos citados no corpo da issue #28 (\"ICMS/FUNRURAL/DARF/GPS…\") | n — assumido, não perguntado |
| Volume de fixtures mock | 2–4 itens por lista (pendências, recebidos, guias, checklist), suficiente para o painel parecer populado sem exagero | Discrição do agente — issue só pede "populado", não define volume | n — assumido |
| Vínculo guia↔documento anexado | Guia é um registro independente (vencimento fiscal), não um documento com arquivo; documento anexado pelo produtor continua vinculado à `SolicitacaoContador` existente | Issue não descreve upload de arquivo para a guia, só metadado; ver Out of Scope | n — assumido |

**Open questions:** nenhuma — todas resolvidas ou registradas acima.

---

## User Stories

### P1: Painel do Contador sempre populado ⭐ MVP

**User Story**: Como contador, quero ver as pendências, documentos recebidos e documentos do produtor
populados com dados de exemplo quando o backend real ainda não responde, para poder demonstrar o fluxo
completo sem telas vazias.

**Why P1**: É a base de tudo — sem dados, nenhuma outra história é demonstrável.

**Acceptance Criteria**:

1. WHEN `ContadorApi.getPendencias()` falha (erro HTTP, ex.: rota inexistente) THEN o service SHALL retornar uma lista de pendências de exemplo (fixture), não uma lista vazia.
2. WHEN `ContadorApi.getRecebidos()` falha THEN o service SHALL retornar documentos recebidos de exemplo.
3. WHEN `ContadorApi.getDocumentos(pendenciaId)` falha THEN o service SHALL retornar anexos de exemplo coerentes com a pendência.
4. WHEN o painel do Contador carrega com qualquer dado de exemplo (mock) ativo THEN a página SHALL exibir o banner "dados de exemplo — em breve" (já existente no header).
5. WHEN o backend real responde com sucesso (mesmo que lista vazia) THEN o service SHALL usar a resposta real, SEM sobrepor com fixtures (fixture é só fallback de erro, nunca de sucesso vazio).

**Independent Test**: Com o backend Spring rodando mas sem os endpoints `/contador/*` implementados (404), abrir `/contador` e ver as 6 abas com conteúdo em todas (nenhuma tela "vazia sem explicação").

---

### P1: Guia com vencimento reflete no calendário do produtor ⭐ MVP

**User Story**: Como contador, quero anexar uma guia (ICMS/FUNRURAL/DARF/GPS) com data de vencimento e
valor, para que o produtor veja essa obrigação no calendário dele e possa marcá-la como paga.

**Why P1**: É a peça central do feedback do contador — fechar o loop guia → calendário → pagamento.

**Acceptance Criteria**:

1. WHEN o contador usa a ação "Anexar guia" preenchendo tipo, data de vencimento e valor THEN o sistema SHALL criar um registro de guia com status `pendente`.
2. WHEN uma guia é criada THEN ela SHALL aparecer no calendário do produtor (`/calendario`) como um vencimento do tipo `imposto`, com o valor e o status corretos.
3. WHEN a data de vencimento de uma guia pendente já passou THEN o calendário SHALL exibir seu status como `vencido`.
4. WHEN o produtor marca uma guia como paga (no calendário ou no painel) THEN o status SHALL mudar para `pago` e refletir em ambas as telas (calendário e painel do contador) na próxima leitura.
5. WHEN o endpoint real `/contador/guias` (GET, criado em backend#74) falha THEN o `ContadorApi` SHALL usar fallback mock em memória (guias de exemplo + as criadas na sessão), sem quebrar a criação/leitura/atualização.
6. WHEN `CalendarioApi.getVencimentos()` falha (endpoint `/calendario-fiscal` fora do ar) THEN o calendário SHALL continuar exibindo as guias e solicitações vindas do `ContadorApi` — a falha do primeiro NÃO SHALL ocultar o segundo.

**Independent Test**: No painel do Contador, anexar uma guia ICMS com vencimento amanhã e valor R$500; navegar para `/calendario` do produtor e ver o evento `imposto` com R$500 status pendente; marcar como paga; confirmar que o status vira "Pago" em ambas as telas.

---

### P2: Anexo de documento por categoria real

**User Story**: Como contador, quero que as categorias de anexo reflitam o que realmente peço (guia de
imposto, balancete, balanço, extrato bancário, documento de IR), e como produtor, quero que meu envio de
arquivo (`salvarAnexo`) realmente chegue ao contador, não apenas um toast local.

**Why P2**: Sem isso, o fluxo de anexo é só teatro visual — não fecha o loop mão-dupla de verdade.

**Acceptance Criteria**:

1. WHEN o contador cria uma nova solicitação THEN a lista de categorias SHALL incluir "Guia de imposto", "Balancete", "Balanço", "Extrato bancário" e "Documento para IR", além das já existentes.
2. WHEN o produtor confirma `salvarAnexo()` em `documentos.ts` com uma solicitação e arquivo selecionados THEN o sistema SHALL chamar `ContadorApi.anexarDocumento(pendenciaId, file, categoria)` (real, com fallback mock em erro), não apenas exibir um toast sem chamada.
3. WHEN `anexarDocumento()` sucede (real ou mock) THEN a solicitação correspondente SHALL mudar de status para `enviado` e aparecer na aba "Recebidos" do contador.
4. WHEN `anexarDocumento()` falha sem fallback possível (raro — ex.: arquivo corrompido) THEN o sistema SHALL exibir um toast de erro e manter o status anterior.

**Independent Test**: No painel do produtor, anexar um arquivo para uma solicitação de categoria "Balancete"; no painel do contador (aba Recebidos), ver a solicitação com status "enviado" e o documento anexado visível em "Ver anexo".

---

### P2: Fluxo mão-dupla reforçado com dados de exemplo

**User Story**: Como contador, quero ver o loop pedir → produtor recebe → produtor envia → contador
aprova/rejeita populado com exemplos realistas, para demonstrar o ciclo completo sem precisar criar dados
manualmente.

**Why P2**: Depende do P1 (fixtures) e do P2 anterior (anexo real); fecha a demonstração ponta a ponta.

**Acceptance Criteria**:

1. WHEN o painel do Contador carrega em modo mock THEN a aba "Solic." SHALL ter ao menos uma pendência de exemplo, a aba "Recebidos" ao menos um documento enviado de exemplo, e "Concluídos" ao menos um histórico (aprovado/rejeitado/cancelado).
2. WHEN o produtor recebe uma nova solicitação (mock) THEN ela SHALL também aparecer na aba "Documentos" do produtor E gerar uma notificação (usando o `NotificacoesService` local já existente).
3. WHEN o contador aprova ("Aprovar") ou rejeita um documento recebido (mock ou real) THEN o comportamento SHALL ser idêntico ao já implementado hoje (sem regressão).

**Independent Test**: Abrir `/contador`, ver pendências/recebidos/concluídos populados; abrir `/documentos` do produtor e ver a mesma solicitação de exemplo refletida.

---

### P2: Checklist de fechamento mensal/IR + Docs Oficiais populado

**User Story**: Como contador, quero um checklist por período (mês/ano) marcando o que já recebi
(balancete, balanço, extratos, guias, documentos de IR), e quero ver a aba "Docs Oficiais" com exemplos de
guias/DARF/FUNRURAL, para acompanhar o fechamento do mês.

**Why P2**: Fecha o DoD "checklist e WhatsApp em breve presentes e claros como mock"; não bloqueia as
histórias centrais (P1).

**Acceptance Criteria**:

1. WHEN o contador abre a aba "Docs Oficiais" THEN ela SHALL exibir guias/DARF/FUNRURAL de exemplo (mock) em vez do placeholder vazio atual.
2. WHEN o contador abre o checklist de fechamento (dentro de "Docs Oficiais") para um período (mês/ano) THEN ele SHALL listar os itens esperados (balancete, balanço, extrato bancário, guias, documento IR) com estado recebido/pendente.
3. WHEN o contador marca um item do checklist como recebido THEN o estado SHALL persistir localmente (mock, sessão) e refletir visualmente (ex.: check verde).
4. WHEN nenhum período está selecionado THEN o sistema SHALL exibir um estado vazio explícito ("Selecione um período para ver o checklist"), nunca uma seção em branco sem texto. *(Corrigido pós-Verifier: a lista de categorias do checklist é fixa — balancete/balanço/extrato/guia/IR sempre presentes uma vez que um período é escolhido — então "período selecionado sem itens" é arquiteturalmente inatingível; a AC original descrevia um estado que a própria decisão de design de T7 tornou impossível. O estado vazio genuíno é "nenhum período escolhido ainda", já coberto.)*

**Independent Test**: Abrir "Docs Oficiais", ver guias de exemplo; abrir o checklist do mês corrente, marcar "Balancete" como recebido e ver o check refletido.

---

### P3: Notificação "WhatsApp — em breve"

**User Story**: Como contador, ao anexar uma guia ou solicitar um documento, quero ver um aviso claro de
que o envio por WhatsApp chega em breve, para entender que a cobrança automática ainda não existe mas
está no roadmap.

**Why P3**: Cosmético/comunicacional — não bloqueia nenhum fluxo funcional (P1/P2).

**Acceptance Criteria**:

1. WHEN o contador anexa uma guia THEN o sistema SHALL exibir um toast/badge local "Envio por WhatsApp — em breve", sem nenhuma chamada HTTP.
2. WHEN o contador cria uma nova solicitação de documento THEN o mesmo aviso "em breve" SHALL aparecer.

**Independent Test**: Anexar uma guia e ver o toast "em breve"; criar uma solicitação e ver o mesmo aviso — sem nenhuma requisição de rede disparada (checar aba Network).

---

## Edge Cases

- WHEN uma guia é criada com data de vencimento no passado THEN o sistema SHALL calculá-la como `vencido` imediatamente (não `pendente`).
- WHEN o `ContadorApi` está em modo mock E o produtor tenta marcar uma guia inexistente (id não encontrado) como paga THEN o sistema SHALL falhar silenciosamente sem quebrar a tela (no-op + log opcional).
- WHEN todas as listas do painel do Contador vêm vazias do backend real (sucesso, sem dados) THEN o sistema SHALL exibir os estados vazios já existentes ("Tudo em dia!", "Nenhum documento recebido"...) SEM popular com fixtures (fixture é só fallback de ERRO, nunca de sucesso vazio — ver AC da história P1).
- WHEN o `forkJoin` do calendário é substituído pela leitura desacoplada THEN uma falha isolada em `/calendario-fiscal` SHALL zerar apenas `vencimentos` reais, preservando solicitações e guias do `ContadorApi` na mesma tela.
- WHEN o valor informado na guia é zero ou negativo THEN o formulário SHALL bloquear o envio (validação client-side, mesma convenção de `Validators` já usada em `novaSolicitacaoForm`).

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| CTD-01 | P1: Painel sempre populado | Design | Pending |
| CTD-02 | P1: Painel sempre populado (getRecebidos) | Design | Pending |
| CTD-03 | P1: Painel sempre populado (getDocumentos) | Design | Pending |
| CTD-04 | P1: Painel sempre populado (banner) | Design | Pending |
| CTD-05 | P1: Painel sempre populado (fixture só em erro) | Design | Pending |
| CTD-06 | P1: Guia no calendário (criar guia) | Design | Pending |
| CTD-07 | P1: Guia no calendário (aparece no calendário) | Design | Pending |
| CTD-08 | P1: Guia no calendário (status vencido) | Design | Pending |
| CTD-09 | P1: Guia no calendário (marcar paga) | Design | Pending |
| CTD-10 | P1: Guia no calendário (fallback mock guias) | Design | Pending |
| CTD-11 | P1: Guia no calendário (calendário desacoplado) | Design | Pending |
| CTD-12 | P2: Anexo por categoria (novas categorias) | Design | Pending |
| CTD-13 | P2: Anexo por categoria (salvarAnexo real) | Design | Pending |
| CTD-14 | P2: Anexo por categoria (status → enviado) | Design | Pending |
| CTD-15 | P2: Anexo por categoria (erro sem fallback) | Design | Pending |
| CTD-16 | P2: Mão-dupla reforçada (fixtures nas 3 abas) | Design | Pending |
| CTD-17 | P2: Mão-dupla reforçada (notificação produtor) | Design | Pending |
| CTD-18 | P2: Mão-dupla reforçada (aprovar/rejeitar sem regressão) | Design | Pending |
| CTD-19 | P2: Checklist + Docs Oficiais (docs populados) | Design | Pending |
| CTD-20 | P2: Checklist + Docs Oficiais (checklist por período) | Design | Pending |
| CTD-21 | P2: Checklist + Docs Oficiais (marcar recebido) | Design | Pending |
| CTD-22 | P2: Checklist + Docs Oficiais (estado vazio) | Design | Pending |
| CTD-23 | P3: WhatsApp em breve (guia) | Design | Pending |
| CTD-24 | P3: WhatsApp em breve (solicitação) | Design | Pending |

**ID format:** `CTD-NN`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 24 total, 0 mapped to tasks (Tasks phase pendente), 24 unmapped ⚠️

---

## Success Criteria

- [ ] `npm run build` · `npm run lint` (0 erros) · `npm test` verdes.
- [ ] Painel do Contador nunca mostra tela vazia sem explicação nas 6 abas.
- [ ] Anexar guia (tipo + vencimento + valor) reflete no calendário do produtor em < 1 navegação (sem reload manual necessário além do já existente).
- [ ] Fluxo solicitar → enviar → receber demonstrável sem nenhuma ação de setup manual (dados já vêm populados).
- [ ] Zero chamadas HTTP disparadas pelo gancho "WhatsApp — em breve" (verificável via `preview_network`).
- [ ] Issue backend#74 registrada e referenciada como follow-up não-bloqueante.
