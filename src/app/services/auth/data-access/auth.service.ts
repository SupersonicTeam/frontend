import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { type Observable, of } from 'rxjs';
import { catchError, finalize, map, shareReplay, switchMap, tap } from 'rxjs';
import { ApiService } from '@core/services/api.service';
import { SessaoService, type Papel, type Sessao } from '@core/services/sessao.service';

/** `POST /api/auth/login` e `POST /api/auth/refresh` devolvem o mesmo corpo (`LoginResponse`). */
export interface LoginResponse {
  accessToken: string;
  tokenType: string;
  /** ISO-8601 em UTC. Medido: 15 minutos depois da emissão. */
  expiraEm: string;
  papel: Papel;
  usuarioId: string;
}

/** `GET /api/auth/me` (`UsuarioLogadoResponse`) — quem o **servidor** diz que eu sou. */
export interface SessaoAtual {
  usuarioId: string;
  papel: Papel;
  nome: string;
}

/**
 * O cliente de `/api/auth`: entrar, renovar, sair e conferir a identidade (issue #93).
 *
 * ## Por que o `HttpClient` direto, e não o `ApiService`
 *
 * O refresh token mora num cookie **HttpOnly** (`agro_refresh`, `Path=/api/auth`, `SameSite=Strict`
 * — medido no `Set-Cookie` do login em 30/10). JavaScript não o lê nem o escreve: quem o manda é o
 * navegador, e só se a requisição pedir credenciais. `ApiService` não expõe `withCredentials`, e
 * acrescentá-lo lá o ofereceria a **toda** chamada, que não precisa dele. Então as três rotas que
 * dependem do cookie falam com o `HttpClient` na mão.
 *
 * A URL segue relativa (`/auth/login`): o `apiInterceptor` prefixa a baseURL como em todo o resto.
 */
@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly api = inject(ApiService);
  private readonly http = inject(HttpClient);
  private readonly sessaoService = inject(SessaoService);

  private renovacaoEmVoo: Observable<string> | null = null;
  private meEmVoo: Observable<SessaoAtual> | null = null;

  /**
   * Entra com e-mail e senha.
   *
   * São **duas** idas ao servidor porque o contrato as separa: o `LoginResponse` traz o token, o
   * papel e o id, mas **não traz o nome** — e a topbar precisa dele. O `GET /auth/me` é a rota que
   * o próprio contrato indica para "conferir o token na abertura", então ela serve às duas coisas:
   * confirma que o token recém-emitido vale e devolve o nome.
   *
   * A sessão é aberta **antes** do `/auth/me` de propósito: é o token guardado que autentica essa
   * segunda chamada. Se ela falhar, a sessão continua de pé sem o nome (a topbar cai no rótulo do
   * papel) em vez de recusar um login que deu certo.
   */
  entrar(email: string, senha: string): Observable<Sessao> {
    return this.http
      .post<LoginResponse>('/auth/login', { email: email.trim(), senha }, { withCredentials: true })
      .pipe(
        map((r) => this.aoAutenticar(r)),
        switchMap((sessao) =>
          this.buscarMe().pipe(
            map(() => this.sessaoService.sessao() ?? sessao),
            catchError(() => of(sessao)),
          ),
        ),
      );
  }

  /**
   * Renova o access token pelo cookie de refresh — **uma renovação por vez**.
   *
   * A fila não é zelo: é o que o contrato exige. Medido contra a API local em 30/10, reusar um
   * refresh já trocado responde 401 `SESSAO_INVALIDA` **e encerra toda a linhagem daquele login**
   * — o cookie obtido na renovação anterior também passa a responder 401. Como o token vence para
   * todas as chamadas ao mesmo tempo, um painel que dispara seis requisições produz seis 401s
   * juntos; sem esta fila, seriam seis renovações, a primeira rotacionando o cookie e as outras
   * cinco reusando-o — e o usuário seria deslogado exatamente por termos tentado mantê-lo logado.
   *
   * Então todos os 401 simultâneos assinam a **mesma** requisição e esperam o mesmo token.
   */
  renovar(): Observable<string> {
    if (this.renovacaoEmVoo) return this.renovacaoEmVoo;

    this.renovacaoEmVoo = this.http
      .post<LoginResponse>('/auth/refresh', null, { withCredentials: true })
      .pipe(
        map((r) => this.aoRenovar(r)),
        finalize(() => (this.renovacaoEmVoo = null)),
        shareReplay({ bufferSize: 1, refCount: false }),
      );

    return this.renovacaoEmVoo;
  }

  /**
   * Revoga o refresh no servidor e apaga o cookie.
   *
   * **Nunca falha para quem chamou** (`catchError`): sair é um pedido do usuário, e servidor fora
   * do ar não é motivo para mantê-lo numa tela que ele mandou fechar. O access token em mãos segue
   * válido até vencer (no máximo 15 min) — o contrato diz que é o frontend que o descarta, e é o
   * que o `EncerramentoService` faz em seguida.
   */
  sair(): Observable<void> {
    return this.http
      .post<void>('/auth/logout', null, { withCredentials: true })
      .pipe(catchError(() => of(undefined as void)));
  }

  /**
   * Quem eu sou.
   *
   * Responde da sessão quando há uma: desde a #93 o id e o papel vêm do token, então perguntar ao
   * servidor o que já está em mãos seria uma ida à rede por chamada de tela. Sem sessão (ou antes
   * de o nome chegar), vai ao `/auth/me` — com chamadas simultâneas compartilhando a requisição.
   */
  carregar(): Observable<SessaoAtual> {
    const sessao = this.sessaoService.sessao();
    if (sessao?.nome) {
      return of({ usuarioId: sessao.usuarioId, papel: sessao.papel, nome: sessao.nome });
    }
    return this.buscarMe();
  }

  /**
   * Esquece quem eu era.
   *
   * O service é `root` e sobrevive à troca de usuário: sem isto, quem entra herda a identidade de
   * quem saiu. Ver `EncerramentoService`, que chama este e os outros caches.
   */
  limpar(): void {
    this.meEmVoo = null;
    this.renovacaoEmVoo = null;
  }

  /**
   * `GET /auth/me` de fato, compartilhado entre chamadas simultâneas.
   *
   * Grava o nome na sessão: é por isso que o `AppLayout` chama `carregar()` na abertura. A topbar
   * lê `SessaoService.nome()`, não a resposta desta chamada — sem o `definirNome` ela buscaria o
   * nome e o jogaria fora.
   */
  private buscarMe(): Observable<SessaoAtual> {
    if (this.meEmVoo) return this.meEmVoo;

    this.meEmVoo = this.api.get<SessaoAtual>('/auth/me').pipe(
      tap((me) => this.sessaoService.definirNome(me.nome)),
      finalize(() => (this.meEmVoo = null)),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.meEmVoo;
  }

  private aoAutenticar(r: LoginResponse): Sessao {
    const sessao: Sessao = {
      token: r.accessToken,
      expiraEm: r.expiraEm,
      usuarioId: r.usuarioId,
      papel: r.papel,
      nome: '',
    };
    this.sessaoService.abrir(sessao);
    return sessao;
  }

  private aoRenovar(r: LoginResponse): string {
    this.sessaoService.renovarToken(r.accessToken, r.expiraEm);
    return r.accessToken;
  }
}
