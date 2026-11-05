import { criarCampoCpfCnpj } from './campo-cpf-cnpj';
import { ERRO_CPF_CNPJ_INVALIDO } from './mascaras';

/** O campo de CPF/CNPJ dos cadastros e da NF-e (#156). */
describe('criarCampoCpfCnpj', () => {
  it('não julga enquanto a pessoa digita', () => {
    const campo = criarCampoCpfCnpj();
    campo.valor.set('123.456');

    expect(campo.erro()).toBeNull();
  });

  it('sair do campo com algo escrito passa a julgar', () => {
    const campo = criarCampoCpfCnpj();
    campo.valor.set('123.456.789-00');
    campo.sair();

    expect(campo.erro()).toBe(ERRO_CPF_CNPJ_INVALIDO);
  });

  it('sair do campo vazio não conta como tocado', () => {
    const campo = criarCampoCpfCnpj();
    campo.sair();
    campo.valor.set('1');

    expect(campo.tocado()).toBe(false);
    expect(campo.erro()).toBeNull();
  });

  it('conferir julga na hora, diz se pode seguir e limpa a frase do servidor', () => {
    const campo = criarCampoCpfCnpj();
    campo.valor.set('529.982.247-25');
    campo.recusadoPeloServidor();
    expect(campo.erro()).toBe(ERRO_CPF_CNPJ_INVALIDO);

    expect(campo.conferir()).toBe(true);
    expect(campo.erro()).toBeNull();

    campo.valor.set('529');
    expect(campo.conferir()).toBe(false);
  });

  it('reiniciar volta ao estado de formulário novo', () => {
    const campo = criarCampoCpfCnpj();
    campo.valor.set('123');
    campo.sair();
    campo.recusadoPeloServidor();

    campo.reiniciar('529.982.247-25');

    expect(campo.valor()).toBe('529.982.247-25');
    expect(campo.tocado()).toBe(false);
    expect(campo.erro()).toBeNull();
  });
});
