/**
 * Máscaras dos campos que guardam valor formatado (issue #102).
 *
 * O formulário da nota já mascarava o CPF/CNPJ, mas com dois problemas medidos no navegador em
 * 29/10, e o CEP não mascarava nada apesar de prometer `78890-000` no placeholder.
 *
 * **O cursor ia para o fim a cada tecla.** Com `123.456.789-09` e o cursor na posição 2, digitar
 * um `7` levava o cursor para a **posição 15** — o fim do campo. Quem percebe um dígito errado no
 * meio e vai corrigir perde o lugar e precisa reposicionar o cursor a cada tecla.
 *
 * A causa é inevitável em máscara: para formatar, é preciso reescrever `input.value`, e isso
 * zera a seleção. O conserto não é evitar a reescrita, é **recolocar o cursor onde ele estava em
 * termos do que a pessoa digitou** — e a unidade disso não é a posição no texto, que muda quando
 * um ponto entra ou sai, e sim **quantos dígitos existiam antes do cursor**. Esse número não muda
 * com a pontuação, então é a âncora estável.
 */

/** Só os algarismos. A máscara é sempre derivada deles, nunca do texto já pontuado. */
export function soDigitos(valor: string): string {
  return valor.replace(/\D/g, '');
}

/**
 * CPF (11 dígitos) ou CNPJ (14), escolhido pelo tamanho.
 *
 * O campo é um só porque o produtor vende para pessoa física e jurídica, e exigir que ele diga
 * antes qual é seria perguntar algo que o próprio número responde.
 */
export function mascaraCpfCnpj(valor: string): string {
  const d = soDigitos(valor).slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  return d
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

/**
 * CPF/CNPJ para **exibir** (#156). A carteira devolve o documento só com dígitos, e a tela
 * mostrava "34524970894". O que não for um CPF ou CNPJ numérico completo (vazio, o CNPJ
 * alfanumérico da RFB) sai como veio, em vez de virar uma máscara errada.
 */
export function formatarCpfCnpj(valor: string | null | undefined): string {
  if (!valor) return '';
  const d = soDigitos(valor);
  const numerico = /^[\d.\-/\s]+$/.test(valor);
  return numerico && (d.length === 11 || d.length === 14) ? mascaraCpfCnpj(d) : valor;
}

/** Os dígitos verificadores de um CPF (11 dígitos). */
export function cpfValido(cpf: string): boolean {
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const dv = (base: string, pesoInicial: number): number => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesoInicial - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const d1 = dv(cpf.slice(0, 9), 10);
  const d2 = dv(cpf.slice(0, 10), 11);
  return d1 === Number(cpf[9]) && d2 === Number(cpf[10]);
}

/** Os dígitos verificadores de um CNPJ (14 dígitos). */
export function cnpjValido(cnpj: string): boolean {
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const dv = (base: string): number => {
    const pesos =
      base.length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesos[i] as number);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = dv(cnpj.slice(0, 12));
  const d2 = dv(cnpj.slice(0, 13));
  return d1 === Number(cnpj[12]) && d2 === Number(cnpj[13]);
}

/** CPF/CNPJ válido por tamanho **e** dígitos verificadores (espelha o `@ValidCpfCnpj` do backend). */
export function cpfCnpjValido(valor: string): boolean {
  const d = soDigitos(valor);
  if (d.length === 11) return cpfValido(d);
  if (d.length === 14) return cnpjValido(d);
  return false;
}

/** A frase do documento com dígito verificador errado, a mesma em todas as telas (#156). */
export const ERRO_CPF_CNPJ_INVALIDO = 'CPF/CNPJ inválido. Confira os dígitos.';

/**
 * O que dizer de um CPF/CNPJ digitado, ou `null` se ele está bom (#156).
 *
 * Vazio também é `null`: campo obrigatório vazio é assunto do botão, não uma frase vermelha.
 *
 * Quem chama decide **quando** mostrar — ver `criarCampoCpfCnpj` em `campo-cpf-cnpj.ts`.
 */
export function erroDoCpfCnpj(valor: string): string | null {
  const d = soDigitos(valor);
  if (d.length === 0) return null;
  if (d.length !== 11 && d.length !== 14) {
    return 'Digite um CPF (11 dígitos) ou um CNPJ (14 dígitos).';
  }
  return cpfCnpjValido(d) ? null : ERRO_CPF_CNPJ_INVALIDO;
}

/** CEP: `78890-000`. */
export function mascaraCep(valor: string): string {
  const d = soDigitos(valor).slice(0, 8);
  return d.replace(/(\d{5})(\d{1,3})$/, '$1-$2');
}

/**
 * Telefone: `(45) 3333-0000` com 10 dígitos e `(45) 99999-0000` com 11 (#186).
 *
 * O backend quer **só dígitos** e recusa máscara, espaço e `+55`; a máscara é só da tela, e o
 * `soDigitos` desfaz no envio — do mesmo jeito que o CPF/CNPJ.
 */
export function mascaraTelefone(valor: string): string {
  const d = soDigitos(valor).slice(0, 11);
  if (d.length <= 2) return d;
  const ddd = `(${d.slice(0, 2)}) `;
  const resto = d.slice(2);
  if (resto.length <= 4) return ddd + resto;
  // Com 11 dígitos o nono entra antes do hífen (celular); com 10, o corte é no quarto.
  const corte = resto.length > 8 ? 5 : 4;
  return `${ddd}${resto.slice(0, corte)}-${resto.slice(corte)}`;
}

/** Por que o telefone digitado não serve, ou `null`. Vazio é "não informado", e passa. */
export function erroDoTelefone(valor: string): string | null {
  const d = soDigitos(valor);
  if (!d) return null;
  return d.length === 10 || d.length === 11
    ? null
    : 'Informe o DDD e o número, com 10 ou 11 dígitos.';
}

/**
 * Onde fica o cursor depois de `quantos` dígitos, no texto já formatado.
 *
 * Caminha o texto contando algarismos e para logo depois do n-ésimo. Com `12.734.567/8909` e
 * `quantos = 3`, devolve 4 — logo após o `7`, que é onde a pessoa estava.
 */
export function posicaoAposDigitos(texto: string, quantos: number): number {
  if (quantos <= 0) return 0;
  let vistos = 0;
  for (let i = 0; i < texto.length; i++) {
    if (/\d/.test(texto[i] as string)) {
      vistos++;
      if (vistos === quantos) return i + 1;
    }
  }
  return texto.length;
}

/**
 * Formata o que está no campo **sem perder o lugar do cursor**, e devolve o texto final para quem
 * chama guardar no signal.
 *
 * Uso no template, no lugar de um `(input)` que só faz `.set(valor)`:
 *
 * ```html
 * <input [value]="formEndCep()" (input)="formEndCep.set(aplicarMascara($event, mascaraCep))" />
 * ```
 */
export function aplicarMascara(evento: Event, formatar: (v: string) => string): string {
  const campo = evento.target as HTMLInputElement;
  const bruto = campo.value;
  const cursor = campo.selectionStart ?? bruto.length;

  // A âncora: quantos dígitos a pessoa já tinha deixado para trás.
  const digitosAntes = soDigitos(bruto.slice(0, cursor)).length;

  const formatado = formatar(bruto);
  campo.value = formatado;

  const novaPosicao = posicaoAposDigitos(formatado, digitosAntes);
  campo.setSelectionRange(novaPosicao, novaPosicao);
  return formatado;
}
