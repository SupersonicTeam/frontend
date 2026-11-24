import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { entrarComo } from '@core/services/sessao.testing';
import type { AssistenteMensagem } from '@models/assistente-mensagem.model';
import { AssistenteConversa } from './assistente-conversa';
import { AssistenteStore } from './assistente.store';

/**
 * O que a conversa desenha a partir de uma mensagem da Ceres (#132). O store já é coberto
 * no próprio spec; aqui a mensagem entra pronta e o que se confere é a tela.
 */
describe('AssistenteConversa — resposta da Ceres', () => {
  // entrarComo grava a sessao no localStorage: limpar para nao vazar para outro spec.
  afterEach(() => localStorage.clear());

  function montar(mensagem: AssistenteMensagem): HTMLElement {
    TestBed.configureTestingModule({
      imports: [AssistenteConversa],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    entrarComo('PRODUTOR');
    TestBed.inject(AssistenteStore).mensagens.set([
      { autor: 'produtor', texto: 'O que eu preciso saber?' },
      mensagem,
    ]);
    const fixture = TestBed.createComponent(AssistenteConversa);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const resumo: AssistenteMensagem = {
    autor: 'ceres',
    rota: 'DADOS',
    texto: [
      'Encontrei 2 pontos de atencao: 1 guia em atraso e 1 nota parada.',
      '',
      '2 notas estao paradas:',
      '- Nota 3224 (serie 1): aguardando aprovacao do contador.',
      '- Nota 3222 (serie 1): devolvida pelo contador.',
    ].join('\n'),
    fontesDados: [{ funcao: 'resumoDoProdutor', parametros: {}, origem: 'PRODUTOR' }],
    citacoes: [],
    modoFallback: false,
    atalhos: [],
  };

  it('mostra cada assunto num parágrafo e as linhas "- " como lista', () => {
    const el = montar(resumo);
    const texto = el.querySelector('app-ceres-texto')!;

    expect(texto.children).toHaveLength(2);
    const itens = [...texto.querySelectorAll('ul > li')].map((li) => li.textContent?.trim());
    expect(itens).toEqual([
      'Nota 3224 (serie 1): aguardando aprovacao do contador.',
      'Nota 3222 (serie 1): devolvida pelo contador.',
    ]);
  });

  it('continua texto puro: marcação na resposta aparece como texto, não vira HTML', () => {
    const el = montar({ ...resumo, texto: 'Veja <b>isto</b>\n\n- <img src=x onerror=alert(1)>' });
    const texto = el.querySelector('app-ceres-texto')!;

    expect(texto.querySelector('b')).toBeNull();
    expect(texto.querySelector('img')).toBeNull();
    expect(texto.textContent).toContain('<b>isto</b>');
  });

  it('mostra os atalhos mesmo fora do modo fallback, sem a frase do fallback', () => {
    const el = montar({
      autor: 'ceres',
      rota: 'DADOS',
      texto: 'Nao consegui identificar qual dado consultar.',
      fontesDados: [],
      citacoes: [],
      modoFallback: false,
      atalhos: [
        { rota: '/documentos', rotulo: 'Minhas notas' },
        { rota: '/calendario', rotulo: 'Prazos' },
      ],
    });

    const links = [...el.querySelectorAll('a[href]')].map((a) => a.textContent?.trim());
    expect(links).toEqual(['Minhas notas', 'Prazos']);
    expect(el.textContent).toContain('Onde ver isso agora');
    expect(el.textContent).not.toContain('Sem interpretar: os trechos da lei');
  });

  it('no fallback de legislação a frase do texto da lei continua', () => {
    const el = montar({
      autor: 'ceres',
      rota: 'LEGISLACAO',
      texto: '- LC 214/2025, art. 138: Ficam reduzidas em 60%...',
      modoFallback: true,
      citacoes: [
        {
          norma: 'LC 214/2025',
          dispositivo: 'art. 138',
          url: 'https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm',
          trecho: 'Art. 138. Ficam reduzidas em 60%...',
        },
      ],
      atalhos: [],
    });

    expect(el.textContent).toContain('Sem interpretar: os trechos da lei');
  });

  /**
   * A resposta real do backend local a "O que eu preciso saber?" sem o modelo: texto fixo,
   * nenhuma lei e os quatro atalhos. Dizer ali que aquilo "é o texto da lei" seria falso.
   */
  it('no fallback de dados, sem citação, mostra os atalhos e não fala em texto da lei', () => {
    const el = montar({
      autor: 'ceres',
      rota: 'DADOS',
      texto:
        'Nao consegui consultar os seus dados agora. Voce encontra essas informacoes nas telas indicadas.',
      modoFallback: true,
      citacoes: [],
      fontesDados: [],
      atalhos: [
        { rota: '/documentos', rotulo: 'Minhas notas' },
        { rota: '/tributario', rotulo: 'Impostos' },
        { rota: '/calendario', rotulo: 'Prazos' },
      ],
    });

    expect(el.textContent).not.toContain('Sem interpretar: os trechos da lei');
    // Nada foi consultado: o selo não pode dizer que a resposta veio das notas.
    expect(el.textContent).not.toContain('resposta das suas notas');
    expect(el.querySelector('a[href="/calendario"]')).not.toBeNull();
    expect(el.querySelectorAll('a[href]')).toHaveLength(3);
  });

  it('resposta só da tabela oficial ganha o selo e o título da tabela, não "das suas notas"', () => {
    const el = montar({
      autor: 'ceres',
      rota: 'DADOS',
      texto: 'O feijao tem reducao de 100% de IBS e CBS.',
      fontesDados: [
        {
          funcao: 'consultarTratamentoProduto',
          parametros: { produtoOuNcm: 'feijao' },
          origem: 'TABELA_OFICIAL',
        },
      ],
      citacoes: [],
    });

    expect(el.textContent).toContain('resposta da tabela oficial');
    expect(el.textContent).toContain('Consultado na tabela oficial do IBS/CBS');
    expect(el.textContent).not.toContain('Calculado a partir das suas notas');
    expect(el.textContent).toContain('Tabela oficial do IBS/CBS — produto: feijao');
  });

  it('com fontes mistas, separa a tabela oficial dos dados do produtor', () => {
    const el = montar({
      autor: 'ceres',
      rota: 'MISTO',
      texto: 'As suas vendas de feijao somam R$ 10,00 e o feijao tem reducao.',
      fontesDados: [
        {
          funcao: 'totalVendasPorProduto',
          parametros: { descricaoOuNcm: 'feijao' },
          origem: 'PRODUTOR',
        },
        {
          funcao: 'consultarTratamentoProduto',
          parametros: { produtoOuNcm: 'feijao' },
          origem: 'TABELA_OFICIAL',
        },
      ],
      citacoes: [],
    });

    const produtor = el.querySelector('[data-fontes="produtor"]')!;
    const oficial = el.querySelector('[data-fontes="oficial"]')!;
    expect(produtor.textContent).toContain('Calculado a partir das suas notas');
    expect(produtor.textContent).toContain('Vendas de produto');
    expect(produtor.textContent).not.toContain('Tabela oficial');
    expect(oficial.textContent).toContain('Consultado na tabela oficial do IBS/CBS');
    expect(oficial.textContent).not.toContain('Vendas de produto');
    expect(el.textContent).toContain('resposta das suas notas e da legislação');
  });

  it('origem que a tela não conhece vai para o bloco neutro, nunca para "das suas notas"', () => {
    const el = montar({
      autor: 'ceres',
      rota: 'DADOS',
      texto: 'Encontrei 3 notas.',
      fontesDados: [{ funcao: 'funcaoNovaDoBackend', parametros: {}, origem: 'COOPERATIVA' }],
      citacoes: [],
    });

    expect(el.querySelector('[data-fontes="neutra"]')?.textContent).toContain(
      'Consultado pelo AgroConIA',
    );
    expect(el.textContent).not.toContain('Calculado a partir das suas notas');
    expect(el.textContent).toContain('resposta do AgroConIA');
  });

  /**
   * O aviso de envio ao provedor (#183). Ele precisa estar no ar **antes** de a flag ser
   * ligada na VPS: quem decide é o backend, e a tela não pode inventar o aviso nem
   * escondê-lo quando o campo chega.
   */
  describe('aviso de envio ao provedor (#183)', () => {
    const TRECHO = 'provedor de IA fora do Brasil';

    function montarComUso(conversaVaiAoProvedor?: boolean): HTMLElement {
      TestBed.configureTestingModule({
        imports: [AssistenteConversa],
        providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
      });
      entrarComo('PRODUTOR');
      TestBed.inject(AssistenteStore).uso.set({
        plano: 'padrao',
        habilitada: true,
        creditosSemana: 1000,
        consumidos: 0,
        restantes: 1000,
        renovaEm: '2026-11-19T00:00:00-03:00',
        ...(conversaVaiAoProvedor === undefined ? {} : { conversaVaiAoProvedor }),
      });
      const fixture = TestBed.createComponent(AssistenteConversa);
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }

    it('com a continuidade ligada, avisa que a conversa sai do Brasil', () => {
      expect(montarComUso(true).textContent).toContain(TRECHO);
    });

    it('com a continuidade desligada, não avisa nada', () => {
      expect(montarComUso(false).textContent).not.toContain(TRECHO);
    });

    it('backend sem o campo não mostra aviso — ausente vale false', () => {
      expect(montarComUso(undefined).textContent).not.toContain(TRECHO);
    });
  });
});
