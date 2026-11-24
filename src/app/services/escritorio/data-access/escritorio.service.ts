import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, shareReplay, tap } from 'rxjs';
import { skipErrorNotify } from '@core/interceptors/error-notify.context';
import type { EnderecoEscritorioRequest } from '@services/auth/data-access/auth.service';

/** Conta pessoal (um usuário só) ou empresarial (CNPJ, equipe e endereço próprio), #186. */
export type TipoEscritorio = 'PESSOAL' | 'EMPRESARIAL';

/** O endereço postal do escritório, como o servidor o devolve — o mesmo formato do envio. */
export type EnderecoEscritorio = EnderecoEscritorioRequest;

/** Corpo do `POST /api/escritorio/tornar-empresarial`: tudo obrigatório. */
export interface TornarEmpresarialRequest {
  nome: string;
  /** 14 dígitos com DV válido, sem máscara. */
  cnpj: string;
  /** Só dígitos, 10 ou 11. */
  telefone: string;
  endereco: EnderecoEscritorio;
}

/**
 * Corpo do `PATCH /api/escritorio`. **O que não vem fica como está** (backend#524): mandar só o
 * `nome` e o `cnpj` não apaga telefone nem endereço. O `endereco`, quando vem, substitui o
 * endereço inteiro — um `complemento` que não vier sai.
 */
export interface AtualizarEscritorioRequest {
  nome: string;
  /** `''` apaga — só no pessoal. No empresarial é 422 `ESCRITORIO_EMPRESARIAL_EXIGE_CNPJ`. */
  cnpj?: string;
  /** Só dígitos, 10 ou 11. Vazio ou ausente mantém o atual: não se apaga por aqui. */
  telefone?: string;
  endereco?: EnderecoEscritorio;
}

/**
 * Onde a página `/equipe/convite` guarda o token durante a ida ao login (#148). Mora aqui, e não na
 * página, para o `EncerramentoService` apagá-lo no Sair sem puxar a página para o bundle inicial.
 */
export const CHAVE_TOKEN_CONVITE_EQUIPE = 'agrocontabil.convite-equipe';

/** Função de um membro no escritório (backend#228). */
export type FuncaoEscritorio = 'ADMINISTRADOR' | 'CONTADOR' | 'ASSISTENTE';

/** Rótulo de cada função, na ordem em que aparecem nos seletores. */
export const FUNCOES_ESCRITORIO: readonly { valor: FuncaoEscritorio; rotulo: string }[] = [
  { valor: 'ADMINISTRADOR', rotulo: 'Administrador' },
  { valor: 'CONTADOR', rotulo: 'Contador' },
  { valor: 'ASSISTENTE', rotulo: 'Assistente' },
];

/** `GET /api/escritorio` — o escritório de quem pergunta, com a função dele. */
export interface Escritorio {
  id: string;
  nome: string;
  cnpj: string | null;
  minhaFuncao: FuncaoEscritorio;
  membros: number;
  /**
   * O endereço próprio, `{slug}.{base}` (#175, backend#464); `null` sem endereço. Qualquer membro
   * vê. Os links saem do `slug` pelo `urlDoHost`, nunca do `enderecoHost`.
   */
  slug?: string | null;
  /** Vem no contrato, mas a tela não usa: o host se monta a partir do `slug`. */
  enderecoHost?: string | null;
  /** Até quando a troca do endereço está bloqueada (30 dias depois da última); `null` = liberada. */
  enderecoAlteravelEm?: string | null;
  /**
   * `PESSOAL` ou `EMPRESARIAL` (#186, backend#523). O pessoal é de um usuário só: não convida
   * equipe nem tem endereço próprio (409 `ESCRITORIO_PESSOAL`), e pode virar empresarial.
   * Escritório antigo com CNPJ ou com equipe vem como `EMPRESARIAL`. Ausente num backend antigo:
   * a tela trata como empresarial, que é como tudo funcionava antes.
   */
  tipo?: TipoEscritorio;
  /** Só dígitos, ou `null`. Os escritórios antigos vêm sem. */
  telefone?: string | null;
  endereco?: EnderecoEscritorio | null;
  /**
   * A GWNext conferiu a titularidade do CNPJ, fora do sistema (backend#520). Enquanto for `false`,
   * o endereço próprio fica **reservado mas fora do ar**. Trocar o CNPJ tira a verificação na
   * hora; trocar o nome, não.
   */
  escritorioVerificado?: boolean;
}

