import { Injectable, computed, inject, signal } from '@angular/core';
import type { Notificacao } from '@models/notificacao.model';
import { SessaoService } from './sessao.service';
import { AlertasApi, type AlertaTributario } from '@services/alertas/data-access/alertas.service';
import { CarteiraApi } from '@services/contador/data-access/carteira.service';
import { VinculosApi, type ConviteRecebido } from '@services/vinculos/data-access/vinculos.service';
import { catchError, forkJoin, of } from 'rxjs';
import { formatarData } from '@core/utils/periodo';
import type { ProdutorCarteira } from '@models/carteira.model';

/** Chave do que já foi lido. O backend não guarda isso; ver `marcarLida`. */
const CHAVE_LIDAS = 'agrocontabil.notificacoes-lidas';

/**
 * O sino: o que o usuário precisa saber **agora**, de fontes reais (issue #113).
 *
 * Isto era um mock cravado no código — três itens iguais para os dois perfis, com datas de junho
 * de 2025, uma "NF-e 001234" que não existe no banco e o badge "2" sempre aceso. Numa
 * apresentação, um sino que avisa de uma nota inventada é pior do que um sino vazio.
 *
 * Cada papel lê a sua fonte, porque são perguntas diferentes:
 *
 * - **produtor** → `GET /api/alertas` (RN010): guia, fechamento da apuração e fim do prazo de
 *   cancelamento que vencem em menos de 5 dias;
 * - **contador** → o `atencao{}` que a carteira já agrega, por cliente. Ele não chama
 *   `/api/alertas`: a rota deriva o produtor da identidade e responde 403 para contador.
 *
 * **Falha em silêncio, de propósito.** O sino é periférico: um estado de erro ali roubaria a
 * atenção do que a pessoa veio fazer, e a tela que importa já mostra a falha dela.
 */
@Injectable({ providedIn: 'root' })
export class NotificacoesService {
  private readonly sessao = inject(SessaoService);
  private readonly alertasApi = inject(AlertasApi);
  private readonly carteiraApi = inject(CarteiraApi);
  private readonly vinculosApi = inject(VinculosApi);

  private readonly itens = signal<Notificacao[]>([]);
  private readonly lidas = signal<Set<string>>(this.carregarLidas());

  /** O que o sino mostra, com o "lido" aplicado por cima. */
  readonly notificacoes = computed(() =>
    this.itens().map((n) => ({ ...n, lida: this.lidas().has(n.id) })),
  );

  readonly naoLidas = computed(() => this.notificacoes().filter((n) => !n.lida).length);

  /**
   * Esquece o que o sino mostrava.
   *
   * O service e `root` e sobrevive a troca de usuario: sem isto o sino de quem entra mostraria os
   * alertas de quem saiu, carregados da fonte do papel anterior, ate a primeira busca responder.
   * O "lido" (`CHAVE_LIDAS`) **fica**: ele e indexado por id de alerta, nao por usuario, e apagar
   * reacenderia como nao lido o que a pessoa ja tinha visto.
   */
  limpar(): void {
    this.itens.set([]);
  }

  /**
   * Busca na fonte do papel atual.
   *
   * `/api/alertas` só sai com sessão **de produtor**, dito assim e não como "quem não é contador"
   * (#136): sem papel definido não há fonte, e o sino fica vazio em vez de colher um 403.
   */
  carregar(): void {
    if (this.sessao.ehContador()) {
      this.carteiraApi.listar().subscribe({
        next: (pagina) => this.itens.set(pagina.itens.flatMap((c) => this.doCliente(c))),
        error: () => this.itens.set([]),
      });
      return;
    }
    if (!this.sessao.ehProdutor()) {
      this.itens.set([]);
      return;
    }
    // Convite de escritório pendente também é coisa para saber agora (#147): sem ele no sino, o
    // produtor só descobriria o convite se fosse por acaso a Configurações. Cada fonte falha
    // sozinha: alerta que não veio não esconde o convite que veio.
    forkJoin({
      alertas: this.alertasApi.listar().pipe(catchError(() => of([] as AlertaTributario[]))),
      convites: this.vinculosApi.convites().pipe(catchError(() => of([] as ConviteRecebido[]))),
    }).subscribe(({ alertas, convites }) =>
      this.itens.set([
        ...convites.filter((c) => c.situacao === 'PENDENTE').map((c) => this.doConvite(c)),
        ...alertas.map((a) => this.doAlerta(a)),
      ]),
    );
  }

  /**
   * Um convite pendente leva a Configurações, onde se aceita ou recusa — **direto à seção**
   * (`#escritorio`). Sem o fragmento a página abria no topo, e o convite ficava abaixo da dobra
   * (#156).
   */
  private doConvite(convite: ConviteRecebido): Notificacao {
    return {
      id: `convite:${convite.id}`,
      titulo: `${convite.escritorio} convidou você para ser cliente do escritório`,
      tipo: 'Solicitação',
      rota: '/configuracoes#escritorio',
      dataHora: `vale até ${formatarData(convite.expiraEm)}`,
      lida: false,
    };
  }

