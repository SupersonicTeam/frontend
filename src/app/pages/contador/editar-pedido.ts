import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import {
  CarteiraApi,
  type NovoPedidoDocumento,
} from '@services/contador/data-access/carteira.service';
import {
  type Pendencia,
  type TipoDocumentoPendencia,
  TIPO_DOCUMENTO_LABEL,
  TIPOS_DOCUMENTO,
} from '@models/pendencia.model';
import { ToastService } from '@core/services/toast.service';
import { falhaDaApi } from '@core/utils/erro-api';
import { UiButton } from '@shared/ui/ui-button';
import { UiModal } from '@shared/ui/ui-modal';

/**
 * Editar um pedido de documento **ainda pendente** (#150, `PUT .../pendencias/{id}`).
 *
 * O `PUT` substitui o pedido inteiro, então o formulário nasce com tudo o que o pedido tem —
 * inclusive as observações, que a criação não pede mas o servidor guarda. Depois que o produtor
 * mandou arquivo, o pedido não é mais editável: o servidor recusa com 409, e a ficha só oferece
 * "Editar" em `PENDENTE`.
 */
@Component({
  selector: 'app-editar-pedido',
  standalone: true,
  imports: [UiButton, UiModal],
  template: `
    <ui-modal
      [aberto]="true"
      titulo="Editar o pedido"
      descricao="O produtor vê o pedido atualizado na hora."
      tamanho="md"
      [travado]="salvando()"
      (fechar)="fechar.emit()"
    >
      <div class="flex flex-col gap-3">
        <label class="flex flex-col gap-1 text-apoio font-medium text-foreground">
          O que você precisa
          <input
            class="tap-target rounded-controle border border-border bg-background px-3 text-apoio"
            maxlength="120"
            [value]="titulo()"
            (input)="titulo.set($any($event.target).value)"
          />
        </label>
        <fieldset class="flex flex-col gap-1">
          <legend class="text-apoio font-medium text-foreground">Tipos de documento (até 5)</legend>
          <div class="flex flex-wrap gap-2">
            @for (t of tiposPossiveis; track t) {
              <label class="tap-target flex items-center gap-2 text-apoio text-foreground">
                <input
                  type="checkbox"
                  class="size-4 accent-primary"
                  [checked]="tipos().includes(t)"
                  (change)="alternarTipo(t)"
                />
                {{ rotuloDoTipo[t] }}
              </label>
            }
          </div>
        </fieldset>
        <label class="flex flex-col gap-1 text-apoio font-medium text-foreground">
          Prazo (opcional)
          <input
            type="date"
            class="tap-target rounded-controle border border-border bg-background px-3 text-apoio"
            [value]="prazo()"
            (input)="prazo.set($any($event.target).value)"
          />
        </label>
        <label class="flex flex-col gap-1 text-apoio font-medium text-foreground">
          Detalhes (opcional)
          <textarea
            rows="3"
            maxlength="1000"
            class="rounded-controle border border-border bg-background px-3 py-2 text-apoio"
            [value]="descricao()"
            (input)="descricao.set($any($event.target).value)"
          ></textarea>
        </label>
      </div>

      <div rodape class="flex flex-wrap justify-end gap-2">
        <ui-button variant="ghost" [disabled]="salvando()" (click)="fechar.emit()">
          Cancelar
        </ui-button>
        <ui-button [disabled]="!valido()" [carregando]="salvando()" (click)="salvar()">
          Salvar
        </ui-button>
      </div>
    </ui-modal>
  `,
})
export class EditarPedido implements OnInit {
  private readonly carteiraApi = inject(CarteiraApi);
  private readonly toast = inject(ToastService);

  readonly produtorId = input.required<string>();
  readonly pendencia = input.required<Pendencia>();
  readonly salvo = output<Pendencia>();
  readonly fechar = output<void>();

  readonly tiposPossiveis = TIPOS_DOCUMENTO;
  readonly rotuloDoTipo = TIPO_DOCUMENTO_LABEL;

  readonly titulo = signal('');
  readonly tipos = signal<TipoDocumentoPendencia[]>([]);
  readonly prazo = signal('');
  readonly descricao = signal('');
  readonly salvando = signal(false);

  readonly valido = computed(() => {
    const titulo = this.titulo().trim();
    const n = this.tipos().length;
    return titulo.length > 0 && titulo.length <= 120 && n >= 1 && n <= 5;
  });

  ngOnInit(): void {
    const p = this.pendencia();
    this.titulo.set(p.titulo);
    this.tipos.set([...p.tiposDocumento]);
    this.prazo.set(p.dataLimite ?? '');
    this.descricao.set(p.descricao ?? '');
  }

  alternarTipo(tipo: TipoDocumentoPendencia): void {
    this.tipos.update((atuais) =>
      atuais.includes(tipo) ? atuais.filter((t) => t !== tipo) : [...atuais, tipo],
    );
  }

  salvar(): void {
    if (!this.valido() || this.salvando()) return;
    const pedido: NovoPedidoDocumento = {
      titulo: this.titulo().trim(),
      tiposDocumento: this.tipos(),
    };
    if (this.prazo()) pedido.dataLimite = this.prazo();
    if (this.descricao().trim()) pedido.descricao = this.descricao().trim();
    // As observações não aparecem aqui, mas o PUT substitui tudo: vão como estavam.
    const observacoes = this.pendencia().observacoes;
    if (observacoes) pedido.observacoes = observacoes;

    this.salvando.set(true);
    this.carteiraApi.editarPendencia(this.produtorId(), this.pendencia().id, pedido).subscribe({
      next: (atualizada) => {
        this.salvando.set(false);
        this.toast.success('Pedido atualizado.');
        this.salvo.emit(atualizada);
      },
      error: (erro: HttpErrorResponse) => {
        this.salvando.set(false);
        this.toast.error(
          erro.status === 409
            ? 'O produtor já respondeu a este pedido; ele não pode mais ser editado. Recarregue a ficha.'
            : falhaDaApi(erro).mensagem,
        );
      },
    });
  }
}
