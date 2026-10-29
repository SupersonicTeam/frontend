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
  /** `imposto`, `obrigacao`, `declaracao` ou `solicitacao` (backend#181). */
  tipo: string;
  /** `pendente` · `pago` · `vencido`, ou **`null` na obrigação**, que não se paga. */
  status: string | null;
  valor?: number | null;
  /** Só em obrigação: `MENSAL`, `ANUAL`… */
  periodicidade?: string | null;
  /** Só em obrigação: a norma de onde ela vem. */
  origem?: string | null;
}

const TIPOS: readonly VencimentoFiscal['tipo'][] = [
  'imposto',
  'obrigacao',
  'declaracao',
  'solicitacao',
];
const STATUS: readonly string[] = ['pendente', 'pago', 'vencido'];

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
        periodicidade: item.periodicidade ?? undefined,
        origem: item.origem ?? undefined,
      },
    ];
  }

  /** Tipo fora do contrato cai em `imposto`, que é o caso que não pode sumir da tela. */
  private tipoConhecido(tipo: string): VencimentoFiscal['tipo'] {
    return (TIPOS as readonly string[]).includes(tipo)
      ? (tipo as VencimentoFiscal['tipo'])
      : 'imposto';
  }

  /**
   * `pago` e `vencido` precisam chegar inteiros à tela — e `null` também.
   *
   * Duas correções moram aqui. A primeira: o mapeamento reconhecia só `vencido` e jogava todo o
   * resto em `pendente`, de modo que uma guia **paga** aparecia como pendente.
   *
   * A segunda é da #181: **`null` passa**. A obrigação não se paga e vem sem status; supor
   * `pendente` fazia a data no passado transformá-la em "atrasada", e a tela do produtor mostrava
   * o fechamento da apuração com o aviso "guia atrasada costuma ter multa e juros" — conselho de
   * pagamento para algo que não se paga.
   *
   * Um status que **não reconhecemos** numa guia continua virando `pendente`: ali é ruído, e supor
   * pendente é o que mantém a guia visível. `null` é informação; desconhecido é ruído.
   */
  private statusConhecido(status: string | null): VencimentoFiscal['status'] {
    if (status === null || status === undefined) return null;
    return (STATUS as readonly string[]).includes(status)
      ? (status as Exclude<VencimentoFiscal['status'], null>)
      : 'pendente';
  }
}
