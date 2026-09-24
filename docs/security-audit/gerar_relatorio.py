# -*- coding: utf-8 -*-
"""
Gera o PDF da auditoria de seguranca a partir de `dados_auditoria.py`.

Uso (a partir de frontend/):
    docs/security-audit/.venv/Scripts/python.exe docs/security-audit/gerar_relatorio.py

O venv isolado fica em docs/security-audit/.venv (reportlab + matplotlib + pypdf);
nada e instalado globalmente. Para recriar:
    python -m venv docs/security-audit/.venv
    docs/security-audit/.venv/Scripts/python.exe -m pip install reportlab matplotlib pypdf
"""

import os
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    BaseDocTemplate, Frame, Image, KeepTogether, PageBreak, PageTemplate,
    Paragraph, Spacer, Table, TableStyle,
)

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
import dados_auditoria as D  # noqa: E402

SAIDA = os.path.join(AQUI, "relatorio-auditoria-seguranca.pdf")
GRAFICOS = os.path.join(AQUI, "graficos")
os.makedirs(GRAFICOS, exist_ok=True)

TINTA = colors.HexColor("#111827")
CINZA = colors.HexColor("#6B7280")
LINHA = colors.HexColor("#D1D5DB")
FUNDO = colors.HexColor("#F3F4F6")
VERDE = colors.HexColor(D.COR_FORTE)

TITULO_REL = f"Relatorio de Auditoria de Seguranca — {D.PROJETO}"


# --------------------------------------------------------------------------- estilos
def montar_estilos():
    ss = getSampleStyleSheet()
    e = {}
    e["capa_titulo"] = ParagraphStyle(
        "capa_titulo", parent=ss["Title"], fontName="Helvetica-Bold", fontSize=26,
        leading=32, textColor=TINTA, alignment=TA_CENTER, spaceAfter=6)
    e["capa_sub"] = ParagraphStyle(
        "capa_sub", parent=ss["Normal"], fontSize=13, leading=18, textColor=CINZA,
        alignment=TA_CENTER)
    e["h1"] = ParagraphStyle(
        "h1", parent=ss["Heading1"], fontName="Helvetica-Bold", fontSize=17, leading=22,
        textColor=TINTA, spaceBefore=4, spaceAfter=10)
    e["h2"] = ParagraphStyle(
        "h2", parent=ss["Heading2"], fontName="Helvetica-Bold", fontSize=12.5, leading=17,
        textColor=TINTA, spaceBefore=12, spaceAfter=6)
    e["h3"] = ParagraphStyle(
        "h3", parent=ss["Heading3"], fontName="Helvetica-Bold", fontSize=10.5, leading=14,
        textColor=TINTA, spaceBefore=8, spaceAfter=3)
    e["corpo"] = ParagraphStyle(
        "corpo", parent=ss["Normal"], fontSize=9.5, leading=14, textColor=TINTA,
        alignment=TA_JUSTIFY, spaceAfter=6)
    e["corpo_cinza"] = ParagraphStyle(
        "corpo_cinza", parent=e["corpo"], textColor=CINZA)
    e["celula"] = ParagraphStyle(
        "celula", parent=ss["Normal"], fontSize=8.5, leading=12, textColor=TINTA)
    e["celula_mono"] = ParagraphStyle(
        "celula_mono", parent=ss["Normal"], fontName="Courier", fontSize=7.4, leading=10,
        textColor=colors.HexColor("#1F2937"))
    e["codigo"] = ParagraphStyle(
        "codigo", parent=ss["Normal"], fontName="Courier", fontSize=7.4, leading=10.2,
        textColor=colors.HexColor("#111827"), backColor=colors.HexColor("#F8FAFC"),
        borderPadding=6, leftIndent=2, rightIndent=2, spaceBefore=3, spaceAfter=6)
    e["chip"] = ParagraphStyle(
        "chip", parent=ss["Normal"], fontName="Helvetica-Bold", fontSize=8,
        leading=11, textColor=colors.white, alignment=TA_CENTER)
    e["issue"] = ParagraphStyle(
        "issue", parent=ss["Normal"], fontName="Courier", fontSize=7.2, leading=9.8,
        textColor=colors.HexColor("#111827"))
    return e


EST = montar_estilos()


