import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ContadorPage } from './contador';
import type { GuiaFiscal } from '@models/solicitacao-contador.model';

/**
 * Cobertura da tela do contador **depois** da #50.
 *
 * O spec anterior exercitava solicitações, anexos e checklist — funcionalidades que
 * saíram da tela porque o backend não as tem (`/contador/pendencias` responde 404) e
 * só existiam à custa de dados de exemplo. Estes testes cobrem o que sobrou, que é
 * real: guias fiscais e as notas que exigem correção.
 */
describe('ContadorPage (#50)', () => {
  let httpMock: HttpTestingController;

  const guia = (over: Partial<GuiaFiscal> = {}): GuiaFiscal => ({
    id: 'g1',
    produtorId: 'p1',
    tipoGuia: 'ICMS',
    dataVencimento: '2026-09-20',
    valor: 1250.5,
    status: 'pendente',
    createdAt: '2026-09-01T10:00:00Z',
    ...over,
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ContadorPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  /** Drena as três leituras do ngOnInit: guias, dashboard e notas. */
  function flushInit(guias: GuiaFiscal[] = [], notas: unknown[] = []) {
    httpMock.match(r => r.url === '/contador/guias').forEach(r => r.flush(guias));
    httpMock.match(r => r.url === '/dashboard').forEach(r => r.flush({}, { status: 500, statusText: 'x' }));
    httpMock
      .match(r => r.url === '/notas')
      .forEach(r => r.flush({ content: notas, totalElements: notas.length }));
  }

  it('não busca mais /contador/pendencias — o endpoint não existe no backend', () => {
    const fixture = TestBed.createComponent(ContadorPage);
    fixture.detectChanges();
    flushInit();

    expect(httpMock.match(r => r.url === '/contador/pendencias').length).toBe(0);
  });

  it('soma o total a pagar apenas das guias em aberto, ignorando as pagas', () => {
    const fixture = TestBed.createComponent(ContadorPage);
    fixture.detectChanges();
    flushInit([
      guia({ id: 'a', valor: 1000, status: 'pendente' }),
      guia({ id: 'b', valor: 500, status: 'vencido' }),
      guia({ id: 'c', valor: 9999, status: 'pago' }),
    ]);

    const cmp = fixture.componentInstance;
    expect(cmp.totalAPagar()).toBe(1500);
    expect(cmp.guiasPendentes().length).toBe(2);
    expect(cmp.guiasVencidas().length).toBe(1);
  });

  it('em erro ao listar guias, mostra lista vazia — nunca dados de exemplo', () => {
    const fixture = TestBed.createComponent(ContadorPage);
    fixture.detectChanges();
    httpMock
      .expectOne(r => r.url === '/contador/guias')
      .flush('erro', { status: 500, statusText: 'Server Error' });
    flushInit();

    expect(fixture.componentInstance.guias()).toEqual([]);
    expect(fixture.componentInstance.carregandoGuias()).toBe(false);
  });

  it('separa as notas que exigem correção das demais', () => {
    const fixture = TestBed.createComponent(ContadorPage);
    fixture.detectChanges();
    flushInit(
      [],
      [
        { id: 'n1', numero: 1, status: 'AUTORIZADA', destinatarioNome: 'A' },
        { id: 'n2', numero: 2, status: 'COM_INCONSISTENCIAS', destinatarioNome: 'B' },
        { id: 'n3', numero: 3, status: 'REJEITADA', destinatarioNome: 'C' },
      ],
    );

    expect(fixture.componentInstance.notasComProblema().map(n => n.numero)).toEqual([2, 3]);
  });

  it('o formulário de guia só habilita com vencimento e valor positivo', () => {
    const fixture = TestBed.createComponent(ContadorPage);
    fixture.detectChanges();
    flushInit();
    const cmp = fixture.componentInstance;

    expect(cmp.formValido()).toBe(false);

    cmp.formVencimento.set('2026-10-20');
    expect(cmp.formValido()).toBe(false);

    cmp.formValor.set('0');
    expect(cmp.formValido()).toBe(false);

    cmp.formValor.set('820.35');
    expect(cmp.formValido()).toBe(true);
  });

  it('dar baixa chama PATCH e recarrega a lista', () => {
    const fixture = TestBed.createComponent(ContadorPage);
    fixture.detectChanges();
    flushInit([guia({ id: 'g9' })]);

    fixture.componentInstance.marcarPaga(guia({ id: 'g9' }));

    const patch = httpMock.expectOne(r => r.url === '/contador/guias/g9/pagar');
    expect(patch.request.method).toBe('PATCH');
    patch.flush({});

    httpMock.expectOne(r => r.url === '/contador/guias').flush([guia({ id: 'g9', status: 'pago' })]);
    expect(fixture.componentInstance.guiasPendentes().length).toBe(0);
  });

  it('traduz o status da guia para linguagem de quem lê, não a do banco', () => {
    const fixture = TestBed.createComponent(ContadorPage);
    fixture.detectChanges();
    flushInit();
    const cmp = fixture.componentInstance;

    expect(cmp.rotuloStatusGuia('pendente')).toBe('Em aberto');
    expect(cmp.rotuloStatusGuia('pago')).toBe('Paga');
    expect(cmp.rotuloStatusGuia('vencido')).toBe('Vencida');
  });
});
