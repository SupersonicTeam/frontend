import { NavigationError } from '@angular/router';

/**
 * Aba aberta antes de um deploy não abria telas novas (#162).
 *
 * Cada tela é um arquivo com hash no nome (`import('./chunk-XXXX.js')`), e a aba guarda os nomes
 * da versão que estava no ar quando abriu. Como o CD publica a cada merge, o deploy seguinte apaga
 * esses arquivos: medido em 05/11, o cadastro da versão anterior (`chunk-GQNNXNPM.js`) dava 404 em
 * produção. O `import()` falhava, o Router não tratava o erro e o clique em "Criar conta"
 * simplesmente não fazia nada até a pessoa recarregar.
 *
 * O conserto é fazer o que a pessoa faria: recarregar, já no endereço para onde ela ia. Recarregar
 * baixa o `index.html` novo, que aponta para os arquivos que existem.
 */

/** A frase de cada navegador quando o arquivo de uma tela não carrega. */
const FALHA_DE_CHUNK = [
  /Failed to fetch dynamically imported module/i, // Chrome, Edge
  /error loading dynamically imported module/i, // Firefox
  /Importing a module script failed/i, // Safari
];

/** Onde fica a hora da última recarga por este motivo, para não entrar em laço. */
export const CHAVE_RECARGA_CHUNK = 'agro-recarga-chunk';

/**
 * Uma recarga a cada 30 s, no máximo. Se o arquivo continua faltando logo depois de recarregar, o
 * problema não é aba velha (é servidor fora, ou cache no caminho), e recarregar de novo só faria a
 * tela piscar sem parar. Aí o erro segue como antes.
 */
export const INTERVALO_MINIMO_MS = 30_000;

/** O erro é de um arquivo de tela que não carregou? */
export function ehFalhaDeChunk(erro: unknown): boolean {
  const mensagem = erro instanceof Error ? erro.message : String(erro ?? '');
  return FALHA_DE_CHUNK.some((padrao) => padrao.test(mensagem));
}

/** O que a decisão precisa do navegador, separado para o teste não recarregar o jsdom. */
export interface AmbienteDeRecarga {
  armazenamento: Pick<Storage, 'getItem' | 'setItem'>;
  agora: () => number;
  ir: (url: string) => void;
}

/**
 * Recarrega no destino se a navegação falhou por arquivo de tela ausente. Devolve se recarregou.
 *
 * Sem `sessionStorage` não há como lembrar que já recarregou, então não recarrega: melhor o clique
 * sem efeito de antes do que uma página presa num laço de recargas.
 */
export function recarregarSeChunkFaltou(
  evento: NavigationError,
  ambiente: AmbienteDeRecarga,
): boolean {
  if (!ehFalhaDeChunk(evento.error)) return false;
  try {
    const anterior = Number(ambiente.armazenamento.getItem(CHAVE_RECARGA_CHUNK));
    const agora = ambiente.agora();
    if (anterior && agora - anterior < INTERVALO_MINIMO_MS) return false;
    ambiente.armazenamento.setItem(CHAVE_RECARGA_CHUNK, String(agora));
  } catch {
    return false;
  }
  ambiente.ir(evento.url);
  return true;
}

/**
 * O ambiente de verdade: `sessionStorage` da aba e uma navegação completa do navegador.
 *
 * O `sessionStorage` é lido só na hora do uso porque o próprio acesso pode lançar (site data
 * bloqueado); assim a exceção cai no `try` de `recarregarSeChunkFaltou`.
 */
export function ambienteDoNavegador(
  janela: Window,
  prepararUrl: (url: string) => string,
): AmbienteDeRecarga {
  return {
    armazenamento: {
      getItem: (chave) => janela.sessionStorage.getItem(chave),
      setItem: (chave, valor) => janela.sessionStorage.setItem(chave, valor),
    },
    agora: () => Date.now(),
    ir: (url) => janela.location.assign(prepararUrl(url)),
  };
}