def esc(texto):
    return (texto.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def preservar_indent(linha):
    """O Paragraph do ReportLab colapsa espacos a esquerda; &nbsp; mantem o recuo."""
    if not linha.strip():
        return "&nbsp;"
    recuo = len(linha) - len(linha.lstrip(" "))
    return "&nbsp;" * recuo + esc(linha.lstrip(" "))


def bloco_codigo(codigo):
    return Paragraph("<br/>".join(preservar_indent(l) for l in codigo.split("\n")),
                     EST["codigo"])


def chip_severidade(chave):
    rotulo, cor_hex = D.SEV[chave]
    t = Table([[Paragraph(rotulo.upper(), EST["chip"])]], colWidths=[2.05 * cm], rowHeights=[0.5 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor(cor_hex)),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return t


# --------------------------------------------------------------------------- graficos
def grafico_rosca(caminho):
    contagem = {}
    for a in D.ACHADOS:
        contagem[a["sev"]] = contagem.get(a["sev"], 0) + 1
    ordem = [k for k in ("critica", "alta", "media", "baixa", "info") if k in contagem]
    valores = [contagem[k] for k in ordem]
    rotulos = [f"{D.SEV[k][0]} ({contagem[k]})" for k in ordem]
    cores = [D.SEV[k][1] for k in ordem]

    fig, ax = plt.subplots(figsize=(4.6, 3.5), dpi=220)
    wedges, _ = ax.pie(valores, colors=cores, startangle=90,
                       wedgeprops={"width": 0.42, "edgecolor": "white", "linewidth": 2})
    ax.text(0, 0.06, str(sum(valores)), ha="center", va="center",
            fontsize=25, fontweight="bold", color="#111827")
    ax.text(0, -0.22, "achados", ha="center", va="center", fontsize=9.5, color="#6B7280")
    ax.legend(wedges, rotulos, loc="center left", bbox_to_anchor=(1.0, 0.5),
              frameon=False, fontsize=9)
    ax.set(aspect="equal")
    fig.tight_layout()
    fig.savefig(caminho, transparent=True, bbox_inches="tight")
    plt.close(fig)


def grafico_barras(caminho):
    contagem = {k: 0 for k in D.CATEGORIAS}
    for a in D.ACHADOS:
        contagem[a["cat"]] += 1
    chaves = list(D.CATEGORIAS.keys())
    valores = [contagem[k] for k in chaves]
    # rotulo curto: so o numero e o nome sem o prefixo numerico
    rotulos = [D.CATEGORIAS[k].split(". ", 1)[1] for k in chaves]
    rotulos = [r if len(r) <= 22 else r[:21] + "…" for r in rotulos]

    # cor da barra = severidade mais alta daquela categoria
    prioridade = ["critica", "alta", "media", "baixa", "info"]
    cores = []
    for k in chaves:
        sevs = [a["sev"] for a in D.ACHADOS if a["cat"] == k]
        cores.append(D.SEV[next((p for p in prioridade if p in sevs), "info")][1]
                     if sevs else "#D1D5DB")

    fig, ax = plt.subplots(figsize=(6.2, 3.3), dpi=220)
    barras = ax.barh(rotulos, valores, color=cores, height=0.6)
    ax.invert_yaxis()
    ax.set_xlabel("achados", fontsize=9, color="#6B7280")
    ax.set_xlim(0, max(max(valores), 1) + 0.9)
    ax.xaxis.set_major_locator(plt.MaxNLocator(integer=True))
    for s in ("top", "right", "left"):
        ax.spines[s].set_visible(False)
    ax.tick_params(axis="y", length=0, labelsize=9)
    ax.tick_params(axis="x", labelsize=8, colors="#6B7280")
    ax.grid(axis="x", color="#E5E7EB", linewidth=0.7)
    ax.set_axisbelow(True)
    for barra, v in zip(barras, valores):
        if v:
            ax.text(v + 0.12, barra.get_y() + barra.get_height() / 2, str(v),
                    va="center", fontsize=9, fontweight="bold", color="#374151")
        else:
            ax.text(0.12, barra.get_y() + barra.get_height() / 2, "0",
                    va="center", fontsize=9, color="#9CA3AF")
    fig.tight_layout()
    fig.savefig(caminho, transparent=True, bbox_inches="tight")
    plt.close(fig)


# --------------------------------------------------------------------------- template
def cabecalho_rodape(canvas, doc):
    canvas.saveState()
    largura, altura = A4
    if doc.page > 1:
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(CINZA)
        canvas.drawString(2 * cm, altura - 1.25 * cm, TITULO_REL)
        canvas.setStrokeColor(LINHA)
        canvas.setLineWidth(0.5)
        canvas.line(2 * cm, altura - 1.4 * cm, largura - 2 * cm, altura - 1.4 * cm)
        canvas.line(2 * cm, 1.5 * cm, largura - 2 * cm, 1.5 * cm)
        canvas.drawRightString(largura - 2 * cm, 1.1 * cm, f"pagina {doc.page}")
        canvas.drawString(2 * cm, 1.1 * cm, D.DATA)
    canvas.restoreState()


def construir_doc():
    doc = BaseDocTemplate(
        SAIDA, pagesize=A4,
        leftMargin=2 * cm, rightMargin=2 * cm, topMargin=2 * cm, bottomMargin=2 * cm,
        title=TITULO_REL, author="Auditoria automatizada", subject="Seguranca de aplicacao")
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="corpo")
    doc.addPageTemplates([PageTemplate(id="padrao", frames=[frame], onPage=cabecalho_rodape)])
    return doc


# --------------------------------------------------------------------------- secoes
def secao_capa(hist):
    hist.append(Spacer(1, 3.6 * cm))
    hist.append(Paragraph("Relatório de Auditoria de Segurança", EST["capa_titulo"]))
    hist.append(Paragraph(D.PROJETO, ParagraphStyle(
        "p", parent=EST["capa_titulo"], fontSize=21, textColor=VERDE, spaceAfter=18)))
    hist.append(Paragraph(D.DATA, EST["capa_sub"]))
    hist.append(Spacer(1, 1.5 * cm))

    linhas = [[Paragraph(f"<b>{esc(t)}</b>", EST["celula"]), Paragraph(esc(v), EST["celula"])]
              for t, v in D.ESCOPO]
    t = Table(linhas, colWidths=[3.2 * cm, 11.8 * cm])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, LINHA),
        ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    hist.append(Paragraph("Escopo auditado", EST["h2"]))
    hist.append(t)

    # A nota metodologica comeca na pagina 2 com titulo proprio. Antes ela seguia na
    # capa e vazava um paragrafo orfao para uma pagina quase vazia.
    hist.append(PageBreak())
    hist.append(Paragraph("Nota metodológica", EST["h1"]))
    hist.append(Paragraph(
        "Como cada categoria pedida foi mapeada para a stack detectada, antes da análise.",
        EST["corpo_cinza"]))
    for par in D.NOTA_METODOLOGICA.strip().split("\n\n"):
        hist.append(Paragraph(esc(" ".join(par.split())), EST["corpo"]))
    hist.append(PageBreak())


