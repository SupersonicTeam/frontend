import { Component, inject, input, signal } from '@angular/core';
import { LucideChevronDown, LucideChevronRight } from '@lucide/angular';
import { CarteiraApi } from '@services/contador/data-access/carteira.service';
import type { RevisaoNota } from '@services/notas/data-access/notas.service';

const ROTULO_ACAO: Record<string, string> = {
  ENVIADA: 'Enviada para revisão',
  RETIRADA: 'Retirada da revisão',
  APROVADA: 'Aprovada',
  DEVOLVIDA: 'Devolvida ao produtor',
  APROVACAO_CADUCADA: 'Aprovação caducou (a geração do XML falhou)',
};

/**
 * O histórico de revisão de uma nota, no lado do escritório (#150, backend#178).
 *
 * Fechado por padrão e buscado **só ao abrir**: a ficha lista várias notas, e o histórico é a
 * pergunta de uma delas ("já devolvi esta? por quê?"), não de todas.
 */
@Component({
  selector: 'app-historico-revisao',
  standalone: true,
  imports: [LucideChevronDown, LucideChevronRight],
  template: `
    <button
      type="button"
      class="tap-target inline-flex items-center gap-1 text-apoio font-medium text-primary"
      [attr.aria-expanded]="aberto()"
      (click)="alternar()"
    >
      @if (aberto()) {
        <svg lucideChevronDown [size]="16" aria-hidden="true" />
      } @else {
        <svg lucideChevronRight [size]="16" aria-hidden="true" />
      }
      Histórico da revisão
    </button>

    @if (aberto()) {
      <div class="mt-1 rounded-controle bg-surface-2 p-3 text-apoio">
        @if (carregando()) {
          <p class="text-muted-foreground">Buscando o histórico…</p>
        } @else if (erro()) {
          <p class="text-muted-foreground">Não foi possível carregar o histórico.</p>
        } @else if (revisoes().length === 0) {
          <p class="text-muted-foreground">Nenhum passo de revisão registrado.</p>
        } @else {
          <ol class="flex flex-col gap-1.5">
            @for (r of revisoes(); track r.id) {
              <li>
                <span class="font-medium text-foreground">{{ rotulo(r.acao) }}</span>
                <span class="text-muted-foreground">
                  · {{ r.papel === 'CONTADOR' ? 'escritório' : 'produtor' }} ·
                  {{ quando(r.ocorridoEm) }}
                </span>
                @if (r.motivo) {
                  <span class="block text-foreground">Motivo: {{ r.motivo }}</span>
                }
              </li>
            }
          </ol>
        }
      </div>
    }
  `,
})
export class HistoricoRevisao {
  private readonly carteiraApi = inject(CarteiraApi);

  readonly produtorId = input.required<string>();
  readonly notaId = input.required<string>();

  readonly aberto = signal(false);
  readonly carregando = signal(false);
  readonly erro = signal(false);
  readonly revisoes = signal<RevisaoNota[]>([]);
  private buscou = false;

  alternar(): void {
    this.aberto.update((v) => !v);
    if (this.aberto() && !this.buscou) this.buscar();
  }

  private buscar(): void {
    this.buscou = true;
    this.carregando.set(true);
    this.erro.set(false);
    this.carteiraApi.revisoesDaNota(this.produtorId(), this.notaId()).subscribe({
      next: (lista) => {
        // Do mais antigo para o mais novo: é a ordem em que a conversa aconteceu.
        this.revisoes.set([...lista].sort((a, b) => a.ocorridoEm.localeCompare(b.ocorridoEm)));
        this.carregando.set(false);
      },
      error: () => {
        // Falhou: a próxima abertura tenta de novo.
        this.buscou = false;
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
