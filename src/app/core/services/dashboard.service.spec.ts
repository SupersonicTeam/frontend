import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import {
  DashboardService,
  buildNotaFiscalXml,
  validarNotaFiscal,
} from './dashboard.service';
import { ApiErrorEnvelope, NotaFiscal } from '../models/types';

function nota(over: Partial<NotaFiscal> = {}): NotaFiscal {
  return {
    id: 'n1',
    produtorId: 'p1',
    chaveAcesso: '35260612345678000190550010000001231000000017',
    tipo: 'saida',
    numero: '123',
    valorTotal: 100,
    itens: [
      {
        id: 'i1',
        numeroItem: 1,
        descricao: 'Soja em grão',
        cfop: '5102',
        unidade: 'KG',
        quantidade: 10,
        valorUnitario: 10,
        valorTotal: 100,
      },
    ],
    ...over,
  };
}

describe('validarNotaFiscal', () => {
  it('não acusa erro para nota consistente', () => {
    expect(validarNotaFiscal(nota())).toEqual([]);
  });

  it('acusa CFOP_AUSENTE quando um item não tem CFOP', () => {
    const n = nota({ itens: [{ ...nota().itens[0], cfop: undefined }] });
    const erros = validarNotaFiscal(n);
    expect(erros).toHaveLength(1);
    expect(erros[0].code).toBe('CFOP_AUSENTE');
    expect(erros[0].field).toBe('itens[0].cfop');
  });

  it('acusa TOTAL_DIVERGENTE quando o total não bate com a soma dos itens', () => {
    const erros = validarNotaFiscal(nota({ valorTotal: 150 }));
    expect(erros.map(e => e.code)).toContain('TOTAL_DIVERGENTE');
    const div = erros.find(e => e.code === 'TOTAL_DIVERGENTE')!;
    expect(div.rejectedValue).toBe('150.00');
    expect(div.expectedValue).toBe('100.00');
  });
});

describe('buildNotaFiscalXml', () => {
  it('inclui chave de acesso, item e total da nota', () => {
    const xml = buildNotaFiscalXml(nota());
    expect(xml).toContain('<?xml');
    expect(xml).toContain(nota().chaveAcesso);
    expect(xml).toContain('Soja em grão');
    expect(xml).toContain('<vNF>100.00</vNF>');
  });

  it('escapa caracteres especiais (& < >) na descrição', () => {
    const xml = buildNotaFiscalXml(
      nota({ itens: [{ ...nota().itens[0], descricao: 'Milho & Trigo <safra>' }] }),
    );
    expect(xml).toContain('Milho &amp; Trigo &lt;safra&gt;');
  });
});

describe('DashboardService.gerarXmlNota', () => {
  let service: DashboardService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [DashboardService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(DashboardService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  // App é zoneless → sem fakeAsync/tick; o mock tem delay de 400ms (timer real).
  const esperarMock = () => new Promise(resolve => setTimeout(resolve, 450));

  it('com backend indisponível, cai no mock e gera o XML de uma nota válida', async () => {
    let xml: string | undefined;
    service.gerarXmlNota(nota()).subscribe(res => (xml = res));

    httpMock.expectOne('/notas/n1/gerar-xml').error(new ProgressEvent('error'), { status: 0 });
    await esperarMock();

    expect(xml).toContain('<NFe');
    expect(xml).toContain(nota().chaveAcesso);
  });

  it('com nota inconsistente, o mock lança o envelope 422 com os erros fiscais', async () => {
    const n = nota({ itens: [{ ...nota().itens[0], cfop: undefined }] });
    let env: ApiErrorEnvelope | undefined;
    service.gerarXmlNota(n).subscribe({ error: (e: ApiErrorEnvelope) => (env = e) });

    httpMock.expectOne('/notas/n1/gerar-xml').error(new ProgressEvent('error'), { status: 0 });
    await esperarMock();

    expect(env?.status).toBe(422);
    expect(env?.errors[0].code).toBe('CFOP_AUSENTE');
  });
});
