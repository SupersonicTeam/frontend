import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { classesBotao } from './classes-botao';
import { UiLinkBotao } from './ui-link-botao';

@Component({
  standalone: true,
  imports: [UiLinkBotao],
  template: `
    <a href="#planos" uiLinkBotao [variant]="variante()" class="mt-4" id="link">Ver os planos</a>
    <a href="/cadastro" uiLinkBotao tamanho="lg" blocoCompleto id="cta">Testar</a>
  `,
})
class Hospedeiro {
  readonly variante = signal<'primary' | 'ghost'>('primary');
}

/** Link com cara de botão (#174, item 4.4): CTA de navegação é sempre `<a>`. */
describe('UiLinkBotao', () => {
  function montar() {
    const fixture = TestBed.createComponent(Hospedeiro);
    fixture.detectChanges();
    const elemento = (id: string) =>
      fixture.nativeElement.querySelector(`#${id}`) as HTMLAnchorElement;
    return { fixture, elemento };
  }

  it('veste o link com as classes do botão, sem virar <button>', () => {
    const { elemento } = montar();
    const link = elemento('link');

    expect(link.tagName).toBe('A');
    expect(link.querySelector('button')).toBeNull();
    expect(link.className).toContain('tap-target');
    expect(link.className).toContain('bg-primary');
  });

  /** O `[class]` da diretiva não pode apagar o que o autor escreveu no elemento. */
  it('mantém as classes estáticas do elemento', () => {
    const { elemento } = montar();

    expect(elemento('link').className).toContain('mt-4');
  });

  it('repassa variante, tamanho e blocoCompleto', () => {
    const { fixture, elemento } = montar();

    // O Angular aplica as classes do `[class]` uma a uma e em ordem alfabetica, entao a
    // comparacao e por conjunto -- comparar a string inteira testaria a ordem do framework.
    expect(new Set(elemento('cta').className.split(' '))).toEqual(
      new Set(classesBotao('primary', 'lg', { blocoCompleto: true }).split(' ')),
    );

    fixture.componentInstance.variante.set('ghost');
    fixture.detectChanges();

    expect(elemento('link').className).toContain('border-border');
    expect(elemento('link').className).not.toContain('bg-primary');
  });

  it('não mexe no destino do link', () => {
    const { elemento } = montar();

    expect(elemento('link').getAttribute('href')).toBe('#planos');
  });
});
