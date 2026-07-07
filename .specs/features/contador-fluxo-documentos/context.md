# Fluxo de Documentos e Obrigações do Contador — Context

**Gathered:** 2026-07-07
**Spec:** `.specs/features/contador-fluxo-documentos/spec.md`
**Status:** Ready for design

---

## Feature Boundary

Painel do Contador (6 abas, layout inalterado) fica populado e demonstrável fim-a-fim: dados de exemplo
via fallback mock onde o backend não existe, guia com vencimento refletindo no calendário do produtor
(com follow-up de backend real já aberto), anexo por categoria real ligado ao `ContadorApi`, checklist de
fechamento e aviso "WhatsApp — em breve". Ver `spec.md` para o detalhamento completo por história.

---

## Implementation Decisions

### Persistência da guia fiscal

- O usuário quer que a guia seja salva "dentro de alguma rota da API" — não aceitar um mock puramente
  cosmético sem plano de persistência real.
- Ação tomada: issue [backend#74](https://github.com/SupersonicTeam/backend/issues/74) aberta propondo
  `POST/GET /contador/guias` e `PATCH /contador/guias/:id/pagar`.
- Enquanto o endpoint não existe, `ContadorApi` tenta a chamada real primeiro e cai para um fallback mock
  em memória (signal, escopo de sessão) em caso de erro — mesmo padrão já usado em `getPendencias`.

### Resiliência do calendário (desacoplar fontes)

- Hoje `calendario.ts` usa `forkJoin({ vencimentos, pendencias })`: uma falha em `/calendario-fiscal`
  derruba a tela inteira (estado de erro), escondendo até dados mockados do `ContadorApi`.
- Decisão confirmada: desacoplar. Falha em `CalendarioApi.getVencimentos()` zera só os vencimentos reais;
  solicitações e guias do `ContadorApi` continuam aparecendo mesmo se o backend de vencimentos cair.
- Isso é necessário para o DoD (\"guia aparece no calendário\") ser demonstrável independente do estado do
  backend de `/calendario-fiscal`.

### Gancho "WhatsApp — em breve"

- 100% local: toast/badge, zero chamada HTTP. Nada de reaproveitar `NotificacaoApi` para essa ação
  específica — simplicidade e nenhum risco de mascarar um erro real de rede.

### Local do checklist de fechamento mensal/IR

- Vive dentro da aba "Docs Oficiais" (mesma aba que recebe as guias de exemplo) — não cria uma 7ª aba,
  respeitando o layout fixo de 6 abas.

### Agent's Discretion

- Enum `tipoGuia`: `ICMS | FUNRURAL | DARF | GPS | OUTRO` (espelha os exemplos citados na issue original).
- Volume de fixtures mock: 2–4 itens por lista, o suficiente para o painel parecer populado.
- Guia é tratada como registro de metadado (tipo/vencimento/valor) — sem upload de arquivo obrigatório
  (ver Deferred Ideas).

### Declined / Undiscussed Gray Areas → Assumptions

Nenhuma área foi recusada — as 4 perguntas levantadas no Discuss foram todas respondidas pelo usuário.
Decisões de menor impacto (enum, volume de fixtures, guia sem upload) não foram perguntadas explicitamente
e ficam registradas como discrição do agente acima e na tabela de Assumptions do `spec.md`.

---

## Specific References

- "isso deve ficar salvo dentro de alguma rota da API, faça essa correção planeje e suba uma issue pra o
  backend a respeito disso" — motivou a criação do backend#74 e o padrão "tentar real, cair pra mock" no
  `ContadorApi`.

---

## Deferred Ideas

- Upload de arquivo (comprovante PDF) anexado à guia — a issue #28 só pede vencimento + valor; se o
  contador quiser anexar o PDF da guia em si, isso é uma extensão natural do backend#74 (campo
  `arquivoUrl`), não desta issue.
- Guia aparecer diretamente na resposta de `/calendario-fiscal/:produtorId/vencimentos` (fusão no backend
  em vez de merge no frontend) — mencionado no backend#74 como "ideal", mas decisão de arquitetura do time
  de backend, fora do controle desta feature.
