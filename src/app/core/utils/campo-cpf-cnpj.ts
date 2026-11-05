import { computed, signal } from '@angular/core';
import { ERRO_CPF_CNPJ_INVALIDO, aplicarMascara, erroDoCpfCnpj, mascaraCpfCnpj } from './mascaras';

/**
 * O estado de um campo de CPF/CNPJ digitado (#156): o valor com máscara, quando ele passa a ser
 * julgado e o que dizer dele.
 *
 * Mora aqui, e não em cada tela, porque são três campos com a mesma regra — `/cadastro`,
 * `/equipe/convite` e o destinatário da NF-e — e cópias dessa lógica divergem na primeira correção.
 *
 * ## Quando o campo é julgado
 *
 * **Só depois que a pessoa sai dele com algo escrito, ou tenta enviar.** Antes, com 6 dígitos, o
 * campo já ficava vermelho dizendo que faltavam dígitos — o que ela sabia, porque ainda estava
 * digitando. Sair do campo **vazio** não conta: quem passou por ele sem digitar não errou nada, e
 * contar isso faria a frase vermelha voltar a cada tecla quando ela voltasse para digitar.
 *
 * Depois de julgado, o campo é reavaliado a cada tecla — corrigir o erro o apaga na hora.
 */
export function criarCampoCpfCnpj() {
  const valor = signal('');
  const tocado = signal(false);
  /** O servidor recusou o documento: a frase fica junto do campo, não no topo da tela. */
  const erroServidor = signal<string | null>(null);

  const erro = computed(() => erroServidor() ?? (tocado() ? erroDoCpfCnpj(valor()) : null));

  return {
    valor,
    tocado,
    erroServidor,
    erro,

    /** No `(input)`: máscara sem perder o cursor (#102). A frase do servidor falava do valor velho. */
    digitar(evento: Event): void {
      valor.set(aplicarMascara(evento, mascaraCpfCnpj));
      erroServidor.set(null);
    },

    /** No `(blur)`. Vazio não conta como tocado (ver acima). */
    sair(): void {
      tocado.set(valor().trim().length > 0);
    },

    /** No envio: julga o campo agora e diz se ele pode seguir. Também limpa a frase do servidor. */
    conferir(): boolean {
      erroServidor.set(null);
      tocado.set(true);
      return erroDoCpfCnpj(valor()) === null;
    },

    /** O servidor respondeu 400 com `field: cpfCnpj`. */
    recusadoPeloServidor(): void {
      erroServidor.set(ERRO_CPF_CNPJ_INVALIDO);
    },

    /** Formulário novo: nada digitado, nada julgado. */
    reiniciar(texto = ''): void {
      valor.set(texto);
      tocado.set(false);
      erroServidor.set(null);
    },
  };
}

export type CampoCpfCnpj = ReturnType<typeof criarCampoCpfCnpj>;
