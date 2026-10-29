import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { falhaDaApi } from './erro-api';

/**
 * A falha da API vira estado de tela (issue #107).
 *
 * Os services engoliam o erro com `catchError(() => of([]))`, e a tela mostrava **lista vazia** —
 * indistinguível de "não há nada". Foi assim que o produtor errado da #106 passou despercebido:
 * a tela dizia "Nenhum vencimento nos próximos dias" quando a API respondia 404.
 *
 * Este helper não decide o texto apenas: decide também **se faz sentido oferecer "tentar de
 * novo"**. Um botão de repetir num 403 é uma promessa falsa — repetir não vai mudar o papel de
 * quem está logado.
 */
describe('falhaDaApi', () => {
  function erro(status: number, corpo?: unknown, headers?: Record<string, string>) {
    return new HttpErrorResponse({
      status,
      statusText: 'erro',
      error: corpo,
      headers: new HttpHeaders(headers ?? {}),
    });
  }

  const envelope = (code: string, message: string) => ({ errors: [{ code, message }] });

  it('sem conexão é diferente de erro do servidor, e vale tentar de novo', () => {
    const falha = falhaDaApi(erro(0));

    expect(falha.mensagem).toContain('Sem conexão');
    expect(falha.podeTentarDeNovo).toBe(true);
  });

  it('401 fala de sessão e NÃO oferece tentar de novo: repetir não loga ninguém', () => {
    const falha = falhaDaApi(erro(401, envelope('NAO_AUTENTICADO', 'Nao autenticado.')));

    expect(falha.mensagem).toContain('sessão');
    expect(falha.podeTentarDeNovo).toBe(false);
  });

  it('403 de papel explica o perfil, e não insiste', () => {
    const falha = falhaDaApi(
      erro(403, envelope('PAPEL_NAO_AUTORIZADO', 'Operacao restrita ao papel CONTADOR.')),
    );

    expect(falha.codigo).toBe('PAPEL_NAO_AUTORIZADO');
    expect(falha.mensagem).toContain('CONTADOR');
    expect(falha.podeTentarDeNovo).toBe(false);
  });

  it('404 não vira "está vazio": é não encontrado, e repetir não resolve', () => {
    const falha = falhaDaApi(erro(404, envelope('NAO_ENCONTRADO', 'Produtor nao encontrado.')));

    expect(falha.mensagem).toContain('Produtor nao encontrado.');
    expect(falha.podeTentarDeNovo).toBe(false);
  });

  it('429 respeita o Retry-After e diz quanto esperar', () => {
    const falha = falhaDaApi(
      erro(429, envelope('MUITAS_TENTATIVAS', 'Muitas tentativas.'), { 'Retry-After': '30' }),
    );

    expect(falha.esperarSegundos).toBe(30);
    expect(falha.mensagem).toContain('30');
    expect(falha.podeTentarDeNovo).toBe(true);
  });

  it('429 sem Retry-After continua funcionando, sem inventar numero', () => {
    const falha = falhaDaApi(erro(429, envelope('MUITAS_TENTATIVAS', 'Muitas tentativas.')));

    expect(falha.esperarSegundos).toBeUndefined();
    expect(falha.podeTentarDeNovo).toBe(true);
  });

  it('5xx é genérico e vale tentar de novo', () => {
    const falha = falhaDaApi(erro(500, null));

    expect(falha.mensagem).toContain('servidor');
    expect(falha.podeTentarDeNovo).toBe(true);
  });

  /**
   * A mensagem do servidor ganha da nossa quando existe: ela é mais específica ("Produtor nao
   * encontrado.") do que qualquer frase genérica que escrevêssemos por status.
   */
  it('a mensagem do envelope vence o texto padrão do status', () => {
    const falha = falhaDaApi(erro(500, envelope('FALHA_X', 'O certificado digital nao foi lido.')));

    expect(falha.mensagem).toBe('O certificado digital nao foi lido.');
  });

  it('envelope sem errors[] cai no message do corpo', () => {
    const falha = falhaDaApi(erro(400, { message: 'Requisicao invalida.' }));

    expect(falha.mensagem).toBe('Requisicao invalida.');
  });

  it('corpo vazio não quebra: sobra uma frase com o status', () => {
    const falha = falhaDaApi(erro(418, null));

    expect(falha.mensagem).toContain('418');
  });
});
