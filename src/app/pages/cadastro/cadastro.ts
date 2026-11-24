import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, type Params, Router, RouterLink } from '@angular/router';
import { LucideLoaderCircle, LucideUserPlus } from '@lucide/angular';
import { ToastService } from '@core/services/toast.service';
import { criarCampoCpfCnpj } from '@core/utils/campo-cpf-cnpj';
import { UFS, erroDoFormatoDoSlug } from '@core/utils/endereco';
import {
  DOMINIO_BASE,
  LOCALIZACAO_ATUAL,
  semProtocolo,
  urlDoHost,
} from '@core/utils/host-escritorio';
import {
  aplicarMascara,
  erroDoTelefone,
  mascaraCep,
  mascaraTelefone,
  soDigitos,
} from '@core/utils/mascaras';
import { AuthApi, ContaError, type CadastroRequest } from '@services/auth/data-access/auth.service';
import type { Papel } from '@core/services/sessao.service';

/** A frase do backend quando o contador manda CNPJ no documento dele (#186). */
const SO_CPF_NO_CONTADOR =
  'Informe o seu CPF, com 11 dígitos: o documento do contador é o da pessoa. ' +
  'O CNPJ do escritório vai nos dados do escritório.';

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
  // A "roleta" do rótulo que vira "Escritório" (#186). O texto novo entra num elemento novo,
  // então a animação de entrada roda sozinha, sem estado nem JS. O bloco global de movimento
  // reduzido do `styles.css` zera a duração: com `prefers-reduced-motion`, o texto só troca.
  styles: `
    .roleta {
      display: inline-block;
      animation: roleta-sobe var(--duracao-entrada) var(--ease-entrada) both;
    }
    @keyframes roleta-sobe {
      from {
        opacity: 0;
        transform: translateY(0.6em);
      }
      to {
        opacity: 1;
        transform: none;
      }
    }
  `,
})
export class CadastroPage {
  private readonly auth = inject(AuthApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly rota = inject(ActivatedRoute);

  /**
   * O destino pedido, que esta tela só **carrega adiante** (#182).
   *
   * Quem chega pelo link de um convite sem ter conta passa por login → cadastro → login. O
   * `returnUrl` morria aqui, e a pessoa caía no painel em vez do convite. Esta tela nunca navega
   * para o valor: quem o valida (caminho interno, nunca `/login`) é a tela de login, no único
   * lugar onde ele vira navegação de verdade.
   */
  readonly paramsDeRetorno: Params = (() => {
    const pedido = this.rota.snapshot.queryParamMap.get('returnUrl');
    return pedido ? { returnUrl: pedido } : {};
  })();

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

  // ── Contador (#186) ──────────────────────────────────────────────────────────────────────
  /**
   * Conta **pessoal** ou **empresarial**. Sem o campo o backend entende `PESSOAL`, e o escritório
   * nasce com o nome da pessoa, sem CNPJ — que é como funcionava antes desta issue.
   */
  readonly tipoConta = signal<'PESSOAL' | 'EMPRESARIAL'>('PESSOAL');
  readonly crc = signal('');
  /** O telefone da pessoa. Opcional, e só na conta pessoal: na empresarial vale o do escritório. */
  readonly telefone = signal('');

  // ── Escritório da conta empresarial (#186) ───────────────────────────────────────────────
  readonly escNome = signal('');
  /** O CNPJ do escritório. Mesmo campo mascarado do documento, aqui exigindo 14 dígitos. */
  readonly escDocumento = criarCampoCpfCnpj();
  readonly escTelefone = signal('');
  readonly escCep = signal('');
  readonly escLogradouro = signal('');
  readonly escNumero = signal('');
  readonly escComplemento = signal('');
  readonly escBairro = signal('');
  readonly escMunicipio = signal('');
  readonly escIbge = signal('');
  readonly escUf = signal('');
  readonly escSlug = signal('');
  /** O endereço fica público e permanente: sem esta caixa o backend recusa o cadastro. */
  readonly escCiente = signal(false);
  readonly ufs = UFS;

  /** O aceite dos termos, obrigatório em toda conta desde a #186. */
  readonly aceiteTermos = signal(false);

  readonly ehContador = computed(() => this.papel() === 'CONTADOR');
  readonly ehEmpresarial = computed(() => this.ehContador() && this.tipoConta() === 'EMPRESARIAL');

  private readonly base = inject(DOMINIO_BASE);
  private readonly localizacao = inject(LOCALIZACAO_ATUAL);

  /**
   * O endereço da prévia (`campoverde.` + o domínio de produção), montado pelo `urlDoHost`.
   *
   * **O domínio não aparece aqui, nem em comentário**: o `conferir-build-producao.mjs` procura
   * o texto dele em todo `.ts` que vai ao bundle (regra 3) e reprova a CI, porque um domínio
   * escrito à mão faria a conferência do `environment.prod.ts` passar sem o `fileReplacements`.
   */
  readonly previaDoEndereco = computed(() => {
    const slug = this.slugNormalizado();
    if (!slug || erroDoFormatoDoSlug(slug)) return null;
    return semProtocolo(urlDoHost(slug, this.base, this.localizacao));
  });

  readonly erroDoSlug = computed(() => erroDoFormatoDoSlug(this.slugNormalizado()));
  readonly erroDoTelefonePessoal = computed(() => erroDoTelefone(this.telefone()));
  readonly erroDoTelefoneEscritorio = computed(() => erroDoTelefone(this.escTelefone()));

  /**
   * O que o servidor recusou, por campo (#186). O cadastro empresarial manda 14 campos de uma
   * vez e o backend responde com todos os erros juntos; mostrar só o primeiro faria a pessoa
   * corrigir um por tentativa.
   */
  readonly errosDoServidor = signal<Readonly<Record<string, string>>>({});

  erroEm(campo: string): string | null {
    return this.errosDoServidor()[campo] ?? null;
  }

  /** O slug vai ao servidor em minúsculas e sem espaços nas pontas — ele normaliza igual. */
  private slugNormalizado(): string {
    return this.escSlug().trim().toLowerCase();
  }

  mascararCep(evento: Event): void {
    this.escCep.set(aplicarMascara(evento, mascaraCep));
  }

  mascararTelefone(evento: Event, onde: 'pessoa' | 'escritorio'): void {
    const texto = aplicarMascara(evento, mascaraTelefone);
    if (onde === 'pessoa') this.telefone.set(texto);
    else this.escTelefone.set(texto);
  }

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
      this.senha().length > 0 &&
      // Sem o aceite não há conta (#186): o botão desligado é o que torna a caixa obrigatória
      // visível, em vez de deixar a pessoa descobrir no 400.
      this.aceiteTermos() &&
      (!this.ehEmpresarial() || this.escritorioCompleto()),
  );

