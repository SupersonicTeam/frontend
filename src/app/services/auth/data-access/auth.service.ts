import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError, finalize, map, shareReplay, switchMap, tap } from 'rxjs';
import { skipErrorNotify } from '@core/interceptors/error-notify.context';
import { ApiService } from '@core/services/api.service';
import { SessaoService, type Papel, type Sessao } from '@core/services/sessao.service';
import { soDigitos } from '@core/utils/mascaras';
import type { ApiErrorEnvelope } from '@dtos/shared/responses/api-error.response';

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

/** O corpo de `POST /api/auth/cadastro`. */
export interface CadastroRequest {
  papel: Papel;
  nomeCompleto: string;
  /** **Só dígitos**, com DV válido — 11 (CPF) ou 14 (CNPJ). A máscara é da tela. */
  cpfCnpj: string;
  email: string;
  senha: string;
}

/** Os códigos de erro da conta, **medidos** contra a API local em 03/11. */
export type CodigoConta =
  | 'SENHA_FRACA'
  | 'CADASTRO_CONFLITO'
  | 'TOKEN_REDEFINICAO_INVALIDO'
  | 'SENHA_ATUAL_INCORRETA'
  | 'MUITAS_TENTATIVAS'
  | 'CONVITE_EQUIPE_INVALIDO'
  | 'DESCONHECIDO';

/**
 * Falha de conta já classificada, para a tela não ler `status` nem adivinhar texto.
 *
 * **A `mensagem` vem do servidor e é usada como está.** Medido: ele escreve para o usuário final e
 * distingue os três motivos de senha fraca ("pelo menos 10 caracteres", "não pode conter seu e-mail
 * nem seu CPF/CNPJ", "está entre as mais usadas"). Reescrever aqui só perderia precisão.
 *
 * O `campo` vem do `field` do envelope e diz **onde** marcar o erro: `senha`, `senhaAtual`, `token`.
 */
