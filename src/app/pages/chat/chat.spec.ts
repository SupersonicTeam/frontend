import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AssistenteStore } from '@shared/assistente/assistente.store';
import { ChatPage } from './chat';

/**
 * A conversa em si é testada em `assistente.store.spec.ts` — aqui cobrimos o que
 * é da página: ela lê o mesmo estado da gaveta (não começa uma conversa nova) e
 * fecha a gaveta ao abrir, para a mesma conversa não aparecer duas vezes.
 */
describe('ChatPage (#51)', () => {
  let httpMock: HttpTestingController;

  const dashboard = {
    produtor: { nome: 'Fazenda Boa Vista', tipoProdutor: 'PESSOA_FISICA', uf: 'MT' },
    periodo: '2026-09',
    kpis: { saldoIbs: 1200.5, saldoCbs: 609, totalNotas: 11 },
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function flushContexto() {
    httpMock.match(r => r.url === '/dashboard').forEach(r => r.flush(dashboard));
    httpMock.match(r => r.url === '/notas').forEach(r => r.flush({ content: [], totalElements: 0 }));
  }

  it('mostra o contexto real do produtor no painel lateral', () => {
    const fixture = TestBed.createComponent(ChatPage);
    fixture.detectChanges();
    flushContexto();
    fixture.detectChanges();

    // `toLocaleString` separa "R$" do valor com espaco nao-quebravel; normalizamos
    // para a assercao falar da moeda, e nao do caractere invisivel.
    const texto = (fixture.nativeElement as HTMLElement).textContent?.replace(/\u00a0/g, ' ') ?? '';
    expect(texto).toContain('Fazenda Boa Vista');
    expect(texto).toContain('MT');
    expect(texto).toContain('setembro de 2026');
    expect(texto).toContain('R$ 1.809,50');
  });

  it('continua a conversa que já existia — não recomeça do zero', () => {
    const store = TestBed.inject(AssistenteStore);
    store.mensagens.set([{ role: 'user', content: 'pergunta feita na gaveta' }]);

    const fixture = TestBed.createComponent(ChatPage);
    fixture.detectChanges();
    flushContexto();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'pergunta feita na gaveta',
    );
  });

  it('fecha a gaveta ao abrir em tela cheia', () => {
    const store = TestBed.inject(AssistenteStore);
    store.abrir();
    flushContexto();

    TestBed.createComponent(ChatPage).detectChanges();
    expect(store.aberto()).toBe(false);
  });
});
