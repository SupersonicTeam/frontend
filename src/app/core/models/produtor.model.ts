export interface Produtor {
  id: string;
  nome: string;
  cpfCnpj: string;
  email?: string;
  telefone?: string;
  estado?: string;
  cidade?: string;
  regime: string;
  culturas: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContatoProdutor {
  nome: string;
  funcao: string;
  telefone: string;
  whatsapp: string;
  email: string;
}

export interface ProdutorContador {
  id: string;
  nome: string;
  cidade?: string;
  uf?: string;
  propriedade?: string;
  contatos: ContatoProdutor[];
}
