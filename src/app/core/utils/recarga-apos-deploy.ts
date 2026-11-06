import { DOCUMENT, Location } from '@angular/common';
import { InjectionToken, inject } from '@angular/core';
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

/**
 * A marca de "já recarreguei por isso", no `sessionStorage` da aba. Guarda o destino.
 *
 * **Uma recarga, até a próxima navegação que der certo.** Se o arquivo continua faltando logo depois
 * de recarregar, o problema não é aba velha (servidor fora, cache no caminho), e recarregar de novo
 * só faria a tela piscar sem parar; aí o erro segue como antes. Uma janela de tempo no lugar da
 * marca falhava em rede lenta: com a recarga levando mais que a janela, o laço voltava (achado do
 * review). A marca sai em `navegacaoDeuCerto()`, ligada ao `NavigationEnd` no `app.config`.
 */
export const CHAVE_RECARGA_CHUNK = 'agro-recarga-chunk';

/** O erro é de um arquivo de tela que não carregou? */
export function ehFalhaDeChunk(erro: unknown): boolean {
  const mensagem = erro instanceof Error ? erro.message : String(erro ?? '');
  return FALHA_DE_CHUNK.some((padrao) => padrao.test(mensagem));
}

/** O que a decisão precisa do navegador; o teste troca por um falso pelo `AMBIENTE_DE_RECARGA`. */
export interface AmbienteDeRecarga {
  armazenamento: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  online: () => boolean;
  ir: (url: string) => void;
}

/**
 * Recarrega no destino se a navegação falhou por arquivo de tela ausente. Devolve se recarregou.
 *
 * - **Sem rede, não recarrega.** O navegador dá a mesma frase quando o sinal cai, e recarregar
 *   offline trocaria o app, que seguia funcionando, pela página de erro do navegador (achado do
 *   review — produtor rural em conexão fraca).
 * - **Sem `sessionStorage`, não recarrega**: não há como lembrar que já recarregou, e melhor o
 *   clique sem efeito de antes do que uma página presa num laço de recargas.
 */
export function recarregarSeChunkFaltou(
  evento: NavigationError,
  ambiente: AmbienteDeRecarga,
): boolean {
  if (!ehFalhaDeChunk(evento.error) || !ambiente.online()) return false;
  try {
    if (ambiente.armazenamento.getItem(CHAVE_RECARGA_CHUNK) !== null) return false;
    ambiente.armazenamento.setItem(CHAVE_RECARGA_CHUNK, evento.url);
  } catch {
    return false;
  }
  ambiente.ir(evento.url);
  return true;
}

/** Uma navegação deu certo: a próxima falha de chunk pode recarregar de novo (outro deploy). */
export function navegacaoDeuCerto(ambiente: AmbienteDeRecarga): void {
  try {
    ambiente.armazenamento.removeItem(CHAVE_RECARGA_CHUNK);
  } catch {
    /* sem sessionStorage a marca nunca foi gravada */
  }
}

/**
 * O ambiente de verdade: `sessionStorage` da aba, `navigator.onLine` e uma navegação completa.
 *
 * O `sessionStorage` é lido só na hora do uso porque o próprio acesso pode lançar (site data
 * bloqueado); assim a exceção cai no `try` de quem chama.
 */
export function ambienteDoNavegador(
  janela: Window,
  prepararUrl: (url: string) => string,
): AmbienteDeRecarga {
  return {
    armazenamento: {
      getItem: (chave) => janela.sessionStorage.getItem(chave),
      setItem: (chave, valor) => janela.sessionStorage.setItem(chave, valor),
      removeItem: (chave) => janela.sessionStorage.removeItem(chave),
    },
    online: () => janela.navigator.onLine !== false,
    ir: (url) => janela.location.assign(prepararUrl(url)),
  };
}

/** O ambiente da recarga; `null` sem janela. Os testes trocam por um falso. */
export const AMBIENTE_DE_RECARGA = new InjectionToken<AmbienteDeRecarga | null>(
  'ambiente da recarga após deploy',
  {
    providedIn: 'root',
    factory: () => {
      const janela = inject(DOCUMENT).defaultView;
      if (!janela) return null;
      const location = inject(Location);
      return ambienteDoNavegador(janela, (url) => location.prepareExternalUrl(url));
    },
  },
);
