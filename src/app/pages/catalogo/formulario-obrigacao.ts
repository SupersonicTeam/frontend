import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ToastService } from '@core/services/toast.service';
import { falhaDaApi } from '@core/utils/erro-api';
import {
  ObrigacoesApi,
  PERIODICIDADES,
  REGIMES_DA_OBRIGACAO,
  type ObrigacaoCatalogo,
  type ObrigacaoRequest,
} from '@services/contador/data-access/obrigacoes.service';
import { UiButton } from '@shared/ui/ui-button';
import { UiModal } from '@shared/ui/ui-modal';

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

const REGIME_LABEL: Record<string, string> = {
  MEI: 'MEI',
  SIMPLES: 'Simples Nacional',
  PRESUMIDO: 'Lucro presumido',
  REAL: 'Lucro real',
};

/**
 * Criar ou editar uma obrigação do catálogo do escritório (#185, backend#181).
 *
 * As rotas existiam desde a #181 (`POST` e `PUT /api/contador/obrigacoes`); o que faltava era a
 * tela, e a antiga dizia isso ao contador citando o nome das rotas.
 *
 * Três regras do servidor que o formulário respeita antes de enviar:
 *
 * - **o mês só existe na anual.** Mensal com mês e anual sem mês respondem 400
 *   `OBRIGACAO_INVALIDA`; aqui o campo simplesmente não aparece na mensal e é obrigatório na anual;
 * - **editar um modelo do sistema não altera o modelo**: o servidor cria a versão do escritório e
 *   devolve **id novo**. Quem recebe o `salvo` troca o item pelo que voltou;
 * - **o `PUT` substitui a obrigação inteira.** O ajuste de fim de semana não é editado aqui, então
 *   volta como veio — senão corrigir um título apagaria a regra de antecipar o vencimento.
 */
