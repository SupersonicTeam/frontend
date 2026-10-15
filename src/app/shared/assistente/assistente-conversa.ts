import {
  Component,
  ElementRef,
  booleanAttribute,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { LucideCircleStop, LucideSend, LucideTriangleAlert, LucideUser } from '@lucide/angular';
import { RouterLink } from '@angular/router';
import { rotuloRota } from '@core/utils/ceres';
import type { AssistenteMensagem } from '@models/assistente-mensagem.model';
import { UiButton } from '@shared/ui/ui-button';
import { AssistenteStore } from './assistente.store';
import { CeresAvatar } from './ceres-avatar';
import { CeresCitacoes } from './ceres-citacoes';
import { CeresFontes } from './ceres-fontes';

/**
 * A conversa em si — mensagens, base legal, origem dos números, sugestões e campo
 * de escrita.
 *
 * É o **mesmo componente** usado na página `/chat` e na gaveta flutuante, lendo o
 * mesmo `AssistenteStore`. Duas telas mostrando a mesma conversa, não duas
 * conversas parecidas.
 *
 * O texto da resposta é renderizado por **interpolação** com `whitespace-pre-line`
 * — nunca `[innerHTML]`. Ele vem de um modelo de linguagem, e o contrato é
 * explícito: texto puro, nunca HTML.
 */
@Component({
  selector: 'app-assistente-conversa',
  standalone: true,
  imports: [
    RouterLink,
    CeresAvatar,
    CeresCitacoes,
    CeresFontes,
    LucideCircleStop,
    LucideSend,
    LucideTriangleAlert,
    LucideUser,
    UiButton,
  ],
  host: { class: 'flex min-h-0 flex-1 flex-col gap-3' },
  templateUrl: './assistente-conversa.html',
})
export class AssistenteConversa {
  protected readonly store = inject(AssistenteStore);

  /**
   * Quanto da cota ainda resta, de 0 a 1 -- e o quanto do anel fica aceso.
   *
   * Cota zerada no servidor devolve 0 creditos na semana; dividir por ela daria `NaN` e o anel
   * sumiria em vez de aparecer vazio, que e justamente o estado que importa mostrar.
   */
  protected fracaoDaCota(uso: { restantes: number; creditosSemana: number }): number {
    if (!uso.creditosSemana) return 0;
    return Math.max(0, Math.min(1, uso.restantes / uso.creditosSemana));
  }

  /**
   * A cor do anel: so muda quando a informacao muda de natureza.
   *
   * Acima de 20% e um dado neutro, e pintar de verde faria o olho conferir o saldo a cada
   * pergunta sem necessidade. Abaixo de 20% vira aviso, e abaixo de 5%, urgencia -- ai sim a cor
   * esta dizendo algo que o numero sozinho demoraria a dizer.
   */
  protected corDaCota(uso: { restantes: number; creditosSemana: number }): string {
    const fracao = this.fracaoDaCota(uso);
    if (fracao <= 0.05) return 'text-perigo';
    if (fracao <= 0.2) return 'text-aviso';
    return 'text-assistente';
  }

  /** Na gaveta o espaço é curto: a saudação some e as sugestões ficam em uma linha. */
  readonly compacto = input(false, { transform: booleanAttribute });

  private readonly fim = viewChild<ElementRef<HTMLDivElement>>('fimDaConversa');

  /** O contador de caracteres só aparece quando a pergunta chega perto do limite. */
  protected readonly limiarDoContador = Math.round(this.store.limiteDeCaracteres * 0.8);

  constructor() {
    // Rola ao fim a cada mensagem nova, inclusive quando ela chega enquanto a
    // gaveta estava fechada.
    effect(() => {
      const total = this.store.mensagens().length;
      const aguardando = this.store.enviando();
      if (total === 0 && !aguardando) return;
      setTimeout(() => {
        try {
          this.fim()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'end' });
        } catch {
          /* rolagem é conveniência, não pode quebrar a tela */
        }
      }, 0);
    });
  }

  aoTeclar(evento: KeyboardEvent): void {
    if (evento.key === 'Enter' && !evento.shiftKey) {
      evento.preventDefault();
      this.store.enviar();
    }
  }

  /** `DADOS` → "das suas notas". `FORA_DE_ESCOPO` não ganha selo. */
  protected selo(msg: AssistenteMensagem): string | null {
    return msg.rota ? rotuloRota(msg.rota) : null;
  }

  /**
   * Título da falha, escolhido pelo **código** do backend — nunca pelo texto, que
   * muda. Cada caso diz o que de fato aconteceu: "modelo fora do ar" não é a mesma
   * coisa que "servidor fora do ar", e o produtor precisa saber a diferença para
   * decidir se tenta de novo ou se é hora de chamar alguém.
   */
  protected tituloDaFalha(falha: NonNullable<AssistenteMensagem['falha']>): string {
    const titulos: Record<string, string> = {
      ASSISTENTE_INDISPONIVEL: 'A Ceres está indisponível agora',
      ASSISTENTE_TEMPO_ESGOTADO: 'A Ceres demorou demais',
      ASSISTENTE_OCUPADO: 'A Ceres está ocupada',
      PAPEL_NAO_AUTORIZADO: 'A Ceres atende o produtor',
      NAO_AUTENTICADO: 'Sessão não reconhecida',
      VALIDATION_ERROR: 'A pergunta não foi aceita',
      PAYLOAD_TOO_LARGE: 'A pergunta é grande demais',
      SEM_CONEXAO: 'Sem conexão com o servidor',
      INTERNAL_ERROR: 'Falha no servidor',
      DESCONHECIDO: 'Não foi possível falar com a Ceres',
    };
    return titulos[falha] ?? 'Não foi possível falar com a Ceres';
  }

  /**
   * O que fazer a respeito. Nos casos que o contrato nomeia, a explicação é nossa
   * (mais útil que o texto genérico do envelope); nos demais, mostramos a mensagem
   * do backend, que o contrato garante segura para exibir.
   */
  protected detalheDaFalha(msg: AssistenteMensagem): string {
    switch (msg.falha) {
      case 'ASSISTENTE_INDISPONIVEL':
        return 'O modelo que responde as perguntas está fora do ar. O resto do sistema segue funcionando — isto afeta só a conversa.';
      case 'ASSISTENTE_TEMPO_ESGOTADO':
        return 'Ela passou do tempo máximo de resposta. Tente uma pergunta mais específica.';
      case 'ASSISTENTE_OCUPADO':
        return 'Ela responde uma pergunta por vez. Tente de novo em alguns segundos.';
      case 'PAPEL_NAO_AUTORIZADO':
        return 'Ela responde sobre os dados de um produtor; o perfil de contador não tem acesso a essa conversa.';
      case 'NAO_AUTENTICADO':
        return 'O servidor não reconheceu a identidade enviada. Entre de novo.';
      case 'SEM_CONEXAO':
        return 'Não foi possível alcançar a API. Verifique se o servidor está no ar.';
      default:
        return msg.texto;
    }
  }
}