export class ContaError extends Error {
  constructor(
    readonly codigo: CodigoConta,
    readonly status: number,
    mensagem: string,
    readonly campo?: string,
    /** Segundos até poder tentar de novo — só no `MUITAS_TENTATIVAS`. */
    readonly retryAfterSegundos?: number,
  ) {
    super(mensagem);
    this.name = 'ContaError';
  }
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
  entrar(email: string, senha: string, escritorio?: string): Observable<Sessao> {
    // No endereço do escritório (#175) o corpo leva o slug; no principal continua exatamente
    // `{ email, senha }`, sem a chave (nem `undefined`): o backend recusa `escritorio` vindo de www.
    const corpo = escritorio
      ? { email: email.trim(), senha, escritorio }
      : { email: email.trim(), senha };
    return this.http.post<LoginResponse>('/auth/login', corpo, { withCredentials: true }).pipe(
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

  // ── Conta: criar, recuperar e trocar a senha (#131) ───────────────────────

  /**
   * Cria a conta. **Não devolve token** — o contrato manda ir ao login depois.
   *
   * O `cpfCnpj` sobe só com dígitos: a máscara existe para quem digita, não para a API.
   */
  cadastrar(dados: CadastroRequest): Observable<void> {
    return this.api
      .post<void>('/auth/cadastro', {
        ...dados,
        // Nome e e-mail vao aparados pela mesma razao do `entrar()`: teclado de celular costuma
        // acrescentar um espaco no fim, e um e-mail com espaco nao casa com nenhuma conta depois.
        nomeCompleto: dados.nomeCompleto.trim(),
        email: dados.email.trim(),
        // A mascara existe para quem digita; a API quer so os digitos.
        cpfCnpj: soDigitos(dados.cpfCnpj),
      })
      .pipe(AuthApi.traduzirFalhaDeConta<void>());
  }

  /**
   * `POST /auth/cadastro/equipe` — cria a conta de contador **pelo convite de equipe** (#148).
   *
   * Rota pública, como o cadastro comum. O e-mail não vai no corpo: é o do convite, que o token
   * identifica. Token inválido, usado ou vencido → 400 `CONVITE_EQUIPE_INVALIDO`. Não devolve
   * token: depois do cadastro, o contador entra pelo login, já membro da equipe.
   */
  cadastrarPorConvite(dados: {
    token: string;
    nomeCompleto: string;
    cpfCnpj: string;
    senha: string;
  }): Observable<void> {
    return this.api
      .post<void>('/auth/cadastro/equipe', {
        token: dados.token,
        nomeCompleto: dados.nomeCompleto.trim(),
        cpfCnpj: soDigitos(dados.cpfCnpj),
        senha: dados.senha,
      })
      .pipe(AuthApi.traduzirFalhaDeConta<void>());
  }

  /**
   * Pede o link de redefinição.
   *
   * **Responde 202 sempre**, exista a conta ou não — medido nos dois casos. É deliberado: a
   * resposta não pode dizer quem é cliente. A tela, portanto, mostra a mesma mensagem sempre, e
   * tratar isso como "deu certo" é o comportamento correto, não uma simplificação.
   */
  esqueciSenha(email: string): Observable<void> {
    return this.api
      .post<void>('/auth/senha/esqueci', { email: email.trim() })
      .pipe(AuthApi.traduzirFalhaDeConta<void>());
  }

  /**
   * Redefine a senha com o token do link.
   *
   * O 204 **encerra todas as sessões** e apaga o cookie: quem redefine entra de novo com a senha
   * nova. Como esta rota é pública e a pessoa nem está logada, não há sessão local a limpar.
   */
  redefinirSenha(token: string, novaSenha: string): Observable<void> {
    return this.api
      .post<void>('/auth/senha/redefinir', { token, novaSenha })
      .pipe(AuthApi.traduzirFalhaDeConta<void>());
  }

  /**
   * Troca a senha de quem está logado.
   *
   * O 204 encerra **todas** as sessões, **inclusive a desta requisição** — então quem chama tem de
   * passar pelo `EncerramentoService` em seguida. Continuar na tela com um token que o servidor já
   * invalidou daria 401 na próxima chamada, sem a pessoa entender por quê.
   */
  alterarSenha(senhaAtual: string, novaSenha: string): Observable<void> {
    return this.api
      .post<void>('/auth/senha/alterar', { senhaAtual, novaSenha })
      .pipe(AuthApi.traduzirFalhaDeConta<void>());
  }

  /**
   * `DELETE /api/usuarios/{id}/dados` — o titular exclui a própria conta (LGPD, #137).
   *
   * **Anonimiza, não apaga tudo:** nome, contato e endereço somem; CPF/CNPJ, IE e UF ficam pela
   * guarda fiscal de 5 anos. Responde 204 e encerra todas as sessões — quem chama faz o mesmo
   * encerramento local do `logout-todos`. O `id` é o da sessão (id de outro → 404). Senha errada →
   * 400 `SENHA_ATUAL_INCORRETA`; tentativas demais seguem a regra do login.
   */
  excluirMinhaConta(senha: string): Observable<void> {
    const id = this.sessaoService.usuarioId();
    // Sem id na sessao nao ha a quem excluir: falha aqui, como o 404 do servidor falharia.
    if (!id) {
      return throwError(
        () => new ContaError('DESCONHECIDO', 404, 'Não foi possível identificar a sua conta.'),
      );
    }
    return (
      this.http
        // Sem toast global: a secao de privacidade mostra cada falha junto do campo de senha.
        .request<void>('DELETE', `/usuarios/${id}/dados`, {
          body: { senha },
          context: skipErrorNotify(),
        })
        .pipe(AuthApi.traduzirFalhaDeConta<void>())
    );
  }

  /** Sai de todos os dispositivos. Mesma consequência do `alterarSenha`: a sessão atual cai junto. */
  sairDeTodosOsDispositivos(): Observable<void> {
    return this.api
      .post<void>('/auth/logout-todos', null)
      .pipe(AuthApi.traduzirFalhaDeConta<void>());
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

  /** Transforma o `HttpErrorResponse` em `ContaError`, com o código e o campo do envelope. */
  private static traduzirFalhaDeConta<T>() {
    return (fonte: Observable<T>): Observable<T> =>
      new Observable<T>((inscrito) =>
        fonte.subscribe({
          next: (v) => inscrito.next(v),
          complete: () => inscrito.complete(),
          error: (erro: unknown) => inscrito.error(AuthApi.classificarConta(erro)),
        }),
      );
  }

  private static classificarConta(erro: unknown): ContaError {
    const falha = erro as HttpErrorResponse;
    const envelope = falha?.error as ApiErrorEnvelope | undefined;
    const primeiro = envelope?.errors?.[0];
    const mensagem = primeiro?.message ?? envelope?.message ?? 'Não foi possível concluir.';
    const campo = primeiro?.field;

    const conhecidos: CodigoConta[] = [
      'SENHA_FRACA',
      'CADASTRO_CONFLITO',
      'TOKEN_REDEFINICAO_INVALIDO',
      'SENHA_ATUAL_INCORRETA',
      'MUITAS_TENTATIVAS',
      'CONVITE_EQUIPE_INVALIDO',
    ];
    const codigo = conhecidos.find((c) => c === primeiro?.code) ?? 'DESCONHECIDO';

    const bruto = falha?.headers?.get?.('Retry-After');
    const segundos = bruto ? Number(bruto) : undefined;

    return new ContaError(
      codigo,
      falha?.status ?? 0,
      mensagem,
      campo,
      Number.isFinite(segundos) ? segundos : undefined,
    );
  }
}
