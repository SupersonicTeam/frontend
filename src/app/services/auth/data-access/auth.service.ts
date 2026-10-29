import { Injectable, inject, signal } from '@angular/core';
import { type Observable, of } from 'rxjs';
import { finalize, shareReplay, tap } from 'rxjs';
import { ApiService } from '@core/services/api.service';

/** Quem o **servidor** diz que eu sou. */
export interface SessaoAtual {
  /** O id do produtor ou do contador autenticado — o mesmo que as rotas por id esperam. */
  usuarioId: string;
  papel: 'PRODUTOR' | 'CONTADOR';
  nome: string;
}

/**
 * `GET /api/auth/me` — a identidade resolvida pelo servidor (issue #106).
 *
 * ## Por que isto existe, e por que não precisou esperar o JWT
 *
 * Quatro telas do produtor passavam `LOGGED_PRODUCER_ID` — um UUID **cravado no código** — para
 * `getVencimentos`, `getGuias` e `notificarProximasObrigacoes`. O próprio arquivo da constante
 * avisa que ela só vale enquanto o banco não for recriado, e que um id errado faz o backend
 * responder erro em **toda** chamada.
 *
 * Eu tratei isso três vezes como "só o JWT da #93 resolve". **Estava errado.** Medido contra a API
 * local em 29/10: `GET /api/auth/me` **já existe e responde 200**, devolvendo exatamente os ids
 * que estavam cravados:
 *
 *     produtor → { usuarioId: 'aaee3cd4-…', papel: 'PRODUTOR', nome: 'João da Silva Produtor' }
 *     contador → { usuarioId: 'e57e0c42-…', papel: 'CONTADOR', nome: 'Escritorio … Campo Certo' }
 *
 * Então o id do próprio usuário é descobrível em tempo de execução, e nenhum UUID precisa morar no
 * código do cliente.
 *
 * ## O que isto **não** é
 *
 * Não é autenticação, e não substitui a #93. O papel que a interface usa continua vindo da escolha
 * na tela de entrada (`PerfilService`), e o header `X-Usuario-Id` continua sendo montado pelo
 * `IdentidadeService`. O que muda é só isto: **o id deixa de ser constante e passa a ser resposta**.
 * Quando o JWT entrar, o `papel` daqui vira a fonte do papel também e o header some.
 *
 * Medido também: as rotas por id são **escopadas pela identidade**. Pedindo os vencimentos de
 * outro produtor com a minha identidade, o backend responde `404 Produtor não encontrado(a) para o
 * identificador` — não há vazamento entre produtores. O id no caminho precisa casar com quem eu
 * sou, e é por isso que cravá-lo é frágil, não perigoso.
 */
@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly api = inject(ApiService);

  private readonly sessaoSignal = signal<SessaoAtual | null>(null);
  /** A sessão já resolvida, ou `null` enquanto ninguém perguntou. */
  readonly sessao = this.sessaoSignal.asReadonly();

  private emVoo: Observable<SessaoAtual> | null = null;

  /**
   * Quem eu sou, resolvido uma vez por sessão.
   *
   * Chamadas simultâneas compartilham a mesma requisição: quatro telas pedindo o id ao mesmo tempo
   * não viram quatro `GET /auth/me`. Depois de resolvido, responde do cache sem ir ao servidor.
   */
  carregar(): Observable<SessaoAtual> {
    const emCache = this.sessaoSignal();
    if (emCache) return of(emCache);
    if (this.emVoo) return this.emVoo;

    this.emVoo = this.api.get<SessaoAtual>('/auth/me').pipe(
      tap((s) => this.sessaoSignal.set(s)),
      finalize(() => (this.emVoo = null)),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
    return this.emVoo;
  }

  /**
   * Esquece quem eu era. Chamado ao **sair**, pela mesma razão do `DashboardApi.limpar()`: o
   * service é `root` e sobrevive à troca de perfil, então sem isto quem entra herda a identidade
   * de quem saiu.
   */
  limpar(): void {
    this.sessaoSignal.set(null);
    this.emVoo = null;
  }
}
