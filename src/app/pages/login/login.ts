import { Location } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideLoaderCircle, LucideLogIn } from '@lucide/angular';
import { SessaoService } from '@core/services/sessao.service';
import { AuthApi } from '@services/auth/data-access/auth.service';
import { ApiErrorEnvelope } from '@dtos/shared/responses/api-error.response';
import { EscritorioDoHostService } from '@core/services/escritorio-do-host.service';
import { DOMINIO_BASE, LOCALIZACAO_ATUAL, urlDoHost } from '@core/utils/host-escritorio';

/**
 * Entrar no app (issue #93).
 *
 * Isto era o "login de sabor" da #23: dois botões, sem senha, que só escolhiam de qual papel ver a
 * interface. Funcionava contra o profile `dev` do backend, que aceita o header `X-Usuario-Id` sem
 * token — e **só ele**. No app publicado, a primeira chamada de qualquer tela respondia 401
 * `NAO_AUTENTICADO` e a demonstração parava aqui.
 *
 * O papel não é mais escolhido: ele vem no token. Quem entra com conta de contador vê as telas do
 * contador porque o servidor disse que é um contador, não porque clicou no cartão do contador.
 *
 * ## No endereço do escritório (#175)
 *
 * Com o host resolvido como escritório, a tela leva a marca dele ("Entrar em {nome}", o monograma
 * e a assinatura "com AgroConIA"), o corpo do login leva o `escritorio` e some o "Criar conta". No
 * 401 aparece uma dica **fixa** para produtor e membro de outro escritório entrarem por www: é o
 * mesmo texto para qualquer credencial, então não revela nada. O nome entra só por interpolação.
 */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink, LucideLogIn, LucideLoaderCircle],
  templateUrl: './login.html',
})
export class LoginPage {
  private readonly auth = inject(AuthApi);
  private readonly sessao = inject(SessaoService);
  private readonly router = inject(Router);
  private readonly rota = inject(ActivatedRoute);
  private readonly host = inject(EscritorioDoHostService);
  private readonly localizacao = inject(LOCALIZACAO_ATUAL);
  private readonly base = inject(DOMINIO_BASE);

  /** O escritório do endereço, no modo escritório; `null` no host principal. */
  readonly escritorio = computed(() =>
    this.host.modo() === 'escritorio' ? this.host.escritorio() : null,
  );
  /** "CR" de "Contabilidade Rural Oeste": o monograma (o contrato não tem logo do escritório). */
  readonly monograma = computed(() => {
    const palavras = (this.escritorio()?.nome ?? '')
      .split(/\s+/)
      .filter((p) => p.length > 2 || /^[A-ZÀ-Ú]/.test(p));
    return palavras
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join('');
  });
  /** O endereço principal, montado pelo `urlDoHost`, para a dica e o link do produtor. */
  readonly www = computed(() =>
    urlDoHost(null, this.base, {
      protocolo: this.localizacao.protocolo,
      porta: this.localizacao.porta,
    }),
  );
  readonly hostWww = computed(() => this.www().replace(/^[a-z]+:\/\//, ''));
  /** O último erro foi um 401: no modo escritório, a dica para entrar por www aparece. */
  readonly foi401 = signal(false);
  /**
   * Uma frase deixada por quem encerrou a sessão (`EncerramentoService.encerrar(_, aviso)`), no
   * `state` da navegação: "Este endereço não é mais o do seu escritório...".
   */
  readonly aviso = signal<string | null>(LoginPage.avisoDoEstado(inject(Location).getState()));

  readonly email = signal('');
  readonly senha = signal('');
  readonly enviando = signal(false);
  readonly erro = signal<string | null>(null);

  readonly podeEnviar = computed(
    () => !this.enviando() && this.email().trim().length > 0 && this.senha().length > 0,
  );

  entrar(): void {
    if (!this.podeEnviar()) return;

    this.enviando.set(true);
    this.erro.set(null);
    this.foi401.set(false);

    this.auth.entrar(this.email(), this.senha(), this.escritorio()?.slug).subscribe({
      next: () => {
        this.enviando.set(false);
        void this.router.navigateByUrl(this.destino());
      },
      error: (falha: unknown) => {
        this.enviando.set(false);
        this.erro.set(LoginPage.mensagemDaFalha(falha));
        this.foi401.set((falha as HttpErrorResponse)?.status === 401);
      },
    });
  }

  /**
   * Para onde ir depois de entrar.
   *
   * O `returnUrl` que o `sessaoGuard` anexou devolve a pessoa ao endereço que ela pediu. Só
   * caminhos **internos** são aceitos: um `returnUrl` é query string, qualquer um o escreve, e sem
   * esta checagem o formulário de login viraria um redirecionador para fora do site — o jeito
   * clássico de usar uma tela de login confiável para levar a uma falsa. `//` barra o protocolo
   * relativo (`//site.externo`), que o navegador trata como absoluto.
   *
   * Sem `returnUrl`, a primeira tela do papel que o token declarou.
   */
  private destino(): string {
    const pedido = this.rota.snapshot.queryParamMap.get('returnUrl');
    const interno = !!pedido && pedido.startsWith('/') && !pedido.startsWith('//');
    if (interno && pedido !== '/login') return pedido;
    return this.sessao.homeDoPerfil();
  }

  /**
   * O que a tela diz quando o login não passa.
   *
   * Ramifica pelo `code` do envelope `ApiError`, não pelo texto: `CREDENCIAIS_INVALIDAS` é a mesma
   * resposta para e-mail sem conta, senha errada e conta desativada — de propósito, para a tela
   * não revelar quem é cliente. A mensagem do backend já é escrita para o usuário final e inclui o
   * aviso de bloqueio por tentativas, então ela é usada como está; o `switch` existe para separar
   * o que é credencial do que é servidor fora do ar, que não é culpa de quem digitou.
   */
  private static avisoDoEstado(estado: unknown): string | null {
    const aviso = (estado as { aviso?: unknown } | null)?.aviso;
    return typeof aviso === 'string' && aviso.trim() ? aviso : null;
  }

  private static mensagemDaFalha(falha: unknown): string {
    const erro = falha as HttpErrorResponse;
    if (erro?.status === 0) {
      return 'Sem conexão com o servidor. Verifique sua rede e tente de novo.';
    }

    const envelope = erro?.error as ApiErrorEnvelope | undefined;
    const codigo = envelope?.errors?.[0]?.code;

    if (codigo === 'CREDENCIAIS_INVALIDAS' || erro?.status === 401) {
      return envelope?.errors?.[0]?.message ?? 'E-mail ou senha incorretos.';
    }
    if (erro?.status >= 500) {
      return 'O servidor não respondeu agora. Tente de novo em instantes.';
    }
    return envelope?.message ?? 'Não foi possível entrar. Tente de novo.';
  }
}
