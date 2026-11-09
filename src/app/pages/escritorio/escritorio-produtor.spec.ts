import type { VinculoDoProdutor } from '@services/vinculos/data-access/vinculos.service';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { EscritorioProdutor } from './escritorio-produtor';

const convite = {
  id: 'c1',
  escritorio: 'Contabilidade Campo Bom',
  convidadoPor: 'Ana',
  crc: 'PR-123',
  situacao: 'PENDENTE',
  criadoEm: '2026-11-01T10:00:00-03:00',
  expiraEm: '2026-11-08T10:00:00-03:00',
};

const vinculo = (situacao: string) => ({
  id: 'v1',
  escritorioId: 'e1',
  escritorio: 'Contabilidade Campo Bom',
  responsavel: 'Ana Souza',
  crc: 'PR-123',
  situacao,
  inicio: '2026-10-01T10:00:00-03:00',
  fim: null,
});

const pedido = (id: string, titulo: string, dataLimite: string | null = null) => ({
  id,
  produtorId: 'p1',
  escritorioId: 'e1',
  titulo,
  descricao: null,
  observacoes: null,
  dataLimite,
  tiposDocumento: [],
  status: 'PENDENTE',
  motivo: null,
  quantidadeAnexos: 0,
  anexos: [],
  createdAt: '2026-11-01T10:00:00-03:00',
  updatedAt: '2026-11-01T10:00:00-03:00',
});

