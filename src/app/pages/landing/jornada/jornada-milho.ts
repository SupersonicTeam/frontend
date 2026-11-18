import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { ThemeService } from '@core/services/theme.service';
import { AnimacaoLandingService } from '@shared/animacao/animacao-landing.service';
import { Cena } from '@shared/animacao/cena';
import { BASE_JORNADA, JornadaStore } from './jornada.store';
import { DESCRICAO_DA_JORNADA, textoDaEtapa } from './jornada-textos';
import {
  etapasDoTema,
  urlDoParado,
  type CameraJornada,
  type EtapaJornada,
  type TemaJornada,
} from './manifesto-jornada';
import {
  encaixeCobrindo,
  escolherCamera,
  faseDaNota,
  montarPercurso,
  opacidadeDaNota,
  posicaoDoPercurso,
  type FaseDaNota,
} from './percurso';

/**
 * Quanto de rolagem cada etapa ocupa, em alturas de tela. Com 60 quadros por etapa, 150vh dão um
 * quadro a cada 2,5vh — fluido sem transformar a seção em 30 telas de rolagem.
 */
const ALTURA_POR_ETAPA_VH = 150;

const ROTULO_DA_FASE: Record<FaseDaNota, string> = {
  oculta: '',
  conferindo: 'Conferindo',
  transmitindo: 'Transmitindo',
  autorizada: 'Autorizada',
};

/**
 * A jornada do milho em 3D, ligada à rolagem (#174): um `<canvas>` que troca de quadro conforme o
 * visitante rola, nos dois sentidos — do nome no campo ao plantio, à colheita, ao armazém, à nota
 * fiscal e à marca.
 *
 * Não é vídeo nem 3D em tempo real: são sequências de imagens renderizadas à parte (repositório
 * Animation-Agroconia), descritas por um `manifesto.json` e servidas fora do bundle.
 *
 * ## Os dois modos
 *
 * - **animado**, quando `vaiAnimar()` é verdadeiro: um trilho alto com um palco `sticky`, e o
 *   `scroll()` do Motion dizendo em que ponto da rolagem a seção está;
 * - **estático**, com movimento reduzido, "Reduzir animações" ou economia de dados: **nenhuma
 *   sequência é baixada**. Cada etapa mostra o quadro parado dela, em fluxo normal, com o mesmo
 *   texto. Sem trilho — senão o modo estático viraria uma armadilha de rolagem.
 *
 * Se o manifesto não chega ou não é o esperado, **a seção não aparece**. É ilustração: a landing
 * fica inteira sem ela, e um canvas vazio seria pior.
 *
 * ## O que não é signal
 *
 * O app é zoneless: cada escrita em signal agenda uma renderização. A rolagem chama o callback
 * dezenas de vezes por segundo, então ele só guarda um número e marca o quadro como sujo; quem
 * desenha é um `requestAnimationFrame`. Signal só muda em evento **discreto** — a etapa em
 * destaque e a fase da nota, que mudam nove e quatro vezes numa rolagem inteira.
 *
 * ## Acessibilidade
 *
 * O canvas leva `role="img"` e descreve a jornada. Os textos das nove etapas estão **todos** no
 * DOM, numa lista; o da vez só fica visível. Assim o leitor de tela lê tudo sem `aria-live`, que
 * a especificação proíbe em cena automática. Quem move a cena é o visitante, então a regra dos
 * cinco segundos não se aplica e não há botão de pausa.
 */
@Component({
  selector: 'app-jornada-milho',
  standalone: true,
  providers: [JornadaStore],
  templateUrl: './jornada-milho.html',
  styleUrl: './jornada-milho.css',
})
export class JornadaMilho {
  protected readonly store = inject(JornadaStore);
  private readonly animacao = inject(AnimacaoLandingService);
  private readonly tema = inject(ThemeService);
  private readonly base = inject(BASE_JORNADA);
  private readonly anfitriao = inject<ElementRef<HTMLElement>>(ElementRef);

  private readonly tela = viewChild<ElementRef<HTMLCanvasElement>>('tela');
  private readonly trilho = viewChild<ElementRef<HTMLElement>>('trilho');
  private readonly nota = viewChild<ElementRef<HTMLElement>>('nota');
  private readonly barra = viewChild<ElementRef<HTMLElement>>('barra');