/** Um membro da equipe (`GET /api/escritorio/membros`). */
export interface MembroEscritorio {
  id: string;
  nomeCompleto: string;
  crc: string | null;
  funcao: FuncaoEscritorio;
}

/** Um convite de equipe que ainda espera resposta (`GET /api/escritorio/membros/convites`). */
export interface ConviteDeEquipe {
  id: string;
  email: string;
  funcao: FuncaoEscritorio;
  criadoEm?: string;
  expiraEm?: string;
}

/**
 * O escritório do contador autenticado e a equipe dele (backend#228, issue #148).
 *
 * O token só diz `CONTADOR`; a **função** dentro do escritório (administrador, contador ou
 * assistente) vem daqui, em `minhaFuncao`. É ela que decide os botões: reabrir apuração
 * (administrador e contador), convidar cliente, mexer no vínculo e gerenciar a equipe (só
 * administrador). O servidor responde 403 a quem não pode; a tela não oferece o botão.
 *
 * **O escritório fica em cache** durante a sessão: a ficha, o Fechamento e o Acompanhamento
 * perguntavam a função cada um por si. O cache é limpo no Sair (`EncerramentoService`), ao editar
 * o escritório e ao entrar noutra equipe — e uma falha **não** fica guardada.
 */
@Injectable({ providedIn: 'root' })
export class EscritorioApi {
  private readonly http = inject(HttpClient);
  private escritorio$: Observable<Escritorio> | null = null;

  /** Sem toast global: quem chama decide o que uma falha significa (ver `podeReabrirApuracao`). */
  meuEscritorio(): Observable<Escritorio> {
    if (!this.escritorio$) {
      this.escritorio$ = this.http
        .get<Escritorio>('/escritorio', { context: skipErrorNotify() })
        .pipe(
          catchError((erro: unknown) => {
            this.escritorio$ = null;
            throw erro;
          }),
          shareReplay({ bufferSize: 1, refCount: false }),
        );
    }
    return this.escritorio$;
  }

  /** Esquece o escritório guardado (Sair, troca de equipe). */
  limpar(): void {
    this.escritorio$ = null;
  }

  /**
   * Quem convida cliente, mexe no vínculo e gerencia a equipe: só o administrador. As outras
   * funções recebem 403; na dúvida, `false`, pela mesma razão do reabrir.
   */
  ehAdministrador(): Observable<boolean> {
    return this.meuEscritorio().pipe(
      map((e) => e.minhaFuncao === 'ADMINISTRADOR'),
      catchError(() => of(false)),
    );
  }

  /**
   * Quem pode reabrir apuração: administrador e contador.
   *
   * Na dúvida (a rota falhou), **não**: esconder um botão que funcionaria custa um clique em outra
   * tela; mostrar um que dá 403 ensina a desconfiar do sistema. O servidor continua sendo quem
   * decide de verdade.
   */
  podeReabrirApuracao(): Observable<boolean> {
    return this.meuEscritorio().pipe(
      map((e) => e.minhaFuncao === 'ADMINISTRADOR' || e.minhaFuncao === 'CONTADOR'),
      catchError(() => of(false)),
    );
  }

  /**
   * `PATCH /api/escritorio` — nome (até 255), CNPJ, telefone e endereço postal. Só administrador.
   * **O que não vem fica como está** (ver `AtualizarEscritorioRequest`). Erros: 422
   * `ESCRITORIO_EMPRESARIAL_EXIGE_CNPJ` (apagar o CNPJ do empresarial) e `ENDERECO_EXIGE_CNPJ`.
   */
  atualizar(dados: AtualizarEscritorioRequest): Observable<Escritorio> {
    return this.http
      .patch<Escritorio>('/escritorio', dados)
      .pipe(tap((novo) => (this.escritorio$ = of(novo))));
  }

