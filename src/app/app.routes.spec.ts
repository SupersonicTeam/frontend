import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom, of, throwError } from 'rxjs';
import { AuthApi } from '@services/auth/data-access/auth.service';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes, visitanteNoPrincipal } from './app.routes';
import {
  EscritorioDoHostService,
  type ModoDoHost,
} from '@core/services/escritorio-do-host.service';
import { SessaoService } from '@core/services/sessao.service';
import { AvisoWwwPage } from '@pages/aviso-www/aviso-www';
import { produtorGuard } from '@core/guards/produtor.guard';
import { contadorGuard } from '@core/guards/contador.guard';

/**
 * **As telas dos dois papéis são separadas.**
 *
 * O contador chegava em `/calendario` e `/tributario` pela própria navegação, e lia textos
 * escritos para o produtor — inclusive "procure o seu escritório de contabilidade", mostrado
 * para o escritório. A correção não é esconder a tela dele: é escrever a versão dele. Onde a rota
 * serve os dois, ela despacha para componentes diferentes; onde a tela só faz sentido para um
 * papel, o guard devolve o outro.
 *
 * Este teste existe para que remover um guard ao mexer nas rotas custe uma reprovação, e não uma
 * descoberta na apresentação.
 */
describe('rotas por papel', () => {
  const filhas = routes.find((r) => r.path === '' && r.children)?.children ?? [];
  const guardsDe = (path: string) => filhas.find((r) => r.path === path)?.canActivate ?? [];

  it.each(['dashboard', 'chat', 'escritorio'])('/%s é do produtor', (path) => {
    expect(guardsDe(path)).toContain(produtorGuard);
  });

  it('/contador é do contador', () => {
    expect(guardsDe('contador')).toContain(contadorGuard);
  });

  /** A equipe do escritório (#157): aba própria do contador, não mais seção de Configurações. */
  it('/equipe é do contador', () => {
    expect(guardsDe('equipe')).toContain(contadorGuard);
  });

  /** Modelos e obrigações (#185): saiu de Configurações para uma aba do menu do contador. */
  it('/catalogo é do contador', () => {
    expect(guardsDe('catalogo')).toContain(contadorGuard);
  });

  it('/documentos é dos dois — e despacha para a tela de cada papel (#136)', () => {
    expect(guardsDe('documentos')).toEqual([]);
  });

  /**
   * `/tributario` e `/calendario` não têm guard **de propósito**: cada uma serve os dois papéis com
   * componentes diferentes (`ImpostosProdutor`/`ImpostosContador`, `PrazosProdutor`/`PrazosContador`),
   * escolhidos pela página de rota. Guardar essas rotas tiraria do contador telas que são dele — foi
   * o erro que esta suíte existe para não deixar repetir, na outra direção.
   */
  it.each(['tributario', 'calendario'])('/%s é dos dois, com uma tela para cada', (path) => {
    expect(guardsDe(path)).toEqual([]);
  });
});

/**
 * Todo `routerLink` do app aponta para uma rota que existe (issue #112).
 *
 * "Ver as minhas notas", em Impostos, apontava para `/notas` -- rota que nunca existiu. O Angular
 * nao avisa: ele cai no `**`, que redirecionava para a raiz, e a pessoa ia parar no painel sem
 * entender por que o link nao levou onde dizia.
 *
 * A lista e escrita a mao de proposito: o teste tem de reprovar quando **o codigo** ganhar um
 * link novo para uma rota inexistente, e um teste que lesse os dois lados do mesmo lugar nao
 * reprovaria nunca.
 */
describe('links do app (#112)', () => {
  /** Todos os `routerLink="/..."` que existem nos templates, em 29/10/2026. */
  const DESTINOS = [
    '/calendario',
    '/catalogo',
    '/chat',
    '/configuracoes',
    '/contador',
    '/dashboard',
    '/documentos',
    '/equipe',
    '/escritorio',
    '/tributario',
  ];

  const caminhos = (routes.find((r) => r.path === '' && r.children)?.children ?? [])
    .map((r) => r.path)
    .filter((p): p is string => typeof p === 'string');

  it('cada destino tem rota', () => {
    for (const destino of DESTINOS) {
      expect(caminhos, destino).toContain(destino.replace('/', ''));
    }
  });

  it('a rota desconhecida mostra uma pagina, nao um redirect mudo', () => {
    const coringa = routes.find((r) => r.path === '**');

    expect(coringa).toBeDefined();
    // `redirectTo: ''` jogava a pessoa no painel sem dizer que o endereco nao existe.
    expect(coringa?.redirectTo).toBeUndefined();
    expect(coringa?.loadComponent).toBeDefined();
  });

  /** O convite de equipe (#148) e publico: quem chega pode nao ter conta nem sessao. */
  it('/equipe/convite fica fora do shell e sem guard', () => {
    const rota = routes.find((r) => r.path === 'equipe/convite');
    expect(rota).toBeTruthy();
    expect(rota?.canActivate ?? []).toEqual([]);
    const doShell = routes.find((r) => r.path === '' && r.children)?.children ?? [];
    expect(doShell.some((r) => r.path === 'equipe/convite')).toBe(false);
  });

  /** A politica de dados (#137) e publica: quem ainda nao tem conta precisa le-la antes. */
  it('/politica-dados fica fora do shell e sem guard', () => {
    const rota = routes.find((r) => r.path === 'politica-dados');
    expect(rota).toBeTruthy();
    expect(rota?.canActivate ?? []).toEqual([]);
  });
});

