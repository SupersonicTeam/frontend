import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { ApiService } from '@core/services/api.service';
import type { TipoDocumentoPendencia } from '@models/pendencia.model';

/** Um modelo de pedido de documento do escritório (backend#517). */
export interface ModeloPedido {
  id: string;
  titulo: string;
  descricao: string | null;
  tiposDocumento: TipoDocumentoPendencia[];
  /** Em quantos dias, a contar de hoje, o pedido feito por este modelo vence. Nulo = sem prazo. */
  prazoEmDias: number | null;
  observacoes: string | null;
}

/** Corpo do `POST` e do `PUT`. Os opcionais vazios não vão. */
export interface ModeloPedidoRequest {
  /** Obrigatório, até 120 caracteres. Único no escritório, sem contar acento nem caixa. */
  titulo: string;
  /** De 1 a 5. */
  tiposDocumento: TipoDocumentoPendencia[];
  /** Até 1000 caracteres. */
  descricao?: string;
  /** De 1 a 365. */
  prazoEmDias?: number;
  /** Até 1000 caracteres. */
  observacoes?: string;
}

/** O máximo de modelos por escritório; acima disso o servidor responde 409. */
export const LIMITE_DE_MODELOS = 50;

/**
 * Os modelos de pedido de documento do escritório (#185, backend#517).
 *
 * O escritório que pede todo mês "extrato bancário" a 30 clientes redigia o pedido 30 vezes. O
 * modelo guarda o texto uma vez; na ficha do cliente, "Usar um modelo" preenche o formulário e o
 * contador ajusta antes de enviar.
 *
 * **O modelo só preenche.** O pedido continua indo pelo `POST .../pendencias` de sempre e não
 * guarda referência ao modelo: editar ou apagar um modelo nunca muda um pedido já enviado.
 *
 * **Todo membro lê e usa; só o administrador cria, edita e apaga** — as rotas de escrita
 * respondem 403 `PAPEL_NAO_AUTORIZADO` aos outros. São no máximo 50 por escritório, sem
 * paginação, em ordem de título.
 *
 * Sem cache: a lista é curta, e um modelo que o administrador acabou de criar tem de aparecer
 * para o colega na próxima vez que ele abrir a ficha de um cliente.
 */
@Injectable({ providedIn: 'root' })
export class ModelosPedidoApi {
  private readonly api = inject(ApiService);

  listar(): Observable<ModeloPedido[]> {
    return this.api.get<ModeloPedido[]>('/contador/modelos-pedido');
  }

  criar(request: ModeloPedidoRequest): Observable<ModeloPedido> {
    return this.api.post<ModeloPedido>('/contador/modelos-pedido', request);
  }

  atualizar(id: string, request: ModeloPedidoRequest): Observable<ModeloPedido> {
    return this.api.put<ModeloPedido>(`/contador/modelos-pedido/${id}`, request);
  }

  /** `DELETE` — aqui **apaga de verdade** (204), ao contrário do catálogo de obrigações. */
  apagar(id: string): Observable<void> {
    return this.api.delete<void>(`/contador/modelos-pedido/${id}`);
  }
}

/**
 * A data-limite de um pedido feito hoje com este prazo, em `AAAA-MM-DD` — "hoje" no fuso de
 * **Brasília**, como o contrato pede. Com `toISOString()` um pedido feito às 22h já sairia com a
 * data de amanhã (UTC), e o prazo ganharia um dia que o contador não deu.
 */
export function dataLimiteDoModelo(prazoEmDias: number | null, agora = new Date()): string {
  if (!prazoEmDias) return '';
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora);
  const [ano, mes, dia] = hoje.split('-').map(Number);
  const limite = new Date(Date.UTC(ano ?? 0, (mes ?? 1) - 1, (dia ?? 1) + prazoEmDias));
  return limite.toISOString().slice(0, 10);
}
