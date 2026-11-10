import {
  FUNCOES_CERES,
  descreverFonte,
  origemDaFonte,
  paragrafosDoTexto,
  rotuloFonte,
  rotuloRota,
} from './ceres';

describe('ceres — rótulos das consultas', () => {
  /**
   * A tela mostrava `consultarTratamentoProduto` e `resumoDoProdutor` com o nome técnico:
   * o `ROTULO_FONTE` conhecia 5 das 13 funções (#132). Este teste reprova a função que
   * ficar sem rótulo em português.
   */
  it.each(FUNCOES_CERES)('%s tem rótulo em português', (funcao) => {
    const rotulo = rotuloFonte(funcao);
    expect(rotulo).not.toBe(funcao);
    expect(rotulo.trim().length).toBeGreaterThan(0);
  });

  it('função que o contrato não documenta aparece com o nome cru, sem rótulo inventado', () => {
    expect(rotuloFonte('consultarAlgoNovo')).toBe('consultarAlgoNovo');
  });

  it('nome que coincide com o Object.prototype também cai no nome cru', () => {
    expect(rotuloFonte('constructor')).toBe('constructor');
    expect(descreverFonte({ funcao: 'constructor', parametros: { toString: 'x' } })).toBe(
      'toString: x',
    );
  });

  it('traduz os parâmetros novos: produto e número da nota', () => {
    expect(
      descreverFonte({
        funcao: 'consultarTratamentoProduto',
        parametros: { produtoOuNcm: 'feijao' },
      }),
    ).toBe('produto: feijao');
    expect(descreverFonte({ funcao: 'consultarNota', parametros: { numero: '3224' } })).toBe(
      'número da nota: 3224',
    );
  });

  it('descricaoOuNcm é insumo nas compras e produto nas vendas', () => {
    expect(
      descreverFonte({
        funcao: 'totalComprasPorInsumo',
        parametros: { descricaoOuNcm: 'calcario' },
      }),
    ).toBe('insumo: calcario');
    expect(
      descreverFonte({ funcao: 'totalVendasPorProduto', parametros: { descricaoOuNcm: 'soja' } }),
    ).toBe('produto: soja');
  });
});

describe('ceres — origem do dado (backend#342)', () => {
  const tabela = {
    funcao: 'consultarTratamentoProduto',
    parametros: { produtoOuNcm: 'feijao' },
    origem: 'TABELA_OFICIAL',
  };
  const resumo = { funcao: 'resumoDoProdutor', parametros: {}, origem: 'PRODUTOR' };

  it('quem decide é a origem que o servidor manda, não o nome da função', () => {
    expect(origemDaFonte(tabela)).toBe('oficial');
    expect(origemDaFonte(resumo)).toBe('produtor');
    // Uma função nova do backend sai com o selo certo sem deploy do Angular.
    expect(origemDaFonte({ funcao: 'funcaoNova', parametros: {}, origem: 'TABELA_OFICIAL' })).toBe(
      'oficial',
    );
  });

  it('origem desconhecida ou ausente é neutra, nunca "das suas notas"', () => {
    const estranha = { funcao: 'listarNotas', parametros: {}, origem: 'OUTRA_COISA' };
    const semOrigem = { funcao: 'listarNotas', parametros: {} };
    expect(origemDaFonte(estranha)).toBe('neutra');
    expect(origemDaFonte(semOrigem)).toBe('neutra');
    expect(rotuloRota('DADOS', [estranha])).toBe('do AgroConIA');
    expect(rotuloRota('DADOS', [tabela, semOrigem])).toBe('do AgroConIA');
  });

  it('DADOS só com a tabela oficial não é resposta "das suas notas"', () => {
    expect(rotuloRota('DADOS', [tabela])).toBe('da tabela oficial');
    expect(rotuloRota('MISTO', [tabela])).toBe('da tabela oficial e da legislação');
  });

  it('com dado do produtor no meio, o selo continua sendo das notas', () => {
    expect(rotuloRota('DADOS', [tabela, resumo])).toBe('das suas notas');
    expect(rotuloRota('DADOS', [resumo])).toBe('das suas notas');
    expect(rotuloRota('MISTO', [resumo])).toBe('das suas notas e da legislação');
  });

  /**
   * Fallback de dados, dado não identificado ou resposta descartada: nada foi consultado.
   * Era assim que "O que eu preciso saber?" sem o modelo aparecia como "resposta das suas
   * notas" logo acima de "Nao consegui consultar os seus dados agora".
   */
  it('sem fonte nenhuma, não afirma que a resposta veio das notas', () => {
    expect(rotuloRota('DADOS', [])).toBeNull();
    expect(rotuloRota('MISTO', [])).toBe('da legislação');
  });

  it('legislação e fora de escopo não mudam', () => {
    expect(rotuloRota('LEGISLACAO', [tabela])).toBe('da legislação');
    expect(rotuloRota('FORA_DE_ESCOPO', [])).toBeNull();
  });
});

