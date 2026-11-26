import {
  Component,
  DestroyRef,
  ElementRef,
  ViewEncapsulation,
  afterNextRender,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { DOMINIO_BASE } from '@core/utils/host-escritorio';
import { PreferenciaMovimentoService } from '@core/services/preferencia-movimento.service';
import { DADOS_EMPRESA } from './dados-empresa';
import { JornadaMilho } from './jornada/jornada-milho';
import {
  DATA_REVISAO_LEGAL,
  PERGUNTAS,
  PLANOS_ESCRITORIO,
  PLANOS_PRODUTOR,
  mailtoDoPlano,
  rotuloDoPlano,
} from './landing-dados';
import { ligarInteracoes } from './landing-interacoes';

/**
 * A landing do AgroConIA (#174), com a jornada do milho em 3D entre o hero e "O que muda".
 *
 * O markup e o CSS vêm da prévia estática da especificação (`rascunhos/previa-landing/`), que é
 * a referência de texto e de layout; o 3D é o player de `jornada/`. Os preços continuam
 * pendentes do Murillo. Marcador de rascunho no template, não: a `landing-dados.spec.ts` falha se
 * voltar um (#212).
 *
 * O CSS é da página, não do app: tem os próprios tokens, escopados em `.lp` (a raiz do template),
 * e por isso a página não usa encapsulamento — ele só existe enquanto ela está na tela. Está
 * dividido por seção para cada arquivo caber no orçamento de estilo por componente (4 kB).
 */
@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink, JornadaMilho],
  templateUrl: './landing.html',
  styleUrls: [
    './landing-tokens.css',
    './landing-base.css',
    './landing-cabecalho.css',
    './landing-hero.css',
    './landing-hero-prova.css',
    './landing-reforma.css',
    './landing-publico.css',
    './landing-meio.css',
    './landing-planos.css',
    './landing-final.css',
    './landing-responsivo.css',
  ],
  encapsulation: ViewEncapsulation.None,
})
export class LandingPage {
  protected readonly movimento = inject(PreferenciaMovimentoService);

  protected readonly planosProdutor = PLANOS_PRODUTOR;
  protected readonly planosEscritorio = PLANOS_ESCRITORIO;
  protected readonly perguntas = PERGUNTAS;
  protected readonly empresa = DADOS_EMPRESA;
  protected readonly mailtoDoPlano = mailtoDoPlano;
  protected readonly rotuloDoPlano = rotuloDoPlano;
  /** Só para a barra de endereço da ilustração do hero: o domínio nunca é escrito à mão. */
  protected readonly dominioBase = inject(DOMINIO_BASE);
  protected readonly dataRevisaoLegal = DATA_REVISAO_LEGAL;
  protected readonly ano = new Date().getFullYear();

  constructor() {
    const raiz = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const desligar = ligarInteracoes(raiz, () => this.movimento.reduzido());
      destroyRef.onDestroy(desligar);
    });
  }
}
