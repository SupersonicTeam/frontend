import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import {
  EscritorioApi,
  FUNCOES_ESCRITORIO,
  type ConviteDeEquipe,
  type Escritorio,
  type FuncaoEscritorio,
  type MembroEscritorio,
  type AtualizarEscritorioRequest,
} from '@services/escritorio/data-access/escritorio.service';
import { ToastService } from '@core/services/toast.service';
import {
  CarteiraApi,
  type EtiquetaEscritorio,
} from '@services/contador/data-access/carteira.service';
import { falhaDaApi } from '@core/utils/erro-api';
import {
  aplicarMascara,
  erroDoTelefone,
  formatarCpfCnpj,
  mascaraTelefone,
  soDigitos,
} from '@core/utils/mascaras';
import { criarCampoCpfCnpj } from '@core/utils/campo-cpf-cnpj';
import type { ApiErrorEnvelope } from '@dtos/shared/responses/api-error.response';
import {
  EnderecoPostal,
  enderecoEmBranco,
  enderecoParaDigitar,
  enderecoParaEnviar,
  enderecoPorExtenso,
  enderecoVazio,
  errosDoEndereco,
  type EnderecoDigitado,
} from '@shared/contador/endereco-postal';
import { UiButton } from '@shared/ui/ui-button';
import { UiModal } from '@shared/ui/ui-modal';
import { EnderecoEscritorio } from './endereco-escritorio';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Escritório e equipe do contador (#148, backend#228), hospedado pela página `/equipe` (#157).
 *
 * Nasceu como seção de Configurações, pela ideia de que é configuração consultada de vez em
 * quando. No uso ficou escondida, e desde a #157 tem aba própria no menu — ver `EquipePage`.
 *
 * Todo membro vê o escritório e a equipe. **Só o administrador** edita os dados, troca função,
 * remove e convida (as outras funções levariam 403), então só ele vê esses controles. O
 * `ULTIMO_ADMINISTRADOR` (409) tem frase própria: a equipe nunca pode ficar sem administrador.
 */
@Component({
  selector: 'app-equipe-escritorio',
  standalone: true,
  imports: [EnderecoEscritorio, EnderecoPostal, UiButton, UiModal],
  templateUrl: './equipe-escritorio.html',
})
export class EquipeEscritorio implements OnInit {
  private readonly api = inject(EscritorioApi);
  private readonly toast = inject(ToastService);
  private readonly carteiraApi = inject(CarteiraApi);

  /** O catálogo de etiquetas do escritório (#149). Só o administrador exclui (403 para os outros). */
  readonly etiquetas = signal<EtiquetaEscritorio[]>([]);
  readonly excluindoEtiqueta = signal<string | null>(null);
  /** A etiqueta cujo "Excluir" já foi clicado uma vez: o segundo clique confirma. */
  readonly confirmandoEtiqueta = signal<string | null>(null);

  readonly funcoes = FUNCOES_ESCRITORIO;

  readonly escritorio = signal<Escritorio | null>(null);
  readonly membros = signal<MembroEscritorio[]>([]);
  readonly convites = signal<ConviteDeEquipe[]>([]);
  readonly erro = signal(false);

  readonly administrador = computed(() => this.escritorio()?.minhaFuncao === 'ADMINISTRADOR');

  /**
   * Conta **pessoal** (#186): um usuário só, sem convite de equipe nem endereço próprio — o
   * servidor responde 409 `ESCRITORIO_PESSOAL` aos dois, então a tela não os oferece e mostra
   * "Tornar empresarial" no lugar. Sem o campo (backend antigo), vale como empresarial, que é
   * como tudo funcionava.
   */
  readonly pessoal = computed(() => this.escritorio()?.tipo === 'PESSOAL');

  readonly mascaraTelefone = mascaraTelefone;
  readonly enderecoPorExtenso = enderecoPorExtenso;

  /** O CNPJ como se lê (o servidor devolve só os dígitos), igual ao da carteira (#156). */
  readonly formatarCpfCnpj = formatarCpfCnpj;

  // Edição dos dados
  readonly editando = signal(false);
  readonly nome = signal('');
  readonly cnpj = signal('');
  readonly telefone = signal('');
  readonly endereco = signal<EnderecoDigitado>(enderecoVazio());
  readonly errosDoEnderecoEditado = signal<Readonly<Record<string, string>>>({});
  readonly salvando = signal(false);
  readonly erroDoTelefoneEditado = computed(() => erroDoTelefone(this.telefone()));
  readonly dadosValidos = computed(() => {
    const cnpj = soDigitos(this.cnpj());
    return (
      this.nome().trim().length > 0 &&
      (cnpj.length === 0 || cnpj.length === 14) &&
      !this.erroDoTelefoneEditado()
    );
  });

  /**
   * O CNPJ digitado é outro, num escritório **já verificado** (backend#520). Salvar tira a
   * verificação na hora, e o endereço próprio sai do ar até a GWNext conferir o CNPJ novo. A
   * tela avisa antes — o servidor não pergunta.
   */
  readonly trocaDeCnpjTiraVerificacao = computed(() => {
    const e = this.escritorio();
    return !!e?.escritorioVerificado && soDigitos(this.cnpj()) !== (e.cnpj ?? '');
  });

  // Tornar empresarial (#186): só no escritório pessoal, só para o administrador.
  readonly tornando = signal(false);
  readonly tornandoAgora = signal(false);
  readonly empNome = signal('');
  readonly empDocumento = criarCampoCpfCnpj();
  readonly empTelefone = signal('');
  readonly empEndereco = signal<EnderecoDigitado>(enderecoVazio());
  readonly empErros = signal<Readonly<Record<string, string>>>({});
  readonly empErroGeral = signal('');
  /** Os erros do endereço, com as chaves curtas que o `<app-endereco-postal>` espera. */
  readonly empErrosDoEndereco = computed(() => {
    const curtos: Record<string, string> = {};
    for (const [campo, frase] of Object.entries(this.empErros())) {
      if (campo.startsWith('endereco.')) curtos[campo.slice('endereco.'.length)] = frase;
    }
    return curtos;
  });
  readonly podeTornar = computed(
    () =>
      this.empNome().trim().length > 0 &&
      this.empDocumento.valor().trim().length > 0 &&
      this.empTelefone().trim().length > 0 &&
      !enderecoEmBranco(this.empEndereco()),
  );

  // Convite de equipe
  readonly emailConvite = signal('');
  readonly funcaoConvite = signal<FuncaoEscritorio>('CONTADOR');
  readonly convidando = signal(false);
  readonly emailValido = computed(() => EMAIL.test(this.emailConvite().trim()));

  // Membros
  readonly alterando = signal<string | null>(null);
  readonly removendo = signal<MembroEscritorio | null>(null);
  readonly removendoAgora = signal(false);

  ngOnInit(): void {
    this.carregar();
  }

  carregar(): void {
    this.erro.set(false);
    this.api.meuEscritorio().subscribe({
      next: (e) => {
        this.escritorio.set(e);
        if (e.minhaFuncao === 'ADMINISTRADOR') {
          this.carregarConvites();
          this.carteiraApi.etiquetasDoEscritorio().subscribe({
            next: (lista) => this.etiquetas.set(lista),
            error: () => this.etiquetas.set([]),
          });
        }
      },
      error: () => this.erro.set(true),
    });
    this.api.membros().subscribe({
      next: (lista) => this.membros.set(lista),
      error: () => this.erro.set(true),
    });
  }

  private carregarConvites(): void {
    this.api.convitesDeEquipe().subscribe({
      next: (lista) => this.convites.set(lista),
      error: () => this.convites.set([]),
    });
  }

  rotuloDaFuncao(funcao: FuncaoEscritorio): string {
    return this.funcoes.find((f) => f.valor === funcao)?.rotulo ?? funcao;
  }

  abrirEdicao(): void {
    const e = this.escritorio();
    if (!e) return;
    this.nome.set(e.nome);
    this.cnpj.set(e.cnpj ?? '');
    this.telefone.set(mascaraTelefone(e.telefone ?? ''));
    this.endereco.set(enderecoParaDigitar(e.endereco));
    this.errosDoEnderecoEditado.set({});
    this.editando.set(true);
  }

  mascararTelefone(evento: Event, onde: 'edicao' | 'empresarial'): void {
    const texto = aplicarMascara(evento, mascaraTelefone);
    if (onde === 'edicao') this.telefone.set(texto);
    else this.empTelefone.set(texto);
  }

  abrirTornarEmpresarial(): void {
    const e = this.escritorio();
    if (!e) return;
    // Nasce com o que o escritório pessoal já tem: quem preencheu telefone e endereço pelo
    // "Editar dados" não digita de novo.
    this.empNome.set(e.nome);
    this.empDocumento.reiniciar(e.cnpj ? formatarCpfCnpj(e.cnpj) : '');
    this.empTelefone.set(mascaraTelefone(e.telefone ?? ''));
    this.empEndereco.set(enderecoParaDigitar(e.endereco));
    this.empErros.set({});
    this.empErroGeral.set('');
    this.tornando.set(true);
  }

  /**
   * `POST /api/escritorio/tornar-empresarial`. Todos os campos são obrigatórios; o que dá para
   * recusar aqui (CNPJ, telefone, CEP, IBGE) nem viaja. O endereço próprio (`{slug}`) **não** é
   * escolhido aqui: o escritório volta com `slug` nulo, e o bloco do endereço aparece logo abaixo.
   */
  tornarEmpresarial(): void {
    if (!this.podeTornar() || this.tornandoAgora()) return;

    const erros: Record<string, string> = {};
    if (!this.empDocumento.conferir() || soDigitos(this.empDocumento.valor()).length !== 14) {
      erros['cnpj'] = 'Informe o CNPJ do escritório, com 14 dígitos.';
      this.empDocumento.erroServidor.set(erros['cnpj']);
    }
    const telefone = erroDoTelefone(this.empTelefone());
    if (telefone) erros['telefone'] = telefone;
    for (const [campo, frase] of Object.entries(errosDoEndereco(this.empEndereco()))) {
      erros[`endereco.${campo}`] = frase;
    }
    this.empErros.set(erros);
    this.empErroGeral.set('');
    if (Object.keys(erros).length) return;

    this.tornandoAgora.set(true);
    this.api
      .tornarEmpresarial({
        nome: this.empNome().trim(),
        cnpj: soDigitos(this.empDocumento.valor()),
        telefone: soDigitos(this.empTelefone()),
        endereco: enderecoParaEnviar(this.empEndereco()),
      })
      .subscribe({
        next: (e) => {
          this.tornandoAgora.set(false);
          this.tornando.set(false);
          this.escritorio.set(e);
          this.carregarConvites();
          this.toast.success('Pronto: o escritório agora é empresarial e pode ter equipe.');
        },
        error: (erro: HttpErrorResponse) => {
          this.tornandoAgora.set(false);
          const campos = camposDoErro(erro);
          this.empErros.set(campos);
          if (campos['cnpj']) this.empDocumento.erroServidor.set(campos['cnpj']);
          // Já é empresarial (outra aba, outro administrador): a tela daqui estava velha.
          if (falhaDaApi(erro).codigo === 'ESCRITORIO_JA_EMPRESARIAL') {
            this.tornando.set(false);
            this.recarregarEscritorio();
            this.toast.error('Este escritório já é empresarial.');
            return;
          }
          if (!Object.keys(campos).length) this.empErroGeral.set(this.mensagem(erro));
        },
      });
  }

  salvar(): void {
    if (!this.dadosValidos() || this.salvando()) return;
    // **O que não vai fica como está** (backend#524). O telefone vazio e o endereço em branco
    // não são mandados: pelo `PATCH` os dois não se apagam, e mandá-los vazios só geraria 400.
    const dados: AtualizarEscritorioRequest = {
      nome: this.nome().trim(),
      cnpj: soDigitos(this.cnpj()),
    };
    if (soDigitos(this.telefone())) dados.telefone = soDigitos(this.telefone());
    if (!enderecoEmBranco(this.endereco())) {
      // O endereço substitui o anterior inteiro, então vai completo ou não vai.
      const erros = errosDoEndereco(this.endereco());
      this.errosDoEnderecoEditado.set(erros);
      if (Object.keys(erros).length) return;
      dados.endereco = enderecoParaEnviar(this.endereco());
    }

    this.salvando.set(true);
    this.api.atualizar(dados).subscribe({
      next: (e) => {
        this.salvando.set(false);
        this.escritorio.set(e);
        this.editando.set(false);
        this.toast.success('Dados do escritório atualizados.');
      },
      error: (erro: HttpErrorResponse) => {
        this.salvando.set(false);
        this.toast.error(this.mensagem(erro));
      },
    });
  }

  convidar(): void {
    if (!this.emailValido() || this.convidando()) return;
    const email = this.emailConvite().trim();
    this.convidando.set(true);
    this.api.convidarMembro(email, this.funcaoConvite()).subscribe({
      next: () => {
        this.convidando.set(false);
        this.emailConvite.set('');
        this.toast.success(`Convite enviado para ${email}. O link chega por e-mail.`);
        this.carregarConvites();
      },
      error: (erro: HttpErrorResponse) => {
        this.convidando.set(false);
        this.toast.error(this.mensagem(erro));
      },
    });
  }

  /**
   * Troca a função. O `seletor` vem junto para voltar à função de antes se o servidor recusar: o
   * `<select>` mostra o que foi escolhido, e o signal sem mudança não o corrigiria sozinho.
   */
  alterarFuncao(
    membro: MembroEscritorio,
    funcao: FuncaoEscritorio,
    seletor?: HTMLSelectElement,
  ): void {
    if (funcao === membro.funcao || this.alterando()) {
      if (seletor) seletor.value = membro.funcao;
      return;
    }
    this.alterando.set(membro.id);
    this.api.alterarFuncao(membro.id, funcao).subscribe({
      next: (atualizado) => {
        this.alterando.set(null);
        this.membros.update((l) => l.map((m) => (m.id === atualizado.id ? atualizado : m)));
        this.recarregarEscritorio();
        this.toast.success(`${membro.nomeCompleto} agora é ${this.rotuloDaFuncao(funcao)}.`);
      },
      error: (erro: HttpErrorResponse) => {
        this.alterando.set(null);
        if (seletor) seletor.value = membro.funcao;
        this.toast.error(this.mensagem(erro));
      },
    });
  }

  remover(): void {
    const membro = this.removendo();
    if (!membro || this.removendoAgora()) return;
    this.removendoAgora.set(true);
    this.api.removerMembro(membro.id).subscribe({
      next: () => {
        this.removendoAgora.set(false);
        this.removendo.set(null);
        this.membros.update((l) => l.filter((m) => m.id !== membro.id));
        this.recarregarEscritorio();
        this.toast.success(`${membro.nomeCompleto} saiu da equipe.`);
      },
      error: (erro: HttpErrorResponse) => {
        this.removendoAgora.set(false);
        this.toast.error(this.mensagem(erro));
      },
    });
  }

  /** Tira a etiqueta do catálogo do escritório. */
  excluirEtiqueta(etiqueta: EtiquetaEscritorio): void {
    if (this.excluindoEtiqueta()) return;
    // Sai do catálogo do escritório inteiro: um clique só pede confirmação.
    if (this.confirmandoEtiqueta() !== etiqueta.id) {
      this.confirmandoEtiqueta.set(etiqueta.id);
      return;
    }
    this.confirmandoEtiqueta.set(null);
    this.excluindoEtiqueta.set(etiqueta.id);
    this.carteiraApi.excluirEtiqueta(etiqueta.id).subscribe({
      next: () => {
        this.excluindoEtiqueta.set(null);
        this.etiquetas.update((l) => l.filter((e) => e.id !== etiqueta.id));
        this.toast.success(`Etiqueta "${etiqueta.nome}" excluída do catálogo.`);
      },
      error: (erro: HttpErrorResponse) => {
        this.excluindoEtiqueta.set(null);
        this.toast.error(this.mensagem(erro));
      },
    });
  }

  /**
   * A função de quem está aqui pode ter mudado (o administrador rebaixou ou removeu a si mesmo), e
   * ela está em cache para a sessão inteira. Pergunta de novo, para os botões acompanharem.
   */
  private recarregarEscritorio(): void {
    this.api.limpar();
    this.api.meuEscritorio().subscribe({
      next: (e) => this.escritorio.set(e),
      error: () => this.escritorio.set(null),
    });
  }

  private mensagem(erro: HttpErrorResponse): string {
    const falha = falhaDaApi(erro);
    if (falha.codigo === 'ULTIMO_ADMINISTRADOR') {
      return 'A equipe precisa de pelo menos um administrador. Promova outra pessoa antes.';
    }
    // Apagar o CNPJ de um escritório com endereço próprio (#175): o endereço exige CNPJ.
    if (falha.codigo === 'ENDERECO_EXIGE_CNPJ') {
      return 'Remova o endereço do escritório antes de apagar o CNPJ.';
    }
    // Convite de equipe ou endereço próprio num escritório pessoal (#186): é de um usuário só.
    if (falha.codigo === 'ESCRITORIO_PESSOAL') {
      return 'Um escritório pessoal é de um usuário só. Torne-o empresarial para ter equipe e endereço próprio.';
    }
    if (falha.codigo === 'ESCRITORIO_EMPRESARIAL_EXIGE_CNPJ') {
      return 'Um escritório empresarial precisa de CNPJ: ele pode ser trocado, mas não apagado.';
    }
    if (erro.status === 403) return 'Só o administrador do escritório faz isso.';
    return falha.mensagem;
  }
}

/**
 * Todos os campos recusados de um 400, do `field` à frase. O `falhaDaApi` só traz o primeiro, e
 * o "tornar empresarial" manda onze campos de uma vez.
 */
function camposDoErro(erro: HttpErrorResponse): Record<string, string> {
  const campos: Record<string, string> = {};
  for (const item of (erro.error as ApiErrorEnvelope | null)?.errors ?? []) {
    if (item.field && item.message && !(item.field in campos)) campos[item.field] = item.message;
  }
  return campos;
}