  /** Na conta empresarial, o backend exige **todos** estes campos; o botão espera por eles. */
  private readonly escritorioCompleto = computed(
    () =>
      this.escNome().trim().length > 0 &&
      this.escDocumento.valor().trim().length > 0 &&
      this.escTelefone().trim().length > 0 &&
      this.escCep().trim().length > 0 &&
      this.escLogradouro().trim().length > 0 &&
      this.escNumero().trim().length > 0 &&
      this.escBairro().trim().length > 0 &&
      this.escMunicipio().trim().length > 0 &&
      this.escIbge().trim().length > 0 &&
      this.escUf().trim().length > 0 &&
      this.slugNormalizado().length > 0 &&
      this.escCiente(),
  );

  criar(): void {
    if (!this.podeEnviar()) return;
    // `conferir()` também limpa a frase de documento de uma tentativa anterior.
    if (!this.documento.conferir()) {
      this.campoDocumento()?.nativeElement.focus();
      return;
    }
    // O contador se identifica pelo **CPF** (#186). O backend responde 400 com esta mesma frase;
    // dizê-la aqui poupa uma viagem e deixa o erro junto do campo desde o começo.
    if (this.ehContador() && soDigitos(this.cpfCnpj()).length !== 11) {
      this.documento.erroServidor.set(SO_CPF_NO_CONTADOR);
      this.campoDocumento()?.nativeElement.focus();
      return;
    }
    if (this.ehEmpresarial() && !this.escritorioValido()) return;

    this.enviando.set(true);
    this.erro.set(null);
    this.erroSenha.set(null);
    this.errosDoServidor.set({});

    const dados: CadastroRequest = {
      papel: this.papel(),
      nomeCompleto: this.nome().trim(),
      cpfCnpj: this.cpfCnpj(),
      email: this.email().trim(),
      senha: this.senha(),
      aceiteTermos: this.aceiteTermos(),
      // Os campos do contador não vão no produtor: o backend recusa `crc` e `tipoConta` lá.
      ...(this.ehContador()
        ? { tipoConta: this.tipoConta(), ...(this.crc().trim() ? { crc: this.crc().trim() } : {}) }
        : {}),
      ...(this.telefone().trim() && !this.ehEmpresarial()
        ? { telefone: soDigitos(this.telefone()) }
        : {}),
      ...(this.ehEmpresarial()
        ? {
            escritorio: {
              nome: this.escNome().trim(),
              cnpj: soDigitos(this.escDocumento.valor()),
              telefone: soDigitos(this.escTelefone()),
              endereco: {
                cep: soDigitos(this.escCep()),
                logradouro: this.escLogradouro().trim(),
                numero: this.escNumero().trim(),
                ...(this.escComplemento().trim()
                  ? { complemento: this.escComplemento().trim() }
                  : {}),
                bairro: this.escBairro().trim(),
                codigoMunicipioIbge: soDigitos(this.escIbge()),
                municipio: this.escMunicipio().trim(),
                uf: this.escUf().toUpperCase(),
              },
              slug: this.slugNormalizado(),
              cienteExposicaoPublica: this.escCiente(),
            },
          }
        : {}),
    };

    this.auth.cadastrar(dados).subscribe({
      next: () => {
        this.enviando.set(false);
        // O cadastro **não** devolve token: quem acabou de criar a conta ainda precisa entrar.
        this.toast.success('Conta criada. Entre com o seu e-mail e a sua senha.');
        // O destino segue junto (#182): sem ele, quem veio de um convite entra e cai no painel.
        void this.router.navigate(['/login'], { queryParams: this.paramsDeRetorno });
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
  /**
   * O que dá para recusar antes de enviar o escritório (#186): CNPJ com dígito verificador,
   * telefone com 10 ou 11 dígitos e a forma do slug. O resto — slug em uso, IBGE de outra UF —
   * só o servidor sabe, e é ele quem responde.
   */
  private escritorioValido(): boolean {
    const erros: Record<string, string> = {};
    if (!this.escDocumento.conferir() || soDigitos(this.escDocumento.valor()).length !== 14) {
      this.escDocumento.erroServidor.set('Informe o CNPJ do escritório, com 14 dígitos.');
      erros['escritorio.cnpj'] = 'Informe o CNPJ do escritório, com 14 dígitos.';
    }
    const telefone = this.erroDoTelefoneEscritorio();
    if (telefone || !soDigitos(this.escTelefone())) {
      erros['escritorio.telefone'] = telefone ?? 'Informe o telefone do escritório.';
    }
    if (soDigitos(this.escCep()).length !== 8) {
      erros['escritorio.endereco.cep'] = 'O CEP tem 8 dígitos.';
    }
    if (soDigitos(this.escIbge()).length !== 7) {
      erros['escritorio.endereco.codigoMunicipioIbge'] = 'O código do IBGE tem 7 dígitos.';
    }
    const slug = this.erroDoSlug();
    if (slug) erros['escritorio.slug'] = slug;

    this.errosDoServidor.set(erros);
    return Object.keys(erros).length === 0;
  }

  private mostrar(falha: ContaError): void {
    // Todos os campos recusados de uma vez (#186) — não só o primeiro.
    this.errosDoServidor.set(falha?.campos ?? {});
    if (falha?.campos?.['escritorio.cnpj']) {
      this.escDocumento.erroServidor.set(falha.campos['escritorio.cnpj']);
    }
    // O slug é o único campo cujo erro vem por código, não por `field` (#175 e #186). Sem dizer
    // por quê: reservado, em uso e em carência recebem a mesma resposta do servidor.
    if (falha?.codigo === 'SLUG_INDISPONIVEL' || falha?.codigo === 'SLUG_INVALIDO') {
      const frase =
        falha.codigo === 'SLUG_INDISPONIVEL'
          ? 'Este endereço não está disponível. Escolha outro.'
          : falha.message;
      this.errosDoServidor.update((atuais) => ({ ...atuais, 'escritorio.slug': frase }));
      return;
    }
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
