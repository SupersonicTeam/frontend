import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PerfilService } from '@core/services/perfil.service';
import { AppLayout } from './app-layout';

/**
 * O shell precisa dizer **quem** esta olhando. O nome vem do dashboard, que e o
 * do PRODUTOR -- usa-lo para o contador o identificava como o proprio cliente.
 */
describe('AppLayout', () => {
  let httpMock: HttpTestingController;
  let perfil: PerfilService;

  const dashboard = {
    produtor: { nome: 'João da Silva Produtor', tipoProdutor: 'PESSOA_FISICA', uf: 'MT' },
    periodo: '2026-09',
    kpis: { saldoIbs: 0, saldoCbs: 0, totalNotas: 0 },
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppLayout],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    perfil = TestBed.inject(PerfilService);
  });

  afterEach(() => httpMock.verify());

  function montar() {
    const fixture = TestBed.createComponent(AppLayout);
    fixture.detectChanges();
    httpMock.match(r => r.url === '/dashboard').forEach(r => r.flush(dashboard));
    // O sino busca na fonte do papel atual desde a #113: `/alertas` para o produtor,
    // `/contador/produtores` para o escritorio. Drenar aqui mantem os testes do shell focados
    // no que eles provam -- nome, papel e paineis.
    httpMock.match(r => r.url === '/alertas').forEach(r => r.flush([]));
    httpMock.match(r => r.url === '/contador/produtores').forEach(r => r.flush([]));
    fixture.detectChanges();
    return fixture;
  }

  it('carrega o produtor no shell — o nome nao pode depender de por onde se entrou', () => {
    perfil.entrar('produtor');
    const cmp = montar().componentInstance;

    expect(cmp.nomeExibido()).toBe('João da Silva Produtor');
    expect(cmp.papelExibido()).toBe('Produtor rural');
  });

  it('nao identifica o contador com o nome do produtor', () => {
    perfil.entrar('contador');
    const cmp = montar().componentInstance;

    // O chip dizia "João da Silva Produtor" com "Contador" embaixo:
    // duas pessoas diferentes no mesmo lugar.
    expect(cmp.nomeExibido()).toBe('Contador');
    expect(cmp.papelExibido()).toBe('Atendendo João da Silva Produtor');
  });

  it('respeita o nome digitado no login', () => {
    perfil.entrar('contador', 'Maria Contadora');
    const cmp = montar().componentInstance;

    expect(cmp.nomeExibido()).toBe('Maria Contadora');
  });

  it('Esc fecha os paineis sobrepostos', () => {
    perfil.entrar('produtor');
    const cmp = montar().componentInstance;

    cmp.toggleNotificacoes();
    expect(cmp.notificacoesOpen()).toBe(true);
    cmp.aoPressionarEsc();
    expect(cmp.notificacoesOpen()).toBe(false);
  });
});
