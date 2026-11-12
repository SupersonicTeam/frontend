import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { PreferenciaMovimentoService } from './preferencia-movimento.service';

const CHAVE = 'agro-movimento';

type Ouvinte = (evento: MediaQueryListEvent) => void;

/** Preferência de movimento (#174, itens 5.1 e 5.3): sistema OU escolha do visitante. */
describe('PreferenciaMovimentoService', () => {
  let ouvintes: Ouvinte[];
  let matchMediaOriginal: typeof window.matchMedia;

  /** `matchMedia` falso, porque no jsdom `matches` é sempre `false` e não há como mudar. */
  function fingirSistema(reduz: boolean, { semEscuta = false } = {}) {
    window.matchMedia = ((consulta: string) =>
      ({
        media: consulta,
        matches: reduz,
        addEventListener: (_: string, ouvinte: Ouvinte) => {
          if (semEscuta) throw new Error('navegador antigo');
          ouvintes.push(ouvinte);
        },
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList) as typeof window.matchMedia;
  }

  const mudarSistema = (reduz: boolean) =>
    ouvintes.forEach((o) => o({ matches: reduz } as MediaQueryListEvent));

  const temClasse = () => document.documentElement.classList.contains('movimento-reduzido');
  const criar = () => TestBed.inject(PreferenciaMovimentoService);

  beforeEach(() => {
    ouvintes = [];
    matchMediaOriginal = window.matchMedia;
    localStorage.clear();
    document.documentElement.classList.remove('movimento-reduzido');
    fingirSistema(false);
    TestBed.configureTestingModule({ providers: [] });
  });

  afterEach(() => {
    window.matchMedia = matchMediaOriginal;
    localStorage.clear();
    document.documentElement.classList.remove('movimento-reduzido');
  });

  it('nasce liberado, sem escolha e sem preferência do sistema', () => {
    const servico = criar();

    expect(servico.reduzido()).toBe(false);
    expect(servico.escolhido()).toBe(false);
    expect(servico.imposto()).toBe(false);
    expect(temClasse()).toBe(false);
  });

  it('a preferência do sistema reduz o movimento e já marca a classe no <html>', () => {
    fingirSistema(true);

    const servico = criar();

    expect(servico.reduzido()).toBe(true);
    expect(servico.imposto()).toBe(true);
    expect(temClasse()).toBe(true);
  });

  it('a escolha do visitante reduz o movimento, marca a classe e persiste', () => {
    const servico = criar();

    servico.alternar();

    expect(servico.reduzido()).toBe(true);
    expect(servico.escolhido()).toBe(true);
    expect(temClasse()).toBe(true);
    expect(localStorage.getItem(CHAVE)).toBe('reduzido');
  });

  it('desligar a escolha libera o movimento e tira a chave do storage', () => {
    localStorage.setItem(CHAVE, 'reduzido');
    const servico = criar();
    expect(servico.reduzido()).toBe(true);

    servico.definir(false);

    expect(servico.reduzido()).toBe(false);
    expect(temClasse()).toBe(false);
    expect(localStorage.getItem(CHAVE)).toBeNull();
  });

  /** O botão liga para quem não configurou nada; ele não desfaz a escolha do aparelho. */
  it('desligar a escolha NÃO passa por cima da preferência do sistema', () => {
    fingirSistema(true);
    localStorage.setItem(CHAVE, 'reduzido');
    const servico = criar();

    servico.definir(false);

    expect(servico.escolhido()).toBe(false);
    expect(servico.reduzido()).toBe(true);
    expect(temClasse()).toBe(true);
  });

  it('acompanha a preferência do sistema mudando com a página aberta', () => {
    const servico = criar();
    expect(servico.reduzido()).toBe(false);

    mudarSistema(true);
    expect(servico.reduzido()).toBe(true);
    expect(temClasse()).toBe(true);

    mudarSistema(false);
    expect(servico.reduzido()).toBe(false);
    expect(temClasse()).toBe(false);
  });

  it('storage que recusa leitura e escrita não derruba o serviço', () => {
    const erro = () => {
      throw new Error('storage bloqueado');
    };
    const ler = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(erro);
    const gravar = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(erro);

    const servico = criar();
    expect(servico.reduzido()).toBe(false);

    servico.definir(true);
    expect(servico.reduzido()).toBe(true);
    expect(temClasse()).toBe(true);

    ler.mockRestore();
    gravar.mockRestore();
  });

  it('navegador sem matchMedia fica com a escolha do visitante', () => {
    (window as { matchMedia?: typeof window.matchMedia }).matchMedia = undefined;
    const servico = criar();

    expect(servico.reduzido()).toBe(false);
    servico.definir(true);
    expect(servico.reduzido()).toBe(true);
  });

  it('MediaQueryList sem addEventListener não impede a leitura inicial', () => {
    fingirSistema(true, { semEscuta: true });

    const servico = criar();

    expect(servico.reduzido()).toBe(true);
    expect(temClasse()).toBe(true);
  });
});
