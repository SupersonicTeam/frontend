import { NavigationError } from '@angular/router';
import {
  AmbienteDeRecarga,
  CHAVE_RECARGA_CHUNK,
  ehFalhaDeChunk,
  navegacaoDeuCerto,
  recarregarSeChunkFaltou,
} from './recarga-apos-deploy';

/** Um ambiente de mentira: `sessionStorage` em memória, rede ligável, navegação espionada. */
function ambienteFalso(guardado: Record<string, string> = {}, online = true) {
  const dados: Record<string, string> = { ...guardado };
  const ir = vi.fn();
  const ambiente: AmbienteDeRecarga = {
    armazenamento: {
      getItem: (k) => dados[k] ?? null,
      setItem: (k, v) => {
        dados[k] = v;
      },
      removeItem: (k) => {
        delete dados[k];
      },
    },
    online: () => online,
    ir,
  };
  return { ambiente, ir, dados };
}

/** Aba aberta antes de um deploy: recarregar no destino, uma vez (#162). */
describe('recarga após deploy', () => {
  const falhaChrome = new TypeError(
    'Failed to fetch dynamically imported module: https://www.agroconia.com.br/chunk-GQNNXNPM.js',
  );

  const erroDeNavegacao = (erro: unknown, url = '/cadastro') => new NavigationError(1, url, erro);

  describe('ehFalhaDeChunk', () => {
    it.each([
      ['Chrome e Edge', falhaChrome],
      ['Firefox', new TypeError('error loading dynamically imported module: /chunk-A.js')],
      ['Safari', new TypeError('Importing a module script failed.')],
    ])('reconhece a frase do %s', (_, erro) => {
      expect(ehFalhaDeChunk(erro)).toBe(true);
    });

    it('não confunde com outros erros de navegação', () => {
      expect(ehFalhaDeChunk(new Error('Cannot match any routes'))).toBe(false);
      expect(ehFalhaDeChunk(null)).toBe(false);
      expect(ehFalhaDeChunk(undefined)).toBe(false);
    });
  });

  describe('recarregarSeChunkFaltou', () => {
    it('falha de chunk: recarrega no endereço para onde a pessoa ia e marca a aba', () => {
      const { ambiente, ir, dados } = ambienteFalso();
      expect(recarregarSeChunkFaltou(erroDeNavegacao(falhaChrome), ambiente)).toBe(true);
      expect(ir).toHaveBeenCalledWith('/cadastro');
      expect(dados[CHAVE_RECARGA_CHUNK]).toBe('/cadastro');
    });

    it('outro erro de navegação segue como antes, sem recarregar', () => {
      const { ambiente, ir } = ambienteFalso();
      const evento = erroDeNavegacao(new Error('guarda quebrou'));
      expect(recarregarSeChunkFaltou(evento, ambiente)).toBe(false);
      expect(ir).not.toHaveBeenCalled();
    });

    it('já recarregou e ainda não houve navegação boa: não recarrega outra vez (sem laço)', () => {
      const { ambiente, ir } = ambienteFalso({ [CHAVE_RECARGA_CHUNK]: '/cadastro' });
      expect(recarregarSeChunkFaltou(erroDeNavegacao(falhaChrome), ambiente)).toBe(false);
      expect(ir).not.toHaveBeenCalled();
    });

    it('depois de uma navegação boa, a falha seguinte (outro deploy) recarrega de novo', () => {
      const { ambiente, ir } = ambienteFalso({ [CHAVE_RECARGA_CHUNK]: '/cadastro' });
      navegacaoDeuCerto(ambiente);
      expect(recarregarSeChunkFaltou(erroDeNavegacao(falhaChrome, '/documentos'), ambiente)).toBe(
        true,
      );
      expect(ir).toHaveBeenCalledWith('/documentos');
    });

    it('sem rede não recarrega: o app segue aberto em vez da página de erro do navegador', () => {
      const { ambiente, ir, dados } = ambienteFalso({}, false);
      expect(recarregarSeChunkFaltou(erroDeNavegacao(falhaChrome), ambiente)).toBe(false);
      expect(ir).not.toHaveBeenCalled();
      expect(dados[CHAVE_RECARGA_CHUNK]).toBeUndefined();
    });

    it('sem sessionStorage não há como lembrar, então não recarrega', () => {
      const { ambiente, ir } = ambienteFalso();
      ambiente.armazenamento.getItem = () => {
        throw new DOMException('bloqueado', 'SecurityError');
      };
      expect(recarregarSeChunkFaltou(erroDeNavegacao(falhaChrome), ambiente)).toBe(false);
      expect(ir).not.toHaveBeenCalled();
    });
  });

  it('navegacaoDeuCerto não lança sem sessionStorage', () => {
    const { ambiente } = ambienteFalso();
    ambiente.armazenamento.removeItem = () => {
      throw new DOMException('bloqueado', 'SecurityError');
    };
    expect(() => navegacaoDeuCerto(ambiente)).not.toThrow();
  });
});