  /**
   * Um alerta vira uma notificação que **leva para onde se resolve**.
   *
   * Sem a rota certa o sino só assusta: diz que algo vence e deixa a pessoa procurar a tela.
   */
  private doAlerta(alerta: AlertaTributario): Notificacao {
    const porTipo: Record<string, { rota: string; tipo: Notificacao['tipo'] }> = {
      VENCIMENTO_GUIA: { rota: '/calendario', tipo: 'Pagamento' },
      FECHAMENTO_APURACAO: { rota: '/tributario', tipo: 'Documento' },
      PRAZO_CANCELAMENTO: { rota: '/documentos', tipo: 'Documento' },
    };
    const destino = porTipo[alerta.tipo] ?? { rota: '/dashboard', tipo: 'Documento' as const };
    return {
      id: alerta.id,
      titulo: alerta.descricao,
      tipo: destino.tipo,
      rota: destino.rota,
      dataHora: this.quando(alerta.diasRestantes, alerta.dataLimite),
      lida: false,
    };
  }

  /**
   * Os indicadores de um cliente viram uma notificação cada, **nomeando o cliente**.
   *
   * "2 notas com inconsistência" sem dizer de quem não serve a um escritório com carteira: a
   * primeira pergunta dele é sempre "de qual cliente".
   */
  private doCliente(cliente: ProdutorCarteira): Notificacao[] {
    const a = cliente.atencao;
    if (!a) return [];
    const nome = cliente.nomeCompleto;
    const rota = `/contador/${cliente.id}`;
    const linhas: { chave: string; quantos: number; texto: string; tipo: Notificacao['tipo'] }[] = [
      {
        chave: 'inconsistencia',
        quantos: a.notasComInconsistencia,
        texto: 'nota com inconsistência',
        tipo: 'Documento',
      },
      {
        chave: 'aprovacao',
        quantos: a.notasAguardandoAprovacao,
        texto: 'nota esperando a sua aprovação',
        tipo: 'Documento',
      },
      { chave: 'vencidas', quantos: a.guiasVencidas, texto: 'guia vencida', tipo: 'Pagamento' },
      {
        chave: 'proximas',
        quantos: a.vencimentosProximos7Dias,
        texto: 'guia vencendo em 7 dias',
        tipo: 'Pagamento',
      },
      {
        chave: 'documentos',
        quantos: a.pendenciasEnviadas,
        texto: 'documento para conferir',
        tipo: 'Solicitação',
      },
    ];

    return linhas
      .filter((l) => l.quantos > 0)
      .map((l) => ({
        // O id é estável entre recargas — é o que faz o "lido" sobreviver.
        id: `${cliente.id}:${l.chave}`,
        titulo: `${nome}: ${l.quantos} ${l.texto}${l.quantos > 1 ? 's' : ''}`,
        tipo: l.tipo,
        rota,
        dataHora: 'agora',
        lida: false,
      }));
  }

  /** "vence hoje" · "em 3 dias" — a conta que a pessoa faria de cabeça. */
  private quando(diasRestantes: number, dataLimite: string): string {
    if (diasRestantes <= 0) return 'vence hoje';
    if (diasRestantes === 1) return 'vence amanhã';
    return `em ${diasRestantes} dias · ${dataLimite.split('-').reverse().join('/')}`;
  }

  /**
   * Marca como lido.
   *
   * **O backend não guarda "lido"** — nem para alerta, nem para o agregado da carteira. Sem
   * guardar aqui, o badge reacenderia a cada recarga mostrando o mesmo aviso que a pessoa já viu.
   * Se um dia o servidor passar a guardar, isto sai.
   */
  marcarLida(id: string): void {
    this.lidas.update((atuais) => new Set(atuais).add(id));
    this.persistirLidas();
  }

  marcarTodasLidas(): void {
    this.lidas.update((atuais) => {
      const nova = new Set(atuais);
      for (const n of this.itens()) nova.add(n.id);
      return nova;
    });
    this.persistirLidas();
  }

  /** Esvazia o sino nesta sessão. Não apaga nada no servidor: ele não é dono desta lista. */
  limparTodas(): void {
    this.marcarTodasLidas();
    this.itens.set([]);
  }

  private carregarLidas(): Set<string> {
    try {
      const bruto = localStorage.getItem(CHAVE_LIDAS);
      return new Set<string>(bruto ? (JSON.parse(bruto) as string[]) : []);
    } catch {
      // Navegação privada pode recusar: sem memória do que foi lido, tudo volta como novo.
      return new Set<string>();
    }
  }

  private persistirLidas(): void {
    try {
      localStorage.setItem(CHAVE_LIDAS, JSON.stringify([...this.lidas()]));
    } catch {
      // Ver `carregarLidas`.
    }
  }
}
