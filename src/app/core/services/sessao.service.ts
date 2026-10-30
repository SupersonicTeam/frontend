import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';

/** Os dois papéis que o backend emite no token (`LoginResponse.papel`). */
export type Papel = 'PRODUTOR' | 'CONTADOR';

/** A sessão autenticada: o que o login devolveu, mais o nome que o `/auth/me` resolveu. */
export interface Sessao {
  /** O JWT de acesso, a enviar em `Authorization: Bearer`. Validade de 15 minutos. */
  token: string;
  /** Instante de expiração do `token`, ISO-8601 em UTC (`LoginResponse.expiraEm`). */
  expiraEm: string;
  /** Id do produtor ou do contador autenticado — o mesmo que as rotas por id esperam. */
  usuarioId: string;
  papel: Papel;
  /** Nome de exibição, de `GET /api/auth/me`. O login não o devolve. */
  nome: string;
}

/** Margem para o relógio local: renova um pouco antes de o token vencer de fato. */
const FOLGA_DE_EXPIRACAO_MS = 30_000;

/**
 * **Quem está logado** — a única fonte de verdade da identidade (issue #93).
 *
 * Substitui três coisas que a demonstração usava no lugar de autenticação: o `PerfilService` (um
 * papel escolhido num `localStorage` que qualquer um editava), o `TokenService` (que devolvia
 * `null` por contrato) e o `IdentidadeService` (o header `X-Usuario-Id`, com o UUID do contador
 * **cravado no código**). Agora o papel e o id vêm do token, que só o backend emite.
 *
 * ## Por que o token é persistido, e não só guardado em memória
 *
 * Guardar o access token apenas em memória é mais seguro — nenhum XSS o lê — mas aqui custaria
 * uma renovação a **cada** abertura de aba e a cada F5, e renovar **rotaciona o refresh**. Medido
 * contra a API local em 30/10: reusar um refresh já trocado não devolve apenas 401
 * `SESSAO_INVALIDA`, ele **encerra toda a linhagem daquele login** — o cookie novo, obtido na
 * renovação anterior, também passa a responder 401. Ou seja, duas abas recarregando ao mesmo
 * tempo derrubariam as duas.
 *
 * Persistir o token tira a renovação do caminho do F5 (ele só renova quando vence de fato, a cada
 * 15 min) e, porque o `localStorage` é compartilhado entre as abas, faz as abas usarem **o mesmo**
 * token em vez de disputarem renovações. A janela de corrida não fecha de todo: duas abas que
 * vençam no mesmo segundo ainda podem renovar em paralelo. Fechá-la pede coordenação entre abas
 * (`BroadcastChannel`), que não entrou aqui — ver o PR da #93.
 *
 * O evento `storage` abaixo é o que mantém as abas juntas: quem renovou grava, as outras leem.
 */
@Injectable({ providedIn: 'root' })
export class SessaoService {
  private static readonly CHAVE = 'agrocontabil.sessao';

  private readonly estado = signal<Sessao | null>(this.carregar());

  /** A sessão atual, ou `null` quando ninguém entrou. */
  readonly sessao = this.estado.asReadonly();

  readonly logado = computed(() => this.estado() !== null);
  readonly papel = computed<Papel | null>(() => this.estado()?.papel ?? null);
  readonly ehProdutor = computed(() => this.papel() === 'PRODUTOR');
  readonly ehContador = computed(() => this.papel() === 'CONTADOR');
  readonly nome = computed(() => this.estado()?.nome ?? '');
  readonly usuarioId = computed<string | null>(() => this.estado()?.usuarioId ?? null);

  /** O token a mandar nesta requisição, ou `null` quando não há sessão. */
  readonly token = computed<string | null>(() => this.estado()?.token ?? null);

  /**
   * Primeira tela de cada papel — e `/login` sem sessão.
   *
   * É o destino de quem entra e o lugar para onde os guards de papel devolvem quem errou a porta.
   */
  readonly homeDoPerfil = computed(() => {
    const papel = this.papel();
    if (papel === 'CONTADOR') return '/contador';
    if (papel === 'PRODUTOR') return '/dashboard';
    return '/login';
  });

