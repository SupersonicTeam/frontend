import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { LucideLoaderCircle, LucideMailCheck, LucideSend } from '@lucide/angular';
import { AuthApi } from '@services/auth/data-access/auth.service';

/**
 * Pedir o link de redefinição (issue #131).
 *
 * **A resposta é sempre a mesma**, exista a conta ou não — medido nos dois casos: `202` em ambos.
 * É deliberado do backend, e a tela precisa acompanhar: dizer "não encontramos esse e-mail"
 * contaria a quem perguntasse quais endereços têm conta aqui. Por isso não há caminho de erro
 * "e-mail não existe", e o estado de sucesso é o mesmo para todo mundo.
 */
@Component({
  selector: 'app-esqueci-senha',
  standalone: true,
  imports: [FormsModule, RouterLink, LucideSend, LucideLoaderCircle, LucideMailCheck],
  templateUrl: './esqueci-senha.html',
})
export class EsqueciSenhaPage {
  private readonly auth = inject(AuthApi);

  readonly email = signal('');
  readonly enviando = signal(false);
  /** Depois do envio a tela troca de estado: o formulário sai e o aviso fica. */
  readonly pedido = signal(false);
  readonly erro = signal<string | null>(null);

  readonly podeEnviar = computed(() => !this.enviando() && this.email().trim().length > 0);

  pedir(): void {
    if (!this.podeEnviar()) return;

    this.enviando.set(true);
    this.erro.set(null);

    this.auth.esqueciSenha(this.email()).subscribe({
      next: () => {
        this.enviando.set(false);
        this.pedido.set(true);
      },
      error: (falha: { status?: number; message?: string }) => {
        this.enviando.set(false);
        // Só rede ou servidor fora do ar chegam aqui — "conta não existe" responde 202.
        this.erro.set(
          falha?.status === 0
            ? 'Sem conexão com o servidor. Verifique sua rede e tente de novo.'
            : falha?.message || 'Não foi possível pedir o link agora.',
        );
      },
    });
  }
}
