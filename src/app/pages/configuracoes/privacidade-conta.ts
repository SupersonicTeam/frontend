import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideShieldCheck } from '@lucide/angular';
import { AuthApi, ContaError } from '@services/auth/data-access/auth.service';
import { EncerramentoService } from '@core/services/encerramento.service';
import { ToastService } from '@core/services/toast.service';
import { UiButton } from '@shared/ui/ui-button';

/**
 * Privacidade e dados, em Configurações (#137, LGPD): a política e a exclusão da conta.
 *
 * Excluir é em **duas etapas** de propósito. A primeira só explica o que acontece — inclusive o que
 * **fica**: CPF/CNPJ, inscrição estadual e UF são guardados por 5 anos, porque documento fiscal tem
 * guarda legal (CTN art. 173; LGPD art. 16, I). Dizer "apagamos tudo" seria falso. A segunda pede
 * a senha. Depois do 204 o servidor já encerrou todas as sessões; aqui fica o mesmo encerramento
 * local do "sair de todos os dispositivos".
 */
@Component({
  selector: 'app-privacidade-conta',
  standalone: true,
  imports: [RouterLink, LucideShieldCheck, UiButton],
  template: `
    <div class="flex flex-col gap-3 rounded-card border border-border bg-card p-5 shadow-suave">
      <h2 class="flex items-center gap-2 font-heading text-lg font-semibold text-foreground">
        <svg lucideShieldCheck [size]="18" class="text-primary" />
        Privacidade e dados
      </h2>
      <p class="text-apoio text-muted-foreground">
        Como tratamos os seus dados, para quê e por quanto tempo está na
        <a
          routerLink="/politica-dados"
          class="tap-target inline-flex items-center font-medium text-primary underline"
          >política de dados</a
        >.
      </p>

      @if (etapa() === 0) {
        <div>
          <ui-button variant="ghost" (click)="etapa.set(1)">Excluir minha conta</ui-button>
        </div>
      } @else {
        <div class="space-y-3 rounded-controle border border-perigo/30 bg-perigo-soft p-4">
          <p class="text-apoio font-semibold text-perigo-ink">
            O que acontece se você excluir a conta
          </p>
          <ul class="list-disc space-y-1 pl-5 text-apoio text-foreground">
            <li>
              Nome, contato e endereço são apagados, e você sai de todos os dispositivos na hora.
            </li>
            <li>
              <strong>CPF/CNPJ, inscrição estadual e UF ficam guardados por 5 anos</strong>:
              documento fiscal tem guarda obrigatória por lei, e as suas notas continuam ligadas a
              eles.
            </li>
            <li>Não dá para desfazer. Para usar o sistema de novo, é preciso criar outra conta.</li>
          </ul>

          @if (etapa() === 1) {
            <div class="flex flex-wrap gap-2">
              <ui-button variant="perigo" (click)="etapa.set(2)"
                >Entendi, quero continuar</ui-button
              >
              <ui-button variant="ghost" (click)="cancelar()">Cancelar</ui-button>
            </div>
          } @else {
            <form class="space-y-2" (submit)="$event.preventDefault(); excluir()">
              <label class="flex flex-col gap-1 text-apoio font-medium text-foreground">
                Confirme com a sua senha
                <input
                  type="password"
                  autocomplete="current-password"
                  class="tap-target rounded-controle border border-border bg-background px-3 text-apoio"
                  [value]="senha()"
                  (input)="senha.set($any($event.target).value); erro.set(null)"
                />
              </label>
              @if (erro(); as e) {
                <p role="alert" class="text-apoio text-perigo-ink">{{ e }}</p>
              }
              <div class="flex flex-wrap gap-2">
                <ui-button
                  type="submit"
                  variant="perigo"
                  [disabled]="!senha()"
                  [carregando]="excluindo()"
                >
                  Excluir minha conta definitivamente
                </ui-button>
                <ui-button variant="ghost" [disabled]="excluindo()" (click)="cancelar()"
                  >Cancelar</ui-button
                >
              </div>
            </form>
          }
        </div>
      }
    </div>
  `,
})
export class PrivacidadeConta {
  private readonly auth = inject(AuthApi);
  private readonly encerramento = inject(EncerramentoService);
  private readonly toast = inject(ToastService);

  /** 0 = fechado; 1 = lendo o que acontece; 2 = confirmando com a senha. */
  readonly etapa = signal<0 | 1 | 2>(0);
  readonly senha = signal('');
  readonly excluindo = signal(false);
  readonly erro = signal<string | null>(null);

  cancelar(): void {
    this.etapa.set(0);
    this.senha.set('');
    this.erro.set(null);
  }

  excluir(): void {
    if (!this.senha() || this.excluindo()) return;
    this.excluindo.set(true);
    this.erro.set(null);
    this.auth.excluirMinhaConta(this.senha()).subscribe({
      next: () => {
        this.excluindo.set(false);
        this.toast.success('A sua conta foi excluída.');
        this.encerramento.encerrar();
      },
      error: (falha: ContaError) => {
        this.excluindo.set(false);
        this.senha.set('');
        this.erro.set(
          falha.codigo === 'SENHA_ATUAL_INCORRETA'
            ? 'Senha incorreta. Confira e tente de novo.'
            : falha.status === 404
              ? 'Não foi possível identificar a sua conta. Saia, entre de novo e tente outra vez.'
              : falha.message,
        );
      },
    });
  }
}
