# Design — Download de nota em PDF e XML (issue #21, Sprint 3)

**Data:** 2026-06-11
**Branch:** `feature/21-download-nota-pdf-xml` (sai de `dev`, PR incremental → `dev`)
**Escopo:** frontend Angular (`frontend/`)

## Contexto

O issue #21 tem título "Download de nota em PDF e XML", mas o corpo descreve o módulo
inteiro de Notas Fiscais. Auditoria do código mostrou que **a maior parte já existe** no
componente `Documentos` (listagem com filtros, badges de status, preview, gerar rascunho,
anexar). O gap real é o botão **"Baixar"** no preview da nota
([documentos.component.html:272](../../../src/app/features/documentos/documentos.component.html)),
que hoje **não tem `(click)`** — não faz nada.

Decisão de escopo (alinhada com o dono): entregar **apenas o download em PDF e XML**.

## Contrato de backend (relevante)

O backend está sendo reescrito em **Spring Boot (:8080)**. Já há contrato para geração de XML:

- `POST /api/notas/:id/gerar-xml` → **200** com o XML, ou **422** com erros fiscais.
- Envelope de erro padronizado de toda a API:

```json
{
  "timestamp": "2026-06-11T18:40:00-03:00",
  "status": 422,
  "error": "Unprocessable Entity",
  "message": "A nota fiscal possui inconsistências fiscais",
  "path": "/api/notas/42/gerar-xml",
  "errors": [
    { "code": "CFOP_INVALIDO", "field": "itens[0].cfop",
      "message": "CFOP incompatível com a UF de destino",
      "suggestion": "Verifique se a operação é estadual ou interestadual",
      "rejectedValue": "5102", "expectedValue": "6102" }
  ]
}
```

O Spring **ainda não responde** → o service do frontend deixa a chamada `/api` pronta e
**mocka** a resposta por ora (convenção do projeto).

## Decisões de design

1. **XML — consumir o backend** (`POST notas/:id/gerar-xml`), tratando o 422. Mock até o
   Spring existir. Não gerar XML "de verdade" no front como produto final (seria retrabalho).
2. **PDF — gerar no frontend** com **jsPDF** (DANFE simplificado). Não há `gerar-pdf` no
   contrato; o PDF é responsabilidade do front por ora.
3. **Tratamento do envelope de erro — local na #21** (painel no preview). O interceptor
   global do envelope (cross-cutting) fica como **tarefa separada**.
4. **Mock realista**: aplica 2 validações simples (item sem CFOP, total divergente) e
   retorna 422 com o envelope quando bate; senão devolve o XML gerado. Exercita ambos os
   caminhos sem backend.

## Componentes e arquivos

### `core/models/types.ts` — tipos novos
```ts
export interface FiscalError {
  code: string; field: string; message: string;
  suggestion?: string; rejectedValue?: string; expectedValue?: string;
}
export interface ApiErrorEnvelope {
  timestamp: string; status: number; error: string;
  message: string; path: string; errors: FiscalError[];
}
```

### `core/services/dashboard.service.ts` — geração de XML
- `gerarXmlNota(notaId: string): Observable<string>` → `POST notas/${id}/gerar-xml`.
  - Sucesso: resolve com a string XML.
  - Erro HTTP 422: o `HttpErrorResponse.error` carrega o `ApiErrorEnvelope`.
  - **Mock** (enquanto sem backend): `validarNotaMock(nota)` → se houver erros, `throwError`
    com um `ApiErrorEnvelope`; senão `of(buildNotaFiscalXml(nota))` com pequeno atraso.
- `buildNotaFiscalXml(nota: NotaFiscal): string` — helper que monta XML representativo de
  NF-e (`infNFe` → `ide`, `emit`, `dest`, `det[]`, `total`). Não é o layout SEFAZ 4.00
  completo; é coerente e suficiente para o TCC. (Quando o Spring assumir, vira só fallback.)

