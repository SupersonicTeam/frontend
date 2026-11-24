import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { SessaoService } from '@core/services/sessao.service';
import { EncerramentoService } from '@core/services/encerramento.service';
import { ClienteEmFocoService } from '@core/services/cliente-em-foco.service';
import { ToastService } from '@core/services/toast.service';
import { falhaDaApi } from '@core/utils/erro-api';
import type { ApiErrorEnvelope } from '@dtos/shared/responses/api-error.response';
import { criarCampoCpfCnpj } from '@core/utils/campo-cpf-cnpj';
import { soDigitos } from '@core/utils/mascaras';
import { AuthApi, ContaError } from '@services/auth/data-access/auth.service';

/** A `message` do envelope seguida da `suggestion`, quando o servidor mandou uma. */
function mensagemComSugestao(erro: HttpErrorResponse, mensagem: string): string {
  const sugestao = (erro.error as ApiErrorEnvelope | null)?.errors?.[0]?.suggestion?.trim();
  return sugestao && !mensagem.includes(sugestao) ? `${mensagem} ${sugestao}` : mensagem;
}

/** A frase do backend quando chega um CNPJ no documento de quem entra pelo convite (#186). */
const SO_CPF_NO_CONVITE =
  'Informe o seu CPF, com 11 dígitos: o documento do contador é o da pessoa. ' +
  'O CNPJ do escritório fica nos dados do escritório, na aba Equipe.';
import {
  CHAVE_TOKEN_CONVITE_EQUIPE,
  EscritorioApi,
} from '@services/escritorio/data-access/escritorio.service';
import { UiButton } from '@shared/ui/ui-button';

/** Guarda o token durante a ida ao login: o `returnUrl` não pode levar o fragmento. */
export const CHAVE_TOKEN_CONVITE = CHAVE_TOKEN_CONVITE_EQUIPE;

/**
 * `/equipe/convite#token=…` — a porta de entrada de quem foi convidado para a equipe (#148).
 *
 * Pública, como `/login` e `/cadastro` (#131): fora do `AppLayout` e sem guard, porque quem chega
 * pode ainda não ter conta. Três caminhos, conforme quem está aqui:
 *
 * - **contador logado** → entra na equipe com a conta dele (o e-mail precisa ser o do convite);
 * - **sem sessão** → cria a conta de contador pelo próprio link, ou vai ao login se já tem uma;
 * - **produtor logado** → o convite não é para esta conta; a tela explica e oferece sair.
 *
 * ## O token
 *
 * Vem no **fragmento**, como o de redefinir senha: não vai a log de servidor nem a `Referer`. Por
 * isso não pode ir no `returnUrl` do login, que é query string. Para atravessar o login ele fica
 * no `sessionStorage` da aba (some ao fechar) e é apagado quando o convite é usado.
 */
