import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { skipErrorNotify } from '@core/interceptors/error-notify.context';

/**
 * Uma seção dos termos. `paragrafos` e `itens` são **texto puro**: a tela renderiza por
 * interpolação, nunca por `innerHTML`.
 */
export interface SecaoTermos {
  /** A âncora da seção (`#quem-somos`, `#ceres`…), para linkar um ponto do documento. */
  id: string;
  titulo: string;
  paragrafos: string[];
  /** Vem vazia quando a seção não tem lista. */
  itens: string[];
}

/** `GET /api/termos-de-uso` — os termos de uso (backend#498, contrato do backend#610). */
export interface TermosDeUso {
  /** `AAAA-MM-DD`. A seção "Mudanças" promete que esta data aparece no topo da página. */
  versao: string;
  controlador: string;
  contato: string;
  /**
   * As dez seções, **na ordem em que o backend as manda**. A tela não reordena nem escolhe: o que
   * o usuário aceita é o documento inteiro, na ordem em que o controlador o escreveu.
   */
  secoes: SecaoTermos[];
}

/**
 * Os termos de uso (#211). Rota **pública**, como a política de dados: quem ainda não tem conta
 * precisa poder ler antes de marcar o aceite no cadastro.
 *
 * **O texto não mora no frontend.** Ele é do controlador (a GWNext), vem do backend e muda de
 * versão lá; uma cópia aqui envelheceria em silêncio e passaria a divergir do que a conta
 * registrou como aceito.
 */
@Injectable({ providedIn: 'root' })
export class TermosApi {
  private readonly http = inject(HttpClient);

  /** Sem toast global: a página mostra a falha no lugar do texto. */
  termos(): Observable<TermosDeUso> {
    return this.http.get<TermosDeUso>('/termos-de-uso', { context: skipErrorNotify() });
  }
}

/**
 * `AAAA-MM-DD` em `dd/MM/aaaa`, que é como a versão aparece no topo da página.
 *
 * Sem `new Date()` de propósito: `new Date('2026-11-24')` é lido como meia-noite **UTC**, e no
 * fuso do Brasil a data mostrada voltaria um dia. Aqui é troca de posição de texto, não data.
 * O que não tiver a forma esperada é mostrado como veio — melhor a versão crua do que uma data
 * inventada.
 */
export function versaoEmDataBr(versao: string): string {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(versao);
  if (!partes) return versao;
  const [, ano, mes, dia] = partes;
  return `${dia}/${mes}/${ano}`;
}
