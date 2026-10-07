import { routes } from './app.routes';
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
  const filhas = routes.find((r) => r.path === '')?.children ?? [];
  const guardsDe = (path: string) => filhas.find((r) => r.path === path)?.canActivate ?? [];

  it.each(['dashboard', 'chat'])('/%s é do produtor', (path) => {
    expect(guardsDe(path)).toContain(produtorGuard);
  });

  it('/contador é do contador', () => {
    expect(guardsDe('contador')).toContain(contadorGuard);
  });

  it('/documentos é dos dois — a lista de notas é a mesma, só a voz troca', () => {
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