def secao_resumo(hist):
    hist.append(Paragraph("Resumo executivo", EST["h1"]))

    contagem = {}
    for a in D.ACHADOS:
        contagem[a["sev"]] = contagem.get(a["sev"], 0) + 1
    acionaveis = [a for a in D.ACHADOS if a["sev"] != "info"]

    hist.append(Paragraph(
        f"A auditoria percorreu os dois repositórios do projeto e registrou "
        f"<b>{len(D.ACHADOS)} achados</b>, sendo <b>{len(acionaveis)} acionáveis</b> e "
        f"{len(D.ACHADOS) - len(acionaveis)} informativo. Também registrou "
        f"<b>{len(D.PONTOS_FORTES)} pontos fortes</b> verificados no código — a maior parte do "
        f"isolamento por produtor está implementada corretamente e com consistência.", EST["corpo"]))
    hist.append(Paragraph(
        "O eixo do relatório é simples: a aplicação <b>constrói</b> o isolamento de dados com "
        "cuidado, mas <b>não exige credencial de ninguém</b>. Os dois achados críticos não são "
        "descuidos pontuais — são a autenticação inteira, adiada para a Sprint 8 e documentada como "
        "débito no próprio código. Os achados de severidade alta são os pontos onde o isolamento, "
        "mesmo depois que a autenticação existir, continuará furado.", EST["corpo"]))

    # numeros por severidade
    cel = []
    for k in ("critica", "alta", "media", "baixa", "info"):
        n = contagem.get(k, 0)
        cel.append([
            Paragraph(f'<font color="{D.SEV[k][1]}"><b>{n}</b></font>', ParagraphStyle(
                "n", parent=EST["celula"], fontSize=20, leading=24, alignment=TA_CENTER)),
            ])
    tabela_num = Table([[c[0] for c in cel],
                        [Paragraph(D.SEV[k][0], ParagraphStyle(
                            "r", parent=EST["celula"], fontSize=8, alignment=TA_CENTER,
                            textColor=CINZA)) for k in ("critica", "alta", "media", "baixa", "info")]],
                       colWidths=[3.0 * cm] * 5)
    tabela_num.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("BACKGROUND", (0, 0), (-1, -1), FUNDO),
        ("TOPPADDING", (0, 0), (-1, 0), 10), ("BOTTOMPADDING", (0, 1), (-1, 1), 10),
        ("BOX", (0, 0), (-1, -1), 0.5, LINHA),
    ]))
    hist.append(Spacer(1, 6))
    hist.append(tabela_num)

    p_rosca = os.path.join(GRAFICOS, "rosca.png")
    p_barras = os.path.join(GRAFICOS, "barras.png")
    grafico_rosca(p_rosca)
    grafico_barras(p_barras)

    hist.append(Paragraph("Achados por severidade", EST["h2"]))
    hist.append(Image(p_rosca, width=11.6 * cm, height=6.0 * cm, kind="proportional"))
    hist.append(Paragraph("Achados por categoria", EST["h2"]))
    hist.append(Image(p_barras, width=15.0 * cm, height=5.6 * cm, kind="proportional"))
    hist.append(PageBreak())


