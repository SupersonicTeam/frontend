import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideKeyRound, LucideLoaderCircle } from '@lucide/angular';
import { ToastService } from '@core/services/toast.service';
import { AuthApi, ContaError } from '@services/auth/data-access/auth.service';

/**
 * Criar a senha nova pelo link do e-mail (issue #131).
 *
 * ## O token vem no fragmento, e isso não é detalhe
 *
 * O backend monta o link como `…/redefinir-senha#token=…` — **no fragmento**, não em query. A
 * diferença importa: o fragmento **não é enviado ao servidor** em requisição nenhuma, não entra em
 * log de acesso nem em cabeçalho `Referer`, e não vai parar no histórico que um proxy enxerga. Um
 * token de redefinição em `?token=` vazaria por qualquer um desses caminhos.
 *
 * Por isso ele é lido de `location.hash`, nunca de `queryParams`, e **não é escrito em log** nem
 * exibido na tela.
 */
@Component({
  selector: 'app-redefinir-senha',
  standalone: true,
  imports: [FormsModule, RouterLink, LucideKeyRound, LucideLoaderCircle],
  templateUrl: './redefinir-senha.html',
})
export class RedefinirSenhaPage {
  private readonly auth = inject(AuthApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  /** Lido uma vez, na abertura. */
  private readonly token = signal(RedefinirSenhaPage.tokenDoFragmento());

  readonly temToken = computed(() => this.token().length > 0);

  readonly senha = signal('');
  readonly enviando = signal(false);
  readonly erroSenha = signal<string | null>(null);
  /** Link inválido, vencido ou já usado: aí o caminho é pedir outro, não tentar de novo. */
  readonly linkInvalido = signal(false);
  readonly erro = signal<string | null>(null);

  readonly podeEnviar = computed(
    () => !this.enviando() && this.temToken() && !this.linkInvalido() && this.senha().length > 0,
  );

  redefinir(): void {
    if (!this.podeEnviar()) return;

    this.enviando.set(true);
    this.erroSenha.set(null);
    this.erro.set(null);

    this.auth.redefinirSenha(this.token(), this.senha()).subscribe({
      next: () => {
        this.enviando.set(false);
        // O 204 encerra TODAS as sessões e apaga o cookie: a pessoa entra de novo com a senha nova.
        this.toast.success('Senha alterada. Entre com a senha nova.');
        void this.router.navigateByUrl('/login');
      },
      error: (falha: ContaError) => {
        this.enviando.set(false);
        if (falha?.codigo === 'TOKEN_REDEFINICAO_INVALIDO') {
          // O link morreu; insistir com a mesma senha não muda nada.
          this.linkInvalido.set(true);
          return;
        }
        if (falha?.codigo === 'SENHA_FRACA' || falha?.campo === 'senha') {
          // O link **continua valendo**: é só a senha que não serve.
          this.erroSenha.set(falha.message);
          return;
        }
        this.erro.set(
          falha?.status === 0
            ? 'Sem conexão com o servidor. Verifique sua rede e tente de novo.'
            : falha?.message || 'Não foi possível redefinir a senha.',
        );
      },
    });
  }

  /**
   * O token do `#token=…`.
   *
   * Aceita o fragmento com mais de um par (`#a=1&token=…`), porque quem monta o link é o servidor e
   * o formato dele pode crescer. Sem fragmento, devolve vazio e a tela diz que o link está
   * incompleto — melhor do que um formulário que só falharia no envio.
   */
  private static tokenDoFragmento(): string {
    if (typeof location === 'undefined') return '';
    const bruto = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash;
    return new URLSearchParams(bruto).get('token')?.trim() ?? '';
  }
}
