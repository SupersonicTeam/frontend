import {
  Component,
  DestroyRef,
  ElementRef,
  ViewEncapsulation,
  afterNextRender,
  inject,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { PreferenciaMovimentoService } from '@core/services/preferencia-movimento.service';
import { JornadaMilho } from './jornada/jornada-milho';
import {
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
 * a referência de texto e de layout; o 3D é o player de `jornada/`. Os textos marcados com
 * "(Murillo)" e os preços continuam pendentes dele.
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
  protected readonly mailtoDoPlano = mailtoDoPlano;
  protected readonly rotuloDoPlano = rotuloDoPlano;
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
