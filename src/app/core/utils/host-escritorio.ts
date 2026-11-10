import { DOCUMENT } from '@angular/common';
import { InjectionToken, inject } from '@angular/core';
import { environment } from '@env/environment';

/**
 * A regra do host (#175, compartilhada com a landing da #174).
 *
 * O escritório com endereço próprio atende em `{slug}.{base}`; todo o resto (o produtor, o
 * visitante, quem já usa o sistema) continua em `www.{base}`. A base vem do `environment` pelo
 * `DOMINIO_BASE`, e nenhum fonte do app a escreve à mão (o `scripts/conferir-build-producao.mjs`
 * reprova). Quem decide se um host é de escritório é esta regra, a mesma do backend (backend#464):
 *
 * - o hostname vai para minúsculas, sem o ponto final (`location.hostname` não traz porta);
 * - **escritório**: exatamente um rótulo antes de `.` + base, diferente de `www`;
 * - **principal**: a base, `www.` + base e qualquer outro host (`localhost`, IP, `[::1]`, o antigo
 *   sslip.io, `a.b.{base}`).
 *
 * O frontend **não valida o formato do rótulo**: qualquer valor estranho vai ao endpoint público e
 * recebe o mesmo 404 do backend.
 *
 * Toda URL de outro host sai do `urlDoHost`, sempre a partir de um rótulo (ou `null` para o
 * principal), nunca de um host inteiro vindo de resposta. E ninguém lê o `environment` direto: os
 * tokens abaixo deixam os specs testarem os dois domínios e os dois valores da chave.
 */

/** O rótulo de escritório do host, ou `null` no host principal. */
export function rotuloDeEscritorio(hostname: string, dominioBase: string): string | null {
  const host = normalizarHost(hostname);
  const base = normalizarHost(dominioBase);
  if (!host || !base || host === base) return null;
  const sufixo = `.${base}`;
  if (!host.endsWith(sufixo)) return null;
  const rotulo = host.slice(0, -sufixo.length);
  // Exatamente um rótulo: `a.b.{base}` é principal, como no backend.
  if (!rotulo || rotulo.includes('.') || rotulo === 'www') return null;
  return rotulo;
}

/** O host é de um escritório? (o nome que a #174 já usa) */
export function ehHostDeEscritorio(hostname: string, dominioBase: string): boolean {
  return rotuloDeEscritorio(hostname, dominioBase) !== null;
}

/** O host principal: `www.` + base em produção; em dev, a própria base (`localhost`). */
export function hostPrincipal(dominioBase: string): string {
  const base = normalizarHost(dominioBase);
  return base === 'localhost' ? base : `www.${base}`;
}

/** Protocolo e porta do endereço atual, para montar a URL de outro host no mesmo esquema. */
export interface EsquemaDoHost {
  /** Com os dois pontos, como `location.protocol`: `https:`. */
  protocolo: string;
  /** Vazio quando é a porta padrão, como `location.port`. */
  porta?: string | null;
}

/**
 * A URL de um host: o do escritório `rotulo`, ou o principal com `null`.
 *
 * Em produção, `https://ruraloeste.{base}` e `https://www.{base}`; em dev,
 * `http://ruraloeste.localhost:4200` e `http://localhost:4200`. Sem barra no fim: quem chama
 * acrescenta o caminho. O texto de um link mostra o host sem o protocolo; o `href` é esta URL.
 */
export function urlDoHost(
  rotulo: string | null,
  dominioBase: string,
  { protocolo, porta }: EsquemaDoHost,
): string {
  // O rótulo vai para a autoridade da URL, e pode vir de resposta (o `slugAtual` do redirecionamento):
  // só um rótulo DNS de verdade entra. `evil.com#` montaria `https://evil.com#.{base}`, um
  // redirecionamento aberto. Qualquer outra coisa cai no host principal, que é seguro.
  const valido = rotulo !== null && ROTULO_DNS.test(rotulo.toLowerCase());
  const host = valido
    ? `${rotulo.toLowerCase()}.${normalizarHost(dominioBase)}`
    : hostPrincipal(dominioBase);
  return `${protocolo}//${host}${porta ? `:${porta}` : ''}`;
}

/** Um rótulo DNS: letras, dígitos e hífen, sem hífen nas pontas, até 63 caracteres. */
const ROTULO_DNS = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Minúsculas, sem espaços nas pontas e sem o ponto final de um FQDN (`www.{base}.`). */
function normalizarHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.+$/, '');
}

/** O hostname desta página. Os specs trocam por um falso. */
export const HOST_ATUAL = new InjectionToken<string>('host atual', {
  providedIn: 'root',
  factory: () => inject(DOCUMENT).location.hostname,
});

/** O domínio base: `localhost` em dev; o de produção vem do `environment.prod.ts`. */
export const DOMINIO_BASE = new InjectionToken<string>('domínio base', {
  providedIn: 'root',
  factory: () => environment.dominioBase,
});

/**
 * O endereço próprio do escritório já está no ar? (DNS curinga e Caddy, #175)
 *
 * Desliga em www só o que aponta para o subdomínio: a seção de endereço da aba Equipe, o aviso do
 * endereço próprio e o selo da landing. A detecção do host não depende dela: sem DNS, nenhum
 * acesso chega por subdomínio. Ligar é uma linha no `environment.prod.ts`, no dia do DNS.
 */
export const ENDERECO_PROPRIO_NO_AR = new InjectionToken<boolean>('endereço próprio no ar', {
  providedIn: 'root',
  factory: () => environment.enderecoProprioNoAr,
});

/**
 * O endereço atual e o único jeito de trocar de host, no molde do `AMBIENTE_DE_RECARGA`
 * (`recarga-apos-deploy.ts`). O jsdom não navega e responde `http://localhost:porta`, então os
 * specs dão um falso.
 */
export interface LocalizacaoAtual {
  /** `https:` */
  protocolo: string;
  /** Vazio na porta padrão. */
  porta: string;
  /** `/login` */
  caminho: string;
  /** `?returnUrl=...`, ou vazio. */
  busca: string;
  /** `#token=...`, ou vazio. */
  fragmento: string;
  /** `location.replace`: sem deixar a página atual no histórico. */
  substituir: (url: string) => void;
}

export const LOCALIZACAO_ATUAL = new InjectionToken<LocalizacaoAtual>('localização atual', {
  providedIn: 'root',
  factory: () => {
    const location = inject(DOCUMENT).location;
    // Getters: o endereço muda ao navegar, e quem lê quer o de agora, não o da criação do token.
    return {
      get protocolo() {
        return location.protocol;
      },
      get porta() {
        return location.port;
      },
      get caminho() {
        return location.pathname;
      },
      get busca() {
        return location.search;
      },
      get fragmento() {
        return location.hash;
      },
      substituir: (url: string) => location.replace(url),
    };
  },
});