@Component({
  selector: 'app-formulario-obrigacao',
  standalone: true,
  imports: [UiButton, UiModal],
  template: `
    <ui-modal
      [aberto]="true"
      [titulo]="obrigacao() ? 'Editar a obrigação' : 'Nova obrigação'"
      [descricao]="descricaoDoModal()"
      tamanho="md"
      [travado]="salvando()"
      (fechar)="fechar.emit()"
    >
      <div class="flex flex-col gap-3">
        @if (erro()) {
          <p
            role="alert"
            class="rounded-controle border border-perigo-borda bg-perigo-soft px-3 py-2 text-apoio text-perigo-ink"
          >
            {{ erro() }}
          </p>
        }

        <label class="flex flex-col gap-1 text-apoio font-medium text-foreground">
          Nome da obrigação
          <input
            class="tap-target rounded-controle border border-border bg-background px-3 text-apoio font-normal"
            maxlength="120"
            placeholder="Guia do Funrural"
            [value]="titulo()"
            (input)="titulo.set($any($event.target).value)"
          />
        </label>

        <div class="grid gap-3 sm:grid-cols-3">
          <label class="flex flex-col gap-1 text-apoio font-medium text-foreground">
            Repete
            <select
              class="tap-target rounded-controle border border-border bg-background px-3 text-apoio font-normal"
              [value]="periodicidade()"
              (change)="periodicidade.set($any($event.target).value)"
            >
              <option value="MENSAL">Todo mês</option>
              <option value="ANUAL">Uma vez por ano</option>
            </select>
          </label>

          <label class="flex flex-col gap-1 text-apoio font-medium text-foreground">
            Dia do vencimento
            <input
              type="number"
              inputmode="numeric"
              min="1"
              max="31"
              class="tap-target rounded-controle border border-border bg-background px-3 text-apoio font-normal"
              [value]="dia()"
              (input)="dia.set($any($event.target).value)"
            />
          </label>

          <!-- O mês só existe na anual: mensal com mês é 400 OBRIGACAO_INVALIDA no servidor. -->
          @if (periodicidade() === 'ANUAL') {
            <label class="flex flex-col gap-1 text-apoio font-medium text-foreground">
              Mês
              <select
                class="tap-target rounded-controle border border-border bg-background px-3 text-apoio font-normal"
                [value]="mes()"
                (change)="mes.set($any($event.target).value)"
              >
                <option value="">Escolha</option>
                @for (nome of meses; track nome; let i = $index) {
                  <option [value]="i + 1">{{ nome }}</option>
                }
              </select>
            </label>
          }
        </div>
        <p class="-mt-1 text-apoio text-muted-foreground">
          Em mês que não tem esse dia, o vencimento cai no último dia do mês.
        </p>

        <label class="flex flex-col gap-1 text-apoio font-medium text-foreground">
          Descrição (opcional)
          <textarea
            rows="2"
            maxlength="500"
            class="rounded-controle border border-border bg-background px-3 py-2 text-apoio font-normal"
            [value]="descricao()"
            (input)="descricao.set($any($event.target).value)"
          ></textarea>
        </label>

        <label class="flex flex-col gap-1 text-apoio font-medium text-foreground">
          Fundamento legal (opcional)
          <input
            class="tap-target rounded-controle border border-border bg-background px-3 text-apoio font-normal"
            maxlength="200"
            placeholder="Lei 8.212/1991"
            [value]="origem()"
            (input)="origem.set($any($event.target).value)"
          />
        </label>

        <label class="flex flex-col gap-1 text-apoio font-medium text-foreground">
          Vale para
          <select
            class="tap-target rounded-controle border border-border bg-background px-3 text-apoio font-normal"
            [value]="tipoProdutor()"
            (change)="tipoProdutor.set($any($event.target).value)"
          >
            <option value="">Todos os clientes</option>
            <option value="PESSOA_FISICA">Só pessoa física</option>
            <option value="PESSOA_JURIDICA">Só pessoa jurídica</option>
          </select>
        </label>

        <fieldset class="flex flex-col gap-1">
          <legend class="text-apoio font-medium text-foreground">Regimes</legend>
          <div class="flex flex-wrap gap-x-4 gap-y-1">
            @for (r of regimesPossiveis; track r) {
              <label class="tap-target flex items-center gap-2 text-apoio text-foreground">
                <input
                  type="checkbox"
                  class="size-4 accent-primary"
                  [checked]="regimes().includes(r)"
                  (change)="alternarRegime(r)"
                />
                {{ rotuloDoRegime[r] }}
              </label>
            }
          </div>
          <p class="text-apoio text-muted-foreground">Sem marcar nenhum, vale para todos.</p>
        </fieldset>
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
export class FormularioObrigacao implements OnInit {
  private readonly api = inject(ObrigacoesApi);
  private readonly toast = inject(ToastService);

  /** A obrigação em edição; sem ela, o formulário cria uma própria do escritório. */
  readonly obrigacao = input<ObrigacaoCatalogo | null>(null);
  /** O que o servidor devolveu — na edição de um modelo, vem com **id novo**. */
  readonly salvo = output<ObrigacaoCatalogo>();
  readonly fechar = output<void>();

  readonly meses = MESES;
  readonly periodicidadesPossiveis = PERIODICIDADES;
  readonly regimesPossiveis = REGIMES_DA_OBRIGACAO;
  readonly rotuloDoRegime = REGIME_LABEL;

  readonly titulo = signal('');
  readonly periodicidade = signal<string>('MENSAL');
  readonly dia = signal('');
  readonly mes = signal('');
  readonly descricao = signal('');
  readonly origem = signal('');
  readonly tipoProdutor = signal('');
  readonly regimes = signal<string[]>([]);
  readonly salvando = signal(false);
  readonly erro = signal('');

  readonly descricaoDoModal = computed(() =>
    this.obrigacao()?.origemCatalogo === 'MODELO'
      ? 'Este é um padrão do sistema: ao salvar, o escritório passa a ter a própria versão dele.'
      : 'Depois de salva, ela aparece no calendário dos clientes a que se aplica.',
  );

  readonly valido = computed(() => {
    const titulo = this.titulo().trim();
    const dia = Number(this.dia());
    const diaOk = Number.isInteger(dia) && dia >= 1 && dia <= 31;
    const mesOk = this.periodicidade() !== 'ANUAL' || this.mes() !== '';
    return titulo.length > 0 && titulo.length <= 120 && diaOk && mesOk;
  });

  ngOnInit(): void {
    const o = this.obrigacao();
    if (!o) return;
    this.titulo.set(o.titulo);
    this.periodicidade.set(o.periodicidade);
    this.dia.set(String(o.dia));
    this.mes.set(o.mes ? String(o.mes) : '');
    this.descricao.set(o.descricao ?? '');
    this.origem.set(o.origem ?? '');
    this.tipoProdutor.set(o.tipoProdutor ?? '');
    this.regimes.set([...o.regimes]);
  }

  alternarRegime(regime: string): void {
    this.regimes.update((atuais) =>
      atuais.includes(regime) ? atuais.filter((r) => r !== regime) : [...atuais, regime],
    );
  }

  salvar(): void {
    if (!this.valido() || this.salvando()) return;

    const corpo: ObrigacaoRequest = {
      titulo: this.titulo().trim(),
      periodicidade: this.periodicidade(),
      dia: Number(this.dia()),
      regimes: this.regimes(),
    };
    // O mês só vai na anual: mandá-lo na mensal é 400 `OBRIGACAO_INVALIDA`.
    if (this.periodicidade() === 'ANUAL') corpo.mes = Number(this.mes());
    if (this.descricao().trim()) corpo.descricao = this.descricao().trim();
    if (this.origem().trim()) corpo.origem = this.origem().trim();
    if (this.tipoProdutor()) corpo.tipoProdutor = this.tipoProdutor();
    // O `PUT` substitui tudo: o ajuste de fim de semana não é editado aqui e volta como veio.
    const ajuste = this.obrigacao()?.ajusteFimDeSemana;
    if (ajuste) corpo.ajusteFimDeSemana = ajuste;

    const atual = this.obrigacao();
    const chamada = atual ? this.api.atualizar(atual.id, corpo) : this.api.criar(corpo);

    this.salvando.set(true);
    this.erro.set('');
    chamada.subscribe({
      next: (salva) => {
        this.salvando.set(false);
        this.toast.success(atual ? 'Obrigação atualizada.' : 'Obrigação criada.');
        this.salvo.emit(salva);
      },
      error: (falha: HttpErrorResponse) => {
        this.salvando.set(false);
        // O erro fica **dentro** do formulário: é aqui que a pessoa corrige. O 403 tem frase
        // própria — quem chegou a abrir o formulário sem ser administrador (a função mudou com
        // a tela aberta) precisa saber que não é defeito.
        this.erro.set(
          falha.status === 403
            ? 'Só o administrador do escritório pode mudar o catálogo de obrigações.'
            : falhaDaApi(falha).mensagem,
        );
      },
    });
  }
}
