import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import {
  DOMINIO_BASE,
  HOST_ATUAL,
  LOCALIZACAO_ATUAL,
  type LocalizacaoAtual,
} from '@core/utils/host-escritorio';
import { EscritorioDoHostService } from './escritorio-do-host.service';

const PROD = 'agroconia.com.br';
const URL_PUBLICA = '/publico/escritorios/ruraloeste';

/** O escritório do endereço (#175, PR B), resolvido antes de o app montar. */
describe('EscritorioDoHostService', () => {
  let httpMock: HttpTestingController;
  let substituir: ReturnType<typeof vi.fn<(url: string) => void>>;

  function montar(host: string) {
    substituir = vi.fn<(url: string) => void>();
    const localizacao: LocalizacaoAtual = {
      protocolo: 'https:',
      porta: '',
      caminho: '/contador',
      busca: '?x=1',
      fragmento: '#y',
      substituir,
    };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: HOST_ATUAL, useValue: host },
        { provide: DOMINIO_BASE, useValue: PROD },
        { provide: LOCALIZACAO_ATUAL, useValue: localizacao },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    return TestBed.inject(EscritorioDoHostService);
  }

  const robots = () =>
    document.head.querySelector<HTMLMetaElement>('meta[name="robots"]')?.content ?? null;

  afterEach(() => {
    httpMock.verify();
    document.head.querySelector('meta[name="robots"]')?.remove();
  });

  it('começa no modo principal', () => {
    const svc = montar(`ruraloeste.${PROD}`);
    expect(svc.modo()).toBe('principal');
    expect(svc.escritorio()).toBeNull();
    expect(svc.rotulo()).toBe('ruraloeste');
  });

  it('no host principal termina sem nenhuma requisição', async () => {
    const svc = montar(`www.${PROD}`);
    await svc.resolver();
    httpMock.expectNone(() => true);
    expect(svc.modo()).toBe('principal');
    expect(robots()).toBeNull();
  });

  it('200: modo escritório, com o nome, noindex e título', async () => {
    const svc = montar(`ruraloeste.${PROD}`);
    const promessa = svc.resolver();
    const req = httpMock.expectOne(URL_PUBLICA);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({ slug: 'ruraloeste', nome: 'Contabilidade Rural Oeste', slugAtual: null });
    await promessa;

    expect(svc.modo()).toBe('escritorio');
    expect(svc.escritorio()).toEqual({ slug: 'ruraloeste', nome: 'Contabilidade Rural Oeste' });
    expect(robots()).toBe('noindex');
    expect(document.title).toBe('Contabilidade Rural Oeste | AgroConIA');
  });

  it('200 com slugAtual: troca de host mantendo caminho, busca e fragmento, sem resolver', async () => {
    const svc = montar(`ruraloeste.${PROD}`);
    let resolveu = false;
    void svc.resolver().then(() => (resolveu = true));
    httpMock.expectOne(URL_PUBLICA).flush({ slug: 'ruraloeste', nome: 'X', slugAtual: 'novo' });
    await new Promise((r) => setTimeout(r, 0));

    expect(substituir).toHaveBeenCalledWith(`https://novo.${PROD}/contador?x=1#y`);
    expect(resolveu).toBe(false);
  });

  it.each(['evil.com/x', 'a--b', 'ruraloeste', '12345'])(
    'slugAtual inválido (%s) não redireciona: indisponível',
    async (slugAtual) => {
      const svc = montar(`ruraloeste.${PROD}`);
      const promessa = svc.resolver();
      httpMock.expectOne(URL_PUBLICA).flush({ slug: 'ruraloeste', nome: 'X', slugAtual });
      await promessa;
      expect(substituir).not.toHaveBeenCalled();
      expect(svc.modo()).toBe('indisponivel');
    },
  );

  it('404 ENDERECO_NAO_ENCONTRADO: não encontrado, com noindex', async () => {
    const svc = montar(`naoexiste.${PROD}`);
    const promessa = svc.resolver();
    httpMock
      .expectOne('/publico/escritorios/naoexiste')
      .flush(
        { errors: [{ code: 'ENDERECO_NAO_ENCONTRADO', message: 'x' }] },
        { status: 404, statusText: 'Not Found' },
      );
    await promessa;
    expect(svc.modo()).toBe('nao-encontrado');
    expect(robots()).toBe('noindex');
  });

  it.each([null, { errors: [{ code: 'OUTRO' }] }])(
    '404 sem o código (%j) é indisponível, não "não encontrado"',
    async (corpo) => {
      const svc = montar(`ruraloeste.${PROD}`);
      const promessa = svc.resolver();
      httpMock.expectOne(URL_PUBLICA).flush(corpo, { status: 404, statusText: 'Not Found' });
      await promessa;
      expect(svc.modo()).toBe('indisponivel');
    },
  );

  it.each([500, 503])('%i: indisponível, com noindex', async (status) => {
    const svc = montar(`ruraloeste.${PROD}`);
    const promessa = svc.resolver();
    httpMock.expectOne(URL_PUBLICA).flush('x', { status, statusText: 'erro' });
    await promessa;
    expect(svc.modo()).toBe('indisponivel');
    expect(robots()).toBe('noindex');
  });

  it('429: indisponível, com o Retry-After guardado', async () => {
    const svc = montar(`ruraloeste.${PROD}`);
    const promessa = svc.resolver();
    httpMock
      .expectOne(URL_PUBLICA)
      .flush('x', { status: 429, statusText: 'Too Many', headers: { 'Retry-After': '30' } });
    await promessa;
    expect(svc.modo()).toBe('indisponivel');
    expect(svc.esperarSegundos()).toBe(30);
  });

  it('erro de rede: indisponível, e a promessa não rejeita', async () => {
    const svc = montar(`ruraloeste.${PROD}`);
    const promessa = svc.resolver();
    httpMock.expectOne(URL_PUBLICA).error(new ProgressEvent('error'));
    await expect(promessa).resolves.toBeUndefined();
    expect(svc.modo()).toBe('indisponivel');
  });

  it.each([
    ['corpo vazio', null],
    ['sem nome', { slug: 'ruraloeste', slugAtual: null }],
    ['slugAtual de outro tipo', { slug: 'ruraloeste', nome: 'X', slugAtual: 123 }],
  ])('200 fora do contrato (%s): indisponível, sem rejeitar', async (_caso, corpo) => {
    const svc = montar(`ruraloeste.${PROD}`);
    const promessa = svc.resolver();
    httpMock.expectOne(URL_PUBLICA).flush(corpo);
    await expect(promessa).resolves.toBeUndefined();
    expect(svc.modo()).toBe('indisponivel');
    expect(substituir).not.toHaveBeenCalled();
  });

  it('8 s sem resposta: indisponível', async () => {
    vi.useFakeTimers();
    try {
      const svc = montar(`ruraloeste.${PROD}`);
      const promessa = svc.resolver();
      const req = httpMock.expectOne(URL_PUBLICA);
      await vi.advanceTimersByTimeAsync(8000);
      expect(req.cancelled).toBe(true);
      await promessa;
      expect(svc.modo()).toBe('indisponivel');
    } finally {
      vi.useRealTimers();
    }
  });
});
