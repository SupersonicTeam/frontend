import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import { environment } from '@env/environment';
import {
  etapasDoTema,
  lerManifesto,
  urlDoQuadro,
  type CameraJornada,
  type EtapaJornada,
  type FormatoJornada,
  type ManifestoJornada,
  type TemaJornada,
} from './manifesto-jornada';
import { maisProximo, ordemDeCarga } from './percurso';

/**
 * De onde vêm os quadros (#174): `/jornada/v0.1/`. **Fora do bundle e fora do `public/`** — são
 * 81 MB, que entrariam no histórico do git e na imagem Docker a cada deploy. A versão no caminho
 * permite cache longo sem nunca servir quadro velho. Ninguém lê o `environment` direto.
 */
export const BASE_JORNADA = new InjectionToken<string>('BASE_JORNADA', {
  providedIn: 'root',
  factory: () => environment.baseJornada,
});

/** O mínimo de um quadro decodificado: o que o canvas desenha e como devolver a memória. */
export interface QuadroDecodificado {
  width: number;
  height: number;
  close(): void;
}

/**
 * O que o depósito pede ao navegador, atrás de um token: o jsdom não tem `createImageBitmap`, e
 * nenhum teste baixa 17 MB de imagem.
 */
export interface AmbienteDaJornada {
  buscarJson(url: string, sinal: AbortSignal): Promise<unknown>;
  baixar(url: string, sinal: AbortSignal): Promise<Blob>;
  decodificar(blob: Blob): Promise<QuadroDecodificado>;
  /** O navegador decodifica AVIF? Conferido decodificando um AVIF de verdade, não pelo `canPlayType`. */
  suportaAvif(): Promise<boolean>;
}

/** Um AVIF de 1×1, para o teste de decodificação. */
const AVIF_DE_TESTE =
  'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQ0MAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKCBgANogQEAwgMg8f8D///8WfhwB8+ErK42A=';

export const AMBIENTE_DA_JORNADA = new InjectionToken<AmbienteDaJornada>('AMBIENTE_DA_JORNADA', {
  providedIn: 'root',
  factory: () => ({
    // `fetch` cru, e não o `ApiService`: o interceptor de autenticação mandaria o `Bearer` da
    // sessão para um host de arquivos estáticos, e o de erro mostraria toast num enfeite.
    buscarJson: async (url, sinal) => {
      const resposta = await fetch(url, { signal: sinal });
      if (!resposta.ok) throw new Error(`manifesto ${resposta.status}`);
      return (await resposta.json()) as unknown;
    },
    baixar: async (url, sinal) => {
      const resposta = await fetch(url, { signal: sinal });
      if (!resposta.ok) throw new Error(`quadro ${resposta.status}`);
      return resposta.blob();
    },
    decodificar: (blob) => createImageBitmap(blob),
    suportaAvif: () =>
      new Promise<boolean>((resolve) => {
        const imagem = new Image();
        imagem.onload = () => resolve(imagem.width > 0);
        imagem.onerror = () => resolve(false);
        imagem.src = AVIF_DE_TESTE;
      }),
  }),
});

/**
 * Quantos quadros ficam **decodificados** ao mesmo tempo. É o risco número 1 da seção: um quadro
 * de 1280×720 aberto ocupa 3,7 MB, e a jornada tem 540. Vinte são ~75 MB; todos seriam 2 GB.
 */
export const LIMITE_DE_QUADROS_ABERTOS = 20;
/** Quantos vizinhos do quadro da vez são decodificados de antemão, para cada lado. */
const VIZINHOS_DECODIFICADOS = 4;
/** Downloads em paralelo. Seis é o que o navegador abre por host em HTTP/1.1. */
const DOWNLOADS_EM_PARALELO = 6;

/**
 * O depósito de quadros da jornada do milho (#174): lê o manifesto, baixa os quadros aos poucos e
 * mantém poucos deles decodificados.
 *
 * **Não é `root`**: quem o provê é a seção, e ele morre com ela. Um serviço `root` seguraria os
 * quadros decodificados depois de o visitante sair da landing para o `/login`.
 *
 * ## Duas memórias diferentes
 *
 * - os **arquivos baixados** (`Blob`) ficam todos: são ~30 kB cada, e voltar a rolar para cima não
 *   deve repetir download;
 * - os **quadros decodificados** ficam em poucos (`LIMITE_DE_QUADROS_ABERTOS`), os usados por
 *   último. Decodificar de novo custa milissegundos; manter todos custaria gigabytes.
 *
 * ## Carga por janela
 *
 * O LEIA-ME do pacote manda carregar o quadro 1 de cada etapa, depois um a cada oito, depois o
 * resto. Aqui isso vale **por etapa**, e só para a etapa da vez e as duas vizinhas: baixar as nove
 * inteiras seriam 17 MB no celular de quem talvez nem role até o fim. O quadro 1 de **todas** vem
 * primeiro, então qualquer ponto da rolagem tem o que mostrar.
 *
 * Nada aqui é signal além do `estado`: os quadros mudam dezenas de vezes por segundo, e no zoneless
 * cada escrita em signal agenda uma renderização. Quem desenha é avisado pelo `aoChegar`.
 */