def secao_fortes_fracos(hist):
    hist.append(Paragraph("Pontos fortes", EST["h1"]))
    hist.append(Paragraph(
        "O que foi verificado e está protegido. Cada item traz a evidência que sustenta a "
        "afirmação — é também a prova da cobertura desta auditoria.", EST["corpo_cinza"]))
    for i, p in enumerate(D.PONTOS_FORTES, 1):
        linhas = [[
            Paragraph(f'<font color="{D.COR_FORTE}"><b>OK</b></font>', EST["celula"]),
            Paragraph(f"<b>{esc(p['titulo'])}</b><br/>"
                      f'<font size="8" color="#4B5563">{esc(p["evidencia"])}</font>', EST["celula"]),
        ]]
        t = Table(linhas, colWidths=[1.1 * cm, 13.9 * cm])
        t.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#ECFDF5")),
            ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINHA),
            ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ("LEFTPADDING", (0, 0), (0, -1), 4),
        ]))
        hist.append(t)

    hist.append(Paragraph("Pontos fracos — os riscos centrais", EST["h2"]))
    fracos = [
        ("A porta está destrancada", "Não há autenticação: <b>permitAll</b> em todos os endpoints e, "
         "no profile padrão, um filtro que autentica sozinho qualquer requisição como o produtor de "
         "teste. Todo o cuidado com isolamento se apoia num principal que ninguém precisa provar."),
        ("Duas rotas confiam no produtorId do cliente",
         "As guias fiscais aceitam o produtorId por query e por corpo sem confrontá-lo com o produtor "
         "autenticado — leitura e escrita cruzando o limite de tenant. O mesmo projeto implementa a "
         "verificação correta no calendário, o que mostra que é lapso pontual, não desconhecimento."),
        ("O papel de Contador é uma variável do navegador",
         "Vem do localStorage, escrito por um login sem senha. Hoje o impacto é pequeno; vira grave no "
         "dia em que um endpoint privilegiado nascer atrás desse gate visual."),
        ("Segredos nascem com valor padrão",
         "<b>JWT_SECRET</b> aceita vazio em produção e nada valida isso no boot — a Sprint 8 pode ligar "
         "a autenticação assinando tokens forjáveis sem emitir um único aviso."),
    ]
    for titulo, txt in fracos:
        hist.append(Paragraph(f"<b>{titulo}.</b> {txt}", EST["corpo"]))
    hist.append(PageBreak())


def secao_achados(hist):
    hist.append(Paragraph("Achados detalhados", EST["h1"]))
    hist.append(Paragraph(
        "Agrupados pelas cinco categorias da auditoria. Cada achado traz arquivo e linha exatos, o "
        "trecho real do código, por que é explorável e a condição necessária.", EST["corpo_cinza"]))

    # tabela-sumario
    linhas = [[Paragraph("<b>Sev.</b>", EST["celula"]),
               Paragraph("<b>ID</b>", EST["celula"]),
               Paragraph("<b>Arquivo:linha</b>", EST["celula"]),
               Paragraph("<b>Descrição</b>", EST["celula"])]]
    for a in D.ACHADOS:
        linhas.append([
            chip_severidade(a["sev"]),
            Paragraph(f"<b>{a['id']}</b>", EST["celula"]),
            Paragraph(esc(a["local"].split(" · ")[0]), EST["celula_mono"]),
            Paragraph(esc(a["titulo"]), EST["celula"]),
        ])
    t = Table(linhas, colWidths=[2.25 * cm, 0.95 * cm, 5.5 * cm, 6.3 * cm], repeatRows=1)
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (-1, 0), FUNDO),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINHA),
        ("BOX", (0, 0), (-1, -1), 0.5, LINHA),
        ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    hist.append(Spacer(1, 6))
    hist.append(t)
    hist.append(Spacer(1, 10))

    for chave, nome in D.CATEGORIAS.items():
        da_cat = [a for a in D.ACHADOS if a["cat"] == chave]
        if not da_cat:
            continue
        hist.append(PageBreak())
        hist.append(Paragraph(esc(nome), EST["h1"]))
        for a in da_cat:
            blocos = [
                Table([[chip_severidade(a["sev"]),
                        Paragraph(f"<b>{a['id']} — {esc(a['titulo'])}</b>", EST["h3"])]],
                      colWidths=[2.25 * cm, 12.75 * cm],
                      style=TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                                        ("LEFTPADDING", (0, 0), (0, 0), 0),
                                        ("BOTTOMPADDING", (0, 0), (-1, -1), 2)])),
                Paragraph(f'<font face="Courier" size="7.6" color="#4B5563">'
                          f'{esc(a["local"])}</font>', EST["celula"]),
                bloco_codigo(a["codigo"]),
                Paragraph(f"<b>Por que é explorável.</b> {esc(a['porque'])}", EST["corpo"]),
            ]
            if a.get("prova_ao_vivo"):
                blocos.append(Paragraph(
                    f"<b>Verificação.</b> {esc(a['prova_ao_vivo'])}", EST["corpo"]))
            blocos += [
                Paragraph(f"<b>Impacto.</b> {esc(a['impacto'])}", EST["corpo"]),
                Paragraph(f"<b>Condição de exploração.</b> {esc(a['condicao'])}", EST["corpo"]),
                Paragraph(f"<b>Correção sugerida.</b> {esc(a['correcao'])}", EST["corpo"]),
                Spacer(1, 10),
            ]
            hist.append(KeepTogether(blocos[:3]))
            hist.extend(blocos[3:])


