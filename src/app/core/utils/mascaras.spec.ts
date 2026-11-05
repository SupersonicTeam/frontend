import {
  aplicarMascara,
  cpfCnpjValido,
  erroDoCpfCnpj,
  formatarCpfCnpj,
  mascaraCep,
  mascaraCpfCnpj,
  posicaoAposDigitos,
  soDigitos,
} from './mascaras';

describe('máscaras dos campos (#102)', () => {
  describe('mascaraCpfCnpj', () => {
    it('formata CPF e CNPJ conforme o tamanho — o número diz qual é', () => {
      expect(mascaraCpfCnpj('12345678909')).toBe('123.456.789-09');
      expect(mascaraCpfCnpj('12345678000190')).toBe('12.345.678/0001-90');
    });

    it('formata enquanto se digita, sem exigir o número completo', () => {
      expect(mascaraCpfCnpj('123')).toBe('123');
      expect(mascaraCpfCnpj('1234')).toBe('123.4');
      expect(mascaraCpfCnpj('1234567')).toBe('123.456.7');
    });

    it('ignora o que não é algarismo, venha de colagem ou de digitação', () => {
      expect(mascaraCpfCnpj('123.456.789-09')).toBe('123.456.789-09');
      expect(mascaraCpfCnpj('CPF: 123 456 789 09')).toBe('123.456.789-09');
    });

    it('para em 14 dígitos — digitar além disso não estica o campo', () => {
      expect(soDigitos(mascaraCpfCnpj('123456780001901234'))).toHaveLength(14);
    });
  });

  describe('mascaraCep', () => {
    it('formata o CEP que o placeholder promete', () => {
      expect(mascaraCep('78890000')).toBe('78890-000');
    });

    it('so poe o hifen quando ha o que separar', () => {
      expect(mascaraCep('78890')).toBe('78890');
      expect(mascaraCep('788901')).toBe('78890-1');
    });

    it('para em 8 digitos', () => {
      expect(mascaraCep('7889000099')).toBe('78890-000');
    });
  });

  /**
   * O cursor é ancorado em **quantos dígitos existem antes dele**, não na posição no texto: a
   * posição muda quando um ponto entra ou sai, a contagem de dígitos não.
   */
  describe('posicaoAposDigitos', () => {
    it('devolve o ponto logo depois do n-esimo algarismo', () => {
      expect(posicaoAposDigitos('12.734.567/8909', 3)).toBe(4); // 1,2,.,7 -> depois do 7
      expect(posicaoAposDigitos('123.456.789-09', 3)).toBe(3);
      expect(posicaoAposDigitos('78890-000', 5)).toBe(5);
    });

    it('no comeco do campo nao ha digito nenhum atras', () => {
      expect(posicaoAposDigitos('123.456', 0)).toBe(0);
    });

    it('pedindo mais digitos do que existem, para no fim', () => {
      expect(posicaoAposDigitos('123', 99)).toBe(3);
    });
  });

  /**
   * O defeito que a issue aponta, reproduzido como o navegador o entrega.
   *
   * Medido em 29/10 antes do conserto: com `123.456.789-09` e o cursor na posição 2, digitar um
   * `7` deixava o cursor na **posição 15** — o fim do campo. Quem percebe um dígito errado no meio
   * e vai corrigir perde o lugar a cada tecla.
   */
  describe('aplicarMascara mantem o cursor onde a pessoa estava', () => {
    /** O estado que o navegador entrega **depois** de inserir o caractere, antes de formatarmos. */
    function campoApósDigitar(valorBruto: string, cursor: number): HTMLInputElement {
      const campo = document.createElement('input');
      campo.value = valorBruto;
      document.body.appendChild(campo);
      campo.setSelectionRange(cursor, cursor);
      return campo;
    }

    it('digitar no meio do CPF nao joga o cursor para o fim', () => {
      // '123.456.789-09' com o cursor em 2, tecla '7' -> o navegador entrega isto:
      const campo = campoApósDigitar('1273.456.789-09', 3);

      const resultado = aplicarMascara({ target: campo } as unknown as Event, mascaraCpfCnpj);

      expect(resultado).toBe('12.734.567/8909');
      expect(campo.value).toBe('12.734.567/8909');
      // Logo depois do 7 recem-digitado — e nao 15, o fim.
      expect(campo.selectionStart).toBe(4);
    });

    it('digitar no meio do CEP tambem preserva o lugar', () => {
      // '78890-0' com o cursor em 2, tecla '4'.
      const campo = campoApósDigitar('7848890-0', 3);

      const resultado = aplicarMascara({ target: campo } as unknown as Event, mascaraCep);

      expect(resultado).toBe('78488-900');
      expect(campo.selectionStart).toBe(3);
    });

    it('digitando no fim, o cursor continua no fim', () => {
      const campo = campoApósDigitar('123456', 6);

      aplicarMascara({ target: campo } as unknown as Event, mascaraCpfCnpj);

      expect(campo.value).toBe('123.456');
      expect(campo.selectionStart).toBe(7);
    });
  });
});

/** Exibir e conferir o documento (#156). */
describe('documento: exibir e conferir', () => {
  it.each([
    ['34524970894', '345.249.708-94'],
    ['11222333000181', '11.222.333/0001-81'],
    ['345.249.708-94', '345.249.708-94'],
    ['12ABC34501DE35', '12ABC34501DE35'],
    ['123', '123'],
    [null, ''],
  ])('formatarCpfCnpj(%s) = %s', (entrada, saida) => {
    expect(formatarCpfCnpj(entrada)).toBe(saida);
  });

  it.each([
    ['529.982.247-25', true],
    ['52998224725', true],
    ['123.456.789-00', false],
    ['111.111.111-11', false],
    ['11.222.333/0001-81', true],
    ['11.222.333/0001-80', false],
    ['5299822472', false],
  ])('cpfCnpjValido(%s) = %s', (valor, esperado) => {
    expect(cpfCnpjValido(valor)).toBe(esperado);
  });

  it('erroDoCpfCnpj: vazio não é erro; tamanho e dígito têm frases diferentes', () => {
    expect(erroDoCpfCnpj('')).toBeNull();
    expect(erroDoCpfCnpj('529.982.247-25')).toBeNull();
    expect(erroDoCpfCnpj('123.456')).toBe('Digite um CPF (11 dígitos) ou um CNPJ (14 dígitos).');
    expect(erroDoCpfCnpj('123.456.789-00')).toBe('CPF/CNPJ inválido. Confira os dígitos.');
  });
});
