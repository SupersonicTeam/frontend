import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { LucideHistory } from '@lucide/angular';
import {
  CarteiraApi,
  type RegistroAuditoria,
} from '@services/contador/data-access/carteira.service';
import { UiButton } from '@shared/ui/ui-button';
import { UiSkeleton } from '@shared/ui/ui-skeleton';

/** Registros por página. O servidor aceita até 200; 20 cabem na ficha sem rolar demais. */
const POR_PAGINA = 20;

const ROTULO_ACAO: Record<string, string> = {
  NOTA_CRIADA: 'Nota criada',
  NOTA_ATUALIZADA: 'Nota editada',
  NOTA_EXCLUIDA: 'Nota excluída',
  NOTA_XML_GERADO: 'XML da nota gerado',
  NOTA_ENVIADA_SEFAZ: 'Nota enviada à SEFAZ',
  NOTA_CANCELADA: 'Nota cancelada',
  NOTAS_IMPORTADAS: 'Notas importadas',
  NOTA_ENVIADA_REVISAO: 'Nota enviada para revisão',
  NOTA_RETIRADA_REVISAO: 'Nota retirada da revisão',
  NOTA_APROVADA: 'Nota aprovada',
  NOTA_DEVOLVIDA: 'Nota devolvida',
  GUIA_CRIADA: 'Guia lançada',
  GUIA_PAGA: 'Guia paga',
  APURACAO_REABERTA: 'Apuração reaberta',
  SENHA_ALTERADA: 'Senha alterada',
  SESSOES_ENCERRADAS: 'Saiu de todos os dispositivos',
  DADOS_PESSOAIS_EXCLUIDOS: 'Dados pessoais excluídos',
  CONVITE_ENVIADO: 'Convite enviado',
  CONVITE_ACEITO: 'Convite aceito',
  CONVITE_RECUSADO: 'Convite recusado',
  VINCULO_SUSPENSO: 'Vínculo suspenso',
  VINCULO_REATIVADO: 'Vínculo reativado',
  VINCULO_ENCERRADO: 'Vínculo encerrado',
  RESPONSAVEL_ALTERADO: 'Responsável alterado',
  PENDENCIA_CRIADA: 'Documento pedido',
  PENDENCIA_ANEXO_ENVIADO: 'Documento enviado',
  PENDENCIA_CONCLUIDA: 'Documento aceito',
  PENDENCIA_REJEITADA: 'Documento devolvido',
  PENDENCIA_CANCELADA: 'Pedido cancelado',
  PENDENCIA_REABERTA: 'Pedido reaberto',
  PENDENCIA_ANEXO_INFECTADO: 'Arquivo recusado pelo antivírus',
};

/**
 * O histórico de operações do cliente na ficha (#137, RNF012): a trilha de auditoria que o backend
 * guarda por 5 anos — notas, guias, reabertura de apuração, conta, vínculo e pedidos.
 *
 * Só ações, papéis e resultados: o backend não registra dado pessoal. Paginado pelo
 * `X-Total-Count`. O 404 tem frase própria: o cliente saiu da carteira, e repetir não muda isso.
 */
@Component({
  selector: 'app-historico-operacoes',
  standalone: true,
  imports: [LucideHistory, UiButton, UiSkeleton],
  template: `
    <section
      class="rounded-card border border-border bg-card p-4"
      aria-labelledby="historico-operacoes"
    >
      <h2
        id="historico-operacoes"
        class="flex items-center gap-2 font-heading font-semibold text-foreground"
      >
        <svg lucideHistory [size]="18" aria-hidden="true" />
        Histórico de operações
      </h2>

      <div class="mt-3">
        @if (carregando()) {
          <ui-skeleton [linhas]="3" />
        } @else if (foraDaCarteira()) {
          <p class="text-apoio text-muted-foreground">
            Este produtor não está mais na carteira do escritório; o histórico dele não é
            alcançável.
          </p>
        } @else if (erro()) {
          <div
            class="flex flex-wrap items-center justify-between gap-3 text-apoio text-muted-foreground"
          >
            <span>Não foi possível carregar o histórico.</span>
            <ui-button variant="ghost" (click)="carregar(pagina())">Tentar de novo</ui-button>
          </div>
        } @else if (registros().length === 0) {
          <p class="text-apoio text-muted-foreground">
            Nenhuma operação registrada para este cliente.
          </p>
        } @else {
          <ol class="divide-y divide-border">
            @for (r of registros(); track r.id) {
              <li class="flex flex-wrap items-baseline justify-between gap-2 py-2 text-apoio">
                <span class="min-w-0">
                  <span class="font-medium text-foreground">{{ rotulo(r.acao) }}</span>
                  <span class="text-muted-foreground">
                    · {{ r.papel === 'CONTADOR' ? 'escritório' : 'produtor' }}
                  </span>
                </span>
                <span class="flex items-center gap-2 text-muted-foreground">
                  @if (!r.sucesso) {
                    <span class="rounded-full bg-perigo-soft px-2 text-perigo-ink">
                      falhou{{ r.codigoErro ? ': ' + r.codigoErro : '' }}
                    </span>
                  }
                  {{ quando(r.ocorridoEm) }}
                </span>
              </li>
            }
          </ol>

          @if (totalPaginas() > 1) {
            <div
              class="mt-2 flex flex-wrap items-center justify-between gap-2 text-apoio text-muted-foreground"
            >
              <span
                >Página {{ pagina() + 1 }} de {{ totalPaginas() }} · {{ total() }} operações</span
              >
              <div class="flex gap-2">
                <ui-button
                  variant="ghost"
                  [disabled]="pagina() === 0"
                  (click)="carregar(pagina() - 1)"
                >
                  Mais recentes
                </ui-button>
                <ui-button
                  variant="ghost"
                  [disabled]="pagina() + 1 >= totalPaginas()"
                  (click)="carregar(pagina() + 1)"
                >
                  Mais antigas
                </ui-button>
              </div>
            </div>
          }
        }
      </div>
    </section>
  `,
})
export class HistoricoOperacoes implements OnInit {
  private readonly carteiraApi = inject(CarteiraApi);

  readonly produtorId = input.required<string>();

  readonly registros = signal<RegistroAuditoria[]>([]);
  readonly total = signal(0);
  readonly pagina = signal(0);
  readonly carregando = signal(true);
  readonly erro = signal(false);
  readonly foraDaCarteira = signal(false);

  readonly totalPaginas = computed(() => Math.max(1, Math.ceil(this.total() / POR_PAGINA)));

  /** Troca de página com resposta em voo: a de antes não entra. */
  private vez = 0;

  ngOnInit(): void {
    this.carregar(0);
  }

  carregar(pagina: number): void {
    const vez = ++this.vez;
    this.carregando.set(true);
    this.erro.set(false);
    this.carteiraApi.auditoriaDoCliente(this.produtorId(), pagina, POR_PAGINA).subscribe({
      next: ({ itens, total }) => {
        if (vez !== this.vez) return;
        this.registros.set(itens);
        this.total.set(total);
        this.pagina.set(pagina);
        this.carregando.set(false);
      },
      error: (erro: HttpErrorResponse) => {
        if (vez !== this.vez) return;
        this.foraDaCarteira.set(erro.status === 404);
        this.erro.set(true);
        this.carregando.set(false);
      },
    });
  }

  rotulo(acao: string): string {
    return ROTULO_ACAO[acao] ?? acao;
  }

  quando(iso: string): string {
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? iso
      : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }
}
