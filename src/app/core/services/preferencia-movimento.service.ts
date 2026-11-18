import { Injectable, computed, signal } from '@angular/core';

/** Chave da escolha do visitante no `localStorage` (#174, item 5.3). */
const CHAVE = 'agro-movimento';
const CONSULTA = '(prefers-reduced-motion: reduce)';
/** Classe que o CSS global de `styles.css` observa, junto com a preferência do sistema. */
const CLASSE = 'movimento-reduzido';

/**
 * Preferência de movimento (#174, itens 5.1 e 5.3). Fonte **única** do "pode animar?":
 * o CSS global, o botão "Reduzir animações" e, depois, o `AnimacaoLandingService` leem
 * este mesmo serviço.
 *
 * `reduzido()` é o **OU** entre a preferência do sistema (`prefers-reduced-motion`) e a
 * escolha do visitante. A ordem não é simétrica de propósito: o botão pode ligar o
 * movimento reduzido para quem não configurou nada no aparelho, mas desligá-lo **não**
 * passa por cima de quem pediu menos movimento no sistema operacional — essa é uma
 * preferência de acessibilidade, não um padrão a ser sobrescrito por um botão de página.
 *
 * Por isso o storage guarda só o "ligado": sem a chave, quem decide é o sistema.
 *
 * A classe no `<html>` segue o `reduzido()`, não só a escolha. Assim existe **um** estado
 * visível para conferir (e para printar com `prefers-reduced-motion: reduce`), em vez de
 * dois caminhos que precisam concordar.
 *
 * Nasce num `provideAppInitializer` (ver `app.config.ts`): se esperasse a primeira
 * injeção, quem escolheu "Reduzir animações" veria a animação de abertura primeiro.
 */
@Injectable({ providedIn: 'root' })
export class PreferenciaMovimentoService {
  /** A escolha do visitante, só o lado "ligado" (ver o comentário da classe). */
  private readonly escolha = signal(this.lerEscolha());
  /** `prefers-reduced-motion: reduce` do aparelho, acompanhado em tempo real. */
  private readonly sistema = signal(this.lerSistema());

  readonly reduzido = computed(() => this.sistema() || this.escolha());
  /** O que o botão mostra no `aria-pressed` — a escolha, não o OU. */
  readonly escolhido = this.escolha.asReadonly();
  /** Com a preferência vinda do aparelho, o botão não tem o que desligar. */
  readonly imposto = this.sistema.asReadonly();

  constructor() {
    this.ouvirSistema();
    this.aplicar();
  }

  alternar(): void {
    this.definir(!this.escolha());
  }

  definir(reduzir: boolean): void {
    this.escolha.set(reduzir);
    this.gravar(reduzir);
    this.aplicar();
  }

  private aplicar(): void {
    document.documentElement.classList.toggle(CLASSE, this.reduzido());
  }

  private lerEscolha(): boolean {
    try {
      return localStorage.getItem(CHAVE) === 'reduzido';
    } catch {
      // Acesso a storage falha em navegação privada e com cookie de terceiro bloqueado.
      return false;
    }
  }

  private gravar(reduzir: boolean): void {
    try {
      if (reduzir) localStorage.setItem(CHAVE, 'reduzido');
      else localStorage.removeItem(CHAVE);
    } catch {
      /* a escolha vale nesta página, sem persistir */
    }
  }

  private lerSistema(): boolean {
    return this.consulta()?.matches ?? false;
  }

  /**
   * Quem muda a preferência no sistema com a página aberta é atendido na hora. A escrita
   * no signal vem de um evento discreto, não de quadro de animação, então não há risco de
   * laço de renderização (o app é zoneless).
   */
  private ouvirSistema(): void {
    try {
      this.consulta()?.addEventListener('change', (evento) => {
        this.sistema.set(evento.matches);
        this.aplicar();
      });
    } catch {
      /* navegador sem addEventListener na MediaQueryList: fica com o valor da abertura */
    }
  }

  private consulta(): MediaQueryList | null {
    try {
      return window.matchMedia?.(CONSULTA) ?? null;
    } catch {
      return null;
    }
  }
}
