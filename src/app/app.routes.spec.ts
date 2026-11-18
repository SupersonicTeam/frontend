import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
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

/** A landing em `/` (#174): só para quem chega sem sessão ao endereço principal. */
describe('landing em /', () => {
  function decide(modo: ModoDoHost, logado: boolean): boolean {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SessaoService, useValue: { logado: () => logado } },
      ],
    });
    TestBed.inject(EscritorioDoHostService).modo.set(modo);
    return TestBed.runInInjectionContext(() => visitanteNoPrincipal());
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

  it('visitante sem sessão no www vê a landing', () => {
    expect(decide('principal', false)).toBe(true);
  });

  it('com sessão, o / segue para o painel', () => {
    expect(decide('principal', true)).toBe(false);
  });

  it.each<ModoDoHost>(['escritorio', 'nao-encontrado', 'indisponivel'])(
    'no endereço de escritório (%s), o / continua do escritório',
    (modo) => {
      expect(decide(modo, false)).toBe(false);
    },
  );
});
