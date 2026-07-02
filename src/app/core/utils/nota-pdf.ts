import type { NotaFiscal } from '@models/nota-fiscal.model';

/**
 * Gera um DANFE simplificado (PDF) da nota e dispara o download.
 *
 * O `jspdf` é importado dinamicamente para ficar no chunk lazy da feature
 * (fora do bundle inicial), seguindo o mesmo padrão do chart.js no dashboard.
 * É um documento de visualização — não tem valor fiscal. O DANFE oficial vem do
 * backend (`GET /api/notas/{id}/pdf`, JasperReports) após a geração do XML (#12).
 */
export async function gerarNotaPdf(nota: NotaFiscal): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const M = 15; // margem
  const W = 210; // largura A4
  const right = W - M;
  let y = M;

  const line = (gap = 6) => (y += gap);
  const sep = () => {
    doc.setDrawColor(210);
    doc.line(M, y, right, y);
    line(5);
  };
  const pageBreak = (need = 10) => {
    if (y + need > 282) {
      doc.addPage();
      y = M;
    }
  };

  // Cabeçalho
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('DANFE — Documento Auxiliar (simplificado)', M, y);
  line(5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text('Documento sem valor fiscal — gerado para visualização.', M, y);
  doc.setTextColor(30);
  line(7);
  sep();

  // Identificação
  doc.setFontSize(9);
  const idLines: [string, string][] = [
    ['Número', nota.numero != null ? String(nota.numero) : '—'],
    ['Série', nota.serie != null ? String(nota.serie) : '—'],
    ['Documento', nota.tipoDocumento === 'NFA' ? 'NFA (avulsa)' : 'NF-e (modelo 55)'],
    ['Emissão', formatDate(nota.dataEmissao)],
    ['Natureza', nota.naturezaOperacao || '—'],
  ];
  idLines.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}:`, M, y);
    doc.setFont('helvetica', 'normal');
    doc.text(value, M + 28, y);
    line(5);
  });

  // Chave de acesso
  doc.setFont('helvetica', 'bold');
  doc.text('Chave de acesso:', M, y);
  doc.setFont('helvetica', 'normal');
  doc.text(nota.chaveAcesso || '—', M + 28, y);
  line(6);
  sep();

  // Destinatário
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Destinatário', M, y);
  line(5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Nome: ${nota.destinatarioNome || '—'}`, M, y);
  line(5);
  doc.text(`CPF/CNPJ: ${formatCpfCnpj(nota.destinatarioCpfCnpj)}`, M, y);
  line(5);
  const end = nota.destinatarioEndereco;
  if (end && (end.municipio || end.uf)) {
    doc.text(`Município: ${[end.municipio, end.uf].filter(Boolean).join(' / ') || '—'}`, M, y);
    line(5);
  }
  sep();

  // Itens
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Itens', M, y);
  line(6);
  doc.setFontSize(8);
  // colunas: Descrição | NCM | CFOP | Qtd | Un | Vlr Unit | Vlr Total
  const cols = { desc: M, ncm: 88, cfop: 108, qtd: 124, un: 138, unit: 152, total: right };
  doc.text('Descrição', cols.desc, y);
  doc.text('NCM', cols.ncm, y);
  doc.text('CFOP', cols.cfop, y);
  doc.text('Qtd', cols.qtd, y, { align: 'right' });
  doc.text('Un', cols.un, y);
  doc.text('Vlr Unit', cols.unit, y, { align: 'right' });
  doc.text('Vlr Total', cols.total, y, { align: 'right' });
  line(2);
  doc.setDrawColor(210);
  doc.line(M, y, right, y);
  line(4);
  doc.setFont('helvetica', 'normal');
  for (const item of nota.itens ?? []) {
    pageBreak();
    doc.text(truncate(item.descricao, 40), cols.desc, y);
    doc.text(item.ncm || '—', cols.ncm, y);
    doc.text(item.cfop || '—', cols.cfop, y);
    doc.text(String(item.quantidade ?? 0), cols.qtd, y, { align: 'right' });
    doc.text(item.unidade || '—', cols.un, y);
    doc.text(brl(item.valorUnitario), cols.unit, y, { align: 'right' });
    doc.text(brl(item.valorTotal), cols.total, y, { align: 'right' });
    line(5);
  }
  if (!nota.itens?.length) {
    doc.setTextColor(120);
    doc.text('Sem itens.', M, y);
    doc.setTextColor(30);
    line(5);
  }
  line(1);
  sep();

  // Totais
  pageBreak(40);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Totais', M, y);
  line(6);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Produtos', M, y);
  doc.text(brl(nota.valorTotalProdutos), right, y, { align: 'right' });
  line(5);
  doc.setFont('helvetica', 'bold');
  doc.text('Total da nota', M, y);
  doc.text(brl(nota.valorTotalNota), right, y, { align: 'right' });
  line(6);

  // Impostos IBS/CBS (informativos em 2026, só os > 0)
  const impostosFonte: [string, number | null | undefined][] = [
    ['CBS', nota.valorTotalCbs],
    ['IBS', nota.valorTotalIbs],
  ];
  const impostos = impostosFonte.filter(([, v]) => (v ?? 0) > 0) as [string, number][];
  if (impostos.length) {
    sep();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Impostos (informativos — reforma 2026)', M, y);
    line(6);
    doc.setFontSize(9);
    impostos.forEach(([label, value]) => {
      doc.setFont('helvetica', 'normal');
      doc.text(label, M, y);
      doc.text(brl(value), right, y, { align: 'right' });
      line(5);
    });
  }

  doc.save(`nota-${nota.numero ?? nota.id}.pdf`);
}

function brl(v?: number | null): string {
  return (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso.split('T')[0] + 'T12:00:00').toLocaleDateString('pt-BR');
}

function formatCpfCnpj(doc?: string): string {
  const n = (doc ?? '').replace(/\D/g, '');
  if (n.length === 11) return n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (n.length === 14) return n.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return doc || '—';
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
