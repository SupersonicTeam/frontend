import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { LucideGlobe } from '@lucide/angular';
import {
  EscritorioApi,
  type Escritorio,
} from '@services/escritorio/data-access/escritorio.service';
import { ToastService } from '@core/services/toast.service';
import { falhaDaApi } from '@core/utils/erro-api';
import {
  DOMINIO_BASE,
  ENDERECO_PROPRIO_NO_AR,
  LOCALIZACAO_ATUAL,
  urlDoHost,
} from '@core/utils/host-escritorio';
import { UiButton } from '@shared/ui/ui-button';
import { UiModal } from '@shared/ui/ui-modal';

/**
 * O formato do slug, o mesmo do backend (contrato da backend#464): 3 a 32 caracteres, letras
 * minúsculas, dígitos e hífen, sem hífen nas pontas. A lista de **reservados não** fica aqui: ela
 * muda e mora só no servidor, que responde 409 `SLUG_INDISPONIVEL`.
 */
const FORMATO_DO_SLUG = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;

/** "09/12/2026, 11:30" no fuso de Brasília, como o contrato pede para o `expectedValue`. */
const DATA_E_HORA = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});

/** Por que o valor digitado não serve, antes de ir ao servidor. `null` = serve (pelo formato). */
export function erroDoFormatoDoSlug(slug: string): string | null {
  if (!slug) return null;
  if (slug.length < 3 || slug.length > 32) return 'Use de 3 a 32 caracteres.';
  if (/^\d+$/.test(slug)) return 'Use ao menos uma letra.';
  if (slug.includes('--')) return 'Não use dois hífens seguidos.';
  if (!FORMATO_DO_SLUG.test(slug)) {
    return 'Use só letras minúsculas sem acento, números e hífen, sem hífen no começo ou no fim.';
  }
  return null;
}

/**
 * O endereço próprio do escritório na aba Equipe (#175, PR D): `{slug}.{base}`, onde só a equipe
 * entra, com a marca do escritório no login.
 *
 * Aparece só com o endereço no ar (`ENDERECO_PROPRIO_NO_AR`): até o DNS curinga existir, um
 * endereço gravado aqui não abriria. Todo membro vê o endereço atual; **só o administrador**, e só
 * com CNPJ, escolhe ou remove. Os links saem do `slug` pelo `urlDoHost`, nunca do `enderecoHost`.
 *
 * A caixa de ciência é obrigatória e desmarca a cada mudança do valor: o endereço fica público e
 * permanente nos registros de certificados (Certificate Transparency), e a pessoa precisa saber
 * disso **para aquele endereço**. É ela que manda o `cienteExposicaoPublica: true`.
 *
 * Falta aqui (PR C): estando no próprio subdomínio, trocar ou remover o endereço muda o host do
 * escritório, e a sessão deveria sair com o aviso do endereço novo (seção 6 da #175).
 */
