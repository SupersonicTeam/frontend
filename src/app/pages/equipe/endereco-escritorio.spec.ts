import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { ToastService } from '@core/services/toast.service';
import { EncerramentoService } from '@core/services/encerramento.service';
import { EscritorioDoHostService } from '@core/services/escritorio-do-host.service';
import {
  DOMINIO_BASE,
  ENDERECO_PROPRIO_NO_AR,
  LOCALIZACAO_ATUAL,
  type LocalizacaoAtual,
} from '@core/utils/host-escritorio';
import type { Escritorio } from '@services/escritorio/data-access/escritorio.service';
import { erroDoFormatoDoSlug } from '@core/utils/endereco';
import { EnderecoEscritorio } from './endereco-escritorio';

const PROD = 'agroconia.com.br';

const escritorio = (over: Partial<Escritorio> = {}): Escritorio => ({
  id: 'e1',
  nome: 'Contabilidade Rural Oeste',
  cnpj: '48315276000195',
  minhaFuncao: 'ADMINISTRADOR',
  membros: 3,
  slug: null,
  enderecoHost: null,
  enderecoAlteravelEm: null,
  ...over,
});

const localizacao: LocalizacaoAtual = {
  protocolo: 'https:',
  porta: '',
  caminho: '/equipe',
  busca: '',
  fragmento: '',
  substituir: () => undefined,
};

