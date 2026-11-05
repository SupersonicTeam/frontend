import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  PrivacidadeApi,
  type PoliticaDados,
} from '@services/privacidade/data-access/privacidade.service';
import { SessaoService } from '@core/services/sessao.service';
import { UiButton } from '@shared/ui/ui-button';
import { UiSkeleton } from '@shared/ui/ui-skeleton';

/**
 * `/politica-dados` — a política de tratamento de dados (LGPD art. 9º, #137).
 *
 * Pública, como `/login` e `/cadastro`: fora do `AppLayout` e sem guard, porque quem ainda não tem
 * conta precisa lê-la **antes** de se cadastrar. O texto vem do backend (`GET /api/politica-dados`),
 * que é quem trata os dados e responde por eles — a tela não reescreve nada.
 */
@Component({
  selector: 'app-politica-dados',
  standalone: true,
  imports: [RouterLink, UiButton, UiSkeleton],
  templateUrl: './politica-dados.html',
})
export class PoliticaDadosPage implements OnInit {
  private readonly api = inject(PrivacidadeApi);
  protected readonly sessao = inject(SessaoService);

  readonly politica = signal<PoliticaDados | null>(null);
  readonly erro = signal(false);

  ngOnInit(): void {
    this.carregar();
  }

  carregar(): void {
    this.erro.set(false);
    this.api.politica().subscribe({
      next: (p) => this.politica.set(p),
      error: () => this.erro.set(true),
    });
  }

  /** As seções da política, na ordem em que o titular as procura. */
  readonly secoes = computed<{ titulo: string; itens: string[] }[]>(() => {
    const p = this.politica();
    if (!p) return [];
    return [
      { titulo: 'Que dados tratamos', itens: p.dadosColetados },
      { titulo: 'Para quê', itens: p.finalidades },
      { titulo: 'Com que base legal', itens: p.basesLegais },
      { titulo: 'Com quem compartilhamos', itens: p.compartilhamento },
      { titulo: 'Por quanto tempo guardamos', itens: p.retencao },
      { titulo: 'Os seus direitos', itens: p.direitos },
    ].filter((s) => s.itens?.length);
  });
}
