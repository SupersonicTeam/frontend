import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { map } from 'rxjs';
import { ApiService } from '@core/services/api.service';
import type { GuiaFiscal, CreateGuiaDto } from '@models/solicitacao-contador.model';
import { statusDaGuia } from '@core/utils/guias';

/** O que o backend devolve: o status vem como texto cru, em MAIÚSCULO. */
type GuiaFiscalResponse = Omit<GuiaFiscal, 'status'> & { status: string };

/**
 * As **guias fiscais** que o escritório lança para o produtor (`/api/contador/guias`).
 *
 * ## Por que este service encolheu (issue #107)
 *
 * Ele tinha catorze métodos; onze deles batiam em rotas que **nunca existiram no backend** —
 * `/contador/pendencias`, `/contador/pendencias-recebidos`, `/contador/documentos/anexar` — e por
 * isso cada um carregava um `catchError(() => of([]))`. O pior era o `criarSolicitacao`, que em
 * erro devolvia um objeto inventado (`id: 'fx-pend-…'`) e fazia a tela mostrar **sucesso**; havia
 * até um teste chamado `SPEC_DEVIATION` guardando esse comportamento.
 *
 * Os onze morreram porque o backend#180 entrou e as telas passaram a usar as rotas de verdade
 * (`PendenciasApi` para o produtor, `CarteiraApi` para o escritório). Nenhum tinha mais chamador.
 * Apagar é melhor do que consertar: **código que não existe não mente**.
 *
 * O que sobrou são as três chamadas de guia, que são reais — e agora o erro delas **sobe**. Uma
 * lista vazia é "não há guia"; uma falha é outra coisa, e foi exatamente essa confusão que deixou
 * o produtor errado da issue #106 passar despercebido.
 */
@Injectable({ providedIn: 'root' })
export class ContadorApi {
  private readonly api = inject(ApiService);

  /**
   * `GET /api/contador/guias?produtorId=` — as guias lançadas para o produtor.
   *
   * **Sem fallback.** Antes um erro virava `[]`, e a tela dizia "Nenhuma guia lançada" com a API
   * respondendo 404 — foi assim que oito guias reais, uma de ICMS de R$ 3.420 vencida, sumiram
   * da tela sem ninguém notar (#106, #107).
   */
  getGuias(produtorId?: string): Observable<GuiaFiscal[]> {
    const params = produtorId ? { produtorId } : undefined;
    return this.api
      .get<GuiaFiscalResponse[]>('/contador/guias', params)
      .pipe(map((lista) => (lista ?? []).map((g) => this.paraGuia(g))));
  }

  /**
   * `POST /api/contador/guias` — lança a guia.
   *
   * O erro sobe em vez de virar `null`: quem chamou precisa distinguir "o servidor recusou" de
   * "deu certo e não veio nada", e só o erro carrega o motivo (`errors[0].message`).
   */
  anexarGuia(dto: CreateGuiaDto): Observable<GuiaFiscal> {
    return this.api
      .post<GuiaFiscalResponse>('/contador/guias', dto)
      .pipe(map((g) => this.paraGuia(g)));
  }

  /**
   * `PATCH /api/contador/guias/{id}/pagar` — dá baixa.
   *
   * Sem `catchError` desde a #50: a falha tem de chegar a quem chamou, senão a tela diz "paga"
   * sem nada ter sido pago.
   */
  marcarGuiaPaga(id: string): Observable<void> {
    return this.api.patch<void>(`/contador/guias/${id}/pagar`);
  }

  /**
   * Traduz o status da guia para o vocabulário do modelo.
   *
   * **O backend fala MAIÚSCULO e no feminino** (`PENDENTE`, `PAGA`, `VENCIDA`); o `GuiaFiscal`
   * daqui declara `'pendente' | 'pago' | 'vencido'`. Antes o service só fazia cast, então o tipo
   * mentia e **nenhuma comparação de status batia**: guia paga entrava no total a pagar e guia
   * vencida nunca acendia o alerta.
   *
   * A tradução mora em `@core/utils/guias` desde a carteira (#95), onde ganhou também o atraso
   * **derivado da data** — esta rota nunca devolve `VENCIDA` por conta própria, mas a carteira
   * conta a guia atrasada em `atencao.guiasVencidas`.
   */
  private paraGuia(bruto: GuiaFiscalResponse): GuiaFiscal {
    return { ...bruto, status: statusDaGuia(bruto.status, bruto.dataVencimento) };
  }
}
