import { Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { UiModal } from './ui-modal';

/**
 * Hospedeiro de teste: replica o uso real do modal, incluindo um botão focável
 * dentro dele (o focus trap precisa de algo para onde levar o foco).
 */
@Component({
  standalone: true,
  imports: [UiModal],
  template: `
    <button type="button" id="gatilho">Abrir</button>
    <ui-modal
      [aberto]="aberto()"
      [travado]="travado()"
      titulo="Cancelar nota"
      descricao="Esta ação não pode ser desfeita."
      (fechar)="aberto.set(false)"
    >
      <p>Conteúdo</p>
      <div rodape><button type="button" id="confirmar">Confirmar</button></div>
    </ui-modal>
  `,
})
class Hospedeiro {
  readonly aberto = signal(false);
  readonly travado = signal(false);
}

describe('UiModal (#45)', () => {
  let fixture: ComponentFixture<Hospedeiro>;
  let host: Hospedeiro;

  const esc = () =>
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Hospedeiro] }).compileComponents();
    fixture = TestBed.createComponent(Hospedeiro);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('não renderiza nada enquanto fechado', () => {
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).toBeNull();
  });

  it('ao abrir, expõe role/aria-modal e associa o título via aria-labelledby', () => {
    host.aberto.set(true);
    fixture.detectChanges();

    const dialogo: HTMLElement = fixture.nativeElement.querySelector('[role="dialog"]');
    expect(dialogo).toBeTruthy();
    expect(dialogo.getAttribute('aria-modal')).toBe('true');

    const idTitulo = dialogo.getAttribute('aria-labelledby');
    expect(idTitulo).toBeTruthy();
    expect(fixture.nativeElement.querySelector(`#${idTitulo}`).textContent).toContain(
      'Cancelar nota',
    );
  });

  it('trava a rolagem do fundo enquanto aberto e devolve ao fechar', () => {
    expect(document.body.style.overflow).not.toBe('hidden');

    host.aberto.set(true);
    fixture.detectChanges();
    expect(document.body.style.overflow).toBe('hidden');

    host.aberto.set(false);
    fixture.detectChanges();
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('Esc fecha', () => {
    host.aberto.set(true);
    fixture.detectChanges();

    esc();
    fixture.detectChanges();
    expect(host.aberto()).toBe(false);
  });

  it('travado: Esc não fecha e o botão de fechar some', () => {
    host.aberto.set(true);
    host.travado.set(true);
    fixture.detectChanges();

    esc();
    fixture.detectChanges();
    expect(host.aberto()).toBe(true);
    expect(fixture.nativeElement.querySelector('[aria-label="Fechar"]')).toBeNull();
  });

  it('clicar no fundo fecha, mas não quando travado', () => {
    host.aberto.set(true);
    fixture.detectChanges();
    const fundo = (): HTMLElement => fixture.nativeElement.querySelector('[aria-hidden="true"]');

    host.travado.set(true);
    fixture.detectChanges();
    fundo().click();
    fixture.detectChanges();
    expect(host.aberto()).toBe(true);

    host.travado.set(false);
    fixture.detectChanges();
    fundo().click();
    fixture.detectChanges();
    expect(host.aberto()).toBe(false);
  });

  it('o botão de fechar é um alvo de toque de 44x44 (.tap-target)', () => {
    host.aberto.set(true);
    fixture.detectChanges();

    const botao: HTMLElement = fixture.nativeElement.querySelector('[aria-label="Fechar"]');
    expect(botao.className).toContain('tap-target');
  });
});
