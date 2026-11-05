import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { LucideLink2Off } from '@lucide/angular';
import {
  CarteiraApi,
  type AcaoVinculo,
  type SituacaoDoVinculo,
} from '@services/contador/data-access/carteira.service';
import { EscritorioApi } from '@services/escritorio/data-access/escritorio.service';
import type { ProdutorCarteira } from '@models/carteira.model';
import { ToastService } from '@core/services/toast.service';
import { falhaDaApi } from '@core/utils/erro-api';
import { UiButton } from '@shared/ui/ui-button';
import { UiModal } from '@shared/ui/ui-modal';

const SUCESSO: Record<AcaoVinculo, string> = {
  suspender: 'Vínculo suspenso. O escritório deixa de alcançar os dados deste cliente.',
  reativar: 'Vínculo reativado.',
  encerrar: 'Vínculo encerrado. Para atender este cliente de novo, mande um convite novo.',
};

/**
 * O ciclo do vínculo de um cliente na ficha (#147): suspender, reativar e encerrar.
 *
 * Só o **administrador** do escritório mexe no vínculo; para as outras funções o servidor responde
 * 403, então elas não veem os botões (a função vem de `GET /api/escritorio`). Encerrar pede
 * confirmação porque **não volta**: atender de novo exige convite novo.
 *
 * O componente não decide o que a ficha faz depois — emite a situação nova em `mudou`.
 */
@Component({
  selector: 'app-vinculo-cliente',
  standalone: true,
  imports: [LucideLink2Off, UiButton, UiModal],
  template: `
    @if (administrador()) {
      <div class="flex flex-wrap items-center gap-2">
        @if (cliente().situacaoVinculo === 'ATIVO') {
          <ui-button
            variant="ghost"
            [carregando]="executando() === 'suspender'"
            [disabled]="!!executando()"
            (click)="executar('suspender')"
          >
            Suspender vínculo
          </ui-button>
        } @else if (cliente().situacaoVinculo === 'SUSPENSO') {
          <ui-button
            [carregando]="executando() === 'reativar'"
            [disabled]="!!executando()"
            (click)="executar('reativar')"
          >
            Reativar vínculo
          </ui-button>
        }
        @if (cliente().situacaoVinculo !== 'ENCERRADO') {
          <ui-button variant="perigo" [disabled]="!!executando()" (click)="confirmando.set(true)">
            <svg lucideLink2Off [size]="14" /> Encerrar vínculo
          </ui-button>
        }
      </div>
    }

    <ui-modal
      [aberto]="confirmando()"
      [titulo]="'Encerrar o vínculo com ' + cliente().nomeCompleto + '?'"
      descricao="O escritório perde o acesso aos dados deste cliente na hora, e isso não se desfaz: para atendê-lo de novo é preciso um convite novo, que ele precisa aceitar."
      tamanho="sm"
      [travado]="!!executando()"
      (fechar)="confirmando.set(false)"
    >
      <div rodape class="flex flex-wrap justify-end gap-2">
        <ui-button variant="ghost" [disabled]="!!executando()" (click)="confirmando.set(false)">
          Cancelar
        </ui-button>
        <ui-button
          variant="perigo"
          [carregando]="executando() === 'encerrar'"
          (click)="executar('encerrar')"
        >
          Encerrar
        </ui-button>
      </div>
    </ui-modal>
  `,
})
export class VinculoCliente implements OnInit {
  private readonly carteiraApi = inject(CarteiraApi);
  private readonly escritorioApi = inject(EscritorioApi);
  private readonly toast = inject(ToastService);

  readonly cliente = input.required<ProdutorCarteira>();
  /** A situação que o servidor devolveu depois da ação. */
  readonly mudou = output<SituacaoDoVinculo>();

  readonly administrador = signal(false);
  readonly executando = signal<AcaoVinculo | null>(null);
  readonly confirmando = signal(false);

  ngOnInit(): void {
    this.escritorioApi.ehAdministrador().subscribe((sim) => this.administrador.set(sim));
  }

  executar(acao: AcaoVinculo): void {
    if (this.executando()) return;
    this.executando.set(acao);
    this.carteiraApi.mudarVinculo(this.cliente().id, acao).subscribe({
      next: (situacao) => {
        this.executando.set(null);
        this.confirmando.set(false);
        this.toast.success(SUCESSO[acao]);
        this.mudou.emit(situacao);
      },
      error: (erro: HttpErrorResponse) => {
        this.executando.set(null);
        this.toast.error(VinculoCliente.mensagemDeErro(erro));
      },
    });
  }

  private static mensagemDeErro(erro: HttpErrorResponse): string {
    const falha = falhaDaApi(erro);
    if (erro.status === 403) {
      return 'Só o administrador do escritório suspende, reativa ou encerra vínculo.';
    }
    if (falha.codigo === 'VINCULO_SITUACAO_INVALIDA') {
      return 'A situação deste vínculo mudou. Recarregue a ficha para ver como ele está.';
    }
    return falha.mensagem;
  }
}