def secao_nao_aplicavel(hist):
    hist.append(PageBreak())
    hist.append(Paragraph("Categorias que não se aplicam a esta stack", EST["h1"]))
    hist.append(Paragraph(
        "Registrado explicitamente para não forçar achados onde a categoria não existe.",
        EST["corpo_cinza"]))
    linhas = [[Paragraph(f"<b>{esc(t)}</b>", EST["celula"]), Paragraph(esc(v), EST["celula"])]
              for t, v in D.NAO_APLICAVEL]
    t = Table(linhas, colWidths=[4.4 * cm, 10.6 * cm])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINHA),
        ("BOX", (0, 0), (-1, -1), 0.5, LINHA),
        ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    hist.append(t)


def secao_recomendacoes(hist):
    hist.append(Paragraph("Recomendações priorizadas", EST["h1"]))
    linhas = [[Paragraph("<b>Prio.</b>", EST["celula"]),
               Paragraph("<b>Ação</b>", EST["celula"]),
               Paragraph("<b>Resolve</b>", EST["celula"])]]
    for pid, titulo, texto, ids in D.RECOMENDACOES:
        linhas.append([
            Paragraph(f'<font color="#111827"><b>{pid}</b></font>', EST["celula"]),
            Paragraph(f"<b>{esc(titulo)}</b><br/>"
                      f'<font size="8" color="#4B5563">{esc(texto)}</font>', EST["celula"]),
            Paragraph(", ".join(ids), EST["celula_mono"]),
        ])
    t = Table(linhas, colWidths=[1.3 * cm, 11.8 * cm, 1.9 * cm], repeatRows=1)
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (-1, 0), FUNDO),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINHA),
        ("BOX", (0, 0), (-1, -1), 0.5, LINHA),
        ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    hist.append(Spacer(1, 6))
    hist.append(t)


# --------------------------------------------------------------------------- issues
def texto_issue(n, titulo, labels, problema, evidencia, impacto, correcao, aceite):
    linhas = [
        f"--- ISSUE {n} ---",
        "",
        f"Titulo: [Seguranca] {titulo}",
        f"Labels: {labels}",
        "",
        "## Problema",
        "",
        problema,
        "",
        "## Evidencia",
        "",
        evidencia,
        "",
        "## Impacto",
        "",
        impacto,
        "",
        "## Sugestao de correcao",
        "",
        correcao,
        "",
        "## Criterios de aceite",
        "",
    ]
    linhas += [f"- [ ] {c}" for c in aceite]
    linhas += ["", f"--- FIM ISSUE {n} ---"]
    return "\n".join(linhas)


