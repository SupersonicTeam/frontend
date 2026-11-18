import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { PreferenciaMovimentoService } from '@core/services/preferencia-movimento.service';
import {
  AMBIENTE_DA_ANIMACAO,
  AnimacaoLandingService,
  type AmbienteDaAnimacao,
} from './animacao-landing.service';
import { CARREGAR_ANIMACAO, type ApiDeAnimacao } from './carregar-animacao';
import { Cena } from './cena';

/**
 * A porta única da animação da landing (#174, N2.4).
 *
 * O que estes testes protegem é sobretudo **o que não acontece**: com movimento reduzido ou
 * economia de dados, a biblioteca **não é baixada**; e ela nunca é pedida antes de a página
 * terminar de carregar. São as duas promessas da N2.5 e da N2.6.
 */
describe('AnimacaoLandingService', () => {
  const api = { animate: vi.fn(), scroll: vi.fn(), inView: vi.fn() } as unknown as ApiDeAnimacao;

  let carregador: ReturnType<typeof vi.fn<() => Promise<ApiDeAnimacao | null>>>;
  let economia: boolean;
  /** Solta a espera pelo `load` + momento ocioso. */
  let ficarOcioso: () => void;

  function montar() {
    const ambiente: AmbienteDaAnimacao = {
      economiaDeDados: () => economia,
      quandoOcioso: () => new Promise<void>((resolve) => (ficarOcioso = resolve)),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: CARREGAR_ANIMACAO, useValue: carregador },
        { provide: AMBIENTE_DA_ANIMACAO, useValue: ambiente },
      ],
    });
    return {
      servico: TestBed.inject(AnimacaoLandingService),
      movimento: TestBed.inject(PreferenciaMovimentoService),
    };
  }

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('movimento-reduzido');
    economia = false;
    ficarOcioso = () => undefined;
    carregador = vi.fn<() => Promise<ApiDeAnimacao | null>>().mockResolvedValue(api);
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('movimento-reduzido');
  });

  it('com movimento liberado e sem economia de dados, vai animar', () => {
    expect(montar().servico.vaiAnimar()).toBe(true);
  });

  it('com "Reduzir animações", não anima e não baixa a biblioteca', async () => {
    const { servico, movimento } = montar();
    movimento.definir(true);

    expect(servico.vaiAnimar()).toBe(false);
    await expect(servico.carregar()).resolves.toBeNull();
    expect(carregador).not.toHaveBeenCalled();
  });

  it('com economia de dados (saveData), não anima e não baixa a biblioteca', async () => {
    economia = true;
    const { servico } = montar();

    expect(servico.vaiAnimar()).toBe(false);
    await expect(servico.carregar()).resolves.toBeNull();
    expect(carregador).not.toHaveBeenCalled();
  });

  /** O LCP é o `<h1>`: a biblioteca não disputa banda com ele. */
  it('só pede a biblioteca depois do load e de um momento ocioso', async () => {
    const { servico } = montar();

    const pedido = servico.carregar();
    await Promise.resolve();
    expect(carregador).not.toHaveBeenCalled();

    ficarOcioso();
    await expect(pedido).resolves.toBe(api);
    expect(carregador).toHaveBeenCalledTimes(1);
  });

  it('dez cenas pedindo juntas fazem um import só', async () => {
    const { servico } = montar();

    const pedidos = Array.from({ length: 10 }, () => servico.carregar());
    ficarOcioso();
    const respostas = await Promise.all(pedidos);

    expect(respostas.every((r) => r === api)).toBe(true);
    expect(carregador).toHaveBeenCalledTimes(1);
  });

  /** Animação é enfeite: sem ela a página fica estática e inteira, não quebrada. */
  it('import que falha vira null, e não é tentado de novo a cada cena', async () => {
    carregador = vi.fn<() => Promise<ApiDeAnimacao | null>>().mockRejectedValue(new Error('chunk'));
    const { servico } = montar();

    const primeiro = servico.carregar();
    ficarOcioso();
    await expect(primeiro).resolves.toBeNull();
    await expect(servico.carregar()).resolves.toBeNull();

    expect(carregador).toHaveBeenCalledTimes(1);
  });

  it('reduzir as animações enquanto a página carrega cancela o download', async () => {
    const { servico, movimento } = montar();

    const pedido = servico.carregar();
    movimento.definir(true);
    ficarOcioso();

    await expect(pedido).resolves.toBeNull();
    expect(carregador).not.toHaveBeenCalled();
  });

  /** A desistência acima não fica guardada: quem volta atrás ainda tem animação. */
  it('liberar o movimento de novo permite carregar na cena seguinte', async () => {
    const { servico, movimento } = montar();
    const desistido = servico.carregar();
    movimento.definir(true);
    ficarOcioso();
    await desistido;

    movimento.definir(false);
    const pedido = servico.carregar();
    ficarOcioso();

    await expect(pedido).resolves.toBe(api);
    expect(carregador).toHaveBeenCalledTimes(1);
  });
});

/**
 * O "revert()" que o Motion não tem (#174, N2.4): o que a cena criou, desfeito de uma vez.
 */
describe('Cena', () => {
  it('concluir leva as animações ao fim e solta os listeners', () => {
    const cena = new Cena();
    const a = { complete: vi.fn() };
    const b = { complete: vi.fn() };
    const soltar = vi.fn();
    cena.animacao(a);
    cena.animacao(b);
    cena.aoEncerrar(soltar);

    cena.concluir();

    expect(a.complete).toHaveBeenCalledTimes(1);
    expect(b.complete).toHaveBeenCalledTimes(1);
    expect(soltar).toHaveBeenCalledTimes(1);
  });

  it('concluir duas vezes não repete nada', () => {
    const cena = new Cena();
    const a = { complete: vi.fn() };
    const soltar = vi.fn();
    cena.animacao(a);
    cena.aoEncerrar(soltar);

    cena.concluir();
    cena.concluir();

    expect(a.complete).toHaveBeenCalledTimes(1);
    expect(soltar).toHaveBeenCalledTimes(1);
  });

  it('uma animação que lança não impede as outras nem a limpeza', () => {
    const cena = new Cena();
    const quebrada = {
      complete: vi.fn(() => {
        throw new Error('já encerrada');
      }),
    };
    const boa = { complete: vi.fn() };
    const soltar = vi.fn();
    cena.animacao(quebrada);
    cena.animacao(boa);
    cena.aoEncerrar(soltar);

    expect(() => cena.concluir()).not.toThrow();
    expect(boa.complete).toHaveBeenCalled();
    expect(soltar).toHaveBeenCalled();
  });

  it('o que entra depois de montada também é alcançado', () => {
    const cena = new Cena();
    cena.concluir();
    const tardia = { complete: vi.fn() };

    expect(cena.animacao(tardia)).toBe(tardia);
    cena.concluir();

    expect(tardia.complete).toHaveBeenCalledTimes(1);
  });
});
