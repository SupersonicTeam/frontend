import type { NotaValidacaoResponse } from '@dtos/notas/sefaz.response';

/**
 * Tratamento das inconsistências fiscais que o backend devolve em
 * `GET /notas/{id}/validacoes`.
 *
 * Mora aqui, e não dentro de uma tela, porque o mesmo dado aparece em dois
 * lugares: no modal da nota e na gaveta do assistente. A regra de qual
 * inconsistência mostrar precisa ser a mesma nos dois.
 */

/**
 * Fica só com a checagem mais recente, sem repetir o mesmo `code`+`field`.
 *
 * O endpoint devolve o **histórico inteiro**: a nota 7 traz o mesmo
 * "Endereço do destinatário é obrigatório" duas vezes, de tentativas em
 * horários diferentes. Quem precisa corrigir quer saber o que impede a emissão
 * **agora** — ver a mesma frase repetida só confunde.
 */
export function apenasUltimaChecagem(
  lista: NotaValidacaoResponse[],
): NotaValidacaoResponse[] {
  if (lista.length === 0) return [];

  const maisRecente = lista.reduce((a, b) =>
    new Date(b.validadoEm).getTime() > new Date(a.validadoEm).getTime() ? b : a,
  );

  const vistos = new Set<string>();
  return lista
    .filter((v) => v.loteValidacao === maisRecente.loteValidacao)
    .filter((v) => {
      const chave = `${v.code}|${v.field ?? ''}`;
      if (vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    });
}

/**
 * Nome do campo em português.
 *
 * O backend devolve o caminho da propriedade (`destinatarioEndereco.municipio`),
 * que é o identificador certo para o código e o errado para o produtor ler. Os
 * nomes abaixo cobrem tudo o que o `FiscalRulesValidator` do backend emite; um
 * campo desconhecido cai no próprio identificador, que é melhor do que
 * esconder a informação.
 */
const ROTULOS: Record<string, string> = {
  dataEmissao: 'Data de emissão',
  naturezaOperacao: 'Natureza da operação',
  numero: 'Número da nota',
  serie: 'Série da nota',
  itens: 'Produtos da nota',
  // O validador aponta o item pelo indice (`itens[0].cClassTrib`); o rotulo vale para todos.
  'itens.cClassTrib': 'Classificação do IBS/CBS do item',

  destinatarioNome: 'Nome do destinatário',
  destinatarioCpfCnpj: 'CPF/CNPJ do destinatário',
  destinatarioEndereco: 'Endereço do destinatário',
  'destinatarioEndereco.logradouro': 'Rua do destinatário',
  'destinatarioEndereco.municipio': 'Município do destinatário',
  'destinatarioEndereco.uf': 'Estado do destinatário',
  'destinatarioEndereco.codigoMunicipioIbge': 'Código IBGE do município do destinatário',

  produtor: 'Seu cadastro de produtor',
  'produtor.cpfCnpj': 'Seu CPF/CNPJ',
  'produtor.endereco': 'Seu endereço',
  'produtor.estado': 'Seu estado',
  'produtor.inscricaoEstadual': 'Sua inscrição estadual',
};

export function rotuloDoCampo(field?: string | null): string {
  if (!field) return 'Dados da nota';
  // `itens[0].ncm` -> `itens.ncm`, para casar com o mapa sem repetir por indice.
  const semIndice = field.replace(/\[\d+\]/g, '');
  return ROTULOS[semIndice] ?? ROTULOS[semIndice.split('.')[0]] ?? semIndice;
}

/**
 * A pendência é no cadastro do produtor, e não na nota?
 *
 * Importa porque muda o que dá para fazer: inconsistência na nota se resolve
 * editando a nota; inconsistência em `produtor.*` (inscrição estadual,
 * endereço) está no cadastro, que **o app ainda não permite editar** — a tela
 * de Configurações só finge salvar. Oferecer "Corrigir" nesse caso levaria a
 * pessoa a um beco.
 */
export function ehCampoDoProdutor(field?: string | null): boolean {
  return !!field && field.startsWith('produtor');
}