def montar_issues():
    """Achados triviais do mesmo tema entram numa issue so, para nao virar spam."""
    return [
        texto_issue(
            1,
            "habilitar autenticacao — API inteira esta com permitAll",
            "security, critica",
            "`SecurityConfig` libera todos os 20 endpoints com `anyRequest().permitAll()`, sem nenhuma\n"
            "regra de autorizacao. Qualquer requisicao de rede executa qualquer operacao, incluindo\n"
            "emitir, cancelar e excluir NF-e. E a causa-raiz de todo o resto: o isolamento por produtor\n"
            "existe no codigo, mas se apoia num principal que ninguem precisa provar.\n\n"
            "Verificado ao vivo: `GET /api/dashboard` sem nenhum header devolveu HTTP 200 com os dados\n"
            "financeiros completos do produtor.",
            "`backend/src/main/java/br/com/agrocontabil/config/SecurityConfig.java:46-51`\n\n"
            "```java\n"
            ".authorizeHttpRequests(\n"
            "    auth ->\n"
            "        auth\n"
            "            // TODO[Sprint 8 - Auth]: substituir por regras reais (.authenticated())\n"
            "            .anyRequest().permitAll());\n"
            "```",
            "Leitura, alteracao e exclusao de documentos fiscais de qualquer produtor por qualquer\n"
            "pessoa com acesso de rede. Em producao, e fraude fiscal viabilizada pela aplicacao.",
            "Trocar `permitAll()` por `.authenticated()`, com allowlist explicita apenas para\n"
            "`/actuator/health` e `/api/v1/health`. Plugar o filtro JWT (o `jjwt` ja esta no `pom.xml`)\n"
            "antes do `UsernamePasswordAuthenticationFilter`.",
            [
                "`SecurityConfig` usa `.authenticated()` como regra padrao",
                "Filtro JWT registrado antes do `UsernamePasswordAuthenticationFilter`",
                "Requisicao sem token a `/api/notas` responde 401",
                "Requisicao sem token a `/actuator/health` continua respondendo 200",
                "Teste de integracao cobrindo os dois casos acima",
            ]),

        texto_issue(
            2,
            "profile padrao e `dev`, que autentica sozinho qualquer requisicao",
            "security, critica",
            "Se `SPRING_PROFILES_ACTIVE` nao for definida, a aplicacao sobe em `dev` — e o `dev` registra\n"
            "o `MockProdutorFilter`, que injeta um `Produtor` autenticado em TODA requisicao sem pedir\n"
            "credencial. O `compose.yaml` ainda crava `dev` no servico do backend, entao subir com Docker\n"
            "Compose ativa a auto-autenticacao por padrao.\n\n"
            "Nao existe nenhuma validacao de startup que recuse o profile `dev` fora do ambiente local.",
            "`backend/src/main/resources/application.yml:7`\n\n"
            "```yaml\n"
            "    active: ${SPRING_PROFILES_ACTIVE:dev}\n"
            "```\n\n"
            "`backend/src/main/java/br/com/agrocontabil/config/MockProdutorFilter.java:35-41`\n\n"
            "```java\n"
            "if (SecurityContextHolder.getContext().getAuthentication() == null) {\n"
            "  Produtor produtor = getOrLoadMockProdutor();   // CPF fixo \"123.456.789-00\"\n"
            "  if (produtor != null) {\n"
            "    UsernamePasswordAuthenticationToken auth =\n"
            "        new UsernamePasswordAuthenticationToken(produtor, null, List.of());\n"
            "    SecurityContextHolder.getContext().setAuthentication(auth);\n"
            "  }\n"
            "}\n"
            "```\n\n"
            "`backend/compose.yaml:31`\n\n"
            "```yaml\n"
            "      SPRING_PROFILES_ACTIVE: dev\n"
            "```",
            "Um deploy que esqueca a variavel de ambiente entrega a base inteira de um produtor a\n"
            "qualquer visitante — sem nem o sintoma de uma tela de login quebrada.",
            "Inverter o default de `application.yml` para `prod`. Mover `SPRING_PROFILES_ACTIVE` do\n"
            "`compose.yaml` para o `.env`. Adicionar um `ApplicationRunner` que aborte o boot quando o\n"
            "profile `dev` estiver ativo com `DB_HOST` diferente de `localhost`/`postgres`.",
            [
                "`application.yml` usa `${SPRING_PROFILES_ACTIVE:prod}`",
                "`compose.yaml` le o profile do `.env` em vez de cravar `dev`",
                "Boot falha com mensagem clara ao ativar `dev` apontando para banco remoto",
                "`MockProdutorFilter` continua funcionando no desenvolvimento local",
            ]),

        texto_issue(
            3,
            "guias fiscais aceitam produtorId do cliente sem verificar o dono (leitura e escrita)",
            "security, alta",
            "Dois handlers de `/api/contador/guias` confiam no `produtorId` enviado pelo cliente sem\n"
            "confronta-lo com o produtor autenticado:\n\n"
            "1. `GET /api/contador/guias?produtorId=` — lista as guias de QUALQUER produtor (valor,\n"
            "   vencimento, tributo, se esta paga).\n"
            "2. `POST /api/contador/guias` — cria uma cobranca na conta de QUALQUER produtor, com valor\n"
            "   e vencimento arbitrarios.\n\n"
            "O contraste prova que e lapso pontual: `CalendarioFiscalService:51-54` faz exatamente a\n"
            "verificacao que falta aqui. Confirmado ao vivo: `GET /api/contador/guias?produtorId=<uuid\n"
            "arbitrario>` responde 200, enquanto `GET /api/calendario-fiscal/<mesmo uuid>/vencimentos`\n"
            "responde 404.",
            "`backend/.../service/GuiaFiscalService.java:75-80` (leitura sem dono)\n\n"
            "```java\n"
            "@Transactional(readOnly = true)\n"
            "public List<GuiaFiscalResponse> listar(UUID produtorId) {\n"
            "  return guiaFiscalRepository.findByProdutorIdOrderByDataVencimentoDesc(produtorId).stream()\n"
            "      .map(GuiaFiscalMapper::toResponse)\n"
            "      .toList();\n"
            "}\n"
            "```\n\n"
            "`backend/.../service/GuiaFiscalService.java:57-64` (escrita sem dono)\n\n"
            "```java\n"
            "public GuiaFiscalResponse criar(GuiaFiscalRequest request) {\n"
            "  Produtor produtor = produtorRepository.findById(request.produtorId())\n"
            "      .orElseThrow(() -> new ResourceNotFoundException(\"Produtor\", request.produtorId()));\n"
            "  GuiaFiscal guia = GuiaFiscalMapper.toEntity(request, produtor);\n"
            "  GuiaFiscal salva = guiaFiscalRepository.save(guia);\n"
            "  return GuiaFiscalMapper.toResponse(salva);\n"
            "}\n"
            "```\n\n"
            "Referencia da implementacao correta — `CalendarioFiscalService.java:51-54`:\n\n"
            "```java\n"
            "UUID autenticadoId = produtorProvider.get().getId();\n"
            "if (!autenticadoId.equals(produtorId)) {\n"
            "  throw new ResourceNotFoundException(\"Produtor\", produtorId);\n"
            "}\n"
            "```",
            "Vazamento da posicao fiscal de outros produtores (quanto devem, de que tributo, se estao\n"
            "inadimplentes) e injecao de cobrancas falsas na apuracao alheia.",
            "Aplicar em `listar` e `criar` a mesma verificacao de `CalendarioFiscalService:51-54`:\n"
            "comparar o `produtorId` recebido com `produtorProvider.get().getId()` e lancar\n"
            "`ResourceNotFoundException` (404) na divergencia. Quando o RBAC de contador existir,\n"
            "trocar pela autorizacao via vinculo contador-produtor.",
            [
                "`GuiaFiscalService.listar` valida o dono antes de consultar",
                "`GuiaFiscalService.criar` valida o dono antes de gravar",
                "`GET /api/contador/guias` com produtorId de terceiro responde 404",
                "`POST /api/contador/guias` com produtorId de terceiro responde 404",
                "Teste cobrindo leitura e escrita cruzadas entre dois produtores",
            ]),

        texto_issue(
            4,
            "papel de Contador so existe no navegador — servidor nao conhece papeis",
            "security, alta",
            "A experiencia do Contador e escondida por `@if (perfilService.ehContador())`, mas o valor vem\n"
            "do `localStorage`, escrito por um login sem senha. Basta\n"
            "`localStorage.setItem('agrocontabil.perfil','contador')` no console — ou navegar direto para\n"
            "`/contador`, que nao tem guarda de papel — para obter a interface inteira.\n\n"
            "No servidor nao existe conceito de papel: `SecurityConfig` nao tem nenhuma regra `hasRole` e\n"
            "a propria `GuiaFiscalService:23` registra que nao ha entidade de Contador.\n\n"
            "O impacto hoje e pequeno (o backend nao oferece nada exclusivo ao contador alem das guias,\n"
            "ja cobertas pela issue 3). O risco e de regressao: o proximo endpoint privilegiado vai\n"
            "parecer protegido pelo gate visual.",
            "`frontend/src/app/core/guards/perfil.guard.ts:9-13`\n\n"
            "```ts\n"
            "export const perfilGuard: CanActivateFn = () => {\n"
            "  const perfil = inject(PerfilService);\n"
            "  const router = inject(Router);\n"
            "  return perfil.logado() ? true : router.createUrlTree(['/login']);  // nao checa QUAL perfil\n"
            "};\n"
            "```\n\n"
            "`frontend/src/app/app.routes.ts:36-39` — rota sem guarda de papel\n\n"
            "```ts\n"
            "{\n"
            "  path: 'contador',\n"
            "  loadComponent: () => import('@pages/contador/contador').then((m) => m.ContadorPage),\n"
            "},\n"
            "```",
            "Hoje: acesso a uma interface que nao expoe dado privilegiado novo. Depois da Sprint 8: se um\n"
            "endpoint privilegiado nascer sob `/api/contador`, ele estara desprotegido com aparencia de\n"
            "protegido.",
            "Curto prazo: documentar na tela de login que a selecao de perfil e demonstrativa. Sprint 8:\n"
            "derivar o papel de uma claim do JWT, proteger `/api/contador/**` com `hasRole('CONTADOR')` no\n"
            "servidor e so entao manter o gate visual como conveniencia.",
            [
                "Tela de login declara que a selecao de perfil e demonstrativa",
                "Sprint 8: papel vem de claim do JWT, nao do localStorage",
                "`/api/contador/**` exige `hasRole('CONTADOR')` no servidor",
                "Teste de integracao: produtor autenticado recebe 403 em rota de contador",
            ]),

        texto_issue(
            5,
            "segredos com valor padrao embutido e sem validacao de startup",
            "security, media",
            "Tres segredos tem default embutido na configuracao, o padrao de valor publico que vira\n"
            "segredo real quando ninguem sobrescreve. O mais perigoso e o `JWT_SECRET` do profile de\n"
            "producao: aceita string vazia silenciosamente.\n\n"
            "Nao existe nenhuma validacao de inicializacao sobre essas propriedades — busca por\n"
            "`@PostConstruct`, `ApplicationRunner` e `@Validated` sobre elas nao retorna nada. Quando a\n"
            "Sprint 8 ligar o JWT, a aplicacao vai subir com segredo vazio e assinar tokens forjaveis sem\n"
            "emitir um unico aviso.\n\n"
            "Agrupa tres itens do mesmo tema para nao gerar tres issues quase identicas.",
            "`backend/src/main/resources/application-prod.yml:28`\n\n"
            "```yaml\n"
            "    jwt-secret: ${JWT_SECRET:}          # aceita vazio\n"
            "```\n\n"
            "`backend/src/main/resources/application-dev.yml:7,46`\n\n"
            "```yaml\n"
            "    password: ${DB_PASSWORD:agrocontabil}\n"
            "      password: ${NFE_CERT_PASSWORD:changeit}\n"
            "```",
            "Segredo de JWT vazio permite forjar token de qualquer produtor assim que a autenticacao for\n"
            "ligada. Senha de banco previsivel e publica facilita acesso direto ao PostgreSQL se a porta\n"
            "5432 estiver alcancavel.",
            "Remover o default de toda propriedade que seja segredo — `${JWT_SECRET}` sem dois-pontos faz\n"
            "o Spring falhar o boot, que e o comportamento desejado. Adicionar um `ApplicationRunner` que\n"
            "recuse iniciar no profile `prod` com `JWT_SECRET` vazio ou com menos de 32 caracteres.",
            [
                "`application-prod.yml` usa `${JWT_SECRET}` sem valor padrao",
                "`DB_PASSWORD` e `NFE_CERT_PASSWORD` sem valor padrao no profile de producao",
                "Boot em `prod` falha com mensagem clara quando `JWT_SECRET` esta vazio ou curto",
                "Teste cobrindo a falha de inicializacao",
            ]),

        texto_issue(
            6,
            "desabilitar Swagger UI no profile de producao",
            "security, baixa",
            "O springdoc e habilitado no profile base e nenhum dos dois profiles o desliga. Somado ao\n"
            "`permitAll` da issue 1, o contrato completo da API fica navegavel por qualquer um.\n\n"
            "Nao e falha em si — e reconhecimento facilitado. Encurta o caminho para explorar a issue 3,\n"
            "que depende de conhecer o formato do `produtorId`. Baixa prioridade: so passa a importar\n"
            "depois que a autenticacao existir e a API for exposta.",
            "`backend/src/main/resources/application.yml:93-95`\n\n"
            "```yaml\n"
            "springdoc:\n"
            "  swagger-ui:\n"
            "    path: /swagger-ui.html\n"
            "```",
            "Reconhecimento facilitado da superficie de ataque. Baixo isoladamente.",
            "Adicionar ao `application-prod.yml`:\n\n"
            "```yaml\n"
            "springdoc:\n"
            "  api-docs:\n"
            "    enabled: false\n"
            "  swagger-ui:\n"
            "    enabled: false\n"
            "```\n\n"
            "Ou manter habilitado e restringir a rota a usuarios autenticados no `SecurityConfig`.",
            [
                "`/swagger-ui.html` responde 404 ou 401 no profile `prod`",
                "`/api/docs` responde 404 ou 401 no profile `prod`",
                "Swagger continua disponivel no profile `dev`",
            ]),
    ]


