import { contraparteDaNota, ehCompraImportada } from './nota-fiscal.model';

/** Origem e emitente da nota (#170, backend#409). */
describe('nota-fiscal.model — compra importada', () => {
  it('só a IMPORTADA é compra; a própria e a sem origem, não', () => {
    expect(ehCompraImportada({ origem: 'IMPORTADA' })).toBe(true);
    expect(ehCompraImportada({ origem: 'PROPRIA' })).toBe(false);
    expect(ehCompraImportada({ origem: null })).toBe(false);
    expect(ehCompraImportada(null)).toBe(false);
  });

  it('na compra, a contraparte é o fornecedor; na própria, o destinatário', () => {
    expect(
      contraparteDaNota({
        origem: 'IMPORTADA',
        emitenteNome: 'Posto Rodoviario Chapadao Ltda',
        destinatarioNome: 'Carlos Eduardo Rossi',
      }),
    ).toBe('Posto Rodoviario Chapadao Ltda');
    expect(
      contraparteDaNota({ origem: 'PROPRIA', emitenteNome: null, destinatarioNome: 'Cooperativa' }),
    ).toBe('Cooperativa');
  });

  it('compra sem o nome do emitente diz "Fornecedor", nunca o nome do próprio produtor', () => {
    expect(
      contraparteDaNota({
        origem: 'IMPORTADA',
        emitenteNome: null,
        destinatarioNome: 'Carlos Eduardo Rossi',
      }),
    ).toBe('Fornecedor');
  });
});
