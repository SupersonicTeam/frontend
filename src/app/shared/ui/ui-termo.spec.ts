import { TestBed } from '@angular/core/testing';
import { TERMOS_FISCAIS, termoFiscal } from '@core/utils/glossario';
import { UiTermo } from './ui-termo';

/**
 * O glossário fiscal (issue #105).
 *
 * Antes disto, `dashboard.ts` tinha um `termoExplicado` e um `explicar()` com o comentário "Abre o
 * glossário de um termo fiscal" — e **nenhum dos dois era referenciado em lugar nenhum**. Era
 * andaime parecendo feature; estes testes existem para o glossário continuar sendo alcançável.
 */
describe('glossário fiscal', () => {
  it('chave desconhecida nao vira verbete inventado', () => {
    expect(termoFiscal('ibs')?.termo).toBe('IBS');
    expect(termoFiscal('imposto-que-nao-existe')).toBeNull();
  });

  /**
   * "Glossário e atalhos alinhados": cada verbete entrega a pergunta pronta à Ceres, na mesma voz
   * das sugestões do chat — primeira pessoa, sobre o que acontece *comigo*.
   */
  it('todo termo carrega uma pergunta, e ela fala na voz do produtor', () => {
    expect(TERMOS_FISCAIS.length).toBeGreaterThan(0);
    for (const t of TERMOS_FISCAIS) {
      expect(t.resumo.length).toBeGreaterThan(10);
      expect(t.pergunta.endsWith('?')).toBe(true);
      expect(t.pergunta.toLowerCase()).toMatch(/\b(eu|me|mim|meu|meus|minha|minhas)\b/);
    }
  });

  it('as chaves sao unicas — senao o track do @for repete verbete', () => {
    const chaves = TERMOS_FISCAIS.map((t) => t.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
  });
});

describe('UiTermo', () => {
  function montar(podePerguntar = true) {
    TestBed.configureTestingModule({ imports: [UiTermo] });
    const fixture = TestBed.createComponent(UiTermo);
    fixture.componentRef.setInput('termo', TERMOS_FISCAIS[0]);
    fixture.componentRef.setInput('podePerguntar', podePerguntar);
    fixture.detectChanges();
    return fixture;
  }

  it('nasce fechado: o verbete nao ocupa a tela de quem nao perguntou', () => {
    const el = montar().nativeElement as HTMLElement;
    expect(el.textContent).toContain('IBS');
    expect(el.textContent).not.toContain(TERMOS_FISCAIS[0]!.resumo);
    expect(el.querySelector('button')?.getAttribute('aria-expanded')).toBe('false');
  });

  it('abre a explicacao no clique', () => {
    const fixture = montar();
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector('button')!.click();
    fixture.detectChanges();

    expect(el.textContent).toContain(TERMOS_FISCAIS[0]!.resumo);
    expect(el.querySelector('button')?.getAttribute('aria-expanded')).toBe('true');
  });

  it('entrega a pergunta pronta, em vez de responder lei por conta propria', () => {
    const fixture = montar();
    const el = fixture.nativeElement as HTMLElement;
    let perguntou: string | undefined;
    fixture.componentInstance.perguntar.subscribe((p) => (perguntou = p));

    el.querySelector('button')!.click();
    fixture.detectChanges();
    const botoes = [...el.querySelectorAll('button')];
    botoes.find((b) => /Perguntar/.test(b.textContent ?? ''))!.click();

    expect(perguntou).toBe(TERMOS_FISCAIS[0]!.pergunta);
  });

  /** A Ceres responde 403 PAPEL_NAO_AUTORIZADO para contador: oferecer o botao seria mentir. */
  it('sem assistente disponivel, o verbete explica mas nao oferece perguntar', () => {
    const fixture = montar(false);
    const el = fixture.nativeElement as HTMLElement;
    el.querySelector('button')!.click();
    fixture.detectChanges();

    expect(el.textContent).toContain(TERMOS_FISCAIS[0]!.resumo);
    expect(el.textContent).not.toContain('Perguntar à Ceres');
  });
});
