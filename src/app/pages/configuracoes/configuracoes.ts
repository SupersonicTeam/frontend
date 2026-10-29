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
import { PerfilService } from '@core/services/perfil.service';
import { DashboardApi } from '@services/dashboard/data-access/dashboard.service';
import { UiCard } from '@shared/ui/ui-card';
import { UiButton } from '@shared/ui/ui-button';
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
  imports: [UiCard, UiButton, LucideCircleAlert, LucideLock, LucideMoon, LucideSettings, LucideUser],
  templateUrl: './configuracoes.html',
})
export class ConfiguracoesPage implements OnInit {
  readonly themeService = inject(ThemeService);
  readonly perfilService = inject(PerfilService);
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
    if (!this.perfilService.ehContador()) return;
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
  private aplicar(
    obrigacao: ObrigacaoCatalogo,
    chamada: Observable<ObrigacaoCatalogo>,
  ): void {
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
    this.dashboardApi.garantirCarregado().subscribe({ error: () => undefined });
    this.carregarCatalogo();
  }
}