### `core/utils/nota-pdf.ts` (novo) — geração de PDF
- `gerarNotaPdf(nota: NotaFiscal): Promise<void>` — `const { jsPDF } = await import('jspdf')`
  (import dinâmico → fica no **chunk lazy** do `Documentos`, fora do bundle inicial).
- Layout DANFE simplificado: cabeçalho (nº/série/chave), emitente/destinatário, tabela de
  itens (descrição, qtd, vlr unit, vlr total), bloco de totais e impostos (CBS/IBS/FUNRURAL/
  ICMS/IPI), rodapé com observações. Usa os tokens de cor do design system quando aplicável.
- Dispara download com nome `nota-<numero|id>.pdf`.

### `features/documentos/documentos.component.ts`
- Sinais: `baixandoXml = signal(false)`, `errosFiscais = signal<FiscalError[]>([])`.
  Limpos ao abrir/fechar o preview (`previewNota`).
- `baixarXml(nota)`: `baixandoXml=true` → `gerarXmlNota` → sucesso: `triggerDownload(
  'nota-<n>.xml', xml, 'application/xml')`; erro: `errosFiscais.set(env.errors)` + toast.
- `baixarPdf(nota)`: `await gerarNotaPdf(nota)` (try/catch → toast em falha).
- `triggerDownload(filename, content, mime)`: cria `Blob`, `URL.createObjectURL`, âncora
  temporária, `revokeObjectURL`.

### `features/documentos/documentos.component.html`
- No rodapé do preview, trocar o botão único "Baixar" por **"Baixar XML"** (com spinner via
  `baixandoXml()`) e **"Baixar PDF"**.
- Painel condicional de inconsistências (`@if (errosFiscais().length)`) listando cada erro:
  `field` · `message` · `suggestion`.

### `package.json`
- Adicionar `jspdf` em `dependencies`.

## Fluxo de dados

```
[Preview da nota] --Baixar XML--> baixarXml()
   -> dashboardService.gerarXmlNota(id)  (POST /notas/:id/gerar-xml | mock)
      -> 200: string XML  -> triggerDownload(.xml)
      -> 422: ApiErrorEnvelope -> errosFiscais (painel) + toast

[Preview da nota] --Baixar PDF--> baixarPdf()
   -> import('jspdf') -> gerarNotaPdf(nota) -> download .pdf
```

## Tratamento de erro

- **422 (gerar-xml)**: painel no preview + toast "A nota possui inconsistências fiscais".
- **Outros erros HTTP / mock falho**: toast genérico "Erro ao gerar XML".
- **Falha no PDF**: toast "Erro ao gerar PDF" (try/catch no import dinâmico/jsPDF).

## Testes (Vitest)

- `dashboard.service`: `gerarXmlNota` mock retorna XML para nota válida; lança
  `ApiErrorEnvelope` (422) para nota com CFOP ausente / total divergente.
- `buildNotaFiscalXml`: o XML contém chave de acesso, todos os itens e o total.
- `documentos.component`: `baixarXml` sucesso chama o `triggerDownload`; erro 422 popula
  `errosFiscais`. `baixarPdf` invoca o gerador (mock do `import('jspdf')`).

## Fora de escopo (tarefas futuras)

- Interceptor global do envelope de erro padronizado (cross-cutting, toda a API).
- Endpoint `gerar-pdf` no backend (se o time decidir mover o PDF pro Spring).
- Migrar o formulário de gerar rascunho para Reactive Forms; tabela Angular Material;
  upload XML drag-and-drop (já há anexar simples).

## Suposições a validar com o time (não bloqueiam)

1. Interceptor global de erros não pertence a outra issue desta sprint.
2. Geração de PDF é responsabilidade do frontend (não há `gerar-pdf` no contrato Spring).

## Orçamento de bundle

jsPDF (~150 kB min) entra **no chunk lazy** do `Documentos` (via `import()` dinâmico), não no
bundle inicial — mesmo padrão do chart.js. Inicial permanece sob o budget (warn 500 kB).
