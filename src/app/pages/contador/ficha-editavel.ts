import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { LucideNotebookPen, LucideX } from '@lucide/angular';
import {
  CarteiraApi,
  type EtiquetaEscritorio,
} from '@services/contador/data-access/carteira.service';
import {
  EscritorioApi,
  type MembroEscritorio,
} from '@services/escritorio/data-access/escritorio.service';
import type { ProdutorCarteira } from '@models/carteira.model';
import { SessaoService } from '@core/services/sessao.service';
import { ToastService } from '@core/services/toast.service';
import { falhaDaApi } from '@core/utils/erro-api';
import { UiButton } from '@shared/ui/ui-button';

const MAX_OBSERVACOES = 1000;
const MAX_ETIQUETAS = 10;
const MAX_NOME_ETIQUETA = 30;

/** O que mudou no cliente, para a ficha atualizar o cabeçalho sem recarregar a carteira. */
export interface MudancaNaFicha {
  etiquetas?: string[];
  responsavelId?: string | null;
  responsavelNome?: string | null;
}

/**
 * A parte **editável** da ficha do cliente (#149): observações internas, etiquetas e responsável.
 *
 * - **Observações** são do escritório e **nunca chegam ao produtor** (até 1000 caracteres). A tela
 *   diz isso junto do campo, porque é a primeira dúvida de quem escreve.
 * - **Etiquetas** são salvas a cada mudança (`PUT` substitui a lista inteira); o catálogo do
 *   escritório aparece como sugestão. Até 10, de 1 a 30 caracteres.
 * - **Responsável** é um membro da equipe (`EscritorioApi.membros()`). Só o administrador ou o
 *   responsável atual trocam (403 para os outros), então o seletor só aparece para eles.
 */
@Component({
  selector: 'app-ficha-editavel',
  standalone: true,
  imports: [LucideNotebookPen, LucideX, UiButton],
  templateUrl: './ficha-editavel.html',
})
export class FichaEditavel implements OnInit {
  private readonly carteiraApi = inject(CarteiraApi);
  private readonly escritorioApi = inject(EscritorioApi);
  private readonly sessao = inject(SessaoService);
  private readonly toast = inject(ToastService);

  readonly cliente = input.required<ProdutorCarteira>();
  readonly mudou = output<MudancaNaFicha>();

  readonly maxObservacoes = MAX_OBSERVACOES;
  readonly maxEtiquetas = MAX_ETIQUETAS;
  readonly maxNomeEtiqueta = MAX_NOME_ETIQUETA;

  readonly carregou = signal(false);
  readonly erro = signal(false);

  // Observações
  readonly observacoes = signal('');
  private readonly observacoesSalvas = signal('');
  readonly salvandoObservacoes = signal(false);
  readonly observacoesMudaram = computed(() => this.observacoes() !== this.observacoesSalvas());
  readonly observacoesLongas = computed(() => this.observacoes().length > MAX_OBSERVACOES);

  // Etiquetas
  readonly etiquetas = signal<string[]>([]);
  readonly catalogo = signal<EtiquetaEscritorio[]>([]);
  readonly novaEtiqueta = signal('');
  readonly salvandoEtiquetas = signal(false);
  readonly podeAdicionar = computed(() => {
    const nome = this.novaEtiqueta().trim();
    return (
      !this.salvandoEtiquetas() &&
      nome.length > 0 &&
      nome.length <= MAX_NOME_ETIQUETA &&
      this.etiquetas().length < MAX_ETIQUETAS &&
      !this.etiquetas().some((e) => e.toLowerCase() === nome.toLowerCase())
    );
  });
  /** Sugestões: o catálogo menos o que o cliente já tem. */
  readonly sugestoes = computed(() => {
    const tem = new Set(this.etiquetas().map((e) => e.toLowerCase()));
    return this.catalogo().filter((c) => !tem.has(c.nome.toLowerCase()));
  });

