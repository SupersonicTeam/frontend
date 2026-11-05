import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LucideLoaderCircle, LucideUserPlus } from '@lucide/angular';
import { ToastService } from '@core/services/toast.service';
import { criarCampoCpfCnpj } from '@core/utils/campo-cpf-cnpj';
import { AuthApi, ContaError, type CadastroRequest } from '@services/auth/data-access/auth.service';
import type { Papel } from '@core/services/sessao.service';

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
  /**
   * O documento (#156): julgado só depois que a pessoa sai do campo com algo escrito, ou tenta
   * enviar, e com o dígito verificador conferido aqui — antes um CPF como `123.456.789-00` passava,
   * e só o servidor recusava, com a frase sem acento no topo. A regra mora em `criarCampoCpfCnpj`.
   */
  readonly documento = criarCampoCpfCnpj();
  readonly cpfCnpj = this.documento.valor;
  readonly email = signal('');
  readonly senha = signal('');

  readonly enviando = signal(false);
  /** Erro geral (conflito, 429, servidor). O de senha tem lugar próprio, junto do campo. */
  readonly erro = signal<string | null>(null);
  readonly erroSenha = signal<string | null>(null);

  private readonly campoDocumento = viewChild<ElementRef<HTMLInputElement>>('campoDocumento');
  readonly erroDocumento = this.documento.erro;

  /**
   * O botão só libera com os campos cheios. O documento é conferido no `criar()`, que marca o
   * campo e põe o foco nele: um botão desligado não diria o que está errado.
   *
   * A **força** da senha não é checada aqui: quem decide é o backend, que conhece a lista de senhas
   * comuns e sabe se ela contém o e-mail ou o documento. Reimplementar essa regra no cliente daria
   * duas verdades, e a do cliente envelheceria primeiro.
   */
  readonly podeEnviar = computed(
    () =>
      !this.enviando() &&
      this.nome().trim().length > 0 &&
      this.cpfCnpj().trim().length > 0 &&
      this.email().trim().length > 0 &&
      this.senha().length > 0,
  );

  criar(): void {
    if (!this.podeEnviar()) return;
    // `conferir()` também limpa a frase de documento de uma tentativa anterior.
    if (!this.documento.conferir()) {
      this.campoDocumento()?.nativeElement.focus();
      return;
    }

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
    // O `@ValidCpfCnpj` do backend responde "CPF/CNPJ informado tem digito verificador invalido",
    // sem acento e no topo. Com o campo marcado, a nossa frase diz o mesmo no lugar certo.
    if (falha?.campo === 'cpfCnpj') {
      this.documento.recusadoPeloServidor();
      this.campoDocumento()?.nativeElement.focus();
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