  protected readonly descricao = DESCRICAO_DA_JORNADA;

  /**
   * Um tema fixo para a cena, quando a página não segue o do app (a landing é sempre escura).
   * Sem ele, vale o do `ThemeService`. Decide qual versão da etapa da marca toca.
   */
  readonly temaFixo = input<TemaJornada | null>(null);
  private readonly temaDaCena = computed(() => this.temaFixo() ?? this.tema.tema());

  /** A biblioteca não veio (rede, chunk que sumiu): a seção cai no modo estático. */
  private readonly semBiblioteca = signal(false);
  protected readonly camera = signal<CameraJornada>(escolherCamera(innerWidth, innerHeight));

  /** As etapas do tema atual. A marca tem uma versão por tema, com o fundo da cor da página. */
  protected readonly etapas = computed<readonly EtapaJornada[]>(() => {
    const manifesto = this.store.estado() === 'pronta' ? this.store.manifesto : null;
    return manifesto ? etapasDoTema(manifesto, this.temaDaCena()) : [];
  });

  protected readonly animando = computed(
    () => this.animacao.vaiAnimar() && !this.semBiblioteca() && this.etapas().length > 0,
  );

  private readonly percurso = computed(() =>
    montarPercurso(this.etapas(), this.store.manifesto?.fusao ?? 0),
  );
  /** O palco ocupa uma tela; o resto do trilho é a rolagem que move a cena. */
  protected readonly alturaDoTrilho = computed(
    () => this.percurso().comprimento * ALTURA_POR_ETAPA_VH + 100,
  );

  // Os dois únicos estados da cena que são signal: mudam em evento discreto (ver a classe).
  protected readonly etapaAtiva = signal(0);
  protected readonly fase = signal<FaseDaNota>('oculta');
  protected readonly rotuloDaFase = computed(() => ROTULO_DA_FASE[this.fase()]);

  private readonly cena = new Cena();
  private progresso = 0;
  private sujo = true;
  private montada = false;

  constructor() {
    const destroyRef = inject(DestroyRef);

    // O manifesto é pedido quando a seção existe na página — quem a põe atrás de um
    // `@defer (on viewport)` decide quando isso acontece. Nunca no caminho do primeiro paint.
    afterNextRender(() => void this.store.iniciar());

    // Câmera e tema decidem quais quadros tocar. Trocar o tema só muda a etapa da marca.
    effect(() => {
      const etapas = this.etapas();
      const camera = this.camera();
      const tema = this.temaDaCena();
      if (!etapas.length || !this.animando()) return;
      untracked(() => {
        this.store.configurar(camera, tema);
        this.sujo = true;
      });
    });

    // O canvas só existe no ramo animado do template: a cena é montada quando ele aparece.
    effect(() => {
      const tela = this.tela()?.nativeElement;
      const trilho = this.trilho()?.nativeElement;
      if (tela && trilho && this.animando()) untracked(() => void this.montarCena(tela, trilho));
    });

    // "Reduzir animações" ligado no meio da seção: a cena para, o template troca para a lista
    // estática, e a página volta ao começo da seção — o trilho alto acabou de sumir.
    effect(() => {
      if (this.animacao.vaiAnimar() || !this.montada) return;
      untracked(() => {
        this.desmontarCena();
        this.anfitriao.nativeElement.scrollIntoView({ block: 'start' });
      });
    });

    destroyRef.onDestroy(() => {
      this.desmontarCena();
      this.store.encerrar();
    });
  }

  protected texto(etapa: EtapaJornada) {
    return textoDaEtapa(etapa.id, etapa.titulo);
  }

  /** O quadro parado da etapa, na câmera da tela e no formato que o navegador decodifica. */
  protected parado(etapa: EtapaJornada): string {
    return urlDoParado(this.base, etapa, this.camera(), this.store.formatoEscolhido);
  }

  /** As medidas da câmera, para o `<img>` reservar o espaço antes de carregar (CLS). */
  protected medidas(): { largura: number; altura: number } {
    return this.store.manifesto?.cameras[this.camera()] ?? { largura: 16, altura: 9 };
  }

