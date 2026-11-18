/**
 * Os dados da empresa que aparecem na landing (#174), **provisórios**, passados pelo Murillo em
 * 09/11 no comentário da issue. Ficam numa constante só para a troca ser de uma linha.
 *
 * O CNPJ é um marcador de propósito: nunca um número inventado com dígito verificador válido, que
 * pode ser de outra empresa. O CNPJ real é condição para publicar a oferta (Decreto 7.962/2013,
 * art. 2º, I) e segue na lista de bloqueios.
 */
export const DADOS_EMPRESA = {
  razaoSocial: 'GWNext Technologies LTDA',
  cnpj: '00.000.000/0000-00',
  cnpjProvisorio: true,
  endereco: 'Rua Luiz Lorenzoni, 2924 - Mercedes/PR',
  /** Contato e encarregado de dados: o mesmo do backend (`app.lgpd.contato-encarregado`). */
  contato: 'contato@gwnext.com.br',
} as const;
