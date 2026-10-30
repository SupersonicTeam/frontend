import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { entrarComo } from '@core/services/sessao.testing';
import { AssistenteStore } from '@shared/assistente/assistente.store';
import { ChatPage } from './chat';

/**
 * A conversa em si é testada em `assistente.store.spec.ts` — aqui cobrimos o que
 * é da página: ela lê o mesmo estado da gaveta (não começa uma conversa nova),
 * fecha a gaveta ao abrir, e **mostra a fundamentação da resposta** (citação com
 * link oficial e origem dos números), que é a garantia do produto exigida pelo
 * contrato da Ceres (#76) e o que faltava para a IA aparecer na tela.
 */
describe('ChatPage (#51, ligada à Ceres na #76)', () => {
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
    entrarComo('PRODUTOR');
  });

  /** A cota da semana (#166): o store a busca junto com o contexto e depois de cada resposta. */
  const usoPadrao = {
    plano: 'padrao',
    habilitada: true,
    creditosSemana: 1000,
    consumidos: 0,
    restantes: 1000,
    renovaEm: '2026-10-19T00:00:00-03:00',
  };

  afterEach(() => {
    httpMock.match((r) => r.url === '/assistente/uso').forEach((r) => r.flush(usoPadrao));
    httpMock.verify();
  });

  function flushContexto() {
    httpMock.match((r) => r.url === '/dashboard').forEach((r) => r.flush(dashboard));
    httpMock
      .match((r) => r.url === '/notas')
      .forEach((r) => r.flush({ content: [], totalElements: 0 }));
    httpMock.match((r) => r.url === '/assistente/uso').forEach((r) => r.flush(usoPadrao));
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
    store.mensagens.set([{ autor: 'produtor', texto: 'pergunta feita na gaveta' }]);

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

  it('mostra a citação da lei com link oficial e o trecho ao alcance', () => {
    const store = TestBed.inject(AssistenteStore);
    store.mensagens.set([
      {
        autor: 'ceres',
        texto: 'A redução é de 60%. (LC 214/2025, art. 138, § 1º)',
        rota: 'LEGISLACAO',
        citacoes: [
          {
            norma: 'LC 214/2025',
            dispositivo: 'art. 138, § 1º',
            url: 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm',
            trecho: 'Art. 138. Ficam reduzidas em 60% as aliquotas do IBS e da CBS...',
          },
        ],
        fontesDados: [],
        modoFallback: false,
      },
    ]);

    const fixture = TestBed.createComponent(ChatPage);
    fixture.detectChanges();
    flushContexto();
    fixture.detectChanges();

    const raiz = fixture.nativeElement as HTMLElement;
    const link = raiz.querySelector<HTMLAnchorElement>('a[href*="planalto.gov.br"]');
    expect(link).not.toBeNull();
    expect(link?.textContent).toContain('LC 214/2025, art. 138, § 1º');
    expect(link?.target).toBe('_blank');
    expect(link?.rel).toContain('noopener');

    // O trecho fica num <details>: visível em um clique, e não escondido atrás
    // de outra tela. O contrato manda mostrar a base legal, não guardá-la.
    const detalhe = raiz.querySelector('details');
    expect(detalhe?.textContent).toContain('ver trecho da lei');
    expect(detalhe?.textContent).toContain('Ficam reduzidas em 60%');
  });

  it('diz de onde veio o número, com a consulta em português', () => {
    const store = TestBed.inject(AssistenteStore);
    store.mensagens.set([
      {
        autor: 'ceres',
        texto: 'A guia vence em 20/10/2026, no valor de R$ 1.840,55.',
        rota: 'DADOS',
        citacoes: [],
        fontesDados: [{ funcao: 'proximosVencimentos', parametros: { dias: '30' } }],
        modoFallback: false,
      },
    ]);

    const fixture = TestBed.createComponent(ChatPage);
    fixture.detectChanges();
    flushContexto();
    fixture.detectChanges();

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('Calculado a partir das suas notas');
    expect(texto).toContain('Guias a vencer');
    expect(texto).toContain('próximos dias: 30');
    expect(texto).toContain('resposta das suas notas');
  });

  it('avisa que a Ceres não substitui o contador', () => {
    const fixture = TestBed.createComponent(ChatPage);
    fixture.detectChanges();
    flushContexto();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'não substitui a análise do seu contador',
    );
  });

  it('a resposta diz que foi a Ceres e que é IA, antes do texto', () => {
    // Quem lê vai agir sobre isto. Saber que uma máquina escreveu não é detalhe de rodapé:
    // vem junto com o nome, antes do conteúdo.
    const store = TestBed.inject(AssistenteStore);
    store.mensagens.set([
      {
        autor: 'ceres',
        texto: 'A guia vence em 20/10/2026.',
        rota: 'DADOS',
        citacoes: [],
        fontesDados: [],
        modoFallback: false,
      },
    ]);

    const fixture = TestBed.createComponent(ChatPage);
    fixture.detectChanges();
    flushContexto();
    fixture.detectChanges();

    const raiz = fixture.nativeElement as HTMLElement;
    expect(raiz.textContent).toContain('Ceres');
    expect(raiz.textContent).toContain('IA');
    // E ela tem rosto: a marca *dela*, não a do produto nem um ícone genérico.
    expect(raiz.querySelector('img[src="/ceres-avatar.svg"]')).not.toBeNull();
  });

  it('sair da tela aborta a pergunta em andamento', () => {
    const store = TestBed.inject(AssistenteStore);
    const cancelar = vi.spyOn(store, 'cancelar');

    const fixture = TestBed.createComponent(ChatPage);
    fixture.detectChanges();
    flushContexto();
    fixture.destroy();

    // Sem aviso na conversa: ninguém está vendo a tela para ler o recado.
    expect(cancelar).toHaveBeenCalledWith(false);
  });
});
