import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { ApiService } from '@core/services/api.service';

/** Um prazo tributário que vence em menos de 5 dias (backend#140, RN010). */
export interface AlertaTributario {
  id: string;
  /** `VENCIMENTO_GUIA`, `FECHAMENTO_APURACAO`, `PRAZO_CANCELAMENTO`… */
  tipo: string;
  /** O recurso de que o alerta fala — a guia, a apuração. */
  referenciaId: string;
  /** Já vem pronto para ler: "Guia de FUNRURAL de R$ 1.840,55". */
  descricao: string;
  /** `AAAA-MM-DD`. */
  dataLimite: string;
  diasRestantes: number;
}

/**
 * Os alertas tributários do produtor autenticado (`GET /api/alertas`).
 *
 * **É rota do produtor**: o backend deriva o produtor da identidade, e um contador ali recebe
 * 403. Por isso o sino do escritório lê a carteira, não esta rota — ver `NotificacoesService`.
 *
 * Lista vazia é o normal: ela só traz o que vence em menos de 5 dias.
 */
@Injectable({ providedIn: 'root' })
export class AlertasApi {
  private readonly api = inject(ApiService);

  listar(): Observable<AlertaTributario[]> {
    return this.api.get<AlertaTributario[]>('/alertas');
  }
}
