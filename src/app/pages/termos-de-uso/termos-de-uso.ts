import { DOCUMENT } from '@angular/common';
import { Component, Injector, OnInit, afterNextRender, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
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
  private readonly rota = inject(ActivatedRoute);
  private readonly documento = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  protected readonly sessao = inject(SessaoService);

  readonly termos = signal<TermosDeUso | null>(null);
  readonly erro = signal(false);

  ngOnInit(): void {
    this.carregar();
  }

  carregar(): void {
    this.erro.set(false);
    this.api.termos().subscribe({
      next: (t) => {
        this.termos.set(t);
        this.irParaAAncora(t);
      },
      error: () => this.erro.set(true),
    });
  }

  /**
   * `/termos-de-uso#ceres` leva à seção da Ceres.
   *
   * Sem isto a âncora existe no HTML e não serve para nada: o router não tem `anchorScrolling`,
   * e ligá-lo também não bastaria — quando a navegação termina, as seções ainda não existem,
   * porque o texto vem do backend. Então quem rola é a própria página, **depois** de o documento
   * chegar e ser desenhado (daí o `afterNextRender`, que só roda no navegador).
   *
   * Só rola para uma das seções recebidas. O fragmento vem da URL, e procurar por ele solto no
   * documento levaria a qualquer elemento que tivesse aquele `id`.
   */
  private irParaAAncora(termos: TermosDeUso): void {
    const fragmento = this.rota.snapshot.fragment;
    if (!fragmento || !termos.secoes.some((s) => s.id === fragmento)) return;

    afterNextRender(
      () => {
        const alvo = this.documento.getElementById(fragmento);
        if (!alvo) return;
        alvo.scrollIntoView();
        // Rolar move os olhos; o foco também tem de ir, senão quem usa teclado ou leitor de tela
        // continua no topo do documento. `preventScroll` para não disputar com a linha acima.
        alvo.focus({ preventScroll: true });
      },
      { injector: this.injector },
    );
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
