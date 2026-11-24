import { TestBed } from '@angular/core/testing';
import { ToastService } from '@core/services/toast.service';
import { ToastContainer } from './toast-container';

/** Os avisos precisam chegar a quem usa leitor de tela (#196). */
describe('ToastContainer', () => {
  function montar() {
    const fixture = TestBed.createComponent(ToastContainer);
    fixture.detectChanges();
    const toasts = TestBed.inject(ToastService);
    const raiz = fixture.nativeElement as HTMLElement;
    const regiao = (papel: 'status' | 'alert') =>
      raiz.querySelector(`[role="${papel}"]`) as HTMLElement | null;
    return { fixture, toasts, raiz, regiao };
  }

  afterEach(() => vi.useRealTimers());

  /** Região que nasce junto com o aviso não é anunciada: as duas existem antes de tudo. */
  it('tem as duas regiões vivas antes do primeiro aviso', () => {
    const { regiao } = montar();

    expect(regiao('status')).not.toBeNull();
    expect(regiao('alert')).not.toBeNull();
    expect(regiao('status')!.children.length).toBe(0);
    expect(regiao('alert')!.children.length).toBe(0);
  });

  it('põe sucesso e informação em role="status"', () => {
    const { fixture, toasts, regiao } = montar();

    toasts.success('Nota salva');
    toasts.info('Sincronizando');
    fixture.detectChanges();

    expect(regiao('status')!.textContent).toContain('Nota salva');
    expect(regiao('status')!.textContent).toContain('Sincronizando');
    expect(regiao('alert')!.textContent).not.toContain('Nota salva');
  });

  it('põe erro e alerta em role="alert"', () => {
    const { fixture, toasts, regiao } = montar();

    toasts.error('Erro ao enviar');
    toasts.warning('Certificado vence em 5 dias');
    fixture.detectChanges();

    expect(regiao('alert')!.textContent).toContain('Erro ao enviar');
    expect(regiao('alert')!.textContent).toContain('Certificado vence em 5 dias');
    expect(regiao('status')!.textContent).not.toContain('Erro ao enviar');
  });

  it('lê o aviso inteiro e dá nome ao botão de fechar', () => {
    const { fixture, toasts, regiao } = montar();

    toasts.success('Nota salva');
    fixture.detectChanges();

    const aviso = regiao('status')!.firstElementChild as HTMLElement;
    expect(aviso.getAttribute('aria-atomic')).toBe('true');
    const fechar = aviso.querySelector('button')!;
    expect(fechar.getAttribute('aria-label')).toBe('Fechar aviso');
    expect(fechar.getAttribute('type')).toBe('button');
  });

  it('fecha o aviso pelo botão', () => {
    const { fixture, toasts, regiao } = montar();

    toasts.error('Erro ao enviar');
    fixture.detectChanges();
    (regiao('alert')!.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(toasts.toasts()).toEqual([]);
  });
});

describe('ToastService', () => {
  afterEach(() => vi.useRealTimers());

  it('sucesso e informação somem em 4 s', () => {
    vi.useFakeTimers();
    const toasts = TestBed.inject(ToastService);

    toasts.success('Nota salva');
    toasts.info('Sincronizando');
    vi.advanceTimersByTime(3999);
    expect(toasts.toasts().length).toBe(2);
    vi.advanceTimersByTime(1);
    expect(toasts.toasts()).toEqual([]);
  });

  /** WCAG 2.2.1: o motivo da falha não pode sumir antes de ser lido. */
  it('erro e alerta ficam até a pessoa fechar', () => {
    vi.useFakeTimers();
    const toasts = TestBed.inject(ToastService);

    toasts.error('Erro ao enviar');
    toasts.warning('Certificado vence em 5 dias');
    vi.advanceTimersByTime(60_000);
    expect(toasts.toasts().map((t) => t.message)).toEqual([
      'Erro ao enviar',
      'Certificado vence em 5 dias',
    ]);

    toasts.dismiss(toasts.toasts()[0]!.id);
    expect(toasts.toasts().map((t) => t.message)).toEqual(['Certificado vence em 5 dias']);
  });

  /** A mesma falha de novo troca a anterior (e é anunciada outra vez), em vez de empilhar. */
  it('o mesmo aviso repetido troca o anterior por um novo', () => {
    const toasts = TestBed.inject(ToastService);

    toasts.error('Erro ao enviar');
    const primeiro = toasts.toasts()[0]!.id;
    toasts.error('Erro ao enviar');

    expect(toasts.toasts().length).toBe(1);
    expect(toasts.toasts()[0]!.id).not.toBe(primeiro);
  });

  it('mensagens iguais de tipos diferentes convivem', () => {
    const toasts = TestBed.inject(ToastService);

    toasts.info('Pronto');
    toasts.success('Pronto');

    expect(toasts.toasts().length).toBe(2);
  });
});
