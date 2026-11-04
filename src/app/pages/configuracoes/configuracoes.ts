import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import type { Observable } from 'rxjs';
import {
  LucideCircleAlert,
  LucideLock,
  LucideMoon,
  LucideSettings,
  LucideUser,
} from '@lucide/angular';
import { ThemeService } from '@core/services/theme.service';
import { SessaoService } from '@core/services/sessao.service';
import { DashboardApi } from '@services/dashboard/data-access/dashboard.service';
import { UiCard } from '@shared/ui/ui-card';
import { FormsModule } from '@angular/forms';
import { UiButton } from '@shared/ui/ui-button';
import { EncerramentoService } from '@core/services/encerramento.service';
import { ToastService } from '@core/services/toast.service';
import { AuthApi, ContaError } from '@services/auth/data-access/auth.service';
import {
  ObrigacoesApi,
  type ObrigacaoCatalogo,
} from '@services/contador/data-access/obrigacoes.service';

/** Para o rótulo "31 de maio" de uma obrigação anual. */
const MESES_POR_EXTENSO = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

/**
 * Configurações — reescrita para mostrar só o que existe de verdade.
 *
 * A versão anterior era quase toda encenação:
 *
 * - **Perfil** exibia "João Silva / joao.silva@fazenda.com" cravado no código,
 *   enquanto o produtor real é "João da Silva Produtor" e vem da API. O botão
 *   "Salvar alterações" era um `setTimeout` de 1,2 s que acendia "Salvo!" sem
 *   chamar endpoint nenhum — e não há endpoint: o backend não tem
 *   `ProdutorController`.
 * - **Segurança** trazia um formulário completo de troca de senha (senha atual,
 *   nova, confirmar) num sistema que **não tem senha**. O botão "Atualizar
 *   senha" nem handler tinha: era um botão que não fazia nada.
 *
 * Agora os dados do produtor vêm do `GET /api/dashboard` e são apresentados
 * como leitura, com a razão de não serem editáveis dita na tela. O tema, que
 * é a única coisa que sempre funcionou aqui, continua igual.
 */
@Component({
  selector: 'app-configuracoes',
  standalone: true,
  imports: [
    UiCard,
    UiButton,
    FormsModule,
    LucideCircleAlert,
    LucideLock,
    LucideMoon,
    LucideSettings,
    LucideUser,
  ],
  templateUrl: './configuracoes.html',
})
export class ConfiguracoesPage implements OnInit {
  readonly themeService = inject(ThemeService);
  readonly sessao = inject(SessaoService);
  private readonly dashboardApi = inject(DashboardApi);

  /** Produtor real, do backend. Antes era um nome inventado no código. */
  readonly produtor = computed(() => this.dashboardApi.dashboard()?.produtor ?? null);

  readonly nome = computed(() => this.produtor()?.nome ?? (this.sessao.nome() || 'Produtor'));

  readonly inicial = computed(() => this.nome().trim().charAt(0).toUpperCase() || '?');

  /** `PESSOA_FISICA` é como o banco fala; aqui vira o que o produtor reconhece. */
  readonly tipoProdutor = computed(() => {
    const tipo = this.produtor()?.tipoProdutor;
    if (!tipo) return 'Produtor rural';
    return tipo === 'PESSOA_FISICA'
      ? 'Produtor rural (pessoa física)'
      : 'Produtor rural (pessoa jurídica)';
  });

  // ── Catálogo de obrigações do escritório (backend#181) ──

  private readonly obrigacoesApi = inject(ObrigacoesApi);

  private readonly obrigacoes = signal<ObrigacaoCatalogo[]>([]);
  readonly carregandoCatalogo = signal(false);
  readonly erroDoCatalogo = signal('');
  readonly mexendoEm = signal<string | null>(null);

  /** O que está no calendário dos clientes hoje. */
  readonly obrigacoesAtivas = computed(() => this.obrigacoes().filter((o) => o.ativa));

