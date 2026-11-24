import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  PrivacidadeApi,
  type OperadorExterno,
  type PoliticaDados,
} from '@services/privacidade/data-access/privacidade.service';
import { SessaoService } from '@core/services/sessao.service';
import { UiButton } from '@shared/ui/ui-button';
import { UiSkeleton } from '@shared/ui/ui-skeleton';

/** Uma linha do quadro do operador: ou um texto, ou uma lista — nunca os dois. */
export interface LinhaOperador {
  rotulo: string;
  texto?: string;
  itens?: string[];
}

/** O quadro de um operador externo, já na ordem em que o titular o lê. */
export interface QuadroOperador {
  nome: string;
  servico: string;
  linhas: LinhaOperador[];
}

/**
 * `/politica-dados` — a política de tratamento de dados (LGPD art. 9º, #137).
 *
 * Pública, como `/login` e `/cadastro`: fora do `AppLayout` e sem guard, porque quem ainda não tem
 * conta precisa lê-la **antes** de se cadastrar. O texto vem do backend (`GET /api/politica-dados`),
 * que é quem trata os dados e responde por eles — a tela não reescreve nada.
 *
 * ## Os operadores de fora do Brasil (#206)
 *
 * A política `2026-11-17` (backend#586) nomeia a Resend e a Anthropic em `operadoresExternos`. Os
 * mesmos fatos continuam nas seis listas, então **a tela não depende do campo**: sem ele, a seção
 * não aparece e nada se perde. Com ele, o titular lê por operador — e, em especial, **o que não é
 * enviado**, que é o que ele procura e o que nenhuma lista geral responde.
 *
 * Os rótulos são daqui porque o backend manda o campo, não o nome dele na tela; o **conteúdo** de
 * cada linha é sempre o do backend, palavra por palavra.
 */
@Component({
  selector: 'app-politica-dados',
  standalone: true,
  imports: [RouterLink, UiButton, UiSkeleton],
  templateUrl: './politica-dados.html',
})
export class PoliticaDadosPage implements OnInit {
  private readonly api = inject(PrivacidadeApi);
  protected readonly sessao = inject(SessaoService);

  readonly politica = signal<PoliticaDados | null>(null);
  readonly erro = signal(false);

  ngOnInit(): void {
    this.carregar();
  }

  carregar(): void {
    this.erro.set(false);
    this.api.politica().subscribe({
      next: (p) => this.politica.set(p),
      error: () => this.erro.set(true),
    });
  }

  /** As seções da política, na ordem em que o titular as procura. */
  readonly secoes = computed<{ titulo: string; itens: string[] }[]>(() => {
    const p = this.politica();
    if (!p) return [];
    return [
      { titulo: 'Que dados tratamos', itens: p.dadosColetados },
      { titulo: 'Para quê', itens: p.finalidades },
      { titulo: 'Com que base legal', itens: p.basesLegais },
      { titulo: 'Com quem compartilhamos', itens: p.compartilhamento },
      { titulo: 'Por quanto tempo guardamos', itens: p.retencao },
      { titulo: 'Os seus direitos', itens: p.direitos },
    ].filter((s) => s.itens?.length);
  });

  /** Um quadro por operador externo. Vazio quando o backend não manda o campo. */
  readonly operadores = computed<QuadroOperador[]>(() =>
    (this.politica()?.operadoresExternos ?? []).map((o) => ({
      nome: o.nome,
      servico: o.servico,
      linhas: this.linhasDo(o),
    })),
  );

  /** Linha vazia não vira rótulo órfão: o que o backend não mandar simplesmente não aparece. */
  private linhasDo(o: OperadorExterno): LinhaOperador[] {
    const linhas: LinhaOperador[] = [
      { rotulo: 'Para quê', texto: o.finalidade },
      { rotulo: 'Onde os dados ficam', texto: o.localizacao },
      { rotulo: 'O que enviamos', itens: o.dadosEnviados },
      { rotulo: 'O que não enviamos', itens: o.dadosNaoEnviados },
      { rotulo: 'Base da transferência para fora do Brasil', texto: o.baseTransferencia },
      { rotulo: 'Por quanto tempo ele guarda', texto: o.retencao },
      { rotulo: 'Como exercer os seus direitos nele', texto: o.comoExercerDireitos },
    ];
    return linhas.filter((l) => l.texto || l.itens?.length);
  }
}
