import { Injectable, computed, inject, signal } from '@angular/core';
import type { Notificacao } from '@models/notificacao.model';
import { PerfilService } from './perfil.service';
import { AlertasApi, type AlertaTributario } from '@services/alertas/data-access/alertas.service';
import { CarteiraApi } from '@services/contador/data-access/carteira.service';
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
  private readonly perfis = inject(PerfilService);
  private readonly alertasApi = inject(AlertasApi);
  private readonly carteiraApi = inject(CarteiraApi);

  private readonly itens = signal<Notificacao[]>([]);
  private readonly lidas = signal<Set<string>>(this.carregarLidas());

  /** O que o sino mostra, com o "lido" aplicado por cima. */
  readonly notificacoes = computed(() =>
    this.itens().map((n) => ({ ...n, lida: this.lidas().has(n.id) })),
  );

  readonly naoLidas = computed(() => this.notificacoes().filter((n) => !n.lida).length);

  /** Busca na fonte do papel atual. */
  carregar(): void {
    if (this.perfis.ehContador()) {
      this.carteiraApi.listar().subscribe({
        next: (pagina) => this.itens.set(pagina.itens.flatMap((c) => this.doCliente(c))),
        error: () => this.itens.set([]),
      });
      return;
    }
    this.alertasApi.listar().subscribe({
      next: (alertas) => this.itens.set(alertas.map((a) => this.doAlerta(a))),
      error: () => this.itens.set([]),
    });
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
