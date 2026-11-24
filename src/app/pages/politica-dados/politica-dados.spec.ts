import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { PoliticaDadosPage } from './politica-dados';
import type { OperadorExterno } from '@services/privacidade/data-access/privacidade.service';

/** A política de dados pública (#137): o texto vem do backend, sem login. */
describe('PoliticaDadosPage', () => {
  let httpMock: HttpTestingController;

  const politica = {
    versao: '1.0',
    controlador: 'GWNext',
    contatoEncarregado: 'contato@gwnext.com.br',
    dadosColetados: ['Nome e CPF/CNPJ'],
    finalidades: ['Emitir nota fiscal'],
    basesLegais: [],
    compartilhamento: [],
    retencao: ['Documento fiscal: 5 anos'],
    direitos: ['Excluir a conta'],
    comoExercer: 'Em Configurações.',
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [PoliticaDadosPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  /** Monta a página e entrega a política pedida, como o backend entregaria. */
  function montar(corpo: Record<string, unknown>) {
    const f = TestBed.createComponent(PoliticaDadosPage);
    f.detectChanges();
    httpMock.expectOne('/politica-dados').flush(corpo);
    f.detectChanges();
    return f;
  }

  const texto = (f: { nativeElement: unknown }) =>
    (f.nativeElement as HTMLElement).textContent ?? '';

  it('mostra as secoes que vieram da API e o caminho para o login de quem nao entrou', () => {
    const f = montar(politica);

    expect(texto(f)).toContain('GWNext');
    expect(texto(f)).toContain('Documento fiscal: 5 anos');
    // Secao vazia nao aparece.
    expect(texto(f)).not.toContain('Com que base legal');
    expect(texto(f)).toContain('Ir para o login');
  });

  it('falha mostra o aviso com "tentar de novo"', () => {
    const f = TestBed.createComponent(PoliticaDadosPage);
    f.detectChanges();
    httpMock.expectOne('/politica-dados').flush('x', { status: 500, statusText: 'erro' });
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).textContent).toContain('Não foi possível carregar');
  });

  /**
   * Os operadores de fora do Brasil (#206, contrato da backend#586).
   *
   * O campo é aditivo: a política de antes de 2026-11-17 não o traz, e o backend local pode estar
   * nela. Por isso os dois casos são testados — com o campo e sem ele.
   */
  describe('operadores externos (#206)', () => {
    const anthropic: OperadorExterno = {
      nome: 'Anthropic',
      servico: 'Modelo de linguagem Claude, pela API, que redige a resposta de lei.',
      localizacao: 'Fora do Brasil.',
      finalidade: 'Responder às perguntas que o produtor faz à Ceres.',
      dadosEnviados: ['A pergunta, sem CPF, CNPJ, e-mail, telefone e CEP.'],
      dadosNaoEnviados: ['Nota fiscal, valor apurado e documento de ninguém.'],
      baseTransferencia: 'Art. 33, IX, com o art. 7º, V.',
      retencao: 'Em verificação para a conta.',
      comoExercerDireitos: 'Pedidos ao encarregado.',
    };

    it('com o campo, mostra o nome, o que nao e enviado e a base da transferencia', () => {
      const f = montar({ ...politica, operadoresExternos: [anthropic] });

      expect(texto(f)).toContain('Serviços de fora do Brasil');
      expect(texto(f)).toContain('Anthropic');
      expect(texto(f)).toContain('O que não enviamos');
      expect(texto(f)).toContain('Nota fiscal, valor apurado e documento de ninguém.');
      expect(texto(f)).toContain('Art. 33, IX, com o art. 7º, V.');
    });

    it('sem o campo, a secao nao aparece — nem o titulo vazio', () => {
      const f = montar(politica);

      expect(texto(f)).not.toContain('Serviços de fora do Brasil');
      expect(texto(f)).not.toContain('O que não enviamos');
    });

    it('lista vazia no campo nao vira rotulo orfao', () => {
      const f = montar({
        ...politica,
        operadoresExternos: [{ ...anthropic, dadosNaoEnviados: [], retencao: '' }],
      });

      expect(texto(f)).toContain('Anthropic');
      expect(texto(f)).not.toContain('O que não enviamos');
      expect(texto(f)).not.toContain('Por quanto tempo ele guarda');
    });
  });
});