@Injectable()
export class JornadaStore {
  private readonly base = inject(BASE_JORNADA);
  private readonly ambiente = inject(AMBIENTE_DA_JORNADA);

  /** `falhou` = o manifesto não veio ou não é o esperado: a seção não aparece. */
  readonly estado = signal<'esperando' | 'pronta' | 'falhou'>('esperando');

  private manifestoLido: ManifestoJornada | null = null;
  private formato: FormatoJornada = 'webp';
  private camera: CameraJornada = '16x9';
  private etapasAtuais: EtapaJornada[] = [];

  private readonly arquivos = new Map<string, Blob>();
  private readonly abertos = new Map<string, QuadroDecodificado>();
  private readonly baixando = new Set<string>();
  private readonly decodificando = new Set<string>();
  private fila: { etapa: number; quadro: number }[] = [];
  private ativos = 0;
  private foco = { etapa: -1, quadro: -1 };
  private controle = new AbortController();
  private encerrado = false;

  /** Chamado quando um quadro novo fica pronto para desenhar. */
  aoChegar: () => void = () => undefined;

  get manifesto(): ManifestoJornada | null {
    return this.manifestoLido;
  }

  get etapas(): readonly EtapaJornada[] {
    return this.etapasAtuais;
  }

  /** O formato escolhido, para o modo estático montar o endereço do quadro parado. */
  get formatoEscolhido(): FormatoJornada {
    return this.formato;
  }

  /**
   * Lê o manifesto e escolhe o formato. É a única coisa que o **modo estático** pede: o manifesto
   * tem alguns kB e é a fonte dos quadros parados e dos textos alternativos.
   */
  async iniciar(): Promise<void> {
    try {
      const [bruto, avif] = await Promise.all([
        this.ambiente.buscarJson(`${this.base}manifesto.json`, this.controle.signal),
        this.ambiente.suportaAvif().catch(() => false),
      ]);
      if (this.encerrado) return;
      const manifesto = lerManifesto(bruto);
      if (!manifesto) {
        this.estado.set('falhou');
        return;
      }
      this.manifestoLido = manifesto;
      this.formato = avif ? 'avif' : 'webp';
      this.estado.set('pronta');
    } catch {
      if (!this.encerrado) this.estado.set('falhou');
    }
  }

  /**
   * Escolhe a câmera e o tema, e começa a carga. Trocar a **câmera** descarta os quadros abertos
   * (são outras imagens); trocar o **tema** só muda a etapa da marca, e o resto continua valendo.
   */
  configurar(camera: CameraJornada, tema: TemaJornada): void {
    if (!this.manifestoLido) return;
    if (camera !== this.camera) this.fecharAbertos();
    this.camera = camera;
    this.etapasAtuais = etapasDoTema(this.manifestoLido, tema);
    this.foco = { etapa: -1, quadro: -1 };
    this.focar(0, 0);
  }

  /**
   * O quadro que a rolagem pede agora. Reordena os downloads quando a **etapa** muda, e
   * decodifica o quadro da vez e os vizinhos.
   */
  focar(etapa: number, quadro: number): void {
    if (this.encerrado || !this.etapasAtuais.length) return;
    const mudouDeEtapa = etapa !== this.foco.etapa;
    this.foco = { etapa, quadro };
    if (mudouDeEtapa) this.refazerFila();
    this.decodificarPertoDoFoco();
    this.tocarFila();
  }

  /**
   * O que há para desenhar no lugar do quadro `quadro` da etapa `etapa`: ele, se estiver aberto;
   * senão o aberto mais próximo da mesma etapa; senão `null` (e o canvas mantém o que tinha).
   */
  quadro(etapa: number, quadro: number): QuadroDecodificado | null {
    const total = this.etapasAtuais[etapa]?.quadros ?? 0;
    const perto = maisProximo(total, quadro, (i) => this.abertos.has(this.chave(etapa, i)));
    if (perto < 0) return null;
    const chave = this.chave(etapa, perto);
    const aberto = this.abertos.get(chave) ?? null;
    // Usado agora: vai para o fim da fila de descarte.
    if (aberto) {
      this.abertos.delete(chave);
      this.abertos.set(chave, aberto);
    }
    return aberto;
  }

  /** Solta tudo: cancela os downloads e devolve a memória dos quadros abertos. */
  encerrar(): void {
    this.encerrado = true;
    this.controle.abort();
    this.fila = [];
    this.fecharAbertos();
    this.arquivos.clear();
    this.aoChegar = () => undefined;
  }

