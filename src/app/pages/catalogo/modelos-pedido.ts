import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastService } from '@core/services/toast.service';
import { falhaDaApi } from '@core/utils/erro-api';
import {
  TIPOS_DOCUMENTO,
  TIPO_DOCUMENTO_LABEL,
  type TipoDocumentoPendencia,
} from '@models/pendencia.model';
import { EscritorioApi } from '@services/escritorio/data-access/escritorio.service';
import {
  LIMITE_DE_MODELOS,
  ModelosPedidoApi,
  type ModeloPedido,
  type ModeloPedidoRequest,
} from '@services/contador/data-access/modelos-pedido.service';
import { UiButton } from '@shared/ui/ui-button';
import { UiEmptyState } from '@shared/ui/ui-empty-state';
import { UiModal } from '@shared/ui/ui-modal';
import { UiSkeleton } from '@shared/ui/ui-skeleton';

/**
 * Os modelos de pedido de documento do escritório (#185, backend#517).
 *
 * Aqui eles são **criados e mantidos**; quem os usa é o formulário de pedir documento da ficha
 * do cliente ("Usar um modelo"). O modelo é do escritório — vem do servidor, e todo membro vê o
 * mesmo. Nada de lista fixa no código nem de `localStorage`.
 *
 * Só o administrador cria, edita e apaga; os outros leem. Como nas obrigações, na dúvida sobre a
 * função ninguém vê botão, e o 403 continua tratado.
 */
@Component({
  selector: 'app-modelos-pedido',
  standalone: true,
  imports: [UiButton, UiEmptyState, UiModal, UiSkeleton],
  templateUrl: './modelos-pedido.html',
})
export class ModelosPedido implements OnInit {
  private readonly api = inject(ModelosPedidoApi);
  private readonly escritorioApi = inject(EscritorioApi);
  private readonly toast = inject(ToastService);

  readonly modelos = signal<ModeloPedido[]>([]);
  readonly carregando = signal(true);
  readonly falhaAoCarregar = signal('');
  readonly administrador = signal(false);

  readonly tiposPossiveis = TIPOS_DOCUMENTO;
  readonly rotuloDoTipo = TIPO_DOCUMENTO_LABEL;

  /** O escritório chegou ao teto: o servidor recusaria o 51º com 409. */
  readonly noLimite = computed(() => this.modelos().length >= LIMITE_DE_MODELOS);

  // ── Formulário (criar e editar) ──
  /** `undefined` = fechado; `null` = criando; um modelo = editando. */
  readonly emEdicao = signal<ModeloPedido | null | undefined>(undefined);
  readonly titulo = signal('');
  readonly descricao = signal('');
  readonly tipos = signal<TipoDocumentoPendencia[]>([]);
  readonly prazo = signal('');
  readonly observacoes = signal('');
  readonly salvando = signal(false);
  readonly erroDoFormulario = signal('');
  /** O 409 de título repetido mora sob o campo, não no topo. */
  readonly erroDoTitulo = signal('');

  readonly valido = computed(() => {
    const titulo = this.titulo().trim();
    const n = this.tipos().length;
    const prazo = this.prazo().trim();
    const dias = Number(prazo);
    const prazoOk = prazo === '' || (Number.isInteger(dias) && dias >= 1 && dias <= 365);
    return titulo.length > 0 && titulo.length <= 120 && n >= 1 && n <= 5 && prazoOk;
  });

  // ── Apagar ──
  readonly apagando = signal<ModeloPedido | null>(null);
  readonly confirmandoApagar = signal(false);

  ngOnInit(): void {
    this.carregar();
    this.escritorioApi.ehAdministrador().subscribe((sim) => this.administrador.set(sim));
  }

  carregar(): void {
    this.carregando.set(true);
    this.falhaAoCarregar.set('');
    this.api.listar().subscribe({
      next: (lista) => {
        this.modelos.set(lista);
        this.carregando.set(false);
      },
      error: (erro: HttpErrorResponse) => {
        this.carregando.set(false);
        this.falhaAoCarregar.set(falhaDaApi(erro).mensagem);
      },
    });
  }