  /** O que o escritório tirou — continua aqui porque pode voltar. */
  readonly obrigacoesForaDoCalendario = computed(() => this.obrigacoes().filter((o) => !o.ativa));

  /** Busca o catálogo. Só o contador: é coisa do escritório, não do produtor. */
  private carregarCatalogo(): void {
    if (!this.sessao.ehContador()) return;
    this.carregandoCatalogo.set(true);
    this.obrigacoesApi.catalogo().subscribe({
      next: (lista) => {
        this.obrigacoes.set(lista);
        this.carregandoCatalogo.set(false);
      },
      error: () => {
        this.carregandoCatalogo.set(false);
        this.erroDoCatalogo.set('Não foi possível carregar o catálogo de obrigações.');
      },
    });
  }

  /**
   * Tira do calendário ou devolve a ele.
   *
   * **`DELETE` não apaga** — a obrigação volta com `ativa: false` e pode ser reativada. E num
   * modelo do sistema o servidor devolve **a versão do escritório, com id novo**: por isso a lista
   * troca o item pelo que voltou, em vez de virar um booleano local.
   */
  alternarNoCalendario(obrigacao: ObrigacaoCatalogo): void {
    const chamada = obrigacao.ativa
      ? this.obrigacoesApi.desativar(obrigacao.id)
      : this.obrigacoesApi.reativar(obrigacao.id);

    this.aplicar(obrigacao, chamada);
  }

  /** Joga fora a versão do escritório e volta ao modelo do sistema. */
  restaurarPadrao(obrigacao: ObrigacaoCatalogo): void {
    this.aplicar(obrigacao, this.obrigacoesApi.restaurarPadrao(obrigacao.id));
  }

  /** Só a versão do escritório tem padrão para onde voltar. */
  podeRestaurar(obrigacao: ObrigacaoCatalogo): boolean {
    return obrigacao.origemCatalogo === 'PERSONALIZADA';
  }

  /**
   * Executa e substitui o item pelo que o servidor devolveu.
   *
   * O **403** ganha mensagem própria: qualquer membro lê o catálogo, mas só o administrador o
   * altera. Dizer "erro" ali faria o assistente achar que o sistema quebrou, quando o sistema
   * apenas disse não.
   */
  private aplicar(obrigacao: ObrigacaoCatalogo, chamada: Observable<ObrigacaoCatalogo>): void {
    this.erroDoCatalogo.set('');
    this.mexendoEm.set(obrigacao.id);
    chamada.subscribe({
      next: (atualizada) => {
        this.mexendoEm.set(null);
        this.obrigacoes.update((lista) =>
          lista.map((o) => (o.id === obrigacao.id ? atualizada : o)),
        );
      },
      error: (erro: HttpErrorResponse) => {
        this.mexendoEm.set(null);
        this.erroDoCatalogo.set(
          erro.status === 403
            ? 'Só o administrador do escritório pode mudar o catálogo de obrigações.'
            : 'Não foi possível mudar esta obrigação. Tente de novo.',
        );
      },
    });
  }

  /** "todo mês, dia 20" · "uma vez por ano, 31 de maio". O backend fala em caixa alta. */
  quandoVence(obrigacao: ObrigacaoCatalogo): string {
    const cada =
      {
        MENSAL: 'todo mês',
        BIMESTRAL: 'a cada dois meses',
        TRIMESTRAL: 'a cada três meses',
        SEMESTRAL: 'a cada seis meses',
        ANUAL: 'uma vez por ano',
      }[obrigacao.periodicidade] ?? obrigacao.periodicidade.toLowerCase();

    if (obrigacao.mes) {
      const nome = MESES_POR_EXTENSO[obrigacao.mes - 1] ?? '';
      return `${cada}, ${obrigacao.dia} de ${nome}`;
    }
    return `${cada}, dia ${obrigacao.dia}`;
  }

