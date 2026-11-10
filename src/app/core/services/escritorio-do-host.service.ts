import { DOCUMENT } from '@angular/common';
import { Injectable, Injector, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import type { Subscription } from 'rxjs';
import { skipErrorNotify } from '@core/interceptors/error-notify.context';
import {
  DOMINIO_BASE,
  HOST_ATUAL,
  LOCALIZACAO_ATUAL,
  rotuloDeEscritorio,
  urlDoHost,
} from '@core/utils/host-escritorio';

/** Em que endereço o app abriu (#175). */
export type ModoDoHost = 'principal' | 'escritorio' | 'nao-encontrado' | 'indisponivel';

/** O escritório do endereço, como o endpoint público devolve. */
export interface EscritorioDoHost {
  slug: string;
  nome: string;
}

/** `GET /api/publico/escritorios/{slug}` (backend#464). */
interface RespostaPublica {
  slug: string;
  nome: string;
  /** Só quando o slug pedido está em carência de um escritório que tem outro slug ativo. */
  slugAtual: string | null;
}

/** Rede móvel ruim no campo, para uma resposta pequena (e em cache por 5 minutos). */
const TEMPO_LIMITE_MS = 8000;

/** O formato do slug no contrato. Um `slugAtual` fora dele não vira redirecionamento. */
const FORMATO_DO_SLUG = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;

function slugValido(slug: string): boolean {
  return FORMATO_DO_SLUG.test(slug) && !slug.includes('--') && !/^\d+$/.test(slug);
}

/**
 * O escritório do endereço (`{slug}.{base}`), resolvido **uma vez**, antes de o app montar (#175).
 *
 * Chamado por um `provideAppInitializer`. No host principal termina na hora, sem nenhuma chamada:
 * www não ganha requisição. No host de escritório pergunta ao endpoint público quem é o escritório:
 *
 * - 200: modo escritório, com o nome (o login ganha a marca, o título muda);
 * - 200 com `slugAtual`: o endereço mudou; troca de host com `location.replace`, mantendo caminho,
 *   busca e fragmento, e a promessa **não resolve** (o app não monta a tela do host velho);
 * - 404 `ENDERECO_NAO_ENCONTRADO`: a tela "Endereço não encontrado";
 * - qualquer outra coisa (outro 404, 5xx, 429, rede, 8 s sem resposta): "Não foi possível abrir
 *   este endereço". **Nunca o modo principal**: no subdomínio ele mostraria o login genérico, com
 *   "Criar conta" de produtor, num endereço onde o backend aplica o modo escritório de qualquer
 *   jeito, e um login que às vezes aparece sem a marca ensina o contador a não reparar nela.
 *
 * **Nunca rejeita**: uma rejeição no inicializador derruba o bootstrap e deixa a pessoa no
 * esqueleto do `index.html`.
 *
 * **Fora da lista do `EncerramentoService`, de propósito.** O que mora aqui é dado do host, público
 * e igual para qualquer visitante, não da sessão. Limpo no Sair, o `/login` do subdomínio perderia
 * a marca, porque o `resolver()` só roda na carga da página.
 *
 * O `HttpClient` só é obtido dentro do `resolver()`: o `App` lê este service, e o `app.spec.ts`
 * monta o `App` sem providers de HTTP.
 */
@Injectable({ providedIn: 'root' })
export class EscritorioDoHostService {
  private readonly injector = inject(Injector);
  private readonly documento = inject(DOCUMENT);
  private readonly localizacao = inject(LOCALIZACAO_ATUAL);
  private readonly base = inject(DOMINIO_BASE);

  /** O rótulo de escritório do host, ou `null` no principal. */
  readonly rotulo = signal<string | null>(rotuloDeEscritorio(inject(HOST_ATUAL), this.base));
  readonly modo = signal<ModoDoHost>('principal');
  readonly escritorio = signal<EscritorioDoHost | null>(null);
  /** Segundos do `Retry-After`, quando o endpoint respondeu 429. */
  readonly esperarSegundos = signal<number | null>(null);

  async resolver(): Promise<void> {
    const rotulo = this.rotulo();
    if (!rotulo) {
      this.modo.set('principal');
      return;
    }
    // Endereço de escritório, achado ou não: nunca indexado.
    this.definirMeta('robots', 'noindex');

    let resposta: RespostaPublica;
    try {
      resposta = await this.perguntar(rotulo);
    } catch (erro) {
      this.modo.set(EscritorioDoHostService.modoDoErro(erro));
      if (erro instanceof HttpErrorResponse && erro.status === 429) {
        const espera = Number(erro.headers?.get('Retry-After') ?? '');
        this.esperarSegundos.set(Number.isFinite(espera) && espera > 0 ? espera : null);
      }
      return;
    }
    // Um 200 fora do contrato (corpo vazio de um proxy, campo de outro tipo) não pode lançar daqui
    // para baixo: o inicializador rejeitaria e o app não montaria.
    if (!EscritorioDoHostService.respostaValida(resposta)) {
      this.modo.set('indisponivel');
      return;
    }

    if (resposta.slugAtual) {
      const novo = resposta.slugAtual.toLowerCase();
      // Só um slug do contrato, e diferente do de agora: senão seria um laço ou outro host.
      if (!slugValido(novo) || novo === rotulo) {
        this.modo.set('indisponivel');
        return;
      }
      const { protocolo, porta, caminho, busca, fragmento } = this.localizacao;
      this.localizacao.substituir(
        `${urlDoHost(novo, this.base, { protocolo, porta })}${caminho}${busca}${fragmento}`,
      );
      // A página vai embora: o app não monta a tela do host velho.
      return new Promise<void>(() => undefined);
    }

    this.escritorio.set({ slug: rotulo, nome: resposta.nome });
    this.modo.set('escritorio');
    this.documento.title = `${resposta.nome} | AgroConIA`;
    this.definirMeta('description', `Acesso da equipe de ${resposta.nome}, com AgroConIA`);
  }

  /**
   * Põe (ou troca) um `<meta name>` no `<head>`. À mão, e não pelos serviços `Meta`/`Title`: este
   * service entra no bundle inicial, e três tags não pagam aqueles dois serviços inteiros.
   */
  private definirMeta(nome: string, conteudo: string): void {
    let tag = this.documento.head.querySelector<HTMLMetaElement>(`meta[name="${nome}"]`);
    if (!tag) {
      tag = this.documento.createElement('meta');
      tag.name = nome;
      this.documento.head.appendChild(tag);
    }
    tag.content = conteudo;
  }

  /**
   * O GET público com o tempo limite. Um `setTimeout` à mão, e não o operador `timeout` do RxJS:
   * este service entra no bundle inicial, e o operador puxava o agendador junto.
   */
  private perguntar(rotulo: string): Promise<RespostaPublica> {
    const http = this.injector.get(HttpClient);
    return new Promise<RespostaPublica>((resolve, reject) => {
      // O limite nasce antes da assinatura: uma resposta síncrona já encontra o `limite` declarado.
      let assinatura: Subscription | undefined = undefined;
      const limite = setTimeout(() => {
        assinatura?.unsubscribe();
        reject(new Error('tempo esgotado'));
      }, TEMPO_LIMITE_MS);
      assinatura = http
        .get<RespostaPublica>(`/publico/escritorios/${encodeURIComponent(rotulo)}`, {
          context: skipErrorNotify(),
        })
        .subscribe({
          next: (corpo) => {
            clearTimeout(limite);
            resolve(corpo);
          },
          error: (erro: unknown) => {
            clearTimeout(limite);
            reject(erro);
          },
        });
    });
  }

  private static respostaValida(corpo: unknown): corpo is RespostaPublica {
    const r = corpo as Partial<RespostaPublica> | null;
    return (
      typeof r?.nome === 'string' &&
      r.nome.trim() !== '' &&
      (r.slugAtual === undefined || r.slugAtual === null || typeof r.slugAtual === 'string')
    );
  }

  /**
   * Só o 404 **com o código** é "não encontrado". Um 404 sem ele (backend sem a rota, proxy
   * errado) não autoriza dizer a um escritório que existe que o endereço não é de ninguém.
   */
  private static modoDoErro(erro: unknown): ModoDoHost {
    if (erro instanceof HttpErrorResponse && erro.status === 404) {
      const codigo = (erro.error as { errors?: { code?: string }[] } | null)?.errors?.[0]?.code;
      if (codigo === 'ENDERECO_NAO_ENCONTRADO') return 'nao-encontrado';
    }
    return 'indisponivel';
  }
}
