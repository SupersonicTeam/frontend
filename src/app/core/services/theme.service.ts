import { Injectable, signal } from '@angular/core';

type Tema = 'claro' | 'escuro';
const STORAGE_KEY = 'agro-tema';

/**
 * Serviço de tema (claro/escuro). Alterna a classe `.dark` no `<html>`, que
 * sobrescreve os tokens de cor do design system (ver `src/styles.css`).
 * Persiste a escolha em `localStorage`.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly tema = signal<Tema>(this.lerInicial());

  constructor() {
    this.aplicar(this.tema());
  }

  alternar(): void {
    this.definir(this.tema() === 'claro' ? 'escuro' : 'claro');
  }

  definir(tema: Tema): void {
    this.tema.set(tema);
    this.aplicar(tema);
    try {
      localStorage.setItem(STORAGE_KEY, tema);
    } catch {
      /* ignore */
    }
  }

  private aplicar(tema: Tema): void {
    const root = document.documentElement;
    root.classList.toggle('dark', tema === 'escuro');
  }

  private lerInicial(): Tema {
    try {
      const salvo = localStorage.getItem(STORAGE_KEY);
      if (salvo === 'claro' || salvo === 'escuro') {
        return salvo;
      }
    } catch {
      /* ignore */
    }
    return 'claro';
  }
}