describe('ceres — texto da resposta em parágrafos e listas', () => {
  /** O exemplo da issue #132, resumido: o seed da banca respondendo "o que eu preciso saber?". */
  const resumo = [
    'Encontrei 3 pontos de atencao: 1 guia em atraso, 2 notas paradas e 1 pedido do escritorio.',
    '',
    'Voce tem 1 guia em atraso, somando R$ 2.300,67:',
    '- FUNRURAL (contribuicao previdenciaria do produtor rural), venceu em 20/10/2026: R$ 2.300,67.',
    '',
    '2 notas estao paradas:',
    '- Nota 3224 (serie 1), de 01/11/2026: aguardando aprovacao do contador.',
    '- Nota 3222 (serie 1), de 30/10/2026: devolvida pelo contador.',
    'E mais 1, na tela de notas.',
  ].join('\n');

  it('um parágrafo por assunto, separado por linha em branco', () => {
    const paragrafos = paragrafosDoTexto(resumo);
    expect(paragrafos).toHaveLength(3);
    expect(paragrafos[0]).toEqual([
      {
        tipo: 'texto',
        texto:
          'Encontrei 3 pontos de atencao: 1 guia em atraso, 2 notas paradas e 1 pedido do escritorio.',
      },
    ]);
  });

  it('linhas "- " viram itens de lista, sem o traço', () => {
    const [, , notas] = paragrafosDoTexto(resumo);
    expect(notas).toEqual([
      { tipo: 'texto', texto: '2 notas estao paradas:' },
      {
        tipo: 'lista',
        itens: [
          'Nota 3224 (serie 1), de 01/11/2026: aguardando aprovacao do contador.',
          'Nota 3222 (serie 1), de 30/10/2026: devolvida pelo contador.',
        ],
      },
      { tipo: 'texto', texto: 'E mais 1, na tela de notas.' },
    ]);
  });

  it('texto sem parágrafos nem lista passa como veio, com as quebras simples', () => {
    expect(paragrafosDoTexto('linha um\nlinha dois')).toEqual([
      [{ tipo: 'texto', texto: 'linha um\nlinha dois' }],
    ]);
  });

  it('tolera \\r\\n e linhas em branco a mais', () => {
    expect(paragrafosDoTexto('a\r\n\r\n\r\n- b\r\n')).toEqual([
      [{ tipo: 'texto', texto: 'a' }],
      [{ tipo: 'lista', itens: ['b'] }],
    ]);
  });

  it('texto vazio não gera parágrafo', () => {
    expect(paragrafosDoTexto('')).toEqual([]);
  });

  it('traço sem espaço não é item de lista', () => {
    expect(paragrafosDoTexto('-5% de redução')).toEqual([
      [{ tipo: 'texto', texto: '-5% de redução' }],
    ]);
  });
});
