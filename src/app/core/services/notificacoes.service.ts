import { Injectable, signal, computed } from '@angular/core';
import { Notificacao } from '@models/notificacao.model';

@Injectable({ providedIn: 'root' })
export class NotificacoesService {
  readonly notificacoes = signal<Notificacao[]>([
    {
      id: 1,
      titulo: 'Vencimento FUNRURAL em 3 dias',
      tipo: 'Pagamento',
      rota: '/calendario',
      dataHora: '07/06/2025 às 08:00',
      lida: false,
    },
    {
      id: 2,
      titulo: 'Nova solicitação do contador',
      tipo: 'Solicitação',
      rota: '/contador',
      dataHora: '06/06/2025 às 14:30',
      lida: false,
    },
    {
      id: 3,
      titulo: 'Documento aprovado: NF-e 001234',
      tipo: 'Documento',
      rota: '/documentos',
      dataHora: '05/06/2025 às 10:00',
      lida: true,
    },
  ]);

  readonly naoLidas = computed(() => this.notificacoes().filter(n => !n.lida).length);

  marcarLida(id: number): void {
    this.notificacoes.update(list =>
      list.map(n => n.id === id ? { ...n, lida: true } : n)
    );
  }

  marcarTodasLidas(): void {
    this.notificacoes.update(list => list.map(n => ({ ...n, lida: true })));
  }

  limparTodas(): void {
    this.notificacoes.set([]);
  }
}
