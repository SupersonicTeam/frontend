import { Injectable, signal } from '@angular/core';

/**
 * O cliente da carteira que o contador está atendendo, **entre telas** (issue #136).
 *
 * Notas e Fechamento são do mesmo cliente na cabeça de quem trabalha: escolher o Sítio Boa Vista
 * em Notas e cair no Fechamento sem cliente nenhum obrigaria a escolher de novo a cada clique no
 * menu. O endereço (`?cliente=`) é quem manda quando existe; isto é só a lembrança para quando o
 * menu não leva o parâmetro.
 *
 * Guarda **só o id**, nunca a resposta da carteira — e mesmo assim o `EncerramentoService` o limpa
 * ao sair: o id de um cliente do escritório anterior não pode virar o ponto de partida de quem
 * entra. O `SeletorCliente` ainda confere o id contra a carteira de quem está logado.
 */
@Injectable({ providedIn: 'root' })
export class ClienteEmFocoService {
  private readonly id = signal<string | null>(null);

  readonly produtorId = this.id.asReadonly();

  escolher(produtorId: string | null): void {
    this.id.set(produtorId);
  }

  limpar(): void {
    this.id.set(null);
  }
}
