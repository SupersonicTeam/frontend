import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { EscritorioDoHostService } from '@core/services/escritorio-do-host.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the router outlet', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('router-outlet')).toBeTruthy();
  });

  /** Endereço de escritório que não abriu (#175): a tela do endereço no lugar das rotas. */
  it.each([
    ['nao-encontrado', 'Endereço não encontrado'],
    ['indisponivel', 'Não foi possível abrir este endereço'],
  ] as const)('modo %s mostra a tela do endereço, sem o router-outlet', async (modo, titulo) => {
    TestBed.inject(EscritorioDoHostService).modo.set(modo);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    // A tela vem num @defer: espera o bloco carregar.
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain(titulo);
    expect(el.querySelector('router-outlet')).toBeNull();
    // O link para www sai do urlDoHost (em dev, localhost).
    expect(el.querySelector('a')?.getAttribute('href')).toMatch(/^http:\/\/localhost/);
  });
});
