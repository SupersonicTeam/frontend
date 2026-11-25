import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SessaoService } from '@core/services/sessao.service';
import {
  TermosApi,
  versaoEmDataBr,
  type SecaoTermos,
  type TermosDeUso,
} from '@services/termos/data-access/termos.service';
import { UiButton } from '@shared/ui/ui-button';
import { UiSkeleton } from '@shared/ui/ui-skeleton';

/** Uma seção já numerada, como o leitor a vê e a cita ("item 4, a Ceres"). */
export interface SecaoNumerada extends SecaoTermos {
  numero: number;
}

/**
 * `/termos-de-uso` — os termos de uso (#211, backend#498).
 *
 * Pública e fora do `AppLayout`, como a `/politica-dados`: o cadastro exige marcar "Li e aceito",
 * e até a #211 o link não existia — a caixa pedia aceite de um texto que não estava em lugar
 * nenhum. Quem ainda não tem conta precisa ler antes de marcar.
 *
 * **O texto é todo do backend**, palavra por palavra, por interpolação. A tela só numera as seções
 * (o documento se cita por número), formata a data da versão e liga o contato e a política.
 * Nenhum parágrafo é escrito aqui: estes termos são o que o controlador afirma, e uma cópia no
 * frontend divergiria da versão que a conta registrou como aceita.
 */
@Component({
  selector: 'app-termos-de-uso',
  standalone: true,
  imports: [RouterLink, UiButton, UiSkeleton],
  templateUrl: './termos-de-uso.html',
})
export class TermosDeUsoPage implements OnInit {
  private readonly api = inject(TermosApi);
  protected readonly sessao = inject(SessaoService);

  readonly termos = signal<TermosDeUso | null>(null);
  readonly erro = signal(false);

  ngOnInit(): void {
    this.carregar();
  }

  carregar(): void {
    this.erro.set(false);
    this.api.termos().subscribe({
      next: (t) => this.termos.set(t),
      error: () => this.erro.set(true),
    });
  }

  /** A versão em `dd/MM/aaaa`, que é o que a seção "Mudanças" promete no topo. */
  readonly versao = computed(() => {
    const t = this.termos();
    return t ? versaoEmDataBr(t.versao) : '';
  });

  /**
   * As seções na ordem recebida, numeradas de 1 em diante. A numeração é **da posição**, não de
   * um campo: o backend manda a ordem, e o documento se refere a "o item 4" contando assim.
   */
  readonly secoes = computed<SecaoNumerada[]>(() =>
    (this.termos()?.secoes ?? []).map((secao, indice) => ({ ...secao, numero: indice + 1 })),
  );
}