@Component({
  selector: 'app-equipe-convite',
  standalone: true,
  imports: [RouterLink, UiButton],
  templateUrl: './equipe-convite.html',
})
export class EquipeConvitePage {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthApi);
  private readonly escritorioApi = inject(EscritorioApi);
  private readonly encerramento = inject(EncerramentoService);
  private readonly clienteEmFoco = inject(ClienteEmFocoService);
  private readonly toast = inject(ToastService);
  protected readonly sessao = inject(SessaoService);

  private readonly token = signal(EquipeConvitePage.lerToken());
  readonly temToken = computed(() => this.token().length > 0);
  readonly linkInvalido = signal(false);

  readonly enviando = signal(false);
  readonly erro = signal<string | null>(null);

  // Cadastro
  readonly nome = signal('');
  /** Mesma regra do `/cadastro` (#156); este campo nem máscara tinha. */
  readonly documento = criarCampoCpfCnpj();
  readonly cpfCnpj = this.documento.valor;
  readonly senha = signal('');
  /** O mesmo aceite do `/cadastro` (#186): toda conta passa por ele. */
  readonly aceiteTermos = signal(false);
  readonly podeCadastrar = computed(
    () =>
      !this.enviando() &&
      this.nome().trim().length > 0 &&
      this.cpfCnpj().trim().length > 0 &&
      this.senha().length > 0 &&
      this.aceiteTermos(),
  );

  private readonly campoDocumento = viewChild<ElementRef<HTMLInputElement>>('campoDocumento');
  readonly erroDocumento = this.documento.erro;

  /** Contador logado: entra na equipe com a conta dele. */
  aceitar(): void {
    if (this.enviando() || !this.temToken()) return;
    this.enviando.set(true);
    this.erro.set(null);
    this.escritorioApi.aceitarConvite(this.token()).subscribe({
      next: () => {
        this.enviando.set(false);
        EquipeConvitePage.esquecerToken();
        // O cliente em foco era do escritório anterior.
        this.clienteEmFoco.limpar();
        this.toast.success('Pronto: você agora faz parte da equipe.');
        void this.router.navigateByUrl('/contador');
      },
      error: (erro: HttpErrorResponse) => {
        this.enviando.set(false);
        const falha = falhaDaApi(erro);
        if (falha.codigo === 'CONVITE_EQUIPE_INVALIDO') {
          this.linkInvalido.set(true);
          EquipeConvitePage.esquecerToken();
          return;
        }
        // O 409 `ESCRITORIO_ATUAL_EM_USO` tem **dois** motivos desde a backend#524: o escritório
        // atual tem clientes ou equipe, ou quem aceita é administrador de um empresarial (que não
        // entra em outra equipe nem sozinho). A frase fixa daqui só valia para o primeiro e
        // mandaria o administrador "encerrar os vínculos" à toa — quem sabe o motivo é o servidor.
        this.erro.set(mensagemComSugestao(erro, falha.mensagem));
      },
    });
  }

  /** Sem conta: cria a de contador pelo link. O e-mail é o do convite. */
  cadastrar(): void {
    if (!this.podeCadastrar()) return;
    if (!this.documento.conferir()) {
      this.campoDocumento()?.nativeElement.focus();
      return;
    }
    // Só CPF desde a #186: o documento do contador é o da pessoa, e o CNPJ do escritório fica
    // nos dados do escritório, na aba Equipe. O backend responde 400 com esta mesma frase.
    if (soDigitos(this.cpfCnpj()).length !== 11) {
      this.documento.erroServidor.set(SO_CPF_NO_CONVITE);
      this.campoDocumento()?.nativeElement.focus();
      return;
    }
    this.enviando.set(true);
    this.erro.set(null);
    this.auth
      .cadastrarPorConvite({
        token: this.token(),
        nomeCompleto: this.nome(),
        cpfCnpj: this.cpfCnpj(),
        senha: this.senha(),
        aceiteTermos: this.aceiteTermos(),
      })
      .subscribe({
        next: () => {
          this.enviando.set(false);
          EquipeConvitePage.esquecerToken();
          this.toast.success('Conta criada. Entre com o e-mail do convite e a senha que escolheu.');
          void this.router.navigateByUrl('/login');
        },
        error: (erro: ContaError) => {
          this.enviando.set(false);
          if (erro.codigo === 'CONVITE_EQUIPE_INVALIDO') {
            this.linkInvalido.set(true);
            EquipeConvitePage.esquecerToken();
            return;
          }
          if (erro.campo === 'cpfCnpj') {
            this.documento.recusadoPeloServidor();
            this.campoDocumento()?.nativeElement.focus();
            return;
          }
          this.erro.set(erro.message);
        },
      });
  }

  /** Já tem conta de contador: vai ao login e volta para cá, com o token guardado na aba. */
  irAoLogin(): void {
    void this.router.navigate(['/login'], { queryParams: { returnUrl: '/equipe/convite' } });
  }

  /** Produtor logado: o convite não é para esta conta. */
  sair(): void {
    this.encerramento.encerrar();
  }

  /**
   * O token do `#token=…`, ou o que ficou guardado na aba na ida ao login.
   *
   * Lido do fragmento, ele é guardado na aba: é o que permite ir ao login e voltar sem o perder.
   */
  private static lerToken(): string {
    if (typeof location === 'undefined') return '';
    const bruto = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash;
    const doLink = new URLSearchParams(bruto).get('token')?.trim() ?? '';
    try {
      if (doLink) {
        sessionStorage.setItem(CHAVE_TOKEN_CONVITE, doLink);
        // Lido, o token sai do endereco: nao fica na barra, num print ou no historico da aba.
        history.replaceState(history.state, '', location.pathname + location.search);
        return doLink;
      }
      return sessionStorage.getItem(CHAVE_TOKEN_CONVITE) ?? '';
    } catch {
      // Navegação privada pode recusar o storage: sem ele, vale só o link.
      return doLink;
    }
  }

  private static esquecerToken(): void {
    try {
      sessionStorage.removeItem(CHAVE_TOKEN_CONVITE);
    } catch {
      // Ver `lerToken`.
    }
  }
}
