# Auditoria de segurança — AgroContábil

Relatório: [`relatorio-auditoria-seguranca.pdf`](relatorio-auditoria-seguranca.pdf) (20 páginas, pt-BR).

Auditoria de **24/09/2026** sobre os dois repositórios do projeto. O backend
(`SupersonicTeam/backend`) foi lido, **nunca modificado** — os achados de lá viram issue para o
Murillo.

## Regerar o PDF

```bash
docs/security-audit/.venv/Scripts/python.exe docs/security-audit/gerar_relatorio.py
```

Se o venv não existir (ele não é versionado):

```bash
python -m venv docs/security-audit/.venv
docs/security-audit/.venv/Scripts/python.exe -m pip install reportlab matplotlib pypdf pymupdf
```

Nada é instalado globalmente.

## Arquivos

| Arquivo | Papel |
|---|---|
| `dados_auditoria.py` | Os achados, pontos fortes, recomendações e o texto das issues. **Edite aqui** quando um achado for corrigido. |
| `gerar_relatorio.py` | Renderiza o PDF (ReportLab) e os gráficos (matplotlib). |
| `graficos/` | PNGs gerados automaticamente — rosca por severidade e barras por categoria. |
| `.venv/`, `.preview/` | Ambiente isolado e rasterizações de conferência. Não versionados. |

## Resumo dos achados

| ID | Sev. | O quê |
|---|---|---|
| A1 | Crítica | `permitAll()` em toda a API — nenhuma autenticação |
| A2 | Crítica | Profile `dev` é o padrão e autentica sozinho qualquer requisição |
| A3 | Alta | `GET /api/contador/guias` aceita qualquer `produtorId` |
| A4 | Alta | `POST /api/contador/guias` grava na conta de qualquer produtor |
| A5 | Alta | Papel "Contador" só existe no `localStorage` |
| A6 | Média | `JWT_SECRET` aceita vazio; sem validação de startup |
| A7 | Baixa | Swagger UI público em qualquer profile |
| A8 | Informativa | `.p12` versionado — verificado: autoassinado, de teste |

**9 pontos fortes** registrados com evidência, incluindo o padrão anti-IDOR aplicado
corretamente em 15 dos 17 pontos com dono e zero sinks de XSS no frontend Angular.