/** O endereço próprio do escritório na aba Equipe (#175, PR D). */
describe('EnderecoEscritorio', () => {
  let httpMock: HttpTestingController;

  function montar(e: Escritorio, noAr = true) {
    TestBed.configureTestingModule({
      imports: [EnderecoEscritorio],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ENDERECO_PROPRIO_NO_AR, useValue: noAr },
        { provide: DOMINIO_BASE, useValue: PROD },
        { provide: LOCALIZACAO_ATUAL, useValue: localizacao },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(EnderecoEscritorio);
    fixture.componentRef.setInput('escritorio', e);
    fixture.detectChanges();
    const emitidos: Escritorio[] = [];
    fixture.componentInstance.mudou.subscribe((x) => emitidos.push(x));
    return { fixture, cmp: fixture.componentInstance, emitidos };
  }

  const texto = (f: { nativeElement: unknown }) =>
    ((f.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');

  afterEach(() => httpMock.verify());

  it('com o endereço fora do ar, a seção nem aparece', () => {
    const { fixture } = montar(escritorio({ slug: 'ruraloeste' }), false);
    expect(texto(fixture)).not.toContain('Endereço do escritório');
  });

  it('todo membro vê o endereço como link, montado a partir do slug', () => {
    const { fixture } = montar(
      escritorio({
        minhaFuncao: 'ASSISTENTE',
        slug: 'ruraloeste',
        // O host do contrato não é usado: o link sai do slug.
        enderecoHost: 'outro-host.example.com',
      }),
    );
    const link = (fixture.nativeElement as HTMLElement).querySelector('a');
    expect(link?.getAttribute('href')).toBe(`https://ruraloeste.${PROD}`);
    expect(link?.textContent?.trim()).toBe(`ruraloeste.${PROD}`);
    expect((fixture.nativeElement as HTMLElement).querySelector('input')).toBeNull();
  });

  it('administrador sem CNPJ não tem campo, e lê por quê', () => {
    const { fixture } = montar(escritorio({ cnpj: null }));
    expect(texto(fixture)).toContain('Cadastre o CNPJ do escritório para ter um endereço próprio.');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('input#slug-escritorio'),
    ).toBeNull();
  });

  it('o formato é conferido antes do envio, sem copiar a lista de reservados', () => {
    expect(erroDoFormatoDoSlug('ab')).toContain('3 a 32');
    expect(erroDoFormatoDoSlug('a'.repeat(33))).toContain('3 a 32');
    expect(erroDoFormatoDoSlug('12345')).toContain('letra');
    expect(erroDoFormatoDoSlug('rural--oeste')).toContain('dois hífens');
    expect(erroDoFormatoDoSlug('-rural')).toContain('hífen');
    expect(erroDoFormatoDoSlug('rural_oeste')).toContain('letras minúsculas');
    expect(erroDoFormatoDoSlug('ruraloeste')).toBeNull();
    // Reservado passa aqui: quem recusa é o servidor (409 SLUG_INDISPONIVEL).
    expect(erroDoFormatoDoSlug('suporte')).toBeNull();
  });

  it('normaliza ao digitar, mostra a prévia e só salva com a ciência marcada', () => {
    const { fixture, cmp } = montar(escritorio());
    cmp.digitar('  RuralOeste ');
    fixture.detectChanges();

    expect(cmp.valor()).toBe('ruraloeste');
    expect(texto(fixture)).toContain(`O endereço vai ser https://ruraloeste.${PROD}`);
    expect(cmp.podeSalvar()).toBe(false);

    cmp.ciente.set(true);
    expect(cmp.podeSalvar()).toBe(true);

    // Mudou o valor: a ciência desmarca.
    cmp.digitar('ruraloeste2');
    expect(cmp.ciente()).toBe(false);
    expect(cmp.podeSalvar()).toBe(false);
  });

  it('o mesmo endereço de agora não se salva de novo', () => {
    const { cmp } = montar(escritorio({ slug: 'ruraloeste' }));
    expect(cmp.valor()).toBe('ruraloeste');
    cmp.ciente.set(true);
    expect(cmp.podeSalvar()).toBe(false);
  });

  it('salvar manda o PUT e devolve o escritório novo para a tela', () => {
    const { cmp, emitidos } = montar(escritorio());
    cmp.digitar('ruraloeste');
    cmp.ciente.set(true);
    cmp.salvar();

    const req = httpMock.expectOne('/escritorio/endereco');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ slug: 'ruraloeste', cienteExposicaoPublica: true });
    req.flush(escritorio({ slug: 'ruraloeste' }));

    expect(emitidos.map((e) => e.slug)).toEqual(['ruraloeste']);
  });

  function salvarComErro(codigo: string, status: number, extra: Record<string, unknown> = {}) {
    const { fixture, cmp } = montar(escritorio());
    cmp.digitar('ruraloeste');
    cmp.ciente.set(true);
    cmp.salvar();
    httpMock
      .expectOne('/escritorio/endereco')
      .flush(
        { errors: [{ code: codigo, message: 'Mensagem do servidor', ...extra }] },
        { status, statusText: 'x' },
      );
    fixture.detectChanges();
    return { fixture, cmp };
  }

  it('indisponível não diz por quê: reservado, em uso e em carência são a mesma resposta', () => {
    const { cmp } = salvarComErro('SLUG_INDISPONIVEL', 409);
    expect(cmp.erroDoCampo()).toBe('Este endereço não está disponível. Escolha outro.');
  });

  it('troca recente mostra quando libera, em Brasília, com dia e hora', () => {
    const { cmp } = salvarComErro('ENDERECO_TROCA_RECENTE', 409, {
      expectedValue: '2026-12-09T14:30:00Z',
    });
    expect(cmp.erroDoCampo()).toBe('O endereço só pode ser trocado a partir de 09/12/2026, 11:30.');
  });

  it('formato recusado pelo servidor mostra a mensagem dele, sob o campo', () => {
    const { cmp } = salvarComErro('SLUG_INVALIDO', 400);
    expect(cmp.erroDoCampo()).toBe('Mensagem do servidor');
    // Digitar de novo tira o erro do servidor.
    cmp.digitar('outro');
    expect(cmp.erroDoCampo()).toBeNull();
  });

  it('sem CNPJ no servidor (corrida), a frase do CNPJ sob o campo', () => {
    const { cmp } = salvarComErro('ENDERECO_EXIGE_CNPJ', 422);
    expect(cmp.erroDoCampo()).toBe('Cadastre o CNPJ do escritório antes de escolher o endereço.');
  });

  it('403 vai ao toast, não ao campo', () => {
    const { cmp } = montar(escritorio());
    const erro = vi.spyOn(TestBed.inject(ToastService), 'error');
    cmp.digitar('ruraloeste');
    cmp.ciente.set(true);
    cmp.salvar();
    httpMock
      .expectOne('/escritorio/endereco')
      .flush(
        { errors: [{ code: 'ACESSO_NEGADO', message: 'x' }] },
        { status: 403, statusText: 'x' },
      );

    expect(cmp.erroDoCampo()).toBeNull();
    expect(erro).toHaveBeenCalledWith('Só o administrador do escritório faz isso.');
  });

  it('com a troca bloqueada, o campo fica desabilitado e diz a partir de quando', () => {
    const { fixture, cmp } = montar(
      escritorio({ slug: 'ruraloeste', enderecoAlteravelEm: '2026-12-09T14:30:00Z' }),
    );
    const campo = (fixture.nativeElement as HTMLElement).querySelector(
      'input#slug-escritorio',
    ) as HTMLInputElement;
    expect(campo.disabled).toBe(true);
    expect(texto(fixture)).toContain('Nova troca a partir de 09/12/2026, 11:30.');
    expect(cmp.podeSalvar()).toBe(false);
    // Remover continua possível.
    expect(texto(fixture)).toContain('Remover endereço');
  });

  it('remover só sai pelo botão do modal, e pergunta o escritório de novo', () => {
    const { fixture, cmp, emitidos } = montar(escritorio({ slug: 'ruraloeste' }));
    cmp.confirmandoRemocao.set(true);
    fixture.detectChanges();
    expect(document.body.textContent).toContain(`Remover o endereço ruraloeste.${PROD}?`);
    httpMock.expectNone('/escritorio/endereco');

    cmp.remover();
    httpMock.expectOne('/escritorio/endereco').flush(null, { status: 204, statusText: 'x' });
    httpMock
      .expectOne('/escritorio')
      .flush(escritorio({ slug: null, enderecoAlteravelEm: '2026-12-09T14:30:00Z' }));

    expect(emitidos.map((e) => e.slug)).toEqual([null]);
    expect(cmp.confirmandoRemocao()).toBe(false);
  });

  it('sem endereço, não há botão de remover', () => {
    const { fixture } = montar(escritorio());
    expect(texto(fixture)).not.toContain('Remover endereço');
  });

  it('recarregar o escritório sem mudar o endereço não apaga o que foi digitado', () => {
    const { fixture, cmp } = montar(escritorio());
    cmp.digitar('ruraloeste');
    cmp.ciente.set(true);

    // A aba recarrega o escritório por outro motivo (troca de função de um membro).
    fixture.componentRef.setInput('escritorio', escritorio({ membros: 4 }));
    fixture.detectChanges();

    expect(cmp.valor()).toBe('ruraloeste');
    expect(cmp.ciente()).toBe(true);
  });

  it('data de liberação já passada não trava o campo (escritório em cache)', () => {
    const { cmp } = montar(
      escritorio({ slug: 'ruraloeste', enderecoAlteravelEm: '2020-01-01T00:00:00Z' }),
    );
    expect(cmp.bloqueadoAte()).toBeNull();
  });

  it('instante ilegível não derruba a tela', () => {
    const { fixture, cmp } = montar(escritorio({ enderecoAlteravelEm: 'amanhã' }));
    expect(cmp.bloqueadoAte()).toBeNull();
    expect(texto(fixture)).toContain('Endereço do escritório');
  });

  it('recusado pelo servidor, a ciência volta a ser pedida', () => {
    const { cmp } = salvarComErro('SLUG_INDISPONIVEL', 409);
    expect(cmp.ciente()).toBe(false);
    expect(cmp.podeSalvar()).toBe(false);
  });

  it('removido mas sem conseguir reler, a tela deixa de mostrar o endereço antigo', () => {
    const { cmp, emitidos } = montar(escritorio({ slug: 'ruraloeste' }));
    cmp.remover();
    httpMock.expectOne('/escritorio/endereco').flush(null, { status: 204, statusText: 'x' });
    httpMock.expectOne('/escritorio').flush('erro', { status: 500, statusText: 'x' });

    expect(emitidos.map((e) => e.slug)).toEqual([null]);
  });

  it('no próprio subdomínio, remover o endereço encerra a sessão com o aviso (#175)', () => {
    const { cmp } = montar(escritorio({ slug: 'ruraloeste' }));
    const host = TestBed.inject(EscritorioDoHostService);
    host.rotulo.set('ruraloeste');
    host.modo.set('escritorio');
    const encerrar = vi
      .spyOn(TestBed.inject(EncerramentoService), 'encerrar')
      .mockImplementation(() => undefined);

    cmp.remover();
    httpMock.expectOne('/escritorio/endereco').flush(null, { status: 204, statusText: 'x' });
    httpMock.expectOne('/escritorio').flush(escritorio({ slug: null }));

    expect(encerrar).toHaveBeenCalledWith(
      'pedido',
      `Este endereço não é mais o do seu escritório (Contabilidade Rural Oeste). Entre por www.${PROD}.`,
    );
  });

  it('em www, salvar o endereço não encerra nada', () => {
    const { cmp } = montar(escritorio());
    const encerrar = vi.spyOn(TestBed.inject(EncerramentoService), 'encerrar');
    cmp.digitar('ruraloeste');
    cmp.ciente.set(true);
    cmp.salvar();
    httpMock.expectOne('/escritorio/endereco').flush(escritorio({ slug: 'ruraloeste' }));
    expect(encerrar).not.toHaveBeenCalled();
  });
});
