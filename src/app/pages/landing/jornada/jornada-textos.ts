/**
 * O texto de cada etapa da jornada do milho (#174), fora da imagem.
 *
 * Fica em HTML, e não dentro do quadro, por três razões: o leitor de tela lê, o tema e o tamanho
 * da fonte valem como no resto da página, e trocar uma frase não exige renderizar 60 quadros de
 * novo. Dentro da imagem só aparece a marca.
 *
 * **Os textos são proposta, para o Murillo aprovar** — como todo o texto da landing (N9). Eles
 * seguem a regra de veracidade da especificação (item 2.3): só citam o que o produto faz hoje.
 *
 * A chave é o `id` da etapa no manifesto, **sem o sufixo do tema** (`marca-claro` e `marca-escuro`
 * são a mesma etapa). Etapa nova no pacote sem texto aqui aparece com o título do manifesto e sem
 * frase — melhor que inventar uma.
 */
export interface TextoDaEtapa {
  titulo: string;
  frase: string;
}

const TEXTOS: Record<string, TextoDaEtapa> = {
  nome: {
    titulo: 'Do campo à nota',
    frase: 'A jornada do milho, do plantio à nota fiscal eletrônica.',
  },
  plantio: {
    titulo: 'Plantio',
    frase: 'A safra começa com semente, adubo e diesel: as compras que entram na sua apuração.',
  },
  crescimento: {
    titulo: 'A lavoura cresce',
    frase: 'Enquanto o milho cresce, os prazos do mês seguem no seu calendário.',
  },
  colheita: {
    titulo: 'Colheita',
    frase: 'Colhido o grão, chega a hora de vender, e de emitir a nota.',
  },
  transporte: {
    titulo: 'Transporte',
    frase: 'A carga segue para o armazém com a nota fiscal acompanhando.',
  },
  armazem: {
    titulo: 'Chegada ao armazém',
    frase: 'Na balança, o peso da carga vira a quantidade que vai na nota.',
  },
  nota: {
    titulo: 'A nota fiscal',
    frase:
      'A AgroConIA calcula o IBS e a CBS de cada produto e avisa o que conferir antes de emitir.',
  },
  fechamento: {
    titulo: 'Fechamento do mês',
    frase: 'No fim do mês, as notas viram a apuração que o seu escritório confere.',
  },
  marca: {
    titulo: 'AgroConIA',
    frase: 'A reforma tributária do agro, nota por nota.',
  },
};

/** O texto de uma etapa pelo `id` do manifesto. O sufixo do tema (`-claro`, `-escuro`) não conta. */
export function textoDaEtapa(id: string, tituloDoManifesto: string): TextoDaEtapa {
  const chave = id.replace(/-(claro|escuro)$/, '');
  return TEXTOS[chave] ?? { titulo: tituloDoManifesto, frase: '' };
}

/** O que o `aria-label` do canvas diz: a jornada inteira, numa frase. */
export const DESCRICAO_DA_JORNADA =
  'Ilustração: a jornada do milho, do plantio e da colheita ao transporte, à chegada ao armazém ' +
  'e à emissão da nota fiscal.';
