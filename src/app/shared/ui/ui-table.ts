import { Component, computed, input } from '@angular/core';

/**
 * Moldura de tabela (#45) — a casca, não a tabela.
 *
 * Deliberadamente **não** é uma tabela genérica com colunas configuráveis: as
 * telas têm células muito diferentes (badge de status, valor em reais, ações), e
 * essa abstração vira configuração difícil de ler. Aqui resolvemos só o que toda
 * tabela do sistema repete e hoje ninguém faz igual:
 *
 * - rolagem horizontal **na moldura**, não na página (hoje o `<main>` usa
 *   `overflow-x-hidden`, que esconde o estouro em vez de resolver);
 * - cabeçalho fixo ao rolar listas longas — o contador vive nisso;
 * - densidade por contexto: `confortavel` no celular do produtor, `compacto` no
 *   desktop do contador.
 *
 * O `<table>` vai por projeção; o espaçamento das células vem das classes
 * `.ui-table-*` definidas no `styles.css`, que alcançam o conteúdo projetado.
 */
@Component({
  selector: 'ui-table',
  standalone: true,
  template: `
    <div [class]="classesMoldura()" [attr.aria-busy]="carregando() ? 'true' : null">
      <ng-content />
    </div>
  `,
})
export class UiTable {
  /** Densidade de desktop (contador), em vez do respiro do celular (produtor). */
  readonly compacto = input(false);
  readonly cabecalhoFixo = input(false);
  readonly carregando = input(false);

  protected readonly classesMoldura = computed(() =>
    [
      'w-full overflow-x-auto rounded-card border border-border bg-card shadow-suave',
      this.compacto() ? 'ui-table-compacta' : 'ui-table-confortavel',
      this.cabecalhoFixo() ? 'max-h-[70vh] overflow-y-auto ui-table-fixa' : '',
    ]
      .filter(Boolean)
      .join(' '),
  );
}