  private async montarCena(tela: HTMLCanvasElement, trilho: HTMLElement): Promise<void> {
    if (this.montada) return;
    this.montada = true;

    const api = await this.animacao.carregar();
    if (!api) {
      // Sem a biblioteca não há como ligar a cena à rolagem: fica a versão estática.
      this.montada = false;
      this.semBiblioteca.set(true);
      return;
    }
    if (!this.montada) return; // desmontada enquanto a biblioteca carregava

    const contexto = tela.getContext('2d');
    if (!contexto) return;

    this.store.aoChegar = () => (this.sujo = true);

    // A rolagem só guarda o número. Nenhum signal aqui (ver a classe).
    this.cena.aoEncerrar(
      api.scroll(
        (progresso: number) => {
          this.progresso = progresso;
          this.sujo = true;
        },
        { target: trilho, offset: ['start start', 'end end'] },
      ),
    );

    // O tamanho do canvas acompanha o palco; a câmera, a orientação. A barra de endereço do
    // celular muda a altura a cada rolagem, então a câmera só troca quando a orientação vira.
    const observador = new ResizeObserver(() => {
      this.ajustarTela(tela);
      const camera = escolherCamera(innerWidth, innerHeight);
      if (camera !== this.camera()) this.camera.set(camera);
    });
    observador.observe(tela);
    this.cena.aoEncerrar(() => observador.disconnect());
    this.ajustarTela(tela);

    let quadro = 0;
    const desenhar = () => {
      quadro = requestAnimationFrame(desenhar);
      if (this.sujo) this.pintar(tela, contexto);
    };
    quadro = requestAnimationFrame(desenhar);
    this.cena.aoEncerrar(() => cancelAnimationFrame(quadro));
  }

  private desmontarCena(): void {
    this.montada = false;
    this.cena.concluir();
    this.store.aoChegar = () => undefined;
  }

  /** O canvas desenha em pixels de verdade: com `devicePixelRatio` 2, o dobro do tamanho na tela. */
  private ajustarTela(tela: HTMLCanvasElement): void {
    const area = tela.getBoundingClientRect();
    const densidade = Math.min(devicePixelRatio || 1, 2);
    const largura = Math.max(1, Math.round(area.width * densidade));
    const altura = Math.max(1, Math.round(area.height * densidade));
    if (tela.width !== largura || tela.height !== altura) {
      tela.width = largura;
      tela.height = altura;
    }
    this.sujo = true;
  }

  private pintar(tela: HTMLCanvasElement, contexto: CanvasRenderingContext2D): void {
    this.sujo = false;
    const etapas = this.etapas();
    const posicao = posicaoDoPercurso(this.percurso(), etapas, this.progresso);
    const topo = posicao.camadas.at(-1);
    if (!topo) return;

    this.store.focar(topo.etapa, topo.quadro);

    for (const camada of posicao.camadas) {
      const imagem = this.store.quadro(camada.etapa, camada.quadro);
      // Sem nada carregado para esta camada, o canvas fica com o que tinha: melhor o quadro
      // anterior por um instante do que um buraco.
      if (!imagem) continue;
      const { x, y, w, h } = encaixeCobrindo(imagem.width, imagem.height, tela.width, tela.height);
      contexto.globalAlpha = camada.alfa;
      contexto.drawImage(imagem as CanvasImageSource, x, y, w, h);
    }
    contexto.globalAlpha = 1;

    // A nota fiscal em HTML, por cima do último quadro do carimbo. Opacidade e barra vão direto
    // no estilo (mudam a cada quadro); a fase é signal porque muda quatro vezes.
    const nota = this.nota()?.nativeElement;
    if (nota) nota.style.opacity = String(opacidadeDaNota(posicao.nota));
    const barra = this.barra()?.nativeElement;
    if (barra) {
      const cheia = posicao.nota === null ? 0 : Math.min(1, Math.max(0, posicao.nota / 0.74));
      barra.style.transform = `scaleX(${cheia})`;
    }

    if (posicao.etapaAtiva !== this.etapaAtiva()) this.etapaAtiva.set(posicao.etapaAtiva);
    const fase = faseDaNota(posicao.nota);
    if (fase !== this.fase()) this.fase.set(fase);
  }
}