/** A aba Meu escritório do produtor: convites, quem atende, o que vê e o que pediu. */
describe('EscritorioProdutor', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [EscritorioProdutor],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  /** Abre a aba; com escritório ativo, também responde os pedidos de documento. */
  function abrir(convites: unknown[], vinculos: unknown[], pedidos: unknown[] = []) {
    const fixture = TestBed.createComponent(EscritorioProdutor);
    fixture.detectChanges();
    httpMock.expectOne('/convites').flush(convites);
    httpMock.expectOne((r) => r.url === '/vinculos').flush(vinculos);
    httpMock.match((r) => r.url === '/pendencias').forEach((r) => r.flush(pedidos));
    fixture.detectChanges();
    return fixture;
  }

  const texto = (f: { nativeElement: unknown }) => (f.nativeElement as HTMLElement).textContent;

  it('mostra o convite pendente com quem mandou', () => {
    const f = abrir([convite], []);
    expect(texto(f)).toContain('Convite de Contabilidade Campo Bom');
    expect(texto(f)).toContain('convite de Ana, CRC PR-123');
  });

  it('com escritório ativo, mostra quem atende, o responsável, o CRC e o que ele vê', () => {
    const f = abrir([], [vinculo('ATIVO')]);
    expect(texto(f)).toContain('Contabilidade Campo Bom');
    expect(texto(f)).toContain('Ana Souza');
    expect(texto(f)).toContain('PR-123');
    expect(texto(f)).toContain('O que o escritório vê');
  });

  it('suspenso: avisa que o escritório não acessa nada, e não busca pedidos', () => {
    const f = abrir([], [vinculo('SUSPENSO')]);
    expect(texto(f)).toContain('suspendeu o atendimento');
    expect(texto(f)).not.toContain('O que o escritório pediu');
    httpMock.expectNone('/pendencias');
  });

  it('o que o escritório pediu: os primeiros pedidos e quantos faltam, com link para Minhas notas', () => {
    const f = abrir(
      [],
      [vinculo('ATIVO')],
      [
        pedido('a', 'Extrato bancário', '2026-11-07'),
        pedido('b', 'Nota de compra de adubo'),
        pedido('c', 'Contrato de arrendamento'),
        pedido('d', 'Comprovante de pagamento'),
      ],
    );
    const req = (f.nativeElement as HTMLElement).querySelector('a[href="/documentos"]');
    expect(texto(f)).toContain('Extrato bancário');
    expect(texto(f)).toContain('até 07/11/2026');
    expect(texto(f)).not.toContain('Comprovante de pagamento');
    expect(texto(f)).toContain('E mais 1.');
    expect(req).not.toBeNull();
  });

  it('pede só os pedidos ainda sem envio', () => {
    const fixture = TestBed.createComponent(EscritorioProdutor);
    fixture.detectChanges();
    httpMock.expectOne('/convites').flush([]);
    httpMock.expectOne((r) => r.url === '/vinculos').flush([vinculo('ATIVO')]);
    const req = httpMock.expectOne((r) => r.url === '/pendencias');
    expect(req.request.params.getAll('status')).toEqual(['PENDENTE']);
    req.flush([]);
    fixture.detectChanges();
    expect(texto(fixture)).toContain('Nenhum pedido de documento esperando você');
  });

  it('sem escritório e sem convite, explica como funciona', () => {
    const f = abrir([], []);
    expect(texto(f)).toContain('Nenhum escritório atende você agora');
    expect(texto(f)).toContain('convite para o e-mail desta conta');
  });

  /** Regra da #107: falha não pode virar "nenhum escritório atende você". */
  it('se /vinculos falha, diz que não carregou, em vez de afirmar que não há escritório', () => {
    const fixture = TestBed.createComponent(EscritorioProdutor);
    fixture.detectChanges();
    httpMock.expectOne('/convites').flush([]);
    httpMock
      .expectOne((r) => r.url === '/vinculos')
      .flush(null, { status: 500, statusText: 'erro' });
    fixture.detectChanges();

    expect(texto(fixture)).toContain('Não foi possível carregar');
    expect(texto(fixture)).not.toContain('Nenhum escritório atende você agora');
  });

  /** Achados do review: falha não vira "nenhum pedido" nem "nenhum escritório" (#107). */
  describe('erro não vira estado vazio', () => {
    it('se /pendencias falha, a seção diz que não carregou', () => {
      const fixture = TestBed.createComponent(EscritorioProdutor);
      fixture.detectChanges();
      httpMock.expectOne('/convites').flush([]);
      httpMock.expectOne((r) => r.url === '/vinculos').flush([vinculo('ATIVO')]);
      httpMock
        .expectOne((r) => r.url === '/pendencias')
        .flush(null, { status: 500, statusText: 'erro' });
      fixture.detectChanges();

      expect(texto(fixture)).toContain('Não foi possível carregar os pedidos');
      expect(texto(fixture)).not.toContain('Nenhum pedido de documento');
    });

    it('se /convites falha, não afirma que não há escritório nem convite', () => {
      const fixture = TestBed.createComponent(EscritorioProdutor);
      fixture.detectChanges();
      httpMock.expectOne('/convites').flush(null, { status: 500, statusText: 'erro' });
      httpMock.expectOne((r) => r.url === '/vinculos').flush([]);
      fixture.detectChanges();

      expect(texto(fixture)).toContain('Não foi possível carregar os convites');
      expect(texto(fixture)).not.toContain('Nenhum escritório atende você agora');
    });

    it('tentar de novo depois de erro volta ao carregamento, não ao vazio', () => {
      const fixture = TestBed.createComponent(EscritorioProdutor);
      fixture.detectChanges();
      httpMock.expectOne('/convites').flush([]);
      httpMock
        .expectOne((r) => r.url === '/vinculos')
        .flush(null, { status: 500, statusText: 'erro' });
      fixture.detectChanges();

      fixture.componentInstance.carregar();
      fixture.detectChanges();
      expect(fixture.componentInstance.carregou()).toBe(false);
      expect(texto(fixture)).not.toContain('Nenhum escritório atende você agora');

      httpMock.expectOne('/convites').flush([]);
      httpMock.expectOne((r) => r.url === '/vinculos').flush([]);
    });
  });

  it('aceitar chama a rota e recarrega convites e vinculos', () => {
    const f = abrir([convite], []);
    f.componentInstance.responder(f.componentInstance.convites()[0]!, 'aceitar');
    const req = httpMock.expectOne('/convites/c1/aceitar');
    expect(req.request.method).toBe('POST');
    req.flush({ ...convite, situacao: 'ACEITO' });
    httpMock.match('/convites').forEach((r) => r.flush([]));
    httpMock.expectOne((r) => r.url === '/vinculos').flush([vinculo('ATIVO')]);
    httpMock.match((r) => r.url === '/pendencias').forEach((r) => r.flush([]));
    httpMock.match((r) => r.url === '/alertas').forEach((r) => r.flush([]));
    f.detectChanges();

    expect(texto(f)).toContain('Encerrar vínculo');
  });

  it('recusar chama a rota de recusa', () => {
    const f = abrir([convite], []);
    f.componentInstance.responder(f.componentInstance.convites()[0]!, 'recusar');
    httpMock.expectOne('/convites/c1/recusar').flush({ ...convite, situacao: 'RECUSADO' });
    httpMock.match('/convites').forEach((r) => r.flush([]));
    httpMock.expectOne((r) => r.url === '/vinculos').flush([]);
    httpMock.match((r) => r.url === '/alertas').forEach((r) => r.flush([]));
  });

  /** Sem o aviso, a tela seguinte só dizia "nenhum escritório atende você", sem contar o que houve. */
  it('encerrar pede confirmação, chama a rota e conta na tela o que aconteceu', () => {
    const f = abrir([], [vinculo('ATIVO')]);
    const cmp = f.componentInstance;

    cmp.encerrando.set(cmp.vinculos()[0]!);
    cmp.encerrar();
    const req = httpMock.expectOne('/vinculos/v1/encerrar');
    expect(req.request.method).toBe('POST');
    req.flush(null);
    httpMock.expectOne('/convites').flush([]);
    httpMock.expectOne((r) => r.url === '/vinculos').flush([]);
    f.detectChanges();

    expect(texto(f)).toContain('Você encerrou o vínculo com Contabilidade Campo Bom');
    expect(texto(f)).toContain('peça um convite novo');
  });

  /** Histórico (#166, backend#353): a aba pede os encerrados também. */
  describe('histórico de vínculos', () => {
    const encerrado = {
      ...vinculo('ENCERRADO'),
      id: 'v0',
      escritorio: 'Escritório Antigo',
      inicio: '2025-01-10T10:00:00-03:00',
      fim: '2026-03-20T10:00:00-03:00',
    };

    it('pede ATIVO, SUSPENSO e ENCERRADO, com o parâmetro repetido', () => {
      const fixture = TestBed.createComponent(EscritorioProdutor);
      fixture.detectChanges();
      httpMock.expectOne('/convites').flush([]);
      const req = httpMock.expectOne((r) => r.url === '/vinculos');
      expect(req.request.params.getAll('situacao')).toEqual(['ATIVO', 'SUSPENSO', 'ENCERRADO']);
      req.flush([]);
    });

    it('lista quem já atendeu com o período; sem registro, não afirma quem encerrou', () => {
      const f = abrir([], [vinculo('ATIVO'), { ...encerrado, encerradoPor: null }]);

      expect(texto(f)).toContain('Escritórios que já atenderam você');
      expect(texto(f)).toContain('Escritório Antigo');
      expect(texto(f)).toContain('de 10/01/2025 a 20/03/2026');
      // `null` é "não registrado" (backend#402): a tela não afirma que foi você.
      expect(texto(f)).toContain('Encerramento não registrado');
      expect(texto(f)).not.toContain('Encerrado por você');
      expect(texto(f)).not.toContain('Você encerrou');
      // O encerrado não vira cartão de quem atende agora.
      expect(f.componentInstance.vinculosAtuais().map((v) => v.id)).toEqual(['v1']);
    });

    it('diz quem encerrou e mostra o motivo, quando o backend registrou (#173)', () => {
      const f = abrir(
        [],
        [
          {
            ...encerrado,
            encerradoPor: 'ESCRITORIO',
            motivoEncerramento: 'Fim do contrato de prestação de serviços',
          },
          { ...encerrado, id: 'v2', escritorio: 'Outro Escritório', encerradoPor: 'PRODUTOR' },
        ],
      );

      expect(texto(f)).toContain('Encerrado pelo escritório');
      expect(texto(f)).toContain('Fim do contrato de prestação de serviços');
      expect(texto(f)).toContain('Encerrado por você');
    });

    it('quem encerrou com valor novo do backend fica neutro, não "não registrado"', () => {
      const cmp = abrir([], []).componentInstance;
      expect(cmp.quemEncerrou({ ...encerrado, encerradoPor: 'SISTEMA' } as VinculoDoProdutor)).toBe(
        'Encerrado',
      );
      expect(cmp.quemEncerrou({ ...encerrado, encerradoPor: undefined } as VinculoDoProdutor)).toBe(
        'Encerramento não registrado',
      );
    });

    it('encerrar manda o motivo, quando há; em branco, vai sem corpo', () => {
      const cmp = abrir([], [vinculo('ATIVO')]).componentInstance;

      cmp.pedirEncerramento(cmp.vinculos()[0]!);
      cmp.motivo.set('  Mudei de escritório  ');
      cmp.encerrar();
      const comMotivo = httpMock.expectOne('/vinculos/v1/encerrar');
      expect(comMotivo.request.body).toEqual({ motivo: 'Mudei de escritório' });
      comMotivo.flush(null);
      httpMock.expectOne('/convites').flush([]);
      httpMock.expectOne((r) => r.url === '/vinculos').flush([vinculo('ATIVO')]);
      httpMock.match((r) => r.url === '/pendencias').forEach((r) => r.flush([]));

      cmp.pedirEncerramento(cmp.vinculos()[0]!);
      expect(cmp.motivo()).toBe('');
      cmp.motivo.set('   ');
      cmp.encerrar();
      const semMotivo = httpMock.expectOne('/vinculos/v1/encerrar');
      expect(semMotivo.request.body).toBeNull();
      semMotivo.flush(null);
      httpMock.expectOne('/convites').flush([]);
      httpMock.expectOne((r) => r.url === '/vinculos').flush([]);
    });

    it('só com histórico, ainda explica que nenhum escritório atende agora', () => {
      const f = abrir([], [encerrado]);

      expect(texto(f)).toContain('Nenhum escritório atende você agora');
      expect(texto(f)).toContain('Escritório Antigo');
      httpMock.expectNone((r) => r.url === '/pendencias');
    });
  });
});
