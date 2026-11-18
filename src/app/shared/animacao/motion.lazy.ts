/**
 * O **único** arquivo do app que importa o Motion (#174, PR A).
 *
 * Existe para o `import()` dinâmico do `CARREGAR_ANIMACAO` apontar para cá, e não para o pacote:
 * num `import('motion')` o empacotador guarda o módulo inteiro, porque não sabe quais exportações
 * o código vai ler do objeto. Com as três importações escritas aqui, ele descarta o resto — o
 * chunk caiu de 188 kB para o que estas três funções de fato usam (medido no PR).
 *
 * Nada além do `carregar-animacao.ts` importa este arquivo, e só por `import()`. Um `import`
 * estático dele em qualquer tela põe a biblioteca no carregamento inicial, e a CI reprova
 * (`scripts/conferir-build-producao.mjs`, conferência 4).
 */
export { animate, inView, scroll } from 'motion';
