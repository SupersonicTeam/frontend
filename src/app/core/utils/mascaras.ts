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

/** CEP: `78890-000`. */
export function mascaraCep(valor: string): string {
  const d = soDigitos(valor).slice(0, 8);
  return d.replace(/(\d{5})(\d{1,3})$/, '$1-$2');
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