/** No endereço do escritório (#175), cadastro e convite mostram o aviso de www. */
describe('rotas no modo escritório', () => {
  async function abrir(caminho: string, modo: 'principal' | 'escritorio') {
    TestBed.configureTestingModule({
      providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(EscritorioDoHostService).modo.set(modo);
    const harness = await RouterTestingHarness.create();
    return harness.navigateByUrl(caminho);
  }

  it.each(['/cadastro', '/equipe/convite'])('%s no subdomínio carrega o aviso', async (caminho) => {
    expect(await abrir(caminho, 'escritorio')).toBeInstanceOf(AvisoWwwPage);
  });

  it('no host principal, /cadastro é o cadastro de sempre', async () => {
    const pagina = await abrir('/cadastro', 'principal');
    expect(pagina).not.toBeInstanceOf(AvisoWwwPage);
    expect(pagina?.constructor.name).toContain('CadastroPage');
  });
});

/**
 * A landing em `/` (#174) e a sessão vencida (#213).
 *
 * `true` = a landing casa a rota; `false` = o `/` cai no shell, que leva ao painel. A armadilha
 * que esta suíte guarda: **sessão vencida no `localStorage` não é sessão**. Perguntar só
 * `logado()` escondia a landing de quem já tinha entrado uma vez, para sempre.
 */
describe('landing em /', () => {
  /** A sessão como o guard a enxerga: existe, e venceu ou não. */
  function sessaoFalsa(estado: 'nenhuma' | 'valida' | 'vencida') {
    return {
      logado: () => estado !== 'nenhuma',
      expirado: () => estado === 'vencida',
      encerrar: vi.fn(),
    };
  }

  function montar(modo: ModoDoHost, sessao: ReturnType<typeof sessaoFalsa>, renovar?: () => unknown) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SessaoService, useValue: sessao },
        { provide: AuthApi, useValue: { renovar: renovar ?? (() => of('token-novo')) } },
      ],
    });
    TestBed.inject(EscritorioDoHostService).modo.set(modo);
    return TestBed.runInInjectionContext(() => visitanteNoPrincipal());
  }

  /** O guard pode responder na hora ou depois da renovação; o teste não quer saber qual. */
  async function decide(
    modo: ModoDoHost,
    sessao: ReturnType<typeof sessaoFalsa>,
    renovar?: () => unknown,
  ): Promise<boolean> {
    const resposta = montar(modo, sessao, renovar);
    return typeof resposta === 'boolean' ? resposta : firstValueFrom(resposta);
  }

  it('vem antes do shell e só casa o / exato, com o canMatch', () => {
    const indice = routes.findIndex(
      (r) => r.path === '' && r.canMatch?.includes(visitanteNoPrincipal),
    );
    const shell = routes.findIndex((r) => r.path === '' && r.children);
    expect(indice).toBeGreaterThanOrEqual(0);
    expect(indice).toBeLessThan(shell);
    expect(routes[indice]?.pathMatch).toBe('full');
  });

  it('visitante sem sessão no www vê a landing', async () => {
    await expect(decide('principal', sessaoFalsa('nenhuma'))).resolves.toBe(true);
  });

  it('com sessão válida, o / segue para o painel sem pedir renovação', async () => {
    const renovar = vi.fn(() => of('nao deveria'));
    await expect(decide('principal', sessaoFalsa('valida'), renovar)).resolves.toBe(false);
    expect(renovar).not.toHaveBeenCalled();
  });

  it('sessão vencida e refresh aceito: o / segue para o painel', async () => {
    const sessao = sessaoFalsa('vencida');
    await expect(decide('principal', sessao, () => of('token-novo'))).resolves.toBe(false);
    expect(sessao.encerrar).not.toHaveBeenCalled();
  });

  it('sessão vencida e refresh recusado: a landing, com a sessão local esquecida', async () => {
    const sessao = sessaoFalsa('vencida');
    const recusado = () => throwError(() => new HttpErrorResponse({ status: 401 }));
    await expect(decide('principal', sessao, recusado)).resolves.toBe(true);
    expect(sessao.encerrar).toHaveBeenCalledTimes(1);
  });

  it('servidor fora do ar: a landing, mas a sessão local é preservada', async () => {
    // Um 0 (rede) ou um 502 não dizem que a sessão acabou, dizem que ninguém respondeu.
    // Apagá-la aqui deslogaria quem só pegou o backend reiniciando.
    const sessao = sessaoFalsa('vencida');
    const foraDoAr = () => throwError(() => new HttpErrorResponse({ status: 0 }));
    await expect(decide('principal', sessao, foraDoAr)).resolves.toBe(true);
    expect(sessao.encerrar).not.toHaveBeenCalled();
  });

  it('a renovação é pedida uma vez só', async () => {
    const renovar = vi.fn(() => of('token-novo'));
    await decide('principal', sessaoFalsa('vencida'), renovar);
    expect(renovar).toHaveBeenCalledTimes(1);
  });

  it.each<ModoDoHost>(['escritorio', 'nao-encontrado', 'indisponivel'])(
    'no endereço de escritório (%s), o / continua do escritório',
    async (modo) => {
      const renovar = vi.fn(() => of('nao deveria'));
      await expect(decide(modo, sessaoFalsa('vencida'), renovar)).resolves.toBe(false);
      // O host decide antes da sessão: num subdomínio não se mexe na sessão de ninguém.
      expect(renovar).not.toHaveBeenCalled();
    },
  );
});
