import { Component, OnInit, computed, inject, signal } from '@angular/core';
import {
  LucideCircleAlert,
  LucideLock,
  LucideMoon,
  LucideSettings,
  LucideUser,
  LucideUsers,
  LucideListChecks,
  LucideBuilding2,
} from '@lucide/angular';
import { RouterLink } from '@angular/router';
import { ThemeService } from '@core/services/theme.service';
import { SessaoService } from '@core/services/sessao.service';
import { DashboardApi } from '@services/dashboard/data-access/dashboard.service';
import { UiCard } from '@shared/ui/ui-card';
import { FormsModule } from '@angular/forms';
import { UiButton } from '@shared/ui/ui-button';
import { EncerramentoService } from '@core/services/encerramento.service';
import { ToastService } from '@core/services/toast.service';
import { AuthApi, ContaError } from '@services/auth/data-access/auth.service';

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
import { PrivacidadeConta } from './privacidade-conta';

@Component({
  selector: 'app-configuracoes',
  standalone: true,
  imports: [
    RouterLink,
    LucideUsers,
    LucideListChecks,
    PrivacidadeConta,
    LucideBuilding2,
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

  ngOnInit(): void {
    // O service decide se precisa buscar, e nao sobrescreve painel pedido com periodo (#114).
    // So para produtor: `/api/dashboard` e do produtor do token e responde 403 ao contador (#136),
    // que nao tem cadastro de produtor para mostrar aqui.
    if (this.sessao.ehProdutor()) {
      this.dashboardApi.garantirCarregado().subscribe({ error: () => undefined });
    }
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
