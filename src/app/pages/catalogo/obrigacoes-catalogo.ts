import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import type { Observable } from 'rxjs';
import { falhaDaApi } from '@core/utils/erro-api';
import { EscritorioApi } from '@services/escritorio/data-access/escritorio.service';
import {
  ORIGEM_CATALOGO_LABEL,
  ObrigacoesApi,
  type ObrigacaoCatalogo,
} from '@services/contador/data-access/obrigacoes.service';
import { UiButton } from '@shared/ui/ui-button';
import { UiEmptyState } from '@shared/ui/ui-empty-state';
import { UiSkeleton } from '@shared/ui/ui-skeleton';
import { FormularioObrigacao } from './formulario-obrigacao';

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

/** O que cada botão de uma linha está fazendo — para o giro aparecer no botão **certo**. */
type AcaoEmCurso = { id: string; acao: 'calendario' | 'padrao' } | null;

/**
 * O catálogo de obrigações do escritório (backend#181), na aba **Modelos e obrigações** (#185).
 *
 * Morou em Configurações, entre o tema e a senha, e estava pela metade: só listava, tirava do
 * calendário e devolvia. Criar e editar dependiam de formulário que não existia — e a tela dizia
 * isso ao contador citando `POST` e `PUT /api/contador/obrigacoes`, que não é texto para ele ler.
 *
 * ## Quem altera
 *
 * **Todo membro lê; só o administrador altera.** Os botões de escrita saem de quem não é
 * `ADMINISTRADOR` (o `minhaFuncao` do `GET /api/escritorio`), com uma linha dizendo isso — antes
 * eles apareciam para todos, e o assistente clicava para levar 403. Na dúvida (o escritório não
 * carregou), ninguém vê botão: mostrar um que falha ensina a desconfiar do sistema. O 403 continua
 * tratado, porque a função pode mudar com a tela aberta.
 *
 * ## O item muda de id
 *
 * `DELETE` não apaga — tira do calendário, e a obrigação volta com `ativa: false`. E mexer num
 * **modelo do sistema** (tirar, editar) faz o servidor criar a versão do escritório, com **id
 * novo**. Por isso toda ação troca o item pelo que voltou, em vez de mudar um booleano local.
 */
@Component({
  selector: 'app-obrigacoes-catalogo',
  standalone: true,
  imports: [FormularioObrigacao, UiButton, UiEmptyState, UiSkeleton],
  templateUrl: './obrigacoes-catalogo.html',
})
export class ObrigacoesCatalogo implements OnInit {
  private readonly api = inject(ObrigacoesApi);
  private readonly escritorioApi = inject(EscritorioApi);

  private readonly obrigacoes = signal<ObrigacaoCatalogo[]>([]);
  readonly carregando = signal(true);
  /** A lista não veio. Diferente de `erroDaAcao`, que é de um clique e não esconde a lista. */
  readonly falhaAoCarregar = signal('');
  readonly erroDaAcao = signal('');
  readonly emCurso = signal<AcaoEmCurso>(null);
  /** Só o administrador vê os botões de escrita. Começa em `false`: na dúvida, sem botão. */
  readonly administrador = signal(false);

  /** `undefined` = fechado; `null` = criando; uma obrigação = editando. */
  readonly formulario = signal<ObrigacaoCatalogo | null | undefined>(undefined);

  readonly rotuloDaOrigem = ORIGEM_CATALOGO_LABEL;

  /** O que está no calendário dos clientes hoje. */
  readonly ativas = computed(() => this.obrigacoes().filter((o) => o.ativa));
  /** O que o escritório tirou — continua aqui porque pode voltar. */
  readonly foraDoCalendario = computed(() => this.obrigacoes().filter((o) => !o.ativa));

  ngOnInit(): void {
    this.carregar();
    this.escritorioApi.ehAdministrador().subscribe((sim) => this.administrador.set(sim));
  }

  carregar(): void {
    this.carregando.set(true);
    this.falhaAoCarregar.set('');
    this.api.catalogo().subscribe({
      next: (lista) => {
        this.obrigacoes.set(lista);
        this.carregando.set(false);
      },
      error: (erro: HttpErrorResponse) => {
        this.carregando.set(false);
        this.falhaAoCarregar.set(falhaDaApi(erro).mensagem);
      },
    });
  }

  /** Tira do calendário ou devolve a ele (ver o comentário da classe sobre o id novo). */
  alternarNoCalendario(obrigacao: ObrigacaoCatalogo): void {
    const chamada = obrigacao.ativa
      ? this.api.desativar(obrigacao.id)
      : this.api.reativar(obrigacao.id);
    this.aplicar(obrigacao, 'calendario', chamada);
  }

  /** Joga fora a versão do escritório e volta ao modelo do sistema. */
  restaurarPadrao(obrigacao: ObrigacaoCatalogo): void {
    this.aplicar(obrigacao, 'padrao', this.api.restaurarPadrao(obrigacao.id));
  }

  /** Só a versão do escritório tem padrão para onde voltar. */
  podeRestaurar(obrigacao: ObrigacaoCatalogo): boolean {
    return obrigacao.origemCatalogo === 'PERSONALIZADA';
  }

  ocupado(obrigacao: ObrigacaoCatalogo, acao: 'calendario' | 'padrao'): boolean {
    const atual = this.emCurso();
    return atual?.id === obrigacao.id && atual.acao === acao;
  }

  /** O formulário salvou: a criada entra na lista, a editada troca de lugar com a antiga. */
  aoSalvar(salva: ObrigacaoCatalogo): void {
    const editada = this.formulario();
    this.obrigacoes.update((lista) =>
      editada ? lista.map((o) => (o.id === editada.id ? salva : o)) : [...lista, salva],
    );
    this.formulario.set(undefined);
  }

  private aplicar(
    obrigacao: ObrigacaoCatalogo,
    acao: 'calendario' | 'padrao',
    chamada: Observable<ObrigacaoCatalogo>,
  ): void {
    this.erroDaAcao.set('');
    this.emCurso.set({ id: obrigacao.id, acao });
    chamada.subscribe({
      next: (atualizada) => {
        this.emCurso.set(null);
        this.obrigacoes.update((lista) =>
          lista.map((o) => (o.id === obrigacao.id ? atualizada : o)),
        );
      },
      error: (erro: HttpErrorResponse) => {
        this.emCurso.set(null);
        // O 403 ganha frase própria: dizer "erro" ali faria a pessoa achar que o sistema
        // quebrou, quando ele apenas disse não.
        this.erroDaAcao.set(
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
      { MENSAL: 'todo mês', ANUAL: 'uma vez por ano' }[obrigacao.periodicidade] ??
      obrigacao.periodicidade.toLowerCase();

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
}