  /** Quantos quadros estão decodificados — para os testes e para conferir pelo console. */
  get quadrosAbertos(): number {
    return this.abertos.size;
  }

  private chave(etapa: number, quadro: number): string {
    return `${this.etapasAtuais[etapa]?.id ?? '?'}:${this.camera}:${quadro}`;
  }

  /** O quadro 1 de todas as etapas; depois a etapa da vez, a seguinte e a anterior. */
  private refazerFila(): void {
    const fila: { etapa: number; quadro: number }[] = [];
    this.etapasAtuais.forEach((_, etapa) => fila.push({ etapa, quadro: 0 }));
    for (const etapa of [this.foco.etapa, this.foco.etapa + 1, this.foco.etapa - 1]) {
      const dados = this.etapasAtuais[etapa];
      if (!dados) continue;
      for (const quadro of ordemDeCarga(dados.quadros)) fila.push({ etapa, quadro });
    }
    this.fila = fila.filter(({ etapa, quadro }) => {
      const chave = this.chave(etapa, quadro);
      return !this.arquivos.has(chave) && !this.baixando.has(chave);
    });
  }

  private tocarFila(): void {
    while (this.ativos < DOWNLOADS_EM_PARALELO && this.fila.length) {
      const item = this.fila.shift();
      if (!item) break;
      const chave = this.chave(item.etapa, item.quadro);
      if (this.arquivos.has(chave) || this.baixando.has(chave)) continue;
      void this.baixar(item.etapa, item.quadro, chave);
    }
  }

  private async baixar(etapa: number, quadro: number, chave: string): Promise<void> {
    const manifesto = this.manifestoLido;
    const dados = this.etapasAtuais[etapa];
    if (!manifesto || !dados) return;
    this.baixando.add(chave);
    this.ativos++;
    try {
      const url = urlDoQuadro(this.base, manifesto, dados, this.camera, this.formato, quadro);
      const blob = await this.ambiente.baixar(url, this.controle.signal);
      if (this.encerrado) return;
      this.arquivos.set(chave, blob);
      // Decodifica na hora se for útil já: perto do foco, ou o primeiro quadro de uma etapa que
      // ainda não tem nenhum aberto (é o que aparece enquanto o resto não chega).
      if (this.pertoDoFoco(etapa, quadro) || !this.temAberto(etapa)) {
        void this.decodificar(chave);
      }
    } catch {
      /* quadro que falhou: o vizinho mais próximo é desenhado no lugar */
    } finally {
      this.baixando.delete(chave);
      this.ativos--;
      if (!this.encerrado) this.tocarFila();
    }
  }

  private temAberto(etapa: number): boolean {
    const prefixo = `${this.etapasAtuais[etapa]?.id ?? '?'}:${this.camera}:`;
    for (const chave of this.abertos.keys()) if (chave.startsWith(prefixo)) return true;
    for (const chave of this.decodificando) if (chave.startsWith(prefixo)) return true;
    return false;
  }

  private pertoDoFoco(etapa: number, quadro: number): boolean {
    return (
      etapa === this.foco.etapa && Math.abs(quadro - this.foco.quadro) <= VIZINHOS_DECODIFICADOS
    );
  }

  private decodificarPertoDoFoco(): void {
    const { etapa, quadro } = this.foco;
    const total = this.etapasAtuais[etapa]?.quadros ?? 0;
    for (let d = 0; d <= VIZINHOS_DECODIFICADOS; d++) {
      for (const i of d === 0 ? [quadro] : [quadro + d, quadro - d]) {
        if (i >= 0 && i < total) void this.decodificar(this.chave(etapa, i));
      }
    }
  }

  private async decodificar(chave: string): Promise<void> {
    const blob = this.arquivos.get(chave);
    if (!blob || this.abertos.has(chave) || this.decodificando.has(chave)) return;
    this.decodificando.add(chave);
    try {
      const aberto = await this.ambiente.decodificar(blob);
      if (this.encerrado || !chave.includes(`:${this.camera}:`)) {
        aberto.close();
        return;
      }
      this.abertos.set(chave, aberto);
      this.descartarOsMaisAntigos();
      this.aoChegar();
    } catch {
      /* arquivo que não decodifica: fica sem esse quadro */
    } finally {
      this.decodificando.delete(chave);
    }
  }

  /** O `Map` guarda a ordem de inserção, e `quadro()` reinsere o que usa: o primeiro é o mais velho. */
  private descartarOsMaisAntigos(): void {
    while (this.abertos.size > LIMITE_DE_QUADROS_ABERTOS) {
      const [chave, aberto] = this.abertos.entries().next().value as [string, QuadroDecodificado];
      aberto.close();
      this.abertos.delete(chave);
    }
  }

  private fecharAbertos(): void {
    for (const aberto of this.abertos.values()) aberto.close();
    this.abertos.clear();
  }
}
