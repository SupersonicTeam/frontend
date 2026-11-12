/**
 * O conteúdo da landing (#174) que o template desenha em lista: os planos e as perguntas.
 *
 * Vem da prévia estática da especificação (`rascunhos/previa-landing/`). Os **preços** ficaram de
 * fora de propósito: são proposta e dependem do Murillo. Enquanto isso, cada plano mostra "Valor de
 * lançamento em definição" e o botão é um "Tenho interesse", por e-mail.
 */

export const EMAIL_CONTATO = 'contato@gwnext.com.br';

export type PublicoLanding = 'produtor' | 'escritorio';

export interface PlanoLanding {
  nome: string;
  para: string;
  itens: readonly string[];
  indicado?: boolean;
  /** O plano grande do escritório: a conversa é outra ("Falar sobre"). */
  rede?: boolean;
}

export const PLANOS_PRODUTOR: readonly PlanoLanding[] = [
  {
    nome: 'Essencial',
    para: 'Para quem emite poucas notas por mês',
    itens: [
      'Nota com IBS e CBS e avisos antes de emitir',
      'Revisão pelo escritório',
      'Notas de compra, créditos estimados, apuração e painel',
      '150 créditos da Ceres por semana (uso leve)',
    ],
  },
  {
    nome: 'Profissional',
    para: 'Para quem precisa prestar contas da conformidade',
    indicado: true,
    itens: [
      'Tudo do Essencial, mais:',
      'Relatório de conformidade em PDF',
      '500 créditos da Ceres por semana (uso moderado)',
    ],
  },
  {
    nome: 'Safra',
    para: 'Para a operação grande, com muitas perguntas',
    itens: ['Tudo do Profissional, mais:', '1.500 créditos da Ceres por semana (uso intenso)'],
  },
];

export const PLANOS_ESCRITORIO: readonly PlanoLanding[] = [
  {
    nome: 'Essencial',
    para: 'Para o escritório pequeno',
    itens: [
      'Até 3 membros da equipe',
      'Até 20 clientes ativos na carteira',
      'Carteira por urgência, fila de revisão e pedidos de documento',
      'Catálogo de obrigações e números de cada cliente',
    ],
  },
  {
    nome: 'Equipe',
    para: 'Para a equipe que divide a carteira',
    indicado: true,
    itens: ['Tudo do Essencial, mais:', 'Até 10 membros da equipe', 'Até 75 clientes ativos'],
  },
  {
    nome: 'Rede',
    para: 'Para o escritório com mais de uma unidade',
    rede: true,
    itens: ['Tudo do Equipe, mais:', 'Até 25 membros da equipe', 'Até 200 clientes ativos'],
  },
];

/** O texto do botão do plano. */
export function rotuloDoPlano(plano: PlanoLanding): string {
  return plano.rede ? 'Falar sobre o plano Rede' : `Tenho interesse no plano ${plano.nome}`;
}

/** O `mailto:` do botão do plano, com o assunto já escrito. */
export function mailtoDoPlano(plano: PlanoLanding, publico: PublicoLanding): string {
  const sufixo = publico === 'escritorio' ? ' para escritório' : '';
  const assunto = `Interesse no plano ${plano.nome} - AgroConIA${sufixo}`;
  return `mailto:${EMAIL_CONTATO}?subject=${encodeURIComponent(assunto)}`;
}

export interface PerguntaLanding {
  pergunta: string;
  resposta: string;
}

export const PERGUNTAS: readonly PerguntaLanding[] = [
  {
    pergunta: 'Para quem é a AgroConIA?',
    resposta:
      'Para o produtor rural no regime regular do IBS e da CBS (receita acima de R$ 3,6 milhões por ano ou optante), pessoa física ou jurídica de regime normal, e para o escritório de contabilidade que o atende.',
  },
  {
    pergunta: 'Minha receita é menor que R$ 3,6 milhões por ano. Serve para mim?',
    resposta:
      'Abaixo do limite, o produtor não é contribuinte do IBS e da CBS, salvo se optar (LC 214/2025, arts. 164 e 165). Hoje o cálculo da AgroConIA vale para o regime regular. Converse com o seu contador sobre a opção.',
  },
  {
    pergunta: 'Quanto custa?',
    resposta: `Os valores de lançamento ainda estão em definição. A seção Planos mostra o que cada plano inclui. A contratação não está aberta; para ser avisado, escreva para ${EMAIL_CONTATO}.`,
  },
  {
    pergunta: 'O meu contador precisa ter um plano?',
    resposta:
      'O vínculo e os pedidos de documento funcionam no plano Grátis do produtor. Para a nota passar pela revisão, o produtor precisa de um plano a partir do Essencial, e o escritório, de um plano de escritório.',
  },
  {
    pergunta: 'O que são os créditos da Ceres?',
    resposta:
      'É o saldo semanal da Ceres, para os planos do produtor. Renova toda segunda-feira e não acumula, e as três perguntas prontas da tela não gastam créditos.',
  },
  {
    pergunta: 'Já posso emitir NF-e com valor fiscal?',
    resposta:
      'Ainda não. A AgroConIA gera o XML no layout oficial, mas a transmissão à SEFAZ ainda não foi homologada. Na demonstração, a assinatura usa um certificado de teste, a autorização é simulada e as notas não têm valor fiscal.',
  },
  {
    pergunta: 'A AgroConIA calcula ICMS e Funrural?',
    resposta:
      'O foco é o IBS e a CBS. A nota sai com o grupo de ICMS que o seu contador definir, e o ICMS segue por guia. O Funrural retido pelo comprador aparece destacado na nota, com o percentual a confirmar com o seu contador, e o recolhimento é por guia.',
  },
  {
    pergunta: 'Atende Simples Nacional e MEI?',
    resposta:
      'Não. A AgroConIA atende o produtor pessoa física e a pessoa jurídica de regime normal.',
  },
  {
    pergunta: 'Como o meu contador acessa os meus dados?',
    resposta:
      'O escritório envia um convite, que aparece na sua conta. O vínculo só existe depois que você aceita, e você pode encerrá-lo quando quiser.',
  },
  {
    pergunta: 'A redução de 60% vale para o meu produto?',
    resposta:
      'A AgroConIA aplica a redução da tabela oficial pelo código do produto. Na dúvida sobre o enquadramento, a Ceres mostra a condição da lei, e a decisão é do seu contador.',
  },
  {
    pergunta: 'A Ceres substitui o contador?',
    resposta:
      'Não. Ela tira dúvidas sobre os seus dados e sobre a lei, sempre citando a fonte. Para decidir, conte com o seu contador.',
  },
  {
    pergunta: 'O que acontece com as minhas perguntas à Ceres?',
    resposta:
      'CPF, CNPJ, e-mail, telefone e CEP nos formatos usuais são mascarados antes de chegar ao modelo, que na versão atual roda no servidor da AgroConIA. Evite escrever dados pessoais na pergunta. O histórico de uso guarda só metadados.',
  },
  {
    pergunta: 'Como excluo a minha conta?',
    resposta:
      'Na sua conta, com a senha atual. Os dados pessoais são anonimizados, e os documentos fiscais seguem guardados pelo prazo legal de 5 anos.',
  },
];
