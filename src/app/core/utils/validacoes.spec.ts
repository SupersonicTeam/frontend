import { apenasUltimaChecagem, ehCampoDoProdutor, rotuloDoCampo } from './validacoes';
import type { NotaValidacaoResponse } from '@dtos/notas/sefaz.response';

/**
 * Regras compartilhadas entre o modal da nota e a gaveta do assistente — por isso
 * moram num util, e nao dentro de uma tela.
 */
describe('validacoes', () => {
  const v = (over: Partial<NotaValidacaoResponse>): NotaValidacaoResponse => ({
    loteValidacao: 'l1',
    code: 'NOTA_INVALIDA_EMISSAO',
    field: 'destinatarioEndereco',
    message: 'Endereço do destinatário é obrigatório',
    validadoEm: '2026-07-02T21:00:00Z',
    ...over,
  });

  describe('apenasUltimaChecagem', () => {
    it('fica so com o lote mais recente — o backend devolve o historico todo', () => {
      // A nota 7 real traz o mesmo problema duas vezes, de tentativas em
      // horarios diferentes. Repetir na tela so confunde quem vai corrigir.
      const lista = [
        v({ loteValidacao: 'antigo', validadoEm: '2026-07-02T21:42:42Z' }),
        v({ loteValidacao: 'atual', validadoEm: '2026-07-02T22:00:18Z' }),
      ];

      const saida = apenasUltimaChecagem(lista);

      expect(saida.length).toBe(1);
      expect(saida[0].loteValidacao).toBe('atual');
    });

    it('nao repete o mesmo code+field dentro do mesmo lote', () => {
      const lista = [
        v({ loteValidacao: 'atual' }),
        v({ loteValidacao: 'atual' }),
        v({ loteValidacao: 'atual', field: 'destinatarioNome' }),
      ];

      expect(apenasUltimaChecagem(lista).length).toBe(2);
    });

    it('lista vazia entra e sai vazia', () => {
      expect(apenasUltimaChecagem([])).toEqual([]);
    });
  });

  describe('rotuloDoCampo', () => {
    it('traduz o caminho da propriedade para portugues', () => {
      expect(rotuloDoCampo('destinatarioEndereco')).toBe('Endereço do destinatário');
      expect(rotuloDoCampo('destinatarioEndereco.municipio')).toBe('Município do destinatário');
      expect(rotuloDoCampo('produtor.inscricaoEstadual')).toBe('Sua inscrição estadual');
    });

    it('ignora o indice do item — itens[0].ncm cai no rotulo de itens', () => {
      expect(rotuloDoCampo('itens[0].ncm')).toBe('Produtos da nota');
    });

    it('a classificacao do IBS/CBS tem nome proprio, em qualquer item (#208)', () => {
      expect(rotuloDoCampo('itens[0].cClassTrib')).toBe('Classificação do IBS/CBS do item');
      expect(rotuloDoCampo('itens[2].cClassTrib')).toBe('Classificação do IBS/CBS do item');
    });

    it('campo desconhecido devolve o proprio identificador, nao esconde a informacao', () => {
      expect(rotuloDoCampo('campoNovoDoBackend')).toBe('campoNovoDoBackend');
      expect(rotuloDoCampo(null)).toBe('Dados da nota');
    });
  });

  describe('ehCampoDoProdutor', () => {
    it('separa o que se corrige na nota do que esta no cadastro', () => {
      // O cadastro do produtor nao e editavel no app: oferecer "Corrigir" ali
      // levaria a pessoa a um beco.
      expect(ehCampoDoProdutor('produtor.inscricaoEstadual')).toBe(true);
      expect(ehCampoDoProdutor('destinatarioEndereco')).toBe(false);
      expect(ehCampoDoProdutor(undefined)).toBe(false);
    });
  });
});
