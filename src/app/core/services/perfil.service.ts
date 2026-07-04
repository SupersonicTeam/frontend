import { Injectable, computed, signal } from '@angular/core';

/** Perfil de usuário da demo — separa a experiência do produtor e do contador. */
export type Perfil = 'produtor' | 'contador';

/**
 * Estado do "login demonstrativo" (issue #23). NÃO é autenticação real: apenas
 * seleciona o perfil ativo (produtor/contador) para separar as experiências na
 * apresentação. Persistido em localStorage para sobreviver a refresh.
 */
@Injectable({ providedIn: 'root' })
export class PerfilService {
  private static readonly KEY = 'agrocontabil.perfil';
  private static readonly KEY_NOME = 'agrocontabil.perfil.nome';

  readonly perfil = signal<Perfil | null>(this.carregar());
  readonly nome = signal<string>(this.carregarNome());

  readonly ehProdutor = computed(() => this.perfil() === 'produtor');
  readonly ehContador = computed(() => this.perfil() === 'contador');
  readonly logado = computed(() => this.perfil() !== null);

  /** Rota inicial de cada perfil. */
  readonly homeDoPerfil = computed(() => (this.perfil() === 'contador' ? '/contador' : '/dashboard'));

  /** Define o perfil ativo (login de sabor, sem validação). */
  entrar(perfil: Perfil, nome?: string): void {
    this.perfil.set(perfil);
    this.nome.set(nome?.trim() || this.rotuloPadrao(perfil));
    this.persistir();
  }

  /** Sai (limpa o perfil) — volta ao /login. */
  sair(): void {
    this.perfil.set(null);
    this.nome.set('');
    if (this.temStorage()) {
      localStorage.removeItem(PerfilService.KEY);
      localStorage.removeItem(PerfilService.KEY_NOME);
    }
  }

  rotuloPadrao(perfil: Perfil): string {
    return perfil === 'contador' ? 'Contador' : 'Produtor';
  }

  private persistir(): void {
    if (!this.temStorage()) return;
    const p = this.perfil();
    if (p) localStorage.setItem(PerfilService.KEY, p);
    localStorage.setItem(PerfilService.KEY_NOME, this.nome());
  }

  private carregar(): Perfil | null {
    if (!this.temStorage()) return null;
    const v = localStorage.getItem(PerfilService.KEY);
    return v === 'produtor' || v === 'contador' ? v : null;
  }

  private carregarNome(): string {
    return this.temStorage() ? (localStorage.getItem(PerfilService.KEY_NOME) ?? '') : '';
  }

  private temStorage(): boolean {
    return typeof localStorage !== 'undefined';
  }
}
