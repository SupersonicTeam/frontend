import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ConfiguracoesPage } from './configuracoes';

/**
 * A tela era quase toda encenação: nome e e-mail cravados no código, um botão
 * que fingia salvar com `setTimeout` e um formulário de troca de senha num
 * sistema sem senha — cujo botão nem handler tinha.
 *
 * Estes testes guardam o que passou a valer: dado real do backend, e nenhuma
 * promessa de ação que o servidor não cumpre.
 */
describe('ConfiguracoesPage', () => {
  let httpMock: HttpTestingController;

  const dashboard = {
    produtor: { nome: 'João da Silva Produtor', tipoProdutor: 'PESSOA_FISICA', uf: 'MT' },
    periodo: '2026-09',
    kpis: { saldoIbs: 0, saldoCbs: 0, totalNotas: 0 },
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConfiguracoesPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('mostra o produtor que veio da API, não um nome cravado no código', () => {
    const fixture = TestBed.createComponent(ConfiguracoesPage);
    fixture.detectChanges();
    httpMock.expectOne(r => r.url === '/dashboard').flush(dashboard);
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('João da Silva Produtor');
    expect(texto).toContain('MT');
    // O nome antigo era inventado — se voltar, o teste pega.
    expect(texto).not.toContain('joao.silva@fazenda.com');
  });

  it('traduz o tipo do produtor em vez de mostrar o valor do banco', () => {
    const fixture = TestBed.createComponent(ConfiguracoesPage);
    fixture.detectChanges();
    httpMock.expectOne(r => r.url === '/dashboard').flush(dashboard);
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('pessoa física');
    expect(texto).not.toContain('PESSOA_FISICA');
  });

  it('não oferece campo de senha nem botão de salvar — nada disso existe no servidor', () => {
    const fixture = TestBed.createComponent(ConfiguracoesPage);
    fixture.detectChanges();
    httpMock.expectOne(r => r.url === '/dashboard').flush(dashboard);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('input[type="password"]').length).toBe(0);
    expect(el.textContent).not.toContain('Atualizar senha');
    expect(el.textContent).not.toContain('Salvar alterações');
  });

  it('com o dashboard fora do ar, a tela continua de pé', () => {
    const fixture = TestBed.createComponent(ConfiguracoesPage);
    fixture.detectChanges();
    httpMock.expectOne(r => r.url === '/dashboard').flush('erro', { status: 500, statusText: 'x' });
    fixture.detectChanges();

    // O tema é local e não depende do backend: precisa continuar disponível.
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('input[type="checkbox"]')).toBeTruthy();
    expect(el.textContent).toContain('Aparência');
  });
});
