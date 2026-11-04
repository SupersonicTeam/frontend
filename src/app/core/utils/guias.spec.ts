import { dataDoPagamento, statusDaGuia } from './guias';

/**
 * O backend fala MAIÚSCULO e no feminino (`PENDENTE`, `PAGA`), e **não deriva `VENCIDA` da data**:
 * uma guia que venceu semanas atrás continua voltando `PENDENTE` de
 * `GET /api/contador/guias`. Quem olha a tela não teria como saber que está atrasada — enquanto a
 * carteira (`atencao.guiasVencidas`) a conta como vencida, porque lá o cálculo é agregado no SQL.
 *
 * Sem esta tradução a triagem diria "1 guia vencida" e a tela do cliente mostraria a mesma guia
 * como "pendente". É a contradição que estes testes impedem.
 */
describe('statusDaGuia', () => {
  const HOJE = '2026-10-27';

  it('traduz PAGA e PAGO para pago', () => {
    expect(statusDaGuia('PAGA', '2026-09-20', HOJE)).toBe('pago');
    expect(statusDaGuia('PAGO', '2026-09-20', HOJE)).toBe('pago');
  });

  it('traduz VENCIDA para vencido', () => {
    expect(statusDaGuia('VENCIDA', '2026-09-20', HOJE)).toBe('vencido');
  });

  it('deriva vencido da data quando o backend ainda diz PENDENTE', () => {
    expect(statusDaGuia('PENDENTE', '2026-10-20', HOJE)).toBe('vencido');
  });

  it('guia que vence hoje ainda NÃO está vencida', () => {
    expect(statusDaGuia('PENDENTE', HOJE, HOJE)).toBe('pendente');
  });

  it('guia com vencimento futuro continua pendente', () => {
    expect(statusDaGuia('PENDENTE', '2026-10-31', HOJE)).toBe('pendente');
  });

  it('guia paga no passado NÃO vira vencida', () => {
    expect(statusDaGuia('PAGA', '2026-01-10', HOJE)).toBe('pago');
  });

  it('status desconhecido cai em pendente, não some da tela', () => {
    expect(statusDaGuia('ALGO_NOVO', '2026-10-31', HOJE)).toBe('pendente');
  });

  it('sem data de vencimento não inventa atraso', () => {
    expect(statusDaGuia('PENDENTE', undefined, HOJE)).toBe('pendente');
  });
});

describe('dataDoPagamento', () => {
  it('só a guia paga tem data de pagamento', () => {
    const data = '2026-11-03T12:00:00-03:00';
    expect(dataDoPagamento({ status: 'pago', dataPagamento: data })).toBe(data);
    expect(dataDoPagamento({ status: 'pago', dataPagamento: null })).toBeNull();
    expect(dataDoPagamento({ status: 'pago' })).toBeNull();
    // Data sem status de paga não vira "paga em": o status manda.
    expect(dataDoPagamento({ status: 'pendente', dataPagamento: data })).toBeNull();
  });
});
