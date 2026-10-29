import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { UiInsight } from './ui-insight';

@Component({
  standalone: true,
  imports: [UiInsight],
  template: `
    <ui-insight natureza="atencao" titulo="2 notas precisam de correção">
      <span icone>i</span>
      <p>A nota 7 está sem endereço do destinatário, exigido para emitir a NF-e.</p>
      <div acoes><button>Corrigir agora</button></div>
    </ui-insight>
  `,
})
class Hospedeiro {}

describe('UiInsight', () => {
  function montar() {
    TestBed.configureTestingModule({ imports: [Hospedeiro] });
    const fixture = TestBed.createComponent(Hospedeiro);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  /**
   * A medida da linha (issue #103).
   *
   * O insight ocupa a largura inteira de propósito — é alerta, e proeminência é o ponto. Mas a
   * **frase** dentro dele seguia a caixa, e num monitor grande virava linha longa demais de ler.
   * Medido em 2560px antes: a prosa tinha **1350px e 143 caracteres por linha**, contra os 45-75
   * que a tipografia recomenda. Depois: 615px e **65 caracteres**.
   *
   * Isto é teste porque apagar a classe não quebraria nada — some a medida, e ninguém percebe até
   * alguém abrir num monitor grande.
   */
  it('a prosa para em max-w-prose, para a linha nao ficar longa demais', () => {
    const el = montar();
    const prosa = el.querySelector('p')?.parentElement;
    expect(prosa?.className).toContain('max-w-prose');
  });

  it('a CAIXA nao e limitada — o alerta continua atravessando a largura', () => {
    const el = montar();
    const caixa = el.querySelector('section');
    expect(caixa?.className).not.toContain('max-w-prose');
    expect(caixa?.className).toContain('rounded-card');
  });

  it('o titulo e as acoes ficam fora do limite: um e curto, a outra e botao', () => {
    const el = montar();
    expect(el.querySelector('h3')?.parentElement?.className).not.toContain('max-w-prose');
    expect(el.querySelector('button')?.parentElement?.className).not.toContain('max-w-prose');
  });

  it('a etiqueta nomeia a natureza — e o que diz ao usuario que ali quem fala e o assistente', () => {
    const el = montar();
    expect(el.textContent).toContain('Precisa de atenção');
  });
});
