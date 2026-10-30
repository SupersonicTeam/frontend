import { vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { SessaoService, type Sessao } from './sessao.service';
import { sessaoDeTeste, sessaoVencida } from './sessao.testing';

/**
 * A identidade do app (issue #93).
 *
 * Substitui o `PerfilService` (um papel escolhido num `localStorage` editável), o `TokenService`
 * (que devolvia `null` por contrato) e o `IdentidadeService` (o `X-Usuario-Id`, com o UUID do
 * contador cravado no código).
 */
describe('SessaoService', () => {
  const CHAVE = 'agrocontabil.sessao';

  function criar(): SessaoService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [SessaoService] });
    return TestBed.inject(SessaoService);
  }

  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it('nasce sem sessão', () => {
    const sessao = criar();

    expect(sessao.logado()).toBe(false);
    expect(sessao.token()).toBeNull();
    expect(sessao.papel()).toBeNull();
    expect(sessao.homeDoPerfil()).toBe('/login');
  });

  it('o papel vem do token e decide a primeira tela', () => {
    const sessao = criar();

    sessao.abrir(sessaoDeTeste('PRODUTOR'));
    expect(sessao.ehProdutor()).toBe(true);
    expect(sessao.ehContador()).toBe(false);
    expect(sessao.homeDoPerfil()).toBe('/dashboard');

    sessao.abrir(sessaoDeTeste('CONTADOR'));
    expect(sessao.ehContador()).toBe(true);
    expect(sessao.homeDoPerfil()).toBe('/contador');
  });

  /**
   * Persistir é o que tira a renovação do caminho do F5.
   *
   * Com o token só em memória, cada recarga renovaria — e renovar **rotaciona** o refresh. Medido
   * em 30/10: reusar um refresh já trocado encerra toda a linhagem do login, então duas abas
   * recarregando juntas se derrubariam.
   */
  it('sobrevive ao F5', () => {
    const original = sessaoDeTeste('CONTADOR', 'Escritorio Campo Certo');
    criar().abrir(original);

    const depoisDoF5 = criar();
    expect(depoisDoF5.logado()).toBe(true);
    expect(depoisDoF5.token()).toBe(original.token);
    expect(depoisDoF5.papel()).toBe('CONTADOR');
    expect(depoisDoF5.nome()).toBe('Escritorio Campo Certo');
  });

  it('renovar troca só o token, preservando quem eu sou', () => {
    const sessao = criar();
    const original = sessaoDeTeste('PRODUTOR', 'João');
    sessao.abrir(original);

    const novoPrazo = new Date(Date.now() + 900_000).toISOString();
    sessao.renovarToken('token.novo', novoPrazo);

    expect(sessao.token()).toBe('token.novo');
    expect(sessao.usuarioId()).toBe(original.usuarioId);
    expect(sessao.papel()).toBe('PRODUTOR');
    expect(sessao.nome()).toBe('João');
  });

  it('renovar sem sessão não inventa uma', () => {
    const sessao = criar();
    sessao.renovarToken('token.solto', new Date().toISOString());

    expect(sessao.logado()).toBe(false);
  });

  it('encerrar esquece a sessão, inclusive a persistida', () => {
    const sessao = criar();
    sessao.abrir(sessaoDeTeste('PRODUTOR'));

    sessao.encerrar();

    expect(sessao.logado()).toBe(false);
    expect(localStorage.getItem(CHAVE)).toBeNull();
    expect(criar().logado()).toBe(false);
  });

  describe('expirado', () => {
    it('sem sessão conta como vencido', () => {
      expect(criar().expirado()).toBe(true);
    });

    it('token no prazo não está vencido', () => {
      const sessao = criar();
      sessao.abrir(sessaoDeTeste('PRODUTOR'));

      expect(sessao.expirado()).toBe(false);
    });

    it('token fora do prazo está vencido', () => {
      const sessao = criar();
      sessao.abrir(sessaoVencida('PRODUTOR'));

      expect(sessao.expirado()).toBe(true);
    });

    /**
     * A folga evita o caso em que o token vence **durante** a viagem da requisição: ele passaria
     * aqui como válido e o servidor o recusaria do outro lado.
     */
    it('vencendo nos próximos segundos já conta como vencido', () => {
      const sessao = criar();
      sessao.abrir({
        ...sessaoDeTeste('PRODUTOR'),
        expiraEm: new Date(Date.now() + 5_000).toISOString(),
      });

      expect(sessao.expirado()).toBe(true);
    });

    it('data ilegível conta como vencida: melhor renovar à toa que confiar num token morto', () => {
      const sessao = criar();
      sessao.abrir({ ...sessaoDeTeste('PRODUTOR'), expiraEm: 'ontem' });

      expect(sessao.expirado()).toBe(true);
    });
  });

  /**
   * O que vem do `localStorage` é entrada, não estado confiável: qualquer um o edita no console.
   *
   * Sessão meia-boca tem de virar ausência de sessão — vai ao `/login` em vez de montar o shell de
   * um papel inventado e colher 401 em cada tela.
   */
  describe('o que está guardado é entrada, não estado', () => {
    it.each([
      ['json quebrado', '{nao e json'],
      ['sem token', JSON.stringify({ expiraEm: 'x', usuarioId: 'u', papel: 'PRODUTOR' })],
      ['token vazio', JSON.stringify({ ...sessaoDeTeste('PRODUTOR'), token: '   ' })],
      ['sem usuarioId', JSON.stringify({ token: 't', expiraEm: 'x', papel: 'PRODUTOR' })],
      ['papel inventado', JSON.stringify({ ...sessaoDeTeste('PRODUTOR'), papel: 'ADMIN' })],
      ['não é objeto', '"produtor"'],
      ['nulo', 'null'],
    ])('%s é tratado como sem sessão', (_caso, bruto) => {
      localStorage.setItem(CHAVE, bruto);

      expect(criar().logado()).toBe(false);
    });

    it('sessão válida sem nome entra: o nome é cosmético e chega depois', () => {
      const semNome: Record<string, unknown> = { ...sessaoDeTeste('PRODUTOR', 'Zé') };
      delete semNome['nome'];
      localStorage.setItem(CHAVE, JSON.stringify(semNome));

      const sessao = criar();
      expect(sessao.logado()).toBe(true);
      expect(sessao.nome()).toBe('');
    });
  });

  describe('definirNome', () => {
    it('grava o nome que o /auth/me respondeu', () => {
      const sessao = criar();
      sessao.abrir(sessaoDeTeste('PRODUTOR'));

      sessao.definirNome('  João da Silva Produtor  ');

      expect(sessao.nome()).toBe('João da Silva Produtor');
    });

    it('nome vazio não apaga o que já havia', () => {
      const sessao = criar();
      sessao.abrir(sessaoDeTeste('PRODUTOR', 'João'));

      sessao.definirNome('   ');

      expect(sessao.nome()).toBe('João');
    });
  });

  /**
   * O `storage` avisa que outra aba mexeu na sessão — e isso são **duas** coisas.
   *
   * Renovação é a mesma pessoa com um token novo, e a aba parada só precisa adotá-lo: sem isso ela
   * insistiria no vencido e tentaria a própria renovação, reusando o cookie que a outra já
   * rotacionou — o que derruba as duas.
   *
   * **Troca de usuário é outra história.** Os services de dados são `root` e guardam o painel, a
   * conversa e o sino de quem estava nesta aba; adotar a identidade de lá sem limpá-los deixaria a
   * aba mostrando o dado de um usuário sob o nome de outro. Nenhum guard roda numa troca de
   * signal, então aí a página é recarregada — nenhum cache sobrevive a isso.
   */
  describe('outra aba mexeu na sessão (evento storage)', () => {
    /** O reload é isolado num método porque o jsdom não implementa navegação. */
    function espiarReload() {
      return vi
        .spyOn(
          SessaoService.prototype as unknown as { recarregarPagina: () => void },
          'recarregarPagina',
        )
        .mockImplementation(() => undefined);
    }

    afterEach(() => vi.restoreAllMocks());

    it('mesma pessoa com token novo: adota, sem recarregar', () => {
      const recarregou = espiarReload();
      const sessao = criar();
      sessao.abrir(sessaoDeTeste('PRODUTOR'));

      const renovada: Sessao = { ...sessaoDeTeste('PRODUTOR'), token: 'token.da.outra.aba' };
      localStorage.setItem(CHAVE, JSON.stringify(renovada));
      window.dispatchEvent(new StorageEvent('storage', { key: CHAVE }));

      expect(sessao.token()).toBe('token.da.outra.aba');
      expect(recarregou).not.toHaveBeenCalled();
    });

    /**
     * O vazamento que a revisão de segurança pegou.
     *
     * Antes daqui o listener só trocava o signal: a aba adotava o contador e seguia mostrando os
     * números do produtor, com o nome do contador na topbar. Em `/configuracoes` seriam os dados
     * cadastrais do produtor anterior, e o contexto que vai para a Ceres sairia com o painel dele.
     */
    it('outra pessoa entrou: recarrega, e NÃO adota a identidade nova', () => {
      const recarregou = espiarReload();
      const sessao = criar();
      sessao.abrir(sessaoDeTeste('PRODUTOR', 'João'));

      localStorage.setItem(CHAVE, JSON.stringify(sessaoDeTeste('CONTADOR', 'Escritorio')));
      window.dispatchEvent(new StorageEvent('storage', { key: CHAVE }));

      expect(recarregou).toHaveBeenCalledTimes(1);
      // Se o recarregamento não acontecer, a aba continua coerente com quem ela era, em vez de
      // misturar as duas pessoas.
      expect(sessao.papel()).toBe('PRODUTOR');
      expect(sessao.nome()).toBe('João');
    });

    /** O papel decide o shell: divergir nele é identidade diferente, mesmo com o id igual. */
    it('mesmo id com outro papel também recarrega', () => {
      const recarregou = espiarReload();
      const sessao = criar();
      const original = sessaoDeTeste('PRODUTOR');
      sessao.abrir(original);

      localStorage.setItem(
        CHAVE,
        JSON.stringify({ ...original, papel: 'CONTADOR', token: 'outro' }),
      );
      window.dispatchEvent(new StorageEvent('storage', { key: CHAVE }));

      expect(recarregou).toHaveBeenCalledTimes(1);
      expect(sessao.papel()).toBe('PRODUTOR');
    });

    it('a aba que saiu leva as outras: storage sem valor recarrega', () => {
      const recarregou = espiarReload();
      const sessao = criar();
      sessao.abrir(sessaoDeTeste('PRODUTOR'));

      localStorage.removeItem(CHAVE);
      window.dispatchEvent(new StorageEvent('storage', { key: CHAVE }));

      expect(recarregou).toHaveBeenCalledTimes(1);
    });

    /**
     * Sem sessão aqui não há cache de ninguém para vazar — quem saiu nesta aba já passou pelo
     * `EncerramentoService`. É o que faz uma aba parada no `/login` acompanhar quem entrou na outra.
     */
    it('sem sessão aqui, adota a de lá sem recarregar', () => {
      const recarregou = espiarReload();
      const sessao = criar();
      expect(sessao.logado()).toBe(false);

      localStorage.setItem(CHAVE, JSON.stringify(sessaoDeTeste('CONTADOR', 'Escritorio')));
      window.dispatchEvent(new StorageEvent('storage', { key: CHAVE }));

      expect(sessao.papel()).toBe('CONTADOR');
      expect(recarregou).not.toHaveBeenCalled();
    });

    it('ignora mudança de outra chave', () => {
      const recarregou = espiarReload();
      const sessao = criar();
      sessao.abrir(sessaoDeTeste('PRODUTOR'));

      localStorage.setItem('agrocontabil.tema', 'escuro');
      window.dispatchEvent(new StorageEvent('storage', { key: 'agrocontabil.tema' }));

      expect(sessao.logado()).toBe(true);
      expect(recarregou).not.toHaveBeenCalled();
    });
  });
});
