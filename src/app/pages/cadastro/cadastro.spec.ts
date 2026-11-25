import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { SessaoService } from '@core/services/sessao.service';
import { CadastroPage } from './cadastro';

/**
 * Criar conta (#131).
 *
 * Até esta tela, conta só nascia por `curl`: o login da #93 deixava entrar quem já tinha uma, e
 * mais ninguém. Com o basic auth do Caddy removido, é por aqui que chega quem não tem conta.
 */
describe('CadastroPage', () => {
  let httpMock: HttpTestingController;
  let sessao: SessaoService;
  let navegouPara: string[];

  /** Monta a tela com o `returnUrl` que o login teria repassado (#182). */
  function montar(returnUrl?: string) {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [CadastroPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParamMap: convertToParamMap(returnUrl ? { returnUrl } : {}) },
          },
        },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    sessao = TestBed.inject(SessaoService);

    navegouPara = [];
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockImplementation((d) => {
      navegouPara.push(String(d));
      return Promise.resolve(true);
    });
    // A ida ao login leva query params desde a #182, entao e `navigate`, nao `navigateByUrl`.
    vi.spyOn(router, 'navigate').mockImplementation((comandos, extras) => {
      navegouPara.push(router.createUrlTree(comandos, extras).toString());
      return Promise.resolve(true);
    });

    const fixture = TestBed.createComponent(CadastroPage);
    fixture.detectChanges();
    // Guardado para os poucos testes que olham o HTML; quase todos querem só o componente.
    ultimaTela = fixture.nativeElement as HTMLElement;
    return fixture.componentInstance;
  }

  /** O HTML da última tela montada. */
  let ultimaTela: HTMLElement;

  /** Preenche tudo com dados válidos, deixando a senha por conta do teste. */
  function preencher(cmp: CadastroPage, senha = 'UmaSenhaBoa2026!') {
    cmp.nome.set('Maria Agricultora');
    cmp.cpfCnpj.set('529.982.247-25');
    cmp.email.set('maria@exemplo.com.br');
    cmp.senha.set(senha);
    // Sem o aceite dos termos não há conta nenhuma desde a #186.
    cmp.aceiteTermos.set(true);
  }

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  /**
   * O documento (#156). Antes o campo ficava vermelho enquanto se digitava (6 dígitos já
   * acusavam "faltam dígitos") e um CPF com dígito verificador errado passava, para o servidor
   * recusar com a frase sem acento no topo.
   */
  describe('o documento', () => {
    it('não acusa nada enquanto a pessoa ainda está digitando', () => {
      const cmp = montar();
      cmp.cpfCnpj.set('123.456');

      expect(cmp.erroDocumento()).toBeNull();
    });

    /**
     * Achado do review da #156: sair do campo vazio contava como "tocado", e daí em diante a frase
     * vermelha voltava a cada tecla quando a pessoa voltava para digitar.
     */
    it('sair do campo vazio não faz a frase aparecer na volta', () => {
      const cmp = montar();
      cmp.documento.sair();
      cmp.cpfCnpj.set('123');

      expect(cmp.erroDocumento()).toBeNull();
    });

    it.each([
      ['123.456', 'Digite um CPF (11 dígitos) ou um CNPJ (14 dígitos).'],
      ['123.456.789-00', 'CPF/CNPJ inválido. Confira os dígitos.'],
      ['11.222.333/0001-80', 'CPF/CNPJ inválido. Confira os dígitos.'],
    ])('depois de sair do campo, %s diz o que está errado', (valor, frase) => {
      const cmp = montar();
      cmp.cpfCnpj.set(valor);
      cmp.documento.sair();

      expect(cmp.erroDocumento()).toBe(frase);
    });

    it.each(['529.982.247-25', '11.222.333/0001-81'])('%s passa', (valor) => {
      const cmp = montar();
      cmp.cpfCnpj.set(valor);
      cmp.documento.sair();

      expect(cmp.erroDocumento()).toBeNull();
    });

    it('CPF com dígito errado não vai ao servidor: o campo é marcado', () => {
      const cmp = montar();
      preencher(cmp);
      cmp.cpfCnpj.set('123.456.789-00');

      cmp.criar();

      httpMock.expectNone('/auth/cadastro');
      expect(cmp.enviando()).toBe(false);
      expect(cmp.erroDocumento()).toBe('CPF/CNPJ inválido. Confira os dígitos.');
    });
  });

  it('o botão libera com tudo preenchido; o documento é conferido ao enviar', () => {
    const cmp = montar();
    expect(cmp.podeEnviar()).toBe(false);

    preencher(cmp);
    expect(cmp.podeEnviar()).toBe(true);

    // Um botão desligado não diria o que está errado: quem diz é o campo, no envio.
    cmp.cpfCnpj.set('529');
    expect(cmp.podeEnviar()).toBe(true);

    cmp.cpfCnpj.set('');
    expect(cmp.podeEnviar()).toBe(false);
  });

  /**
   * A força da senha **não** é checada aqui de propósito: quem conhece a lista de senhas comuns, e
   * sabe se ela contém o e-mail ou o documento, é o servidor. Duas verdades sobre a mesma regra
   * seria uma a mais, e a do cliente envelheceria primeiro.
   */
  it('senha curta não é barrada no cliente — quem decide é o servidor', () => {
    const cmp = montar();
    preencher(cmp, 'abc');

    expect(cmp.podeEnviar()).toBe(true);
  });

  it('criando a conta, vai para o login — o cadastro não devolve token', () => {
    const cmp = montar();
    preencher(cmp);

    cmp.criar();
    expect(cmp.enviando()).toBe(true);

    httpMock.expectOne('/auth/cadastro').flush(null, { status: 201, statusText: 'Created' });

    expect(cmp.enviando()).toBe(false);
    expect(sessao.logado()).toBe(false);
    expect(navegouPara).toEqual(['/login']);
  });

  /**
   * O caminho de quem chega por um convite **sem ter conta** (#182): login → "Criar conta" →
   * cadastro → login → o convite. O destino morria aqui, e a pessoa caía no painel; o e-mail do
   * backend ainda manda abrir "Escritório" no menu, mas quem não lê o e-mail inteiro se perde.
   *
   * Esta tela **nunca navega para o `returnUrl`** — ela só o carrega adiante. Quem valida que o
   * caminho é interno é o login, no único ponto em que ele vira navegação.
   */
  describe('o destino pedido atravessa o cadastro (#182)', () => {
    it('depois de criar a conta, o login recebe o mesmo returnUrl', () => {
      const cmp = montar('/equipe/convite');
      preencher(cmp);

      cmp.criar();
      httpMock.expectOne('/auth/cadastro').flush(null, { status: 201, statusText: 'Created' });

      expect(navegouPara).toEqual(['/login?returnUrl=%2Fequipe%2Fconvite']);
    });

    it('sem returnUrl, vai para o login limpo, como antes', () => {
      const cmp = montar();
      preencher(cmp);

      cmp.criar();
      httpMock.expectOne('/auth/cadastro').flush(null, { status: 201, statusText: 'Created' });

      expect(navegouPara).toEqual(['/login']);
      expect(cmp.paramsDeRetorno).toEqual({});
    });

    it('o link "Entrar" leva o mesmo destino', () => {
      const cmp = montar('/escritorio');

      expect(cmp.paramsDeRetorno).toEqual({ returnUrl: '/escritorio' });
    });

    /**
     * Repassar não é validar: um `returnUrl` externo continua chegando ao login, que o recusa.
     * A checagem mora num lugar só — duas cópias dela seria a forma de uma ficar para trás.
     */
    it('não julga o valor: um returnUrl externo segue para o login decidir', () => {
      const cmp = montar('//site.externo/phishing');

      expect(cmp.paramsDeRetorno).toEqual({ returnUrl: '//site.externo/phishing' });
    });
  });

  describe('os erros caem onde a pessoa pode agir', () => {
    function falhar(cmp: CadastroPage, code: string, status: number, field?: string, msg = 'erro') {
      cmp.criar();
      httpMock
        .expectOne('/auth/cadastro')
        .flush({ errors: [{ code, field, message: msg }] }, { status, statusText: 'erro' });
    }

    it('SENHA_FRACA aparece no campo da senha, com o texto do servidor', () => {
      const cmp = montar();
      preencher(cmp);

      falhar(cmp, 'SENHA_FRACA', 400, 'senha', 'A senha precisa ter pelo menos 10 caracteres.');

      expect(cmp.erroSenha()).toBe('A senha precisa ter pelo menos 10 caracteres.');
      expect(cmp.erro()).toBeNull();
    });

    /**
     * O conflito **não diz qual** dos dois repetiu — responder "este e-mail já existe" contaria a
     * um estranho quem tem conta aqui. A tela também não tenta adivinhar.
     */
    it('CADASTRO_CONFLITO vira erro geral, sem apontar e-mail nem documento', () => {
      const cmp = montar();
      preencher(cmp);

      falhar(cmp, 'CADASTRO_CONFLITO', 409, undefined, 'Nao foi possivel concluir o cadastro.');

      expect(cmp.erro()).toBe('Nao foi possivel concluir o cadastro.');
      expect(cmp.erro()).not.toMatch(/e-?mail|CPF|CNPJ/i);
      expect(cmp.erroSenha()).toBeNull();
    });

    it('documento recusado pelo servidor marca o campo, não o topo', () => {
      const cmp = montar();
      preencher(cmp);

      falhar(
        cmp,
        'VALIDATION_ERROR',
        400,
        'cpfCnpj',
        'CPF/CNPJ informado tem digito verificador invalido',
      );

      expect(cmp.erro()).toBeNull();
      expect(cmp.erroDocumento()).toBe('CPF/CNPJ inválido. Confira os dígitos.');

      // Mexer no campo tira a frase do servidor, que falava do valor anterior.
      const campo = document.createElement('input');
      campo.value = '52998224725';
      cmp.documento.digitar({ target: campo } as unknown as Event);
      expect(cmp.erroDocumento()).toBeNull();
    });

    it('reenviar tira a frase de documento da tentativa anterior', () => {
      const cmp = montar();
      preencher(cmp);
      falhar(cmp, 'VALIDATION_ERROR', 400, 'cpfCnpj');
      expect(cmp.erroDocumento()).toBeTruthy();

      cmp.criar();
      expect(cmp.erroDocumento()).toBeNull();
      httpMock
        .expectOne('/auth/cadastro')
        .flush(
          { errors: [{ code: 'MUITAS_TENTATIVAS', message: 'x' }] },
          { status: 429, statusText: 'Too Many Requests' },
        );

      expect(cmp.erro()).toContain('Muitas tentativas');
      expect(cmp.erroDocumento()).toBeNull();
    });

    it('o 429 diz quando tentar de novo', () => {
      const cmp = montar();
      preencher(cmp);

      cmp.criar();
      httpMock
        .expectOne('/auth/cadastro')
        .flush(
          { errors: [{ code: 'MUITAS_TENTATIVAS', message: 'Muitas tentativas.' }] },
          { status: 429, statusText: 'Too Many Requests', headers: { 'Retry-After': '120' } },
        );

      expect(cmp.erro()).toContain('2 min');
    });

    it('uma nova tentativa limpa os erros anteriores', () => {
      const cmp = montar();
      preencher(cmp);
      falhar(cmp, 'SENHA_FRACA', 400, 'senha');
      expect(cmp.erroSenha()).toBeTruthy();

      cmp.criar();
      expect(cmp.erroSenha()).toBeNull();
      httpMock.expectOne('/auth/cadastro').flush(null, { status: 201, statusText: 'Created' });
    });

    it('falhando, não navega nem abre sessão', () => {
      const cmp = montar();
      preencher(cmp);

      falhar(cmp, 'CADASTRO_CONFLITO', 409);

      expect(navegouPara).toEqual([]);
      expect(sessao.logado()).toBe(false);
    });
  });

  /**
   * Conta pessoal ou empresarial do contador, e o aceite dos termos (#186, backend#523).
   *
   * O que estes testes protegem é o **corpo** que sai daqui: o backend recusa `crc`, `tipoConta` e
   * `escritorio` no produtor, recusa `escritorio` sem `tipoConta: EMPRESARIAL`, e exige só dígitos
   * em CNPJ, telefone e CEP. Cada um desses enganos vira um 400 que a pessoa não causou.
   */
  describe('conta pessoal ou empresarial (#186)', () => {
    /** Preenche o escritório inteiro com dados válidos. */
    function preencherEscritorio(cmp: CadastroPage) {
      cmp.papel.set('CONTADOR');
      cmp.cpfCnpj.set('529.982.247-25');
      cmp.tipoConta.set('EMPRESARIAL');
      cmp.escNome.set('  Contabilidade Campo Verde ');
      cmp.escDocumento.valor.set('11.444.777/0001-61');
      cmp.escTelefone.set('(45) 3333-0000');
      cmp.escCep.set('85810-000');
      cmp.escLogradouro.set('Rua Paraná');
      cmp.escNumero.set('1200');
      cmp.escComplemento.set('Sala 3');
      cmp.escBairro.set('Centro');
      cmp.escMunicipio.set('Cascavel');
      cmp.escIbge.set('4104808');
      cmp.escUf.set('PR');
      cmp.escSlug.set('  CampoVerde ');
      cmp.escCiente.set(true);
    }

    it('o aceite liga para os Termos de uso e para a Política, em aba nova (#211)', () => {
      montar();
      const links = [...ultimaTela.querySelectorAll('a')];
      const termos = links.find((a) => a.textContent?.trim() === 'Termos de uso');
      const politica = links.find((a) => a.textContent?.trim() === 'Política de privacidade');

      // Até a #211 a caixa pedia aceite de um texto que não estava em lugar nenhum.
      expect(termos?.getAttribute('href')).toBe('/termos-de-uso');
      expect(politica?.getAttribute('href')).toBe('/politica-dados');
      // Aba nova: ler os termos não pode custar o formulário já preenchido.
      for (const link of [termos, politica]) {
        expect(link?.getAttribute('target')).toBe('_blank');
        expect(link?.getAttribute('rel')).toBe('noopener');
      }
    });

    it('sem o aceite dos termos o botão não libera', () => {
      const cmp = montar();
      preencher(cmp);
      expect(cmp.podeEnviar()).toBe(true);

      cmp.aceiteTermos.set(false);
      expect(cmp.podeEnviar()).toBe(false);
    });

    it('no produtor, o corpo não leva tipoConta, crc nem escritório', () => {
      const cmp = montar();
      preencher(cmp);

      cmp.criar();
      const corpo = httpMock.expectOne('/auth/cadastro').request.body as Record<string, unknown>;

      expect(corpo['papel']).toBe('PRODUTOR');
      expect(corpo['aceiteTermos']).toBe(true);
      expect('tipoConta' in corpo).toBe(false);
      expect('crc' in corpo).toBe(false);
      expect('escritorio' in corpo).toBe(false);
      httpMock.expectNone('/auth/cadastro');
    });

    it('contador pessoal manda tipoConta, o CRC e o telefone só com dígitos', () => {
      const cmp = montar();
      preencher(cmp);
      cmp.papel.set('CONTADOR');
      cmp.crc.set(' PR-012345/O ');
      cmp.telefone.set('(45) 99999-0000');

      cmp.criar();
      const corpo = httpMock.expectOne('/auth/cadastro').request.body as Record<string, unknown>;

      expect(corpo['tipoConta']).toBe('PESSOAL');
      expect(corpo['crc']).toBe('PR-012345/O');
      expect(corpo['telefone']).toBe('45999990000');
      expect('escritorio' in corpo).toBe(false);
    });

    /** O documento do contador é o da pessoa: o CNPJ do escritório tem campo próprio. */
    it('contador com CNPJ no documento é barrado antes de sair', () => {
      const cmp = montar();
      preencher(cmp);
      cmp.papel.set('CONTADOR');
      cmp.cpfCnpj.set('11.444.777/0001-61');

      cmp.criar();

      httpMock.expectNone('/auth/cadastro');
      expect(cmp.erroDocumento()).toContain('Informe o seu CPF');
    });

    it('conta empresarial manda o escritório inteiro, sem máscara e com o slug normalizado', () => {
      const cmp = montar();
      preencher(cmp);
      preencherEscritorio(cmp);

      cmp.criar();
      const corpo = httpMock.expectOne('/auth/cadastro').request.body as Record<string, unknown>;

      expect(corpo['tipoConta']).toBe('EMPRESARIAL');
      expect(corpo['escritorio']).toEqual({
        nome: 'Contabilidade Campo Verde',
        cnpj: '11444777000161',
        telefone: '4533330000',
        endereco: {
          cep: '85810000',
          logradouro: 'Rua Paraná',
          numero: '1200',
          complemento: 'Sala 3',
          bairro: 'Centro',
          codigoMunicipioIbge: '4104808',
          municipio: 'Cascavel',
          uf: 'PR',
        },
        slug: 'campoverde',
        cienteExposicaoPublica: true,
      });
      // O telefone da pessoa não vai junto: na empresarial o que vale é o do escritório.
      expect('telefone' in corpo).toBe(false);
    });

    it('complemento vazio não vira campo vazio no corpo', () => {
      const cmp = montar();
      preencher(cmp);
      preencherEscritorio(cmp);
      cmp.escComplemento.set('   ');

      cmp.criar();
      const corpo = httpMock.expectOne('/auth/cadastro').request.body as {
        escritorio: { endereco: Record<string, unknown> };
      };

      expect('complemento' in corpo.escritorio.endereco).toBe(false);
    });

    it('o botão só libera com o escritório inteiro e a ciência marcada', () => {
      const cmp = montar();
      preencher(cmp);
      preencherEscritorio(cmp);
      expect(cmp.podeEnviar()).toBe(true);

      cmp.escCiente.set(false);
      expect(cmp.podeEnviar()).toBe(false);
      cmp.escCiente.set(true);
      cmp.escIbge.set('');
      expect(cmp.podeEnviar()).toBe(false);
    });

    it('a prévia do endereço sai do slug digitado, já normalizado', () => {
      const cmp = montar();
      cmp.escSlug.set(' CampoVerde ');

      expect(cmp.previaDoEndereco()).toContain('campoverde.');
      expect(cmp.erroDoSlug()).toBeNull();

      cmp.escSlug.set('campo_verde');
      expect(cmp.previaDoEndereco()).toBeNull();
      expect(cmp.erroDoSlug()).toContain('letras minúsculas');
    });

    it('CNPJ, telefone, CEP e IBGE errados são recusados antes de ir ao servidor', () => {
      const cmp = montar();
      preencher(cmp);
      preencherEscritorio(cmp);
      cmp.escDocumento.valor.set('11.444.777/0001-00');
      cmp.escTelefone.set('(45) 333');
      cmp.escCep.set('858');
      cmp.escIbge.set('410');

      cmp.criar();

      httpMock.expectNone('/auth/cadastro');
      expect(cmp.erroEm('escritorio.cnpj')).toContain('14 dígitos');
      expect(cmp.erroEm('escritorio.telefone')).toContain('10 ou 11');
      expect(cmp.erroEm('escritorio.endereco.cep')).toContain('8 dígitos');
      expect(cmp.erroEm('escritorio.endereco.codigoMunicipioIbge')).toContain('7 dígitos');
    });

    /**
     * O backend manda **todos** os campos recusados de uma vez. Mostrar só o primeiro faria a
     * pessoa corrigir um campo por tentativa num formulário de 14.
     */
    it('os erros do servidor caem cada um no seu campo, todos de uma vez', () => {
      const cmp = montar();
      preencher(cmp);
      preencherEscritorio(cmp);

      cmp.criar();
      httpMock.expectOne('/auth/cadastro').flush(
        {
          errors: [
            { code: 'VALIDATION_ERROR', field: 'escritorio.nome', message: 'Informe o nome.' },
            {
              code: 'VALIDATION_ERROR',
              field: 'escritorio.endereco.codigoMunicipioIbge',
              message: 'O município não é do estado informado.',
            },
            { code: 'VALIDATION_ERROR', field: 'crc', message: 'CRC muito longo.' },
          ],
        },
        { status: 400, statusText: 'Bad Request' },
      );

      expect(cmp.erroEm('escritorio.nome')).toBe('Informe o nome.');
      expect(cmp.erroEm('escritorio.endereco.codigoMunicipioIbge')).toContain('não é do estado');
      expect(cmp.erroEm('crc')).toBe('CRC muito longo.');
    });

    it('slug em uso aparece sob o campo do endereço, sem dizer por quê', () => {
      const cmp = montar();
      preencher(cmp);
      preencherEscritorio(cmp);

      cmp.criar();
      httpMock
        .expectOne('/auth/cadastro')
        .flush(
          { errors: [{ code: 'SLUG_INDISPONIVEL', message: 'Em uso.' }] },
          { status: 409, statusText: 'Conflict' },
        );

      expect(cmp.erroEm('escritorio.slug')).toBe(
        'Este endereço não está disponível. Escolha outro.',
      );
      expect(cmp.erro()).toBeNull();
    });
  });
});