  // Responsável
  readonly membros = signal<MembroEscritorio[]>([]);
  readonly administrador = signal(false);
  readonly salvandoResponsavel = signal(false);
  /** Administrador ou o próprio responsável: os únicos que o servidor deixa trocar. */
  readonly podeTrocarResponsavel = computed(
    () =>
      this.administrador() ||
      (!!this.cliente().responsavelId && this.cliente().responsavelId === this.sessao.usuarioId()),
  );

  ngOnInit(): void {
    this.carregar();
    this.carteiraApi.etiquetasDoEscritorio().subscribe({
      next: (lista) => this.catalogo.set(lista),
      error: () => this.catalogo.set([]),
    });
    this.escritorioApi.ehAdministrador().subscribe((sim) => this.administrador.set(sim));
    this.escritorioApi.membros().subscribe({
      next: (lista) => this.membros.set(lista),
      error: () => this.membros.set([]),
    });
  }

  carregar(): void {
    this.erro.set(false);
    this.carteiraApi.ficha(this.cliente().id).subscribe({
      next: (ficha) => {
        const obs = ficha.observacoes ?? '';
        this.observacoes.set(obs);
        this.observacoesSalvas.set(obs);
        this.etiquetas.set(ficha.etiquetas ?? []);
        this.carregou.set(true);
      },
      error: () => this.erro.set(true),
    });
  }

  salvarObservacoes(): void {
    if (!this.observacoesMudaram() || this.observacoesLongas() || this.salvandoObservacoes())
      return;
    this.salvandoObservacoes.set(true);
    this.carteiraApi.salvarObservacoes(this.cliente().id, this.observacoes()).subscribe({
      next: (ficha) => {
        this.salvandoObservacoes.set(false);
        const obs = ficha.observacoes ?? '';
        this.observacoes.set(obs);
        this.observacoesSalvas.set(obs);
        this.toast.success('Observações salvas.');
      },
      error: (erro: HttpErrorResponse) => {
        this.salvandoObservacoes.set(false);
        this.toast.error(falhaDaApi(erro).mensagem);
      },
    });
  }

  adicionarEtiqueta(): void {
    if (!this.podeAdicionar()) return;
    const nome = this.novaEtiqueta().trim();
    this.gravarEtiquetas([...this.etiquetas(), nome], () => this.novaEtiqueta.set(''));
  }

  removerEtiqueta(nome: string): void {
    if (this.salvandoEtiquetas()) return;
    this.gravarEtiquetas(this.etiquetas().filter((e) => e !== nome));
  }

  /** O `PUT` substitui a lista inteira; a tela só troca a lista quando o servidor confirma. */
  private gravarEtiquetas(lista: string[], depois?: () => void): void {
    this.salvandoEtiquetas.set(true);
    this.carteiraApi.definirEtiquetas(this.cliente().id, lista).subscribe({
      next: (ficha) => {
        this.salvandoEtiquetas.set(false);
        this.etiquetas.set(ficha.etiquetas ?? lista);
        this.mudou.emit({ etiquetas: this.etiquetas() });
        depois?.();
      },
      error: (erro: HttpErrorResponse) => {
        this.salvandoEtiquetas.set(false);
        this.toast.error(falhaDaApi(erro).mensagem);
      },
    });
  }

  trocarResponsavel(valor: string, seletor?: HTMLSelectElement): void {
    const anterior = this.cliente().responsavelId ?? '';
    if (valor === anterior || this.salvandoResponsavel()) return;
    this.salvandoResponsavel.set(true);
    this.carteiraApi.alterarResponsavel(this.cliente().id, valor || null).subscribe({
      next: (r) => {
        this.salvandoResponsavel.set(false);
        this.mudou.emit({ responsavelId: r.responsavelId, responsavelNome: r.responsavelNome });
        this.toast.success(
          r.responsavelNome
            ? `${r.responsavelNome} agora cuida deste cliente.`
            : 'Cliente sem responsável.',
        );
      },
      error: (erro: HttpErrorResponse) => {
        this.salvandoResponsavel.set(false);
        if (seletor) seletor.value = anterior;
        this.toast.error(
          erro.status === 403
            ? 'Só o administrador ou o responsável atual trocam o responsável deste cliente.'
            : falhaDaApi(erro).mensagem,
        );
      },
    });
  }
}
