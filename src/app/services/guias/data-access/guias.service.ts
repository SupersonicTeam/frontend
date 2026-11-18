import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { map } from 'rxjs';
import { ApiService } from '@core/services/api.service';
import type { GuiaFiscal } from '@models/solicitacao-contador.model';
import { statusDaGuia } from '@core/utils/guias';

/** O que o backend devolve: o status vem como texto cru, em MAIÚSCULO. */
export type GuiaFiscalResponse = Omit<GuiaFiscal, 'status'> & { status: string };

/** Traduz o status do backend e deriva o atraso da data (ver `@core/utils/guias`). */
export function paraGuia(bruto: GuiaFiscalResponse): GuiaFiscal {
  return { ...bruto, status: statusDaGuia(bruto.status, bruto.dataVencimento) };
}

/**
 * As **guias do produtor autenticado** (`/api/guias`, #198, backend#273). O produtor vem do token:
 * nenhuma rota daqui leva `produtorId`, e o contador recebe 403 `PAPEL_NAO_AUTORIZADO` em todas.
 * As guias de um cliente da carteira, do lado do escritório, moram no `CarteiraApi`.
 *
 * Até a #198 as duas pontas usavam o `ContadorApi`, sobre `/api/contador/guias?produtorId=` — uma
 * rota só, anterior à carteira, que servia ao produtor e ao contador conforme o id da query.
 *
 * **Sem fallback** (#106, #107): lista vazia é "não há guia"; erro sobe para a tela, que mostra
 * "não carregou" com "Tentar novamente". Foi uma lista vazia em falha que escondeu oito guias
 * reais, uma de ICMS de R$ 3.420 vencida.
 */
@Injectable({ providedIn: 'root' })
export class GuiasApi {
  private readonly api = inject(ApiService);

  /**
   * `GET /api/guias` — as guias do produtor, vencimento mais recente primeiro. Corpo é array, o
   * total vai no `X-Total-Count` (padrão 100 por página, máximo 200).
   */
  minhas(): Observable<GuiaFiscal[]> {
    return this.api
      .get<GuiaFiscalResponse[]>('/guias')
      .pipe(map((lista) => (lista ?? []).map(paraGuia)));
  }

  /**
   * `PATCH /api/guias/{id}/pagar` — o produtor dá baixa na guia dele. 404 para guia de outro
   * produtor, 409 se já estiver paga, 403 para contador. O erro sobe: sem ele a tela diria "paga"
   * sem nada ter sido pago (#50).
   */
  pagar(id: string): Observable<GuiaFiscal> {
    return this.api.patch<GuiaFiscalResponse>(`/guias/${id}/pagar`).pipe(map(paraGuia));
  }
}
