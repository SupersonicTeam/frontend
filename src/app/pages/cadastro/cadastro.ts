import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideLoaderCircle, LucideUserPlus } from '@lucide/angular';
import { ToastService } from '@core/services/toast.service';
import { aplicarMascara, mascaraCpfCnpj, soDigitos } from '@core/utils/mascaras';
import { AuthApi, ContaError, type CadastroRequest } from '@services/auth/data-access/auth.service';
import type { Papel } from '@core/services/sessao.service';

/** CPF tem 11 dígitos, CNPJ tem 14 — o backend recusa qualquer outro tamanho. */
const TAMANHOS_VALIDOS = [11, 14];

/**
 * Criar conta (issue #131).
 *
 * Até aqui, conta só nascia por `curl`: o login da #93 deixava entrar quem já tinha uma, e mais
 * ninguém. Com o basic auth do Caddy fora do ar, esta tela passa a ser a porta de quem chega.
 *
 * **O papel é escolhido aqui, e só aqui.** Depois do cadastro ele vem no token e a interface se
 * decide sozinha — é a diferença para o "login de sabor" da #23, onde a escolha era cosmética e
 * durava uma sessão.
 */
@Component({
  selector: 'app-cadastro',
  standalone: true,
  imports: [FormsModule, RouterLink, LucideUserPlus, LucideLoaderCircle],
  templateUrl: './cadastro.html',
})
export class CadastroPage {
  private readonly auth = inject(AuthApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly papel = signal<Papel>('PRODUTOR');
  readonly nome = signal('');
  readonly cpfCnpj = signal('');
  readonly email = signal('');
  readonly senha = signal('');

  readonly enviando = signal(false);
  /** Erro geral (conflito, 429, servidor). O de senha tem lugar próprio, junto do campo. */
  readonly erro = signal<string | null>(null);
  readonly erroSenha = signal<string | null>(null);

  readonly documentoValido = computed(() =>
    TAMANHOS_VALIDOS.includes(soDigitos(this.cpfCnpj()).length),
  );

  /**
   * O botão só libera com os campos cheios e o documento no tamanho certo.
   *
   * A **força** da senha não é checada aqui: quem decide é o backend, que conhece a lista de senhas
   * comuns e sabe se ela contém o e-mail ou o documento. Reimplementar essa regra no cliente daria
   * duas verdades, e a do cliente envelheceria primeiro.
   */
  readonly podeEnviar = computed(
    () =>
      !this.enviando() &&
      this.nome().trim().length > 0 &&
      this.documentoValido() &&
      this.email().trim().length > 0 &&
      this.senha().length > 0,
  );

  /** Máscara sem perder o cursor (#102); o envio segue cru. */
  aoDigitarDocumento(evento: Event): void {
    this.cpfCnpj.set(aplicarMascara(evento, mascaraCpfCnpj));
  }

  criar(): void {
    if (!this.podeEnviar()) return;

    this.enviando.set(true);
    this.erro.set(null);
    this.erroSenha.set(null);

    const dados: CadastroRequest = {
      papel: this.papel(),
      nomeCompleto: this.nome().trim(),
      cpfCnpj: this.cpfCnpj(),
      email: this.email().trim(),
      senha: this.senha(),
    };

    this.auth.cadastrar(dados).subscribe({
      next: () => {
        this.enviando.set(false);
        // O cadastro **não** devolve token: quem acabou de criar a conta ainda precisa entrar.
        this.toast.success('Conta criada. Entre com o seu e-mail e a sua senha.');
        void this.router.navigateByUrl('/login');
      },
      error: (falha: ContaError) => {
        this.enviando.set(false);
        this.mostrar(falha);
      },
    });
  }

  /**
   * Onde cada erro aparece.
   *
   * A mensagem vem do servidor e é usada como está: ela distingue os três motivos de senha fraca
   * ("pelo menos 10 caracteres", "não pode conter seu e-mail nem seu CPF/CNPJ", "está entre as mais
   * usadas"), e reescrever aqui perderia essa precisão.
   *
   * O **conflito não diz qual** dos dois repetiu, de propósito — responder "este e-mail já existe"
   * contaria a um estranho quem tem conta. A tela também não tenta adivinhar.
   */
  private mostrar(falha: ContaError): void {
    if (falha?.codigo === 'SENHA_FRACA' || falha?.campo === 'senha') {
      this.erroSenha.set(falha.message);
      return;
    }
    if (falha?.codigo === 'MUITAS_TENTATIVAS') {
      const espera = falha.retryAfterSegundos;
      const quando = espera ? ` Tente em ${Math.ceil(espera / 60)} min.` : '';
      this.erro.set(`Muitas tentativas seguidas.${quando}`);
      return;
    }
    if (falha?.status === 0) {
      this.erro.set('Sem conexão com o servidor. Verifique sua rede e tente de novo.');
      return;
    }
    this.erro.set(falha?.message || 'Não foi possível criar a conta.');
  }
}