  abrirFormulario(modelo: ModeloPedido | null): void {
    this.titulo.set(modelo?.titulo ?? '');
    this.descricao.set(modelo?.descricao ?? '');
    this.tipos.set(modelo ? [...modelo.tiposDocumento] : []);
    this.prazo.set(modelo?.prazoEmDias ? String(modelo.prazoEmDias) : '');
    this.observacoes.set(modelo?.observacoes ?? '');
    this.erroDoFormulario.set('');
    this.erroDoTitulo.set('');
    this.emEdicao.set(modelo);
  }

  fecharFormulario(): void {
    this.emEdicao.set(undefined);
  }

  alternarTipo(tipo: TipoDocumentoPendencia): void {
    this.tipos.update((atuais) =>
      atuais.includes(tipo) ? atuais.filter((t) => t !== tipo) : [...atuais, tipo],
    );
  }

  /** "em 10 dias" · "sem prazo". */
  prazoPorExtenso(modelo: ModeloPedido): string {
    if (!modelo.prazoEmDias) return 'sem prazo';
    return modelo.prazoEmDias === 1 ? 'prazo de 1 dia' : `prazo de ${modelo.prazoEmDias} dias`;
  }

  tiposPorExtenso(modelo: ModeloPedido): string {
    return modelo.tiposDocumento.map((t) => this.rotuloDoTipo[t] ?? t).join(', ');
  }

  salvar(): void {
    if (!this.valido() || this.salvando()) return;

    const corpo: ModeloPedidoRequest = {
      titulo: this.titulo().trim(),
      tiposDocumento: this.tipos(),
    };
    if (this.descricao().trim()) corpo.descricao = this.descricao().trim();
    if (this.prazo().trim()) corpo.prazoEmDias = Number(this.prazo());
    if (this.observacoes().trim()) corpo.observacoes = this.observacoes().trim();

    const atual = this.emEdicao();
    const chamada = atual ? this.api.atualizar(atual.id, corpo) : this.api.criar(corpo);

    this.salvando.set(true);
    this.erroDoFormulario.set('');
    this.erroDoTitulo.set('');
    chamada.subscribe({
      next: (salvo) => {
        this.salvando.set(false);
        this.modelos.update((lista) =>
          // A lista vem do servidor em ordem de título; aqui a ordem se mantém igual.
          (atual ? lista.map((m) => (m.id === atual.id ? salvo : m)) : [...lista, salvo]).sort(
            (a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR', { sensitivity: 'base' }),
          ),
        );
        this.toast.success(atual ? 'Modelo atualizado.' : 'Modelo criado.');
        this.fecharFormulario();
      },
      error: (erro: HttpErrorResponse) => {
        this.salvando.set(false);
        const falha = falhaDaApi(erro);
        if (falha.codigo === 'MODELO_PEDIDO_DUPLICADO') {
          this.erroDoTitulo.set('Já existe um modelo com este nome no escritório.');
          return;
        }
        this.erroDoFormulario.set(this.fraseDaFalha(erro, falha.codigo, falha.mensagem));
      },
    });
  }

  apagar(): void {
    const modelo = this.apagando();
    if (!modelo || this.confirmandoApagar()) return;
    this.confirmandoApagar.set(true);
    this.api.apagar(modelo.id).subscribe({
      next: () => {
        this.confirmandoApagar.set(false);
        this.modelos.update((lista) => lista.filter((m) => m.id !== modelo.id));
        this.apagando.set(null);
        this.toast.success('Modelo apagado.');
      },
      error: (erro: HttpErrorResponse) => {
        this.confirmandoApagar.set(false);
        this.apagando.set(null);
        // 404: outra pessoa já apagou. A lista daqui estava velha — recarrega em vez de insistir.
        if (erro.status === 404) {
          this.toast.error('Este modelo já tinha sido apagado.');
          this.carregar();
          return;
        }
        const falha = falhaDaApi(erro);
        this.toast.error(this.fraseDaFalha(erro, falha.codigo, falha.mensagem));
      },
    });
  }

  private fraseDaFalha(erro: HttpErrorResponse, codigo: string | undefined, mensagem: string) {
    if (erro.status === 403) return 'Só o administrador do escritório pode mudar os modelos.';
    if (codigo === 'LIMITE_MODELOS_PEDIDO') {
      return `O escritório já tem ${LIMITE_DE_MODELOS} modelos, que é o máximo. Apague um para criar outro.`;
    }
    return mensagem;
  }
}
