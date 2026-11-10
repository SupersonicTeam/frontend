import { Component, DestroyRef, OnInit, inject, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LucideRefreshCw, LucideUsers } from '@lucide/angular';
import { CarteiraApi } from '@services/contador/data-access/carteira.service';
import { ClienteEmFocoService } from '@core/services/cliente-em-foco.service';
import type { ProdutorCarteira } from '@models/carteira.model';

/**
 * O seletor de cliente das telas do contador que leem dado **de um produtor** (issue #136).
 *
 * Notas e Fechamento chamavam as rotas do produtor (`/api/notas`, `/api/apuracao`...), que derivam
 * o produtor do token e respondem 403 para o escritório. As versões do escritório levam o cliente
 * no caminho — `/api/contador/produtores/{produtorId}/...` —, então alguém precisa dizer **qual**.
 * É este componente, alimentado pela carteira.
 *
 * O cliente escolhido vem, em ordem:
 *
 * 1. do endereço (`?cliente=`), que é compartilhável e volta no histórico;
 * 2. da lembrança entre telas (`ClienteEmFocoService`), para o menu não zerar a escolha;
 * 3. do único cliente da carteira, quando só há um — escolher entre um não é escolha.
 *
 * Qualquer um deles **só vale se estiver na carteira** de quem está logado. Um id que não está
 * (link antigo, cliente encerrado, outro escritório) vira "nenhum cliente", e a tela orienta a
 * escolher, em vez de pedir dado que o backend negaria com 404.
 *
 * Emite `clienteChange` **depois** de a carteira responder — até lá a tela não sabe se há cliente,
 * e é isso que a deixa mostrar "carregando" em vez de "escolha um cliente" por um instante.
 */
@Component({
  selector: 'app-seletor-cliente',
  standalone: true,
  imports: [RouterLink, LucideRefreshCw, LucideUsers],
  template: `
    @if (erro()) {
      <div class="flex flex-wrap items-center gap-2 text-apoio text-muted-foreground" role="alert">
        <span>Não foi possível carregar a carteira.</span>
        <button
          type="button"
          class="tap-target inline-flex items-center gap-1.5 rounded-controle border border-border bg-card px-3 font-medium text-foreground hover:bg-muted"
          (click)="carregar()"
        >
          <svg lucideRefreshCw [size]="14" aria-hidden="true" /> Tentar de novo
        </button>
      </div>
    } @else if (carregando()) {
      <span class="text-apoio text-muted-foreground" aria-live="polite"
        >Carregando a carteira…</span
      >
    } @else if (clientes().length === 0) {
      <span class="text-apoio text-muted-foreground">
        Nenhum cliente ativo na carteira.
        <a
          routerLink="/contador"
          class="tap-target inline-flex items-center font-medium text-primary underline"
          >Ver a carteira</a
        >
      </span>
    } @else {
      <label class="flex flex-wrap items-center gap-2 text-apoio text-muted-foreground">
        <svg lucideUsers [size]="16" aria-hidden="true" />
        <span>Cliente</span>
        <select
          class="tap-target min-w-56 max-w-full rounded-controle border bg-card px-3 text-apoio text-foreground"
          [class.border-border]="!!selecionado()"
          [class.border-primary]="!selecionado()"
          [value]="selecionado() ?? ''"
          (change)="escolher($any($event.target).value)"
        >
          <option value="" [selected]="!selecionado()">Escolha um cliente</option>
          @for (c of clientes(); track c.id) {
            <option [value]="c.id" [selected]="c.id === selecionado()">{{ c.nomeCompleto }}</option>
          }
        </select>
      </label>
    }
  `,
})
export class SeletorCliente implements OnInit {
  private readonly carteiraApi = inject(CarteiraApi);
  private readonly foco = inject(ClienteEmFocoService);
  private readonly router = inject(Router);
  private readonly rota = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  /** O cliente escolhido, ou `null` quando não há. Só dispara depois de a carteira responder. */
  readonly clienteChange = output<ProdutorCarteira | null>();

  readonly clientes = signal<ProdutorCarteira[]>([]);
  readonly selecionado = signal<string | null>(null);
  readonly carregando = signal(true);
  readonly erro = signal(false);

  ngOnInit(): void {
    this.carregar();

    // O Angular reaproveita o componente quando só a query muda (voltar no histórico, link para a
    // mesma tela com outro cliente). Sem isto o endereço diria um cliente e a tela mostraria outro
    // -- e "aprovar" iria para o da tela. A nossa própria escrita no endereço chega aqui com o
    // cliente já escolhido e não faz nada.
    this.rota.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      if (this.carregando() || this.erro()) return;
      const pedido = params.get('cliente');
      if (pedido === null || pedido === this.selecionado()) return;
      this.escolher(pedido);
    });
  }

  carregar(): void {
    this.carregando.set(true);
    this.erro.set(false);
    this.carteiraApi.listar({ size: CarteiraApi.TAMANHO_MAXIMO }).subscribe({
      next: (pagina) => {
        this.clientes.set(pagina.itens);
        this.carregando.set(false);
        // Cada fonte vale só se estiver na carteira, e a que falha passa a vez à seguinte: um
        // `?cliente=` velho (cliente encerrado, link salvo) não pode apagar o cliente em foco.
        const naCarteira = (id: string | null) => pagina.itens.find((c) => c.id === id);
        const escolhido =
          naCarteira(this.rota.snapshot.queryParamMap.get('cliente')) ??
          naCarteira(this.foco.produtorId()) ??
          (pagina.itens.length === 1 ? pagina.itens[0] : null);
        this.aplicar(escolhido ?? null);
      },
      error: () => {
        this.carregando.set(false);
        this.erro.set(true);
      },
    });
  }

  escolher(id: string): void {
    this.aplicar(this.clientes().find((c) => c.id === id) ?? null);
  }

  private aplicar(cliente: ProdutorCarteira | null): void {
    const id = cliente?.id ?? null;
    this.selecionado.set(id);
    this.foco.escolher(id);
    this.clienteChange.emit(cliente);

    // O endereço acompanha a escolha, sem empilhar histórico a cada troca.
    if (this.rota.snapshot.queryParamMap.get('cliente') !== id) {
      void this.router.navigate([], {
        relativeTo: this.rota,
        queryParams: { cliente: id },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      });
    }
  }
}