  constructor() {
    if (typeof window === 'undefined') return;

    // O `storage` avisa que **outra aba** mexeu na sessão — e isso são duas coisas diferentes.
    //
    // 1. **Mesma pessoa, token novo** (renovação): a aba parada passa a usar o token novo em vez
    //    de insistir no vencido e disputar uma renovação que revogaria a linhagem.
    //
    // 2. **Outra pessoa, ou ninguém** (entrou com outra conta, ou saiu): aí trocar o signal
    //    **não basta**, e foi o que esta classe fazia. Os services de dados são `root` e guardam
    //    o painel, a conversa com a Ceres e o sino de **quem estava aqui**; adotar a identidade
    //    da outra aba sem limpá-los deixa a aba parada mostrando o dado de um usuário sob o nome
    //    de outro. É o mesmo vazamento que o `EncerramentoService` existe para evitar, por um
    //    caminho que ele não alcança — nenhum guard roda numa troca de signal, e ninguém observa
    //    a sessão com `effect()`. Em `/configuracoes` seriam os dados cadastrais do produtor
    //    anterior, e o contexto que vai para a Ceres sairia com o painel dele.
    //
    //    Então a página é **recarregada**: nenhum cache sobrevive a isso, nem os dos services que
    //    ainda não existem. Limpar por lista dependeria de alguém manter a lista em dia, que é
    //    justamente como isto voltaria.
    const aoMudarOStorage = (evento: StorageEvent) => {
      if (evento.key !== SessaoService.CHAVE) return;

      const nova = this.carregar();
      if (SessaoService.ehMesmaIdentidade(this.estado(), nova)) {
        this.estado.set(nova);
        return;
      }

      // A identidade nova **não** é adotada aqui de propósito: se o recarregamento não acontecer,
      // a aba continua coerente com quem ela era — o comportamento de antes deste listener — em
      // vez de misturar as duas pessoas. E seguir como quem saiu se cura sozinho: o refresh
      // daquela sessão foi revogado, então a próxima chamada cai no 401 e no `EncerramentoService`.
      this.recarregarPagina();
    };

    window.addEventListener('storage', aoMudarOStorage);
    // O service é `root` e vive o quanto a aplicação vive, então na prática isto nunca dispara.
    // Mas um ouvinte sem remoção **vaza no TestBed**: cada injector novo pendura mais um no MESMO
    // `window`, e um único evento acaba atendido por todas as instâncias já criadas na suíte.
    inject(DestroyRef).onDestroy(() => window.removeEventListener('storage', aoMudarOStorage));
  }

  /**
   * É a mesma pessoa, só com um token novo?
   *
   * Sem sessão **aqui** não há cache de ninguém para vazar — quem saiu nesta aba já passou pelo
   * `EncerramentoService` —, então adotar a sessão de lá é seguro, e é o que faz uma aba parada no
   * `/login` acompanhar quem entrou na outra. O papel entra na comparação junto com o id porque é
   * ele que decide o shell: divergir nele é identidade diferente, mesmo com o id igual.
   */
  private static ehMesmaIdentidade(atual: Sessao | null, nova: Sessao | null): boolean {
    if (!nova) return false;
    if (!atual) return true;
    return atual.usuarioId === nova.usuarioId && atual.papel === nova.papel;
  }

  /** Num método só para o teste poder observá-lo: o jsdom não implementa navegação. */
  protected recarregarPagina(): void {
    window.location.reload();
  }

  /** O token já venceu (ou vence nos próximos instantes)? */
  expirado(): boolean {
    const atual = this.estado();
    if (!atual) return true;
    const vence = Date.parse(atual.expiraEm);
    // Data ilegível é tratada como vencida: melhor renovar à toa do que confiar num token morto.
    if (Number.isNaN(vence)) return true;
    return vence - FOLGA_DE_EXPIRACAO_MS <= Date.now();
  }

  /** Entra: guarda a sessão inteira, recém-vinda do login. */
  abrir(sessao: Sessao): void {
    this.estado.set(sessao);
    this.persistir();
  }

  /** Troca só o par token/validade, preservando quem eu sou — o que a renovação devolve. */
  renovarToken(token: string, expiraEm: string): void {
    const atual = this.estado();
    if (!atual) return;
    this.estado.set({ ...atual, token, expiraEm });
    this.persistir();
  }

  /** O nome chega depois do token: o `/auth/me` é uma segunda ida ao servidor. */
  definirNome(nome: string): void {
    const atual = this.estado();
    if (!atual || !nome.trim()) return;
    this.estado.set({ ...atual, nome: nome.trim() });
    this.persistir();
  }

  /** Esquece a sessão. Quem limpa os caches das telas é o `EncerramentoService`. */
  encerrar(): void {
    this.estado.set(null);
    if (!this.temStorage()) return;
    try {
      localStorage.removeItem(SessaoService.CHAVE);
    } catch {
      // Navegação privada pode recusar a escrita; o estado em memória já foi limpo.
    }
  }

  private persistir(): void {
    if (!this.temStorage()) return;
    const atual = this.estado();
    try {
      if (atual) localStorage.setItem(SessaoService.CHAVE, JSON.stringify(atual));
    } catch {
      // Sem storage a sessão vale só para esta aba, e o F5 cai no /login. Não é motivo para falhar.
    }
  }

  private carregar(): Sessao | null {
    if (!this.temStorage()) return null;
    try {
      const bruto = localStorage.getItem(SessaoService.CHAVE);
      if (!bruto) return null;
      return SessaoService.validar(JSON.parse(bruto));
    } catch {
      return null;
    }
  }

  /**
   * O que veio do `localStorage` é entrada, não estado confiável: qualquer um edita.
   *
   * Sessão meia-boca (sem token, com papel inventado) é tratada como ausência de sessão — vai
   * para o `/login` em vez de montar o shell do papel errado e colher 401 em cada tela.
   */
  private static validar(bruto: unknown): Sessao | null {
    if (typeof bruto !== 'object' || bruto === null) return null;
    const c = bruto as Record<string, unknown>;
    const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

    const token = texto(c['token']);
    const expiraEm = texto(c['expiraEm']);
    const usuarioId = texto(c['usuarioId']);
    const papel = c['papel'];
    if (!token || !expiraEm || !usuarioId) return null;
    if (papel !== 'PRODUTOR' && papel !== 'CONTADOR') return null;

    return { token, expiraEm, usuarioId, papel, nome: texto(c['nome']) ?? '' };
  }

  private temStorage(): boolean {
    return typeof localStorage !== 'undefined';
  }
}