@Component({
  selector: 'app-endereco-escritorio',
  standalone: true,
  imports: [LucideGlobe, UiButton, UiModal],
  template: `
    @if (noAr()) {
      <section
        class="flex flex-col gap-2 border-t border-border pt-4"
        aria-labelledby="titulo-endereco"
      >
        <h2
          id="titulo-endereco"
          class="flex items-center gap-2 font-heading text-base font-semibold text-foreground"
        >
          <svg lucideGlobe [size]="18" class="text-primary" aria-hidden="true" />
          Endereço do escritório
        </h2>

        @if (urlAtual(); as url) {
          <p class="text-apoio text-muted-foreground">
            A equipe entra por
            <a
              [href]="url"
              target="_blank"
              rel="noopener"
              class="font-medium text-primary underline"
              >{{ hostAtual() }}</a
            >, com a marca do escritório no login.
          </p>
        } @else {
          <p class="text-apoio text-muted-foreground">
            O escritório ainda não tem endereço próprio. Com ele, a equipe entra por
            <span class="font-medium text-foreground">{{ exemplo() }}</span
            >, com a marca do escritório no login.
          </p>
        }

        @if (administrador()) {
          @if (!temCnpj()) {
            <p class="text-apoio text-aviso-ink">
              Cadastre o CNPJ do escritório para ter um endereço próprio.
            </p>
          } @else {
            <form class="flex flex-col gap-2" (submit)="$event.preventDefault(); salvar()">
              <label for="slug-escritorio" class="text-apoio font-medium text-foreground">
                {{ urlAtual() ? 'Trocar o endereço' : 'Escolher o endereço' }}
              </label>
              <div class="flex flex-wrap items-center gap-2">
                <input
                  id="slug-escritorio"
                  class="tap-target min-w-0 flex-1 rounded-controle border bg-background px-3 text-apoio sm:max-w-xs"
                  [class.border-border]="!erroDoCampo()"
                  [class.border-perigo]="!!erroDoCampo()"
                  autocomplete="off"
                  spellcheck="false"
                  maxlength="40"
                  aria-describedby="slug-ajuda"
                  [attr.aria-invalid]="!!erroDoCampo()"
                  [disabled]="!!bloqueadoAte()"
                  [value]="valor()"
                  (input)="digitar($any($event.target).value)"
                />
                <span class="text-apoio text-muted-foreground">.{{ base() }}</span>
              </div>
              <p id="slug-ajuda" class="text-apoio" [class.text-perigo-ink]="!!erroDoCampo()">
                @if (erroDoCampo(); as erro) {
                  {{ erro }}
                } @else if (bloqueadoAte(); as quando) {
                  <span class="text-muted-foreground">Nova troca a partir de {{ quando }}.</span>
                } @else if (previa(); as p) {
                  <span class="text-muted-foreground">O endereço vai ser {{ p }}</span>
                }
              </p>

              <label class="flex items-start gap-2 text-apoio text-foreground">
                <input
                  type="checkbox"
                  class="mt-1"
                  [checked]="ciente()"
                  [disabled]="!!bloqueadoAte()"
                  (change)="ciente.set($any($event.target).checked)"
                />
                <span>
                  O endereço fica público e permanente em registros de certificados da internet. Não
                  use o seu nome pessoal.
                </span>
              </label>

              <div class="flex flex-wrap gap-2">
                <ui-button type="submit" [disabled]="!podeSalvar()" [carregando]="salvando()">
                  Salvar endereço
                </ui-button>
                @if (escritorio().slug) {
                  <ui-button
                    variant="ghost"
                    [disabled]="salvando()"
                    (click)="confirmandoRemocao.set(true)"
                  >
                    Remover endereço
                  </ui-button>
                }
              </div>
            </form>
          }
        }
      </section>
    }

    <ui-modal
      [aberto]="confirmandoRemocao()"
      titulo="Remover o endereço do escritório?"
      tamanho="sm"
      [travado]="removendo()"
      (fechar)="confirmandoRemocao.set(false)"
    >
      <p class="text-apoio text-foreground">
        Remover o endereço {{ hostAtual() }}? Ele sai do ar na hora e fica bloqueado por 90 dias,
        sem que outro escritório possa usá-lo. Quem abrir o endereço vai ver "Endereço não
        encontrado". Um endereço novo só poderá ser escolhido daqui a 30 dias.
      </p>
      <div rodape class="flex flex-wrap justify-end gap-2">
        <ui-button variant="ghost" [disabled]="removendo()" (click)="confirmandoRemocao.set(false)">
          Cancelar
        </ui-button>
        <ui-button variant="perigo" [carregando]="removendo()" (click)="remover()">
          Remover
        </ui-button>
      </div>
    </ui-modal>
  `,
})
export class EnderecoEscritorio {
  private readonly api = inject(EscritorioApi);
  private readonly toast = inject(ToastService);
  private readonly localizacao = inject(LOCALIZACAO_ATUAL);

  readonly escritorio = input.required<Escritorio>();
  /** O escritório como o servidor devolveu depois de salvar ou remover. */
  readonly mudou = output<Escritorio>();

  protected readonly noAr = signal(inject(ENDERECO_PROPRIO_NO_AR)).asReadonly();
  protected readonly base = signal(inject(DOMINIO_BASE)).asReadonly();

  readonly valor = signal('');
  readonly ciente = signal(false);
  /** O erro que o servidor devolveu para o valor enviado; some ao digitar. */
  readonly erroDoServidor = signal<string | null>(null);
  readonly salvando = signal(false);
  readonly confirmandoRemocao = signal(false);
  readonly removendo = signal(false);

  readonly administrador = computed(() => this.escritorio().minhaFuncao === 'ADMINISTRADOR');
  readonly temCnpj = computed(() => !!this.escritorio().cnpj);

