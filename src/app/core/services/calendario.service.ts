import { Injectable, inject } from '@angular/core';
import { Observable, of, catchError, map } from 'rxjs';
import { ApiService } from './api.service';
import { VencimentoFiscal } from '../models/types';

interface CalendarioVencimento {
  id?: string;
  evento?: string; // backend usa este campo p/ o nome
  nome?: string;
  titulo?: string;
  descricao?: string;
  dataVencimento?: string;
  data?: string;
  tipo?: string;
  status?: string; // backend: vencido | urgente | normal
  valor?: number;
  obrigatorio?: boolean;
}

@Injectable({ providedIn: 'root' })
export class CalendarioService {
  private readonly api = inject(ApiService);

  // Backend: GET /calendario-fiscal/:produtorId/vencimentos
  getVencimentos(produtorId?: string): Observable<VencimentoFiscal[]> {
    const id = produtorId || 'default';
    return this.api.get<CalendarioVencimento[]>(`/calendario-fiscal/${id}/vencimentos`).pipe(
      map(items => items.map(item => this.mapToVencimento(item))),
      catchError(() => of(this.getMockVencimentos()))
    );
  }

  // Backend: GET /calendario-fiscal/:produtorId/resumo
  getResumo(produtorId: string): Observable<unknown> {
    return this.api.get<unknown>(`/calendario-fiscal/${produtorId}/resumo`).pipe(
      catchError(() => of(null))
    );
  }

  private mapToVencimento(item: CalendarioVencimento): VencimentoFiscal {
    const dataRaw = item.dataVencimento || item.data || new Date().toISOString();
    return {
      id: item.id || String(Math.random()),
      titulo: item.evento || item.nome || item.titulo || 'Obrigação fiscal',
      descricao: item.descricao,
      dataVencimento: dataRaw.split('T')[0],
      // Heurística: se tem valor monetário é imposto/pagamento, senão obrigação
      tipo: (item.valor && item.valor > 0) ? 'imposto' : 'obrigacao',
      // backend devolve 'vencido' | 'urgente' | 'normal'
      status: item.status === 'vencido' ? 'vencido' : 'pendente',
      valor: item.valor,
    };
  }

  private getMockVencimentos(): VencimentoFiscal[] {
    const ano = new Date().getFullYear();
    const mes = String(new Date().getMonth() + 1).padStart(2, '0');
    return [
      { id: '1', titulo: 'FUNRURAL - Folha de Pagamento', descricao: 'Recolhimento mensal do FUNRURAL', dataVencimento: `${ano}-${mes}-07`, tipo: 'imposto', status: 'pendente', valor: 1250 },
      { id: '2', titulo: 'SPED Fiscal', descricao: 'Entrega do SPED Fiscal', dataVencimento: `${ano}-${mes}-15`, tipo: 'obrigacao', status: 'pendente' },
      { id: '3', titulo: 'DCTF', descricao: 'Declaração de Débitos e Créditos Tributários Federais', dataVencimento: `${ano}-${mes}-20`, tipo: 'declaracao', status: 'pendente' },
      { id: '4', titulo: 'CBS/IBS - Nota de Saída', descricao: 'Recolhimento CBS e IBS ref. notas de saída', dataVencimento: `${ano}-${mes}-25`, tipo: 'imposto', status: 'pendente', valor: 3400 },
    ];
  }
}
