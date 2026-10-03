import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from '@core/services/api.service';
import { VencimentoFiscal } from '@models/vencimento-fiscal.model';

/**
 * Resposta de `GET /api/calendario-fiscal/{produtorId}/vencimentos`
 * (`VencimentoFiscalResponse` do backend Spring).
 *
 * Os campos são obrigatórios no contrato — `descricao` e `valor` podem vir nulos. Tipar como
 * opcional o que o backend garante só serviria para justificar um valor inventado quando faltasse.
 */
interface VencimentoFiscalResponse {
  id: string;
  /** Título exibido no calendário (ex.: "Guia ICMS"). */
  evento: string;
  descricao?: string | null;
  /** `AAAA-MM-DD`. */
  dataVencimento: string;
  /** Hoje sempre `imposto`; o backend reserva obrigacao/declaracao/solicitacao. */
  tipo: string;
  /** `pendente` · `pago` · `vencido`. */
  status: string;
  valor?: number | null;
}

const TIPOS: readonly VencimentoFiscal['tipo'][] = [
  'imposto',
  'obrigacao',
  'declaracao',
  'solicitacao',
];
const STATUS: readonly VencimentoFiscal['status'][] = ['pendente', 'pago', 'vencido'];

/** Janela pedida ao servidor. Datas em `AAAA-MM-DD`, extremos inclusivos. */
export interface JanelaVencimentos {
  de: string;
  ate: string;
}

@Injectable({ providedIn: 'root' })
export class CalendarioApi {
  private readonly api = inject(ApiService);

  /**
   * `GET /api/calendario-fiscal/{produtorId}/vencimentos` — as guias do produtor na janela pedida.
   *
   * **A janela é do servidor, não da tela.** Sem `de`/`ate` o backend devolve o mês corrente ±12
   * meses: navegar para fora disso traria lista vazia, indistinguível de "não há nada a pagar".
   * Por isso a página pede o mês que está mostrando.
   *
   * Em falha o erro propaga — a tela mostra o estado de erro com "Tentar novamente", nunca um
   * vencimento inventado.
   */
  getVencimentos(produtorId: string, janela?: JanelaVencimentos): Observable<VencimentoFiscal[]> {
    return this.api
      .get<VencimentoFiscalResponse[]>(
        `/calendario-fiscal/${produtorId}/vencimentos`,
        janela ? { de: janela.de, ate: janela.ate } : undefined,
      )
      .pipe(map((itens) => (itens ?? []).flatMap((item) => this.paraVencimento(item))));
  }

  /**
   * Converte um item do contrato. **Nada é preenchido por adivinhação**: item sem `id` ou sem
   * `dataVencimento` é descartado, porque a alternativa (id aleatório, data de hoje) coloca na
   * tela do produtor um prazo fiscal que o servidor nunca informou.
   *
   * Devolve lista para o `flatMap` do chamador poder descartar sem `null`.
   */
  private paraVencimento(item: VencimentoFiscalResponse): VencimentoFiscal[] {
    const data = (item.dataVencimento ?? '').split('T')[0];
    if (!item.id || !data) return [];

    return [
      {
        id: item.id,
        titulo: item.evento || 'Vencimento fiscal',
        descricao: item.descricao ?? undefined,
        dataVencimento: data,
        tipo: this.tipoConhecido(item.tipo),
        status: this.statusConhecido(item.status),
        valor: item.valor ?? undefined,
      },
    ];
  }

  /** O backend documenta `imposto` como o único tipo hoje; é o padrão para valor desconhecido. */
  private tipoConhecido(tipo: string): VencimentoFiscal['tipo'] {
    return (TIPOS as readonly string[]).includes(tipo)
      ? (tipo as VencimentoFiscal['tipo'])
      : 'imposto';
  }

  /**
   * `pago` e `vencido` precisam chegar inteiros à tela.
   *
   * O mapeamento anterior reconhecia só `vencido` e jogava todo o resto em `pendente` — uma guia
   * **paga** aparecia como pendente no calendário. O próprio `VencimentoFiscalResponse` do backend
   * registra esse bug como pendência do frontend.
   */
  private statusConhecido(status: string): VencimentoFiscal['status'] {
    return (STATUS as readonly string[]).includes(status)
      ? (status as VencimentoFiscal['status'])
      : 'pendente';
  }
}