def secao_issues(hist):
    hist.append(PageBreak())
    hist.append(Paragraph("Issues para o GitHub", EST["h1"]))
    hist.append(Paragraph(
        "Texto completo de cada issue, em Markdown, pronto para copiar e colar. Achados do mesmo tema "
        "foram agrupados para não virar spam: os três defaults de segredo saem numa issue só, e as "
        "duas rotas de guias fiscais (leitura e escrita) saem juntas por terem a mesma correção. "
        "O achado A8 não gera issue — foi verificado e não é vazamento.", EST["corpo_cinza"]))
    hist.append(Spacer(1, 6))

    issues = montar_issues()
    for i, bruto in enumerate(issues):
        # Uma linha do texto por LINHA da tabela: assim o bloco quebra entre paginas.
        # Um Table de 1 linha so estoura o frame nas issues longas (LayoutError).
        linhas = [[Paragraph(preservar_indent(l), EST["issue"])]
                  for l in bruto.split("\n")]
        t = Table(linhas, colWidths=[15.0 * cm])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
            ("BOX", (0, 0), (-1, -1), 0.6, LINHA),
            ("LEFTPADDING", (0, 0), (-1, -1), 9), ("RIGHTPADDING", (0, 0), (-1, -1), 9),
            ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ]))
        hist.append(t)
        # Sem espacador depois da ultima: ele empurrava uma pagina final em branco.
        if i < len(issues) - 1:
            hist.append(Spacer(1, 14))


# --------------------------------------------------------------------------- main
def main():
    hist = []
    secao_capa(hist)
    secao_resumo(hist)
    secao_fortes_fracos(hist)
    secao_achados(hist)
    secao_nao_aplicavel(hist)
    hist.append(PageBreak())
    secao_recomendacoes(hist)
    secao_issues(hist)

    construir_doc().build(hist)
    print(f"PDF gerado: {SAIDA}")
    print(f"Tamanho: {os.path.getsize(SAIDA) / 1024:.0f} kB")


if __name__ == "__main__":
    main()
