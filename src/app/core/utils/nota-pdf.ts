import type { NotaFiscal } from '@models/nota-fiscal.model';

/**
 * Gera um DANFE simplificado (PDF) da nota e dispara o download.
 *
 * O `jspdf` é importado dinamicamente para ficar no chunk lazy da feature
 * (fora do bundle inicial), seguindo o mesmo padrão do chart.js no dashboard.
 * É um documento de visualização — não tem valor fiscal.
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
    ['Número', nota.numero || '—'],
    ['Série', nota.serie || '—'],
    ['Tipo', nota.tipo === 'entrada' ? 'Entrada' : 'Saída'],
    ['Emissão', formatDate(nota.dataEmissao)],
    ['Natureza', nota.naturezaOperacao || '—'],
    ['CFOP', nota.cfop || '—'],
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

  // Emitente
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Emitente', M, y);
  line(5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Nome: ${nota.nomeEmitente || '—'}`, M, y);
  line(5);
  doc.text(`CPF/CNPJ: ${nota.cpfCnpjEmitente || '—'}`, M, y);
  line(5);
  if (nota.destino) {
    doc.text(`Destino: ${nota.destino}`, M, y);
    line(5);
  }
  sep();

  // Itens
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Itens', M, y);
  line(6);
  doc.setFontSize(8);
  // colunas: Descrição | NCM | Qtd | Un | Vlr Unit | Vlr Total
  const cols = { desc: M, ncm: 95, qtd: 120, un: 138, unit: 150, total: right };
  doc.text('Descrição', cols.desc, y);
  doc.text('NCM', cols.ncm, y);
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
    const desc = truncate(item.descricao, 48);
    doc.text(desc, cols.desc, y);
    doc.text(item.ncm || '—', cols.ncm, y);
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
  const totais: [string, number | undefined][] = [
    ['Produtos', nota.valorProdutos],
    ['Frete', nota.valorFrete],
    ['Seguro', nota.valorSeguro],
    ['Desconto', nota.valorDesconto],
  ];
  totais.forEach(([label, value]) => {
    if (value === undefined || value === null) return;
    doc.setFont('helvetica', 'normal');
    doc.text(label, M, y);
    doc.text(brl(value), right, y, { align: 'right' });
    line(5);
  });
  doc.setFont('helvetica', 'bold');
  doc.text('Total da nota', M, y);
  doc.text(brl(nota.valorTotal), right, y, { align: 'right' });
  line(6);

  // Impostos (só os > 0)
  const impostosFonte: [string, number | undefined][] = [
    ['CBS', nota.valorCbs],
    ['IBS', nota.valorIbs],
    ['FUNRURAL', nota.valorFunrural],
    ['ICMS', nota.valorIcms],
    ['IPI', nota.valorIpi],
  ];
  const impostos = impostosFonte.filter(([, v]) => (v ?? 0) > 0) as [string, number][];
  if (impostos.length) {
    sep();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Impostos', M, y);
    line(6);
    doc.setFontSize(9);
    impostos.forEach(([label, value]) => {
      doc.setFont('helvetica', 'normal');
      doc.text(label, M, y);
      doc.text(brl(value), right, y, { align: 'right' });
      line(5);
    });
  }

  // Observações
  if (nota.observacoes) {
    sep();
    pageBreak(20);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Observações', M, y);
    line(5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(doc.splitTextToSize(nota.observacoes, right - M), M, y);
  }

  doc.save(`nota-${nota.numero || nota.id}.pdf`);
}

function brl(v?: number): string {
  return (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso.split('T')[0] + 'T12:00:00').toLocaleDateString('pt-BR');
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
