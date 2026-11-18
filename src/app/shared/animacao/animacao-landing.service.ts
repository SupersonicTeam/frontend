import { Injectable, InjectionToken, computed, inject } from '@angular/core';
import { PreferenciaMovimentoService } from '@core/services/preferencia-movimento.service';
import { CARREGAR_ANIMACAO, type ApiDeAnimacao } from './carregar-animacao';

/**
 * O que o serviço pergunta ao navegador, atrás de um token (no molde do `AMBIENTE_DE_RECARGA`):
 * os specs trocam por um falso, e nenhum teste espera um `load` de verdade.
 */
export interface AmbienteDaAnimacao {
  /** `navigator.connection.saveData`: a pessoa pediu ao navegador para gastar menos dados. */
  economiaDeDados(): boolean;
  /** Resolve depois do `load` da janela **e** de um momento ocioso. */
  quandoOcioso(): Promise<void>;
}

/** Quanto esperar por um momento ocioso onde o `requestIdleCallback` não existe (Safari). */
const ESPERA_SEM_IDLE_MS = 200;
/** O teto do `requestIdleCallback`: página que nunca fica ociosa carrega mesmo assim. */
const TETO_DO_IDLE_MS = 2000;

export const AMBIENTE_DA_ANIMACAO = new InjectionToken<AmbienteDaAnimacao>('AMBIENTE_DA_ANIMACAO', {
  providedIn: 'root',
  factory: () => ({
    economiaDeDados: () =>
      (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData ===
      true,
    quandoOcioso: () =>
      new Promise<void>((resolve) => {
        const ocioso = () => {
          if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(() => resolve(), { timeout: TETO_DO_IDLE_MS });
          } else {
            setTimeout(resolve, ESPERA_SEM_IDLE_MS);
          }
        };
        if (document.readyState === 'complete') ocioso();
        else window.addEventListener('load', ocioso, { once: true });
      }),
  }),
});

/**
 * A porta única da animação da landing (#174, N2.4): decide **se** vai haver animação e
 * **quando** a biblioteca é baixada. Toda cena passa por aqui; nenhuma importa o Motion direto.
 *
 * ## `vaiAnimar`: um sinal só
 *
 * Verdadeiro quando o movimento está liberado (`PreferenciaMovimentoService`: o sistema **ou** o
 * botão "Reduzir animações") e a pessoa não pediu economia de dados. O template e o código leem
 * **este mesmo sinal**: a classe que arma uma cena (esconde para animar a entrada) e a decisão de
 * carregar a biblioteca nunca discordam. Se discordassem, a cena ficaria armada — invisível — com
 * o serviço tendo desistido de animá-la.
 *
 * ## `carregar()`: sem disputar o primeiro paint
 *
 * - `vaiAnimar()` falso → `null`, **sem baixar nada**. Com movimento reduzido ou `saveData`, o
 *   chunk do Motion nem é pedido, e cada cena mostra a versão estática equivalente.
 * - verdadeiro → espera o `load` da janela e um momento ocioso, e só então faz o `import()`. O
 *   LCP da landing é o `<h1>`; a biblioteca não disputa banda com ele nem com a fonte.
 * - erro no `import()` (rede, chunk que sumiu num deploy) → `null`. Animação é enfeite: a página
 *   fica estática, inteira, em vez de quebrar.
 * - **uma promessa por página**: dez cenas pedindo ao mesmo tempo fazem um `import()` só.
 *
 * Quem chama trata o `null` como "fique no estado final" — é o mesmo caminho do movimento
 * reduzido, e por isso não existe um terceiro estado para testar.
 */
@Injectable({ providedIn: 'root' })
export class AnimacaoLandingService {
  private readonly movimento = inject(PreferenciaMovimentoService);
  private readonly carregador = inject(CARREGAR_ANIMACAO);
  private readonly ambiente = inject(AMBIENTE_DA_ANIMACAO);

  readonly vaiAnimar = computed(
    () => !this.movimento.reduzido() && !this.ambiente.economiaDeDados(),
  );

  private promessa: Promise<ApiDeAnimacao | null> | null = null;

  carregar(): Promise<ApiDeAnimacao | null> {
    if (!this.vaiAnimar()) return Promise.resolve(null);

    this.promessa ??= this.ambiente
      .quandoOcioso()
      .then(() => {
        // A pessoa pode ter ligado "Reduzir animações" enquanto a página carregava. Aqui a
        // resposta é `null` **sem guardar**: se ela desligar depois, a próxima cena ainda carrega.
        if (!this.vaiAnimar()) {
          this.promessa = null;
          return null;
        }
        return this.carregador();
      })
      // Falha de rede fica guardada como `null`: tentar de novo a cada cena viraria uma rajada
      // de requisições para um chunk que não está lá.
      .catch(() => null);

    return this.promessa;
  }
}
