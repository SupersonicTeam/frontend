import { NavigationError } from '@angular/router';
import {
  AmbienteDeRecarga,
  CHAVE_RECARGA_CHUNK,
  INTERVALO_MINIMO_MS,
  ehFalhaDeChunk,
  recarregarSeChunkFaltou,
} from './recarga-apos-deploy';

/** Aba aberta antes de um deploy: recarregar no destino, uma vez (#162). */
describe('recarga após deploy', () => {
  const falhaChrome = new TypeError(
    'Failed to fetch dynamically imported module: https://www.agroconia.com.br/chunk-GQNNXNPM.js',
  );

  function ambiente(guardado: Record<string, string> = {}, agora = 1_000_000) {
    const dados = { ...guardado };
    const ir = vi.fn();
    const amb: AmbienteDeRecarga = {
      armazenamento: {
        getItem: (k) => dados[k] ?? null,
        setItem: (k, v) => {
          dados[k] = v;
        },
      },
      agora: () => agora,
      ir,
    };
    return { amb, ir, dados };
  }

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
    it('falha de chunk: recarrega no endereço para onde a pessoa ia e anota a hora', () => {
      const { amb, ir, dados } = ambiente();
      expect(recarregarSeChunkFaltou(erroDeNavegacao(falhaChrome), amb)).toBe(true);
      expect(ir).toHaveBeenCalledWith('/cadastro');
      expect(dados[CHAVE_RECARGA_CHUNK]).toBe('1000000');
    });

    it('outro erro de navegação segue como antes, sem recarregar', () => {
      const { amb, ir } = ambiente();
      expect(recarregarSeChunkFaltou(erroDeNavegacao(new Error('guarda quebrou')), amb)).toBe(
        false,
      );
      expect(ir).not.toHaveBeenCalled();
    });

    it('falhou de novo logo depois de recarregar: não recarrega outra vez (sem laço)', () => {
      const agora = 1_000_000;
      const { amb, ir } = ambiente(
        { [CHAVE_RECARGA_CHUNK]: String(agora - INTERVALO_MINIMO_MS + 1) },
        agora,
      );
      expect(recarregarSeChunkFaltou(erroDeNavegacao(falhaChrome), amb)).toBe(false);
      expect(ir).not.toHaveBeenCalled();
    });

    it('a recarga anterior foi há mais tempo (outro deploy): recarrega de novo', () => {
      const agora = 1_000_000;
      const { amb, ir } = ambiente(
        { [CHAVE_RECARGA_CHUNK]: String(agora - INTERVALO_MINIMO_MS) },
        agora,
      );
      expect(recarregarSeChunkFaltou(erroDeNavegacao(falhaChrome), amb)).toBe(true);
      expect(ir).toHaveBeenCalledTimes(1);
    });

    it('sem sessionStorage não há como lembrar, então não recarrega', () => {
      const { amb, ir } = ambiente();
      amb.armazenamento.getItem = () => {
        throw new DOMException('bloqueado', 'SecurityError');
      };
      expect(recarregarSeChunkFaltou(erroDeNavegacao(falhaChrome), amb)).toBe(false);
      expect(ir).not.toHaveBeenCalled();
    });
  });
});
