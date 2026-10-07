import { routes } from './app.routes';
import { produtorGuard } from '@core/guards/produtor.guard';
import { contadorGuard } from '@core/guards/contador.guard';

/**
 * **As telas dos dois papéis são separadas.**
 *
 * O contador chegava em `/calendario` e `/tributario` pela própria navegação, e lia textos
 * escritos para o produtor — inclusive "procure o seu escritório de contabilidade", mostrado
 * para o escritório. O que ele precisa de apuração e de prazos está em `/contador`.
 *
 * Este teste existe para que remover um guard ao mexer nas rotas custe uma reprovação, e não uma
 * descoberta na apresentação.
 */
describe('rotas por papel', () => {
  const filhas = routes.find((r) => r.path === '')?.children ?? [];
  const guardsDe = (path: string) => filhas.find((r) => r.path === path)?.canActivate ?? [];

  it.each(['dashboard', 'calendario', 'tributario', 'chat'])('/%s é do produtor', (path) => {
    expect(guardsDe(path)).toContain(produtorGuard);
  });

  it('/contador é do contador', () => {
    expect(guardsDe('contador')).toContain(contadorGuard);
  });

  it('/documentos é dos dois — a lista de notas é a mesma, só a voz troca', () => {
    expect(guardsDe('documentos')).toEqual([]);
  });
});
