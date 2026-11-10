import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { EncerramentoService } from './encerramento.service';
import { EscritorioDoHostService } from './escritorio-do-host.service';
import { SessaoService } from './sessao.service';
import { NotificacoesService } from './notificacoes.service';
import { ToastService } from './toast.service';
import { ClienteEmFocoService } from './cliente-em-foco.service';
import { entrarComo } from './sessao.testing';
import { DashboardApi } from '@services/dashboard/data-access/dashboard.service';
import { AssistenteStore } from '@shared/assistente/assistente.store';
import {
  CHAVE_TOKEN_CONVITE_EQUIPE,
  EscritorioApi,
} from '@services/escritorio/data-access/escritorio.service';

/**
 * Sair — e sair **inteiro** (issue #93).
 *
 * Os services de dados são `providedIn: 'root'` e sobrevivem à troca de usuário: o Angular não os
 * recria, porque a aplicação não recarrega. Sem a limpeza, o painel e a conversa de quem saiu
 * seguiam em memória para quem entrou — foi assim que a topbar do contador exibiu o nome do
 * produtor da sessão anterior.
 */
describe('EncerramentoService', () => {
  let encerramento: EncerramentoService;
  let sessao: SessaoService;
  let httpMock: HttpTestingController;
  /** Espião em vez de `router.url`: a navegação é assíncrona e o teste não a espera. */
  let navegouPara: string[];

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: 'login', children: [] }]),
      ],
    });
    encerramento = TestBed.inject(EncerramentoService);
    sessao = TestBed.inject(SessaoService);
    httpMock = TestBed.inject(HttpTestingController);

    navegouPara = [];
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockImplementation((destino) => {
      navegouPara.push(String(destino));
      return Promise.resolve(true);
    });
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  /** Deixa os caches de sessão com conteúdo, para que a limpeza tenha o que limpar. */
  function comCachesCheios() {
    const dashboard = TestBed.inject(DashboardApi);
    const assistente = TestBed.inject(AssistenteStore);
    const notificacoes = TestBed.inject(NotificacoesService);

    dashboard.garantirCarregado().subscribe({ error: () => undefined });
    httpMock
      .match((r) => r.url === '/dashboard')
      .forEach((r) =>
        r.flush({
          produtor: { nome: 'João da Silva Produtor', tipoProdutor: 'PESSOA_FISICA', uf: 'MT' },
          periodo: '2026-10',
          kpis: { saldoIbs: 0, saldoCbs: 0, totalNotas: 0 },
        }),
      );

    notificacoes.carregar();
    httpMock
      .match((r) => r.url === '/alertas')
      .forEach((r) =>
        r.flush([
          {
            id: 'a1',
            tipo: 'VENCIMENTO_GUIA',
            referenciaId: 'g1',
            descricao: 'Guia de FUNRURAL de R$ 1.840,55',
            dataLimite: '2026-11-02',
            diasRestantes: 3,
          },
        ]),
      );
    httpMock.match((r) => r.url === '/convites').forEach((r) => r.flush([]));

    return { dashboard, assistente, notificacoes };
  }

  it('avisa o servidor: o refresh tem de ser revogado de verdade', () => {
    entrarComo('PRODUTOR');

    encerramento.encerrar();

    const req = httpMock.expectOne('/auth/logout');
    expect(req.request.method).toBe('POST');
    // O cookie desta sessão é o que ele revoga — então a chamada sai antes de o token ser jogado.
    expect(req.request.withCredentials).toBe(true);
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('esquece a sessão e vai ao /login', async () => {
    entrarComo('PRODUTOR', 'João');

    encerramento.encerrar();
    httpMock.match((r) => r.url === '/auth/logout').forEach((r) => r.flush(null));
    await Promise.resolve();

    expect(sessao.logado()).toBe(false);
    expect(sessao.nome()).toBe('');
    expect(navegouPara).toEqual(['/login']);
  });

  it('limpa os caches de sessão: o dado de quem saiu não fica para quem entra', () => {
    entrarComo('PRODUTOR');
    const { dashboard, notificacoes } = comCachesCheios();
    expect(dashboard.dashboard()?.produtor.nome).toBe('João da Silva Produtor');
    expect(notificacoes.notificacoes().length).toBe(1);

    encerramento.encerrar();
    httpMock.match((r) => r.url === '/auth/logout').forEach((r) => r.flush(null));

    expect(dashboard.dashboard()).toBeNull();
    expect(notificacoes.notificacoes().length).toBe(0);
  });

  /** O cliente que o contador atendia é de **outro** escritório para quem entra depois (#136). */
  it('esquece o cliente em foco do contador', () => {
    entrarComo('CONTADOR');
    const foco = TestBed.inject(ClienteEmFocoService);
    foco.escolher('p1');

    encerramento.encerrar();
    httpMock.match((r) => r.url === '/auth/logout').forEach((r) => r.flush(null));

    expect(foco.produtorId()).toBeNull();
  });

  /** A funcao no escritorio fica em cache (#148): quem entra nao herda os botoes de quem saiu. */
  it('esquece o escritorio e o convite de equipe guardados', () => {
    entrarComo('CONTADOR');
    const escritorio = TestBed.inject(EscritorioApi);
    escritorio.ehAdministrador().subscribe();
    httpMock.expectOne('/escritorio').flush({ minhaFuncao: 'ADMINISTRADOR' });
    sessionStorage.setItem(CHAVE_TOKEN_CONVITE_EQUIPE, 'tok');

    encerramento.encerrar();
    httpMock.match((r) => r.url === '/auth/logout').forEach((r) => r.flush(null));

    escritorio.ehAdministrador().subscribe();
    httpMock.expectOne('/escritorio').flush({ minhaFuncao: 'CONTADOR' });
    expect(sessionStorage.getItem(CHAVE_TOKEN_CONVITE_EQUIPE)).toBeNull();
  });

  it('limpa a conversa com a Ceres: é dado do usuário por definição', () => {
    entrarComo('PRODUTOR');
    const assistente = TestBed.inject(AssistenteStore);
    assistente.entrada.set('quanto eu pago de IBS?');
    assistente.aberto.set(true);

    encerramento.encerrar();
    httpMock.match((r) => r.url === '/auth/logout').forEach((r) => r.flush(null));

    expect(assistente.mensagens()).toEqual([]);
    expect(assistente.entrada()).toBe('');
  });

  /** Sem isto a pessoa é jogada no /login no meio de uma tarefa sem saber por quê. */
  it('sessão expirada avisa; sair por vontade própria não', () => {
    const toast = TestBed.inject(ToastService);
    entrarComo('PRODUTOR');

    encerramento.encerrar('pedido');
    httpMock.match((r) => r.url === '/auth/logout').forEach((r) => r.flush(null));
    expect(toast.toasts().length).toBe(0);

    entrarComo('PRODUTOR');
    encerramento.encerrar('expirada');
    httpMock.match((r) => r.url === '/auth/logout').forEach((r) => r.flush(null));

    expect(toast.toasts().length).toBe(1);
    expect(toast.toasts()[0]?.message).toContain('expirou');
  });

  /** Servidor fora do ar não é motivo para manter alguém numa tela que ele mandou fechar. */
  it('sai mesmo com o /auth/logout falhando', async () => {
    entrarComo('PRODUTOR');

    encerramento.encerrar();
    httpMock
      .match((r) => r.url === '/auth/logout')
      .forEach((r) => r.error(new ProgressEvent('error')));
    await Promise.resolve();

    expect(sessao.logado()).toBe(false);
    expect(navegouPara).toEqual(['/login']);
  });

  it('o aviso vai ao /login no state da navegação (#175)', async () => {
    entrarComo('CONTADOR', 'Patricia');
    const navegar = TestBed.inject(Router).navigateByUrl as unknown as ReturnType<typeof vi.fn>;

    encerramento.encerrar('pedido', 'Este endereço não é mais o do seu escritório.');
    httpMock.match((r) => r.url === '/auth/logout').forEach((r) => r.flush(null));

    expect(navegar).toHaveBeenLastCalledWith('/login', {
      state: { aviso: 'Este endereço não é mais o do seu escritório.' },
    });
  });

  it('não mexe no escritório do endereço: o /login do subdomínio continua com a marca', () => {
    const host = TestBed.inject(EscritorioDoHostService);
    host.modo.set('escritorio');
    host.escritorio.set({ slug: 'ruraloeste', nome: 'Contabilidade Rural Oeste' });
    entrarComo('CONTADOR', 'Patricia');

    encerramento.encerrar();
    httpMock.match((r) => r.url === '/auth/logout').forEach((r) => r.flush(null));

    expect(host.modo()).toBe('escritorio');
    expect(host.escritorio()?.nome).toBe('Contabilidade Rural Oeste');
  });
});
