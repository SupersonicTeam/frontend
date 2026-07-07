import { Injectable, inject } from '@angular/core';
import { Observable, of, catchError, map } from 'rxjs';
import { ApiService } from '@core/services/api.service';
import { VencimentoFiscal } from '@models/vencimento-fiscal.model';

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
export class CalendarioApi {
  private readonly api = inject(ApiService);

  // Backend: GET /calendario-fiscal/:produtorId/vencimentos
  // Sem fallback mock: em falha, o erro propaga para a página tratar (erro + retry).
  getVencimentos(produtorId?: string): Observable<VencimentoFiscal[]> {
    const id = produtorId || 'default';
    return this.api
      .get<CalendarioVencimento[]>(`/calendario-fiscal/${id}/vencimentos`)
      .pipe(map(items => items.map(item => this.mapToVencimento(item))));
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
      tipo: item.valor && item.valor > 0 ? 'imposto' : 'obrigacao',
      // backend devolve 'vencido' | 'urgente' | 'normal'
      status: item.status === 'vencido' ? 'vencido' : 'pendente',
      valor: item.valor,
    };
  }
}
