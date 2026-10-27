import { TestBed } from '@angular/core/testing';
import { IdentidadeService } from './identidade.service';
import { PerfilService } from './perfil.service';
import { LOGGED_ACCOUNTANT_ID } from '@core/config/produtor-logado';

/**
 * Por que a identidade deixou de ser sempre vazia (#95).
 *
 * Enquanto as telas do contador consultavam só rotas do produtor (`/notas`, `/apuracao`), não
 * mandar header nenhum funcionava: o `MockIdentidadeFilter` resolve o produtor semente, e era
 * dele que os números vinham. A carteira (backend#177) é a primeira rota **do contador** que o app
 * chama — e aí o mock resolver o produtor virou `403 PAPEL_NAO_AUTORIZADO`.
 *
 * Então em desenvolvimento a identidade passa a seguir o perfil escolhido na tela de entrada.
 * Isto morre com a frontend#93: com JWT o papel vem do token, não de um UUID cravado aqui.
 */
describe('IdentidadeService', () => {
  function criar(perfil: 'produtor' | 'contador' | null, idNoStorage?: string) {
    localStorage.clear();
    if (idNoStorage) localStorage.setItem('agrocontabil.usuario-id', idNoStorage);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [IdentidadeService, PerfilService] });
    const perfis = TestBed.inject(PerfilService);
    if (perfil) perfis.entrar(perfil);
    else perfis.sair();
    return TestBed.inject(IdentidadeService);
  }

  afterEach(() => localStorage.clear());

  it('como produtor não manda identidade: o mock resolve o produtor semente', () => {
    expect(criar('produtor').usuarioId()).toBeNull();
  });

  it('como contador manda o UUID do contador semente, senão a carteira dá 403', () => {
    expect(criar('contador').usuarioId()).toBe(LOGGED_ACCOUNTANT_ID);
  });

  it('sem perfil escolhido continua sem identidade', () => {
    expect(criar(null).usuarioId()).toBeNull();
  });

  it('o id posto à mão no localStorage vence o perfil: é a escotilha de depuração', () => {
    const outro = '11111111-2222-3333-4444-555555555555';
    expect(criar('contador', outro).usuarioId()).toBe(outro);
  });

  /**
   * O recorte que mantém a demonstração de pé.
   *
   * Mandar a identidade do contador em **toda** rota resolve a carteira e quebra as outras três
   * abas: `/api/dashboard`, `/api/notas`, `/api/apuracao` e `/api/relatorios` derivam o produtor da
   * identidade e respondem 403 para contador (medido em 27/10). Como a leitura por cliente não
   * existe (SupersonicTeam/backend#255), não há para onde apontá-las — o Fechamento simplesmente
   * pararia de carregar.
   *
   * Então o header vai só nas rotas **do contador**, e as do produtor seguem sem header, resolvendo
   * o produtor semente como sempre resolveram.
   */
  describe('paraRota — o header só nas rotas do contador', () => {
    it('manda a identidade na carteira', () => {
      expect(criar('contador').paraRota('/contador/produtores')).toBe(LOGGED_ACCOUNTANT_ID);
    });

    it('manda nas rotas aninhadas de um cliente', () => {
      expect(criar('contador').paraRota('/contador/produtores/p1/notas')).toBe(
        LOGGED_ACCOUNTANT_ID,
      );
    });

    it('NÃO manda em /api/apuracao: ela daria 403 e o Fechamento pararia', () => {
      expect(criar('contador').paraRota('/apuracao?periodo=2026-09')).toBeNull();
    });

    it('NÃO manda em /api/notas nem /api/dashboard', () => {
      const identidade = criar('contador');
      expect(identidade.paraRota('/notas?size=50')).toBeNull();
      expect(identidade.paraRota('/dashboard')).toBeNull();
    });

    it('reconhece a rota com a baseURL já prefixada', () => {
      expect(criar('contador').paraRota('/api/contador/etiquetas')).toBe(LOGGED_ACCOUNTANT_ID);
    });

    it('o id posto à mão vale em qualquer rota: quem usou a escotilha quis aquele id', () => {
      const outro = '11111111-2222-3333-4444-555555555555';
      expect(criar('contador', outro).paraRota('/apuracao')).toBe(outro);
      expect(criar('produtor', outro).paraRota('/dashboard')).toBe(outro);
    });

    it('produtor não manda identidade nem nas rotas do contador', () => {
      // `/contador/guias` é consultada pelas telas do produtor também, e sem header o backend
      // resolve o produtor semente — que é justamente quem deve ser.
      expect(criar('produtor').paraRota('/contador/guias')).toBeNull();
    });
  });

  it('acompanha a troca de perfil sem recarregar a página', () => {
    const identidade = criar('produtor');
    expect(identidade.usuarioId()).toBeNull();

    TestBed.inject(PerfilService).entrar('contador');
    expect(identidade.usuarioId()).toBe(LOGGED_ACCOUNTANT_ID);
  });
});