  /**
   * `POST /api/escritorio/tornar-empresarial` — o escritório pessoal vira empresarial (#186,
   * backend#524). Só administrador; todos os campos obrigatórios. Devolve o escritório com
   * `tipo: 'EMPRESARIAL'` e `slug` nulo: o endereço próprio é escolhido depois, pelo
   * `definirEndereco`. Já empresarial → 409 `ESCRITORIO_JA_EMPRESARIAL`. Voltar a pessoal não existe.
   */
  tornarEmpresarial(dados: TornarEmpresarialRequest): Observable<Escritorio> {
    return this.http
      .post<Escritorio>('/escritorio/tornar-empresarial', dados)
      .pipe(tap((novo) => (this.escritorio$ = of(novo))));
  }

  /**
   * `PUT /api/escritorio/endereco` — define ou troca o endereço próprio (#175). Só administrador,
   * só com CNPJ. A ciência da exposição pública é a caixa que a tela exige marcar. Erros:
   * 400 `SLUG_INVALIDO`, 409 `SLUG_INDISPONIVEL` e `ENDERECO_TROCA_RECENTE` (com `expectedValue`),
   * 422 `ENDERECO_EXIGE_CNPJ`. O escritório devolvido vai para o cache, como no `atualizar()`.
   */
  definirEndereco(slug: string): Observable<Escritorio> {
    return this.http
      .put<Escritorio>('/escritorio/endereco', { slug, cienteExposicaoPublica: true })
      .pipe(tap((novo) => (this.escritorio$ = of(novo))));
  }

  /**
   * `DELETE /api/escritorio/endereco` — 204. O endereço sai do ar na hora, fica 90 dias em carência
   * e a remoção conta como alteração (o `enderecoAlteravelEm` muda): o cache é esquecido.
   */
  removerEndereco(): Observable<void> {
    return this.http.delete<void>('/escritorio/endereco').pipe(tap(() => this.limpar()));
  }

  /** `GET /api/escritorio/membros` — a equipe. */
  membros(): Observable<MembroEscritorio[]> {
    return this.http.get<MembroEscritorio[]>('/escritorio/membros');
  }

  /**
   * `PATCH /api/escritorio/membros/{id}` — troca a função. Rebaixar o último administrador →
   * 409 `ULTIMO_ADMINISTRADOR`.
   */
  alterarFuncao(membroId: string, funcao: FuncaoEscritorio): Observable<MembroEscritorio> {
    return this.http.patch<MembroEscritorio>(`/escritorio/membros/${membroId}`, { funcao });
  }

  /** `DELETE /api/escritorio/membros/{id}` — remove da equipe; o último administrador não sai (409). */
  removerMembro(membroId: string): Observable<void> {
    return this.http.delete<void>(`/escritorio/membros/${membroId}`);
  }

  /**
   * `POST /api/escritorio/membros/convites` — convida alguém para a equipe. Responde **202 sempre**,
   * para não revelar quem tem conta; o e-mail leva um link com o token no fragmento.
   */
  convidarMembro(email: string, funcao: FuncaoEscritorio): Observable<void> {
    return this.http.post<void>('/escritorio/membros/convites', { email: email.trim(), funcao });
  }

  /** `GET /api/escritorio/membros/convites` — os convites de equipe pendentes. */
  convitesDeEquipe(): Observable<ConviteDeEquipe[]> {
    return this.http.get<ConviteDeEquipe[]>('/escritorio/membros/convites');
  }

  /**
   * `POST /api/escritorio/membros/convites/aceitar` — entra na equipe com a conta logada (o e-mail
   * tem de ser o do convite). Token inválido, usado ou vencido → 400 `CONVITE_EQUIPE_INVALIDO`;
   * escritório atual com clientes ou equipe → 409 `ESCRITORIO_ATUAL_EM_USO`.
   */
  aceitarConvite(token: string): Observable<MembroEscritorio> {
    return this.http
      .post<MembroEscritorio>('/escritorio/membros/convites/aceitar', { token })
      .pipe(tap(() => this.limpar()));
  }
}
