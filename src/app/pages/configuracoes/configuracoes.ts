import { Component, OnInit, computed, inject } from '@angular/core';
import {
  LucideCircleAlert,
  LucideLock,
  LucideMoon,
  LucideSettings,
  LucideUser,
} from '@lucide/angular';
import { ThemeService } from '@core/services/theme.service';
import { PerfilService } from '@core/services/perfil.service';
import { DashboardApi } from '@services/dashboard/data-access/dashboard.service';
import { UiCard } from '@shared/ui/ui-card';

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
  imports: [UiCard, LucideCircleAlert, LucideLock, LucideMoon, LucideSettings, LucideUser],
  templateUrl: './configuracoes.html',
})
export class ConfiguracoesPage implements OnInit {
  readonly themeService = inject(ThemeService);
  private readonly perfilService = inject(PerfilService);
  private readonly dashboardApi = inject(DashboardApi);

  /** Produtor real, do backend. Antes era um nome inventado no código. */
  readonly produtor = computed(() => this.dashboardApi.dashboard()?.produtor ?? null);

  readonly nome = computed(
    () => this.produtor()?.nome ?? (this.perfilService.nome() || 'Produtor'),
  );

  readonly inicial = computed(() => this.nome().trim().charAt(0).toUpperCase() || '?');

  /** `PESSOA_FISICA` é como o banco fala; aqui vira o que o produtor reconhece. */
  readonly tipoProdutor = computed(() => {
    const tipo = this.produtor()?.tipoProdutor;
    if (!tipo) return 'Produtor rural';
    return tipo === 'PESSOA_FISICA' ? 'Produtor rural (pessoa física)' : 'Produtor rural (pessoa jurídica)';
  });

  ngOnInit(): void {
    // Cache no signal do service: se o painel já carregou, não repete a chamada.
    if (!this.dashboardApi.dashboard()) {
      this.dashboardApi.carregar().subscribe({ error: () => undefined });
    }
  }
}