  /** A URL do endereço atual, ou `null` sem endereço. */
  readonly urlAtual = computed(() => {
    const slug = this.escritorio().slug;
    return slug ? this.url(slug) : null;
  });
  /** O host sem o protocolo, para o texto do link. */
  readonly hostAtual = computed(() => (this.urlAtual() ?? '').replace(/^[a-z]+:\/\//, ''));
  readonly exemplo = computed(() => this.url('seu-escritorio').replace(/^[a-z]+:\/\//, ''));

  /** "Nova troca a partir de ...", enquanto os 30 dias da última alteração não passam. */
  readonly bloqueadoAte = computed(() => {
    const quando = this.escritorio().enderecoAlteravelEm;
    return quando ? DATA_E_HORA.format(new Date(quando)) : null;
  });

  readonly erroDoFormato = computed(() => erroDoFormatoDoSlug(this.valor()));
  readonly erroDoCampo = computed(() => this.erroDoServidor() ?? this.erroDoFormato());

  /** A prévia da URL, só quando o valor serve pelo formato. */
  readonly previa = computed(() =>
    this.valor() && !this.erroDoFormato() ? this.url(this.valor()) : null,
  );

  readonly podeSalvar = computed(
    () =>
      this.administrador() &&
      this.temCnpj() &&
      !this.bloqueadoAte() &&
      !!this.valor() &&
      !this.erroDoFormato() &&
      // Reenviar o mesmo devolve 200 e não serve para nada.
      this.valor() !== (this.escritorio().slug ?? '') &&
      this.ciente() &&
      !this.salvando(),
  );

  constructor() {
    // O campo começa com o endereço atual (e volta a ele quando o servidor devolve outro).
    effect(() => {
      this.valor.set(this.escritorio().slug ?? '');
      this.ciente.set(false);
      this.erroDoServidor.set(null);
    });
  }

  /** Normaliza como o backend (sem espaços nas pontas, minúsculas) e desmarca a ciência. */
  digitar(texto: string): void {
    this.valor.set(texto.trim().toLowerCase());
    this.ciente.set(false);
    this.erroDoServidor.set(null);
  }

  salvar(): void {
    if (!this.podeSalvar()) return;
    const slug = this.valor();
    this.salvando.set(true);
    this.api.definirEndereco(slug).subscribe({
      next: (escritorio) => {
        this.salvando.set(false);
        this.toast.success(`Endereço salvo: ${this.url(slug).replace(/^[a-z]+:\/\//, '')}.`);
        this.mudou.emit(escritorio);
      },
      error: (erro: HttpErrorResponse) => {
        this.salvando.set(false);
        const noCampo = this.erroNoCampo(erro);
        if (noCampo) this.erroDoServidor.set(noCampo);
        else this.toast.error(this.mensagem(erro));
      },
    });
  }

  remover(): void {
    if (this.removendo()) return;
    this.removendo.set(true);
    this.api.removerEndereco().subscribe({
      next: () => {
        // A remoção conta como alteração: o `enderecoAlteravelEm` muda, então pergunta de novo.
        this.api.meuEscritorio().subscribe({
          next: (escritorio) => {
            this.removendo.set(false);
            this.confirmandoRemocao.set(false);
            this.toast.success('Endereço removido.');
            this.mudou.emit(escritorio);
          },
          error: () => {
            this.removendo.set(false);
            this.confirmandoRemocao.set(false);
            this.toast.success('Endereço removido. Recarregue a página para ver a situação nova.');
          },
        });
      },
      error: (erro: HttpErrorResponse) => {
        this.removendo.set(false);
        this.toast.error(this.mensagem(erro));
      },
    });
  }

  private url(slug: string): string {
    return urlDoHost(slug, this.base(), {
      protocolo: this.localizacao.protocolo,
      porta: this.localizacao.porta,
    });
  }

  /** O erro do `PUT` que mora sob o campo, ou `null` para os que vão ao toast (403, rede). */
  private erroNoCampo(erro: HttpErrorResponse): string | null {
    const falha = falhaDaApi(erro);
    switch (falha.codigo) {
      case 'SLUG_INVALIDO':
      case 'VALIDATION_ERROR':
        return falha.mensagem;
      case 'SLUG_INDISPONIVEL':
        // Sem dizer por quê: reservado, em uso e em carência recebem a mesma resposta.
        return 'Este endereço não está disponível. Escolha outro.';
      case 'ENDERECO_TROCA_RECENTE':
        return falha.valorEsperado
          ? `O endereço só pode ser trocado a partir de ${DATA_E_HORA.format(new Date(falha.valorEsperado))}.`
          : 'O endereço foi alterado há pouco e ainda não pode ser trocado.';
      case 'ENDERECO_EXIGE_CNPJ':
        return 'Cadastre o CNPJ do escritório antes de escolher o endereço.';
      default:
        return null;
    }
  }

  private mensagem(erro: HttpErrorResponse): string {
    if (erro.status === 403) return 'Só o administrador do escritório faz isso.';
    return falhaDaApi(erro).mensagem;
  }
}