  /** A quem a obrigação se aplica, em português. Vazio quando vale para todos. */
  aQuemSeAplica(obrigacao: ObrigacaoCatalogo): string {
    const partes: string[] = [];
    if (obrigacao.tipoProdutor === 'PESSOA_FISICA') partes.push('pessoa física');
    if (obrigacao.tipoProdutor === 'PESSOA_JURIDICA') partes.push('pessoa jurídica');
    if (obrigacao.regimes.length) partes.push(obrigacao.regimes.join(', ').toLowerCase());
    return partes.join(' · ');
  }

  ngOnInit(): void {
    // O service decide se precisa buscar, e nao sobrescreve painel pedido com periodo (#114).
    // So para produtor: `/api/dashboard` e do produtor do token e responde 403 ao contador (#136),
    // que nao tem cadastro de produtor para mostrar aqui.
    if (this.sessao.ehProdutor()) {
      this.dashboardApi.garantirCarregado().subscribe({ error: () => undefined });
    }
    this.carregarCatalogo();
  }

  // ── Acesso: trocar a senha e sair de todos (#131) ─────────────────────────

  private readonly authApi = inject(AuthApi);
  private readonly toastService = inject(ToastService);
  private readonly encerramento = inject(EncerramentoService);

  readonly senhaAtual = signal('');
  readonly novaSenha = signal('');
  readonly trocandoSenha = signal(false);
  readonly saindoDeTodos = signal(false);
  readonly erroAcesso = signal<string | null>(null);
  readonly erroSenhaAtual = signal<string | null>(null);
  readonly erroSenhaNova = signal<string | null>(null);

  readonly podeTrocarSenha = computed(
    () => !this.trocandoSenha() && this.senhaAtual().length > 0 && this.novaSenha().length > 0,
  );

  /**
   * Troca a senha.
   *
   * O 204 encerra **todas** as sessões, **inclusive esta** — o backend invalida os tokens já
   * emitidos. Por isso o sucesso passa pelo `EncerramentoService`: seguir na tela com um token que
   * o servidor acabou de matar daria 401 na próxima chamada, sem a pessoa entender por quê.
   */
  trocarSenha(): void {
    if (!this.podeTrocarSenha()) return;

    this.trocandoSenha.set(true);
    this.erroAcesso.set(null);
    this.erroSenhaAtual.set(null);
    this.erroSenhaNova.set(null);

    this.authApi.alterarSenha(this.senhaAtual(), this.novaSenha()).subscribe({
      next: () => {
        this.trocandoSenha.set(false);
        this.toastService.success('Senha alterada. Entre de novo com a senha nova.');
        this.encerramento.encerrar();
      },
      error: (falha: ContaError) => {
        this.trocandoSenha.set(false);
        if (falha?.codigo === 'SENHA_ATUAL_INCORRETA' || falha?.campo === 'senhaAtual') {
          this.erroSenhaAtual.set(falha.message);
          return;
        }
        if (falha?.codigo === 'SENHA_FRACA' || falha?.campo === 'senha') {
          this.erroSenhaNova.set(falha.message);
          return;
        }
        this.erroAcesso.set(falha?.message || 'Não foi possível trocar a senha.');
      },
    });
  }

  /** Mesma consequência da troca de senha: a sessão desta aba cai junto, e é esse o pedido. */
  sairDeTodos(): void {
    if (this.saindoDeTodos()) return;

    this.saindoDeTodos.set(true);
    this.erroAcesso.set(null);

    this.authApi.sairDeTodosOsDispositivos().subscribe({
      next: () => {
        this.saindoDeTodos.set(false);
        this.toastService.success('Todas as sessões foram encerradas.');
        this.encerramento.encerrar();
      },
      error: (falha: ContaError) => {
        this.saindoDeTodos.set(false);
        this.erroAcesso.set(falha?.message || 'Não foi possível encerrar as sessões.');
      },
    });
  }
}
