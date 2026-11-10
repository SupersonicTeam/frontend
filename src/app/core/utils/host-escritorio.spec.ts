import { TestBed } from '@angular/core/testing';
import { environment as ambienteDev } from '@env/environment';
import { environment as ambienteProd } from '@env/environment.prod';
import {
  DOMINIO_BASE,
  ENDERECO_PROPRIO_NO_AR,
  HOST_ATUAL,
  LOCALIZACAO_ATUAL,
  ehHostDeEscritorio,
  hostPrincipal,
  rotuloDeEscritorio,
  urlDoHost,
} from './host-escritorio';

const PROD = 'agroconia.com.br';

/**
 * A regra do host (#175), a mesma do backend (backend#464). Os casos de produção usam o domínio
 * real; os de dev, `localhost`.
 */
describe('host-escritorio — a regra do host', () => {
  it('um rótulo antes da base, diferente de www, é escritório', () => {
    expect(rotuloDeEscritorio(`ruraloeste.${PROD}`, PROD)).toBe('ruraloeste');
    expect(rotuloDeEscritorio('ruraloeste.localhost', 'localhost')).toBe('ruraloeste');
    expect(ehHostDeEscritorio(`ruraloeste.${PROD}`, PROD)).toBe(true);
  });

  it('minúsculas e sem o ponto final, como o backend', () => {
    expect(rotuloDeEscritorio(`RuralOeste.${PROD.toUpperCase()}.`, PROD)).toBe('ruraloeste');
  });

  it('a base, www, mais de um rótulo e qualquer outro host são o principal', () => {
    for (const host of [
      PROD,
      `www.${PROD}`,
      `a.b.${PROD}`,
      'localhost',
      '127.0.0.1',
      '[::1]',
      'agrocontabil.167-126-45-181.sslip.io',
      `ruraloeste.${PROD}.exemplo.com`,
      `x${PROD}`,
    ]) {
      expect(rotuloDeEscritorio(host, PROD), host).toBeNull();
    }
    expect(ehHostDeEscritorio('localhost', 'localhost')).toBe(false);
    expect(rotuloDeEscritorio('www.localhost', 'localhost')).toBeNull();
  });

  it('não valida o formato do rótulo: o backend responde 404 a qualquer valor estranho', () => {
    expect(rotuloDeEscritorio(`--nao-existe--.${PROD}`, PROD)).toBe('--nao-existe--');
  });

  it('o principal é www em produção e a própria base em dev', () => {
    expect(hostPrincipal(PROD)).toBe(`www.${PROD}`);
    expect(hostPrincipal('localhost')).toBe('localhost');
  });

  it('urlDoHost só aceita rótulo DNS: o resto vira o principal, nunca outro host', () => {
    for (const rotulo of ['evil.com#', 'evil.com/x?', 'a@b', '', '-x', 'x'.repeat(64)]) {
      expect(urlDoHost(rotulo, PROD, { protocolo: 'https:' }), rotulo).toBe(`https://www.${PROD}`);
    }
    expect(urlDoHost('Rural-Oeste2', PROD, { protocolo: 'https:' })).toBe(
      `https://rural-oeste2.${PROD}`,
    );
  });

  it('urlDoHost monta a URL com o protocolo e a porta de agora, sem barra no fim', () => {
    expect(urlDoHost('ruraloeste', PROD, { protocolo: 'https:', porta: '' })).toBe(
      `https://ruraloeste.${PROD}`,
    );
    expect(urlDoHost(null, PROD, { protocolo: 'https:' })).toBe(`https://www.${PROD}`);
    expect(urlDoHost('ruraloeste', 'localhost', { protocolo: 'http:', porta: '4200' })).toBe(
      'http://ruraloeste.localhost:4200',
    );
    expect(urlDoHost(null, 'localhost', { protocolo: 'http:', porta: '4200' })).toBe(
      'http://localhost:4200',
    );
  });
});

/**
 * O build de produção usa o `environment.prod.ts` (#175). Sem o `fileReplacements` no
 * `angular.json`, a produção receberia `localhost` e o modo escritório ficaria morto no ar; quem
 * pega isso no build é o `scripts/conferir-build-producao.mjs`, e aqui fica o valor de cada arquivo.
 */
describe('host-escritorio — os environments', () => {
  it('dev: base localhost e o endereço próprio ligado', () => {
    expect(ambienteDev.dominioBase).toBe('localhost');
    expect(ambienteDev.enderecoProprioNoAr).toBe(true);
  });

  it('produção: a base real e o endereço próprio desligado até o DNS', () => {
    expect(ambienteProd.dominioBase).toBe(PROD);
    expect(ambienteProd.enderecoProprioNoAr).toBe(false);
  });
});

describe('host-escritorio — os tokens', () => {
  // Um teste mexe no endereço do jsdom; ele volta para `/` mesmo se uma asserção falhar no meio.
  afterEach(() => history.replaceState(null, '', '/'));

  it('por padrão leem a página e o environment (o de dev, nos specs)', () => {
    TestBed.configureTestingModule({});
    expect(TestBed.inject(HOST_ATUAL)).toBe(document.location.hostname);
    expect(TestBed.inject(DOMINIO_BASE)).toBe('localhost');
    expect(TestBed.inject(ENDERECO_PROPRIO_NO_AR)).toBe(true);

    const local = TestBed.inject(LOCALIZACAO_ATUAL);
    expect(local.protocolo).toBe(document.location.protocol);
    expect(local.caminho).toBe(document.location.pathname);
  });

  it('a localização lê o endereço de agora, não o da criação do token', () => {
    TestBed.configureTestingModule({});
    const local = TestBed.inject(LOCALIZACAO_ATUAL);
    history.replaceState(null, '', '/login?returnUrl=%2Fequipe#x');
    expect(local.caminho).toBe('/login');
    expect(local.busca).toBe('?returnUrl=%2Fequipe');
    expect(local.fragmento).toBe('#x');
  });

  it('os specs trocam qualquer um por um falso', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: HOST_ATUAL, useValue: `ruraloeste.${PROD}` },
        { provide: DOMINIO_BASE, useValue: PROD },
        { provide: ENDERECO_PROPRIO_NO_AR, useValue: false },
      ],
    });
    expect(rotuloDeEscritorio(TestBed.inject(HOST_ATUAL), TestBed.inject(DOMINIO_BASE))).toBe(
      'ruraloeste',
    );
    expect(TestBed.inject(ENDERECO_PROPRIO_NO_AR)).toBe(false);
  });
});
