import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { EquipeEscritorio } from './equipe-escritorio';
import { ToastService } from '@core/services/toast.service';

const membros = [
  { id: 'm1', nomeCompleto: 'Ana Admin', crc: 'PR-1', funcao: 'ADMINISTRADOR' },
  { id: 'm2', nomeCompleto: 'Bia Assistente', crc: null, funcao: 'ASSISTENTE' },
];

/** Escritório e equipe, na aba /equipe (#148, #157): só o administrador gerencia. */
describe('EquipeEscritorio', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [EquipeEscritorio],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  function abrir(funcao: string) {
    const fixture = TestBed.createComponent(EquipeEscritorio);
    fixture.detectChanges();
    httpMock
      .expectOne('/escritorio')
      .flush({ id: 'e1', nome: 'Campo Bom', cnpj: null, minhaFuncao: funcao, membros: 2 });
    httpMock.expectOne('/escritorio/membros').flush(membros);
    if (funcao === 'ADMINISTRADOR') {
      httpMock.expectOne('/escritorio/membros/convites').flush([]);
      httpMock.expectOne('/contador/etiquetas').flush([{ id: 'e1', nome: 'Soja' }]);
    }
    fixture.detectChanges();
    return fixture;
  }

  const el = (f: { nativeElement: unknown }) => f.nativeElement as HTMLElement;

  it('o administrador ve os controles de gestao', () => {
    const f = abrir('ADMINISTRADOR');
    expect(el(f).textContent).toContain('Convidar para a equipe');
    expect(el(f).textContent).toContain('Editar dados');
    expect(el(f).querySelectorAll('select').length).toBeGreaterThan(membros.length - 1);
  });

  it('o assistente so le: nem seletor de funcao, nem convite, nem remover', () => {
    const f = abrir('ASSISTENTE');
    expect(el(f).textContent).toContain('Bia Assistente');
    expect(el(f).textContent).not.toContain('Convidar para a equipe');
    expect(el(f).textContent).not.toContain('Remover');
    expect(el(f).querySelector('select')).toBeNull();
  });

  it('ULTIMO_ADMINISTRADOR tem frase propria e o seletor volta a funcao de antes', () => {
    const erro = vi.spyOn(TestBed.inject(ToastService), 'error');
    const f = abrir('ADMINISTRADOR');
    const seletor = document.createElement('select');
    for (const v of ['ADMINISTRADOR', 'CONTADOR']) {
      const o = document.createElement('option');
      o.value = v;
      seletor.appendChild(o);
    }
    seletor.value = 'CONTADOR';

    f.componentInstance.alterarFuncao(f.componentInstance.membros()[0]!, 'CONTADOR', seletor);
    httpMock
      .expectOne('/escritorio/membros/m1')
      .flush(
        { errors: [{ code: 'ULTIMO_ADMINISTRADOR', message: 'x' }] },
        { status: 409, statusText: 'Conflict' },
      );

    expect(erro).toHaveBeenCalledWith(expect.stringContaining('pelo menos um administrador'));
    expect(seletor.value).toBe('ADMINISTRADOR');
  });

  it('remover tira o membro da lista', () => {
    const f = abrir('ADMINISTRADOR');
    const cmp = f.componentInstance;
    cmp.removendo.set(cmp.membros()[1]!);
    cmp.remover();
    httpMock.expectOne('/escritorio/membros/m2').flush(null);
    expect(cmp.membros().map((m) => m.id)).toEqual(['m1']);
    // A funcao de quem esta aqui pode ter mudado: o escritorio e perguntado de novo.
    httpMock
      .expectOne('/escritorio')
      .flush({ id: 'e1', nome: 'Campo Bom', cnpj: null, minhaFuncao: 'ADMINISTRADOR', membros: 1 });
  });

  it('salvar os dados manda o CNPJ so com digitos', () => {
    const f = abrir('ADMINISTRADOR');
    const cmp = f.componentInstance;
    cmp.abrirEdicao();
    cmp.nome.set('Campo Bom Contabil');
    cmp.cnpj.set('11.222.333/0001-81');
    cmp.salvar();
    const req = httpMock.expectOne('/escritorio');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ nome: 'Campo Bom Contabil', cnpj: '11222333000181' });
    req.flush({
      id: 'e1',
      nome: 'Campo Bom Contabil',
      cnpj: '11222333000181',
      minhaFuncao: 'ADMINISTRADOR',
      membros: 2,
    });
    expect(cmp.editando()).toBe(false);
    f.detectChanges();
    // Grava só dígitos, mostra com máscara: "48315276000195" era o que a Equipe exibia.
    expect(el(f).textContent).toContain('CNPJ 11.222.333/0001-81');
  });

  it('o administrador exclui etiqueta do catalogo', () => {
    const cmp = abrir('ADMINISTRADOR').componentInstance;
    cmp.excluirEtiqueta(cmp.etiquetas()[0]!);
    // O primeiro clique so pede confirmacao.
    httpMock.expectNone('/contador/etiquetas/e1');
    cmp.excluirEtiqueta(cmp.etiquetas()[0]!);
    expect(httpMock.expectOne('/contador/etiquetas/e1').request.method).toBe('DELETE');
  });

  it('apagar o CNPJ com endereço próprio explica que o endereço sai antes (#175)', () => {
    const erro = vi.spyOn(TestBed.inject(ToastService), 'error');
    const cmp = abrir('ADMINISTRADOR').componentInstance;
    cmp.abrirEdicao();
    cmp.cnpj.set('');
    cmp.salvar();
    httpMock
      .expectOne('/escritorio')
      .flush(
        { errors: [{ code: 'ENDERECO_EXIGE_CNPJ', message: 'x' }] },
        { status: 422, statusText: 'Unprocessable' },
      );

    expect(erro).toHaveBeenCalledWith('Remova o endereço do escritório antes de apagar o CNPJ.');
  });

  /**
   * Conta pessoal ou empresarial (#186, backend#523 e #524).
   *
   * O pessoal é de um usuário só: convite de equipe e endereço próprio respondem 409
   * `ESCRITORIO_PESSOAL`. Em vez de mostrar dois formulários que falham, a tela oferece "Tornar
   * empresarial". Telefone e endereço postal valem nos dois tipos, pelo `PATCH`.
   */
  describe('pessoal ou empresarial (#186)', () => {
    const endereco = {
      cep: '85810000',
      logradouro: 'Rua Paraná',
      numero: '1200',
      complemento: 'Sala 3',
      bairro: 'Centro',
      codigoMunicipioIbge: '4104808',
      municipio: 'Cascavel',
      uf: 'PR',
    };

    function abrirCom(escritorio: Record<string, unknown>) {
      const fixture = TestBed.createComponent(EquipeEscritorio);
      fixture.detectChanges();
      const dados = {
        id: 'e1',
        nome: 'Ana Souza',
        cnpj: null,
        minhaFuncao: 'ADMINISTRADOR',
        membros: 1,
        ...escritorio,
      };
      httpMock.expectOne('/escritorio').flush(dados);
      httpMock.expectOne('/escritorio/membros').flush(membros);
      if (dados.minhaFuncao === 'ADMINISTRADOR') {
        httpMock.expectOne('/escritorio/membros/convites').flush([]);
        httpMock.expectOne('/contador/etiquetas').flush([]);
      }
      fixture.detectChanges();
      return fixture;
    }

    it('o pessoal não mostra convite de equipe nem endereço próprio, e oferece virar empresarial', () => {
      const f = abrirCom({ tipo: 'PESSOAL' });

      expect(el(f).textContent).toContain('Conta pessoal');
      expect(el(f).textContent).toContain('Tornar empresarial');
      expect(el(f).textContent).not.toContain('Convidar para a equipe');
      expect(el(f).querySelector('app-endereco-escritorio')).toBeNull();
    });

    it('quem não é administrador vê que a conta é pessoal, sem o botão', () => {
      const f = abrirCom({ tipo: 'PESSOAL', minhaFuncao: 'CONTADOR' });

      expect(el(f).textContent).toContain('O escritório pessoal é de um usuário só');
      expect(el(f).textContent).not.toContain('Tornar empresarial');
    });

    /** Backend antigo não manda o `tipo`: a tela segue como sempre foi, empresarial. */
    it('sem o campo tipo, vale como empresarial', () => {
      const f = abrirCom({ cnpj: '11444777000161' });

      expect(el(f).textContent).toContain('Convidar para a equipe');
      expect(el(f).textContent).not.toContain('Tornar empresarial');
    });

    it('mostra telefone e endereço como se leem', () => {
      const f = abrirCom({ tipo: 'EMPRESARIAL', telefone: '4533330000', endereco });

      expect(el(f).textContent).toContain('Telefone (45) 3333-0000');
      expect(el(f).textContent).toContain(
        'Rua Paraná, 1200, Sala 3 · Centro · Cascavel/PR · 85810-000',
      );
    });

    /** "O que não vem fica como está": telefone vazio e endereço em branco nem viajam. */
    it('salvar sem telefone nem endereço manda só nome e CNPJ', () => {
      const cmp = abrirCom({ tipo: 'EMPRESARIAL', cnpj: '11444777000161' }).componentInstance;
      cmp.abrirEdicao();
      cmp.nome.set('Campo Verde');

      cmp.salvar();

      const req = httpMock.expectOne('/escritorio');
      expect(req.request.body).toEqual({ nome: 'Campo Verde', cnpj: '11444777000161' });
      req.flush({ id: 'e1', nome: 'Campo Verde', minhaFuncao: 'ADMINISTRADOR', membros: 1 });
    });

    it('salvar com telefone e endereço manda os dois sem máscara', () => {
      const cmp = abrirCom({ tipo: 'PESSOAL' }).componentInstance;
      cmp.abrirEdicao();
      cmp.telefone.set('(45) 3333-0000');
      cmp.endereco.set({ ...endereco, cep: '85810-000' });

      cmp.salvar();

      const req = httpMock.expectOne('/escritorio');
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({
        nome: 'Ana Souza',
        cnpj: '',
        telefone: '4533330000',
        endereco,
      });
      req.flush({ id: 'e1', nome: 'Ana Souza', minhaFuncao: 'ADMINISTRADOR', membros: 1 });
    });

    /** O endereço substitui o anterior inteiro: pela metade, ele não vai — nem a requisição. */
    it('endereço pela metade não é enviado, e os campos que faltam são marcados', () => {
      const cmp = abrirCom({ tipo: 'EMPRESARIAL', cnpj: '11444777000161' }).componentInstance;
      cmp.abrirEdicao();
      cmp.endereco.set({ ...endereco, cep: '858', codigoMunicipioIbge: '' });

      cmp.salvar();

      httpMock.expectNone((r) => r.method === 'PATCH');
      expect(cmp.errosDoEnderecoEditado()['cep']).toContain('8 dígitos');
      expect(cmp.errosDoEnderecoEditado()['codigoMunicipioIbge']).toContain('7 dígitos');
    });

    it('trocar o CNPJ de um escritório verificado avisa antes de salvar', () => {
      const f = abrirCom({
        tipo: 'EMPRESARIAL',
        cnpj: '11444777000161',
        escritorioVerificado: true,
      });
      const cmp = f.componentInstance;
      cmp.abrirEdicao();
      expect(cmp.trocaDeCnpjTiraVerificacao()).toBe(false);

      cmp.cnpj.set('11.222.333/0001-81');
      f.detectChanges();

      expect(cmp.trocaDeCnpjTiraVerificacao()).toBe(true);
      expect(el(f).textContent).toContain('a verificação é desfeita na hora');
    });

    it('trocar só o nome de um verificado não avisa nada', () => {
      const cmp = abrirCom({
        tipo: 'EMPRESARIAL',
        cnpj: '11444777000161',
        escritorioVerificado: true,
      }).componentInstance;
      cmp.abrirEdicao();
      cmp.nome.set('Outro nome');

      expect(cmp.trocaDeCnpjTiraVerificacao()).toBe(false);
    });

    it('apagar o CNPJ de um empresarial tem frase própria', () => {
      const cmp = abrirCom({ tipo: 'EMPRESARIAL', cnpj: '11444777000161' }).componentInstance;
      const erros: string[] = [];
      vi.spyOn(TestBed.inject(ToastService), 'error').mockImplementation((m) => void erros.push(m));
      cmp.abrirEdicao();
      cmp.cnpj.set('');

      cmp.salvar();
      httpMock
        .expectOne('/escritorio')
        .flush(
          { errors: [{ code: 'ESCRITORIO_EMPRESARIAL_EXIGE_CNPJ', field: 'cnpj', message: 'x' }] },
          { status: 422, statusText: 'Unprocessable Entity' },
        );

      expect(erros[0]).toContain('precisa de CNPJ');
    });

    describe('tornar empresarial', () => {
      function preencher(cmp: EquipeEscritorio) {
        cmp.abrirTornarEmpresarial();
        cmp.empNome.set('  Contabilidade Campo Verde ');
        cmp.empDocumento.valor.set('11.444.777/0001-61');
        cmp.empTelefone.set('(45) 3333-0000');
        cmp.empEndereco.set({ ...endereco, cep: '85810-000' });
      }

      it('o formulário nasce com o que o escritório pessoal já tem', () => {
        const cmp = abrirCom({
          tipo: 'PESSOAL',
          telefone: '45999990000',
          endereco,
        }).componentInstance;

        cmp.abrirTornarEmpresarial();

        expect(cmp.empNome()).toBe('Ana Souza');
        expect(cmp.empTelefone()).toBe('(45) 99999-0000');
        expect(cmp.empEndereco().municipio).toBe('Cascavel');
      });

      it('manda tudo sem máscara e a tela passa a ser a do empresarial', () => {
        const f = abrirCom({ tipo: 'PESSOAL' });
        const cmp = f.componentInstance;
        preencher(cmp);

        cmp.tornarEmpresarial();

        const req = httpMock.expectOne('/escritorio/tornar-empresarial');
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toEqual({
          nome: 'Contabilidade Campo Verde',
          cnpj: '11444777000161',
          telefone: '4533330000',
          endereco,
        });
        req.flush({
          id: 'e1',
          nome: 'Contabilidade Campo Verde',
          cnpj: '11444777000161',
          tipo: 'EMPRESARIAL',
          telefone: '4533330000',
          endereco,
          slug: null,
          minhaFuncao: 'ADMINISTRADOR',
          membros: 1,
        });
        httpMock.expectOne('/escritorio/membros/convites').flush([]);
        f.detectChanges();

        expect(cmp.tornando()).toBe(false);
        expect(cmp.pessoal()).toBe(false);
        expect(el(f).textContent).toContain('Convidar para a equipe');
      });

      it('CNPJ, telefone e endereço errados não chegam ao servidor', () => {
        const cmp = abrirCom({ tipo: 'PESSOAL' }).componentInstance;
        preencher(cmp);
        cmp.empDocumento.valor.set('11.444.777/0001-00');
        cmp.empTelefone.set('(45) 333');
        cmp.empEndereco.set({ ...endereco, cep: '1' });

        cmp.tornarEmpresarial();

        httpMock.expectNone('/escritorio/tornar-empresarial');
        expect(cmp.empErros()['cnpj']).toContain('14 dígitos');
        expect(cmp.empErros()['telefone']).toContain('10 ou 11');
        expect(cmp.empErrosDoEndereco()['cep']).toContain('8 dígitos');
      });

      /** O IBGE de outro estado só o servidor sabe: o erro dele cai no campo certo. */
      it('os erros do servidor caem cada um no seu campo', () => {
        const cmp = abrirCom({ tipo: 'PESSOAL' }).componentInstance;
        preencher(cmp);

        cmp.tornarEmpresarial();
        httpMock.expectOne('/escritorio/tornar-empresarial').flush(
          {
            errors: [
              {
                code: 'VALIDATION_ERROR',
                field: 'endereco.codigoMunicipioIbge',
                message: 'O município não é do estado informado.',
              },
              { code: 'VALIDATION_ERROR', field: 'nome', message: 'Informe o nome do escritório.' },
            ],
          },
          { status: 400, statusText: 'Bad Request' },
        );

        expect(cmp.empErrosDoEndereco()['codigoMunicipioIbge']).toContain('não é do estado');
        expect(cmp.empErros()['nome']).toBe('Informe o nome do escritório.');
        expect(cmp.tornando()).toBe(true);
      });

      /** Outra aba já tornou: a tela daqui estava velha. Fecha e recarrega em vez de insistir. */
      it('já empresarial fecha o formulário e pergunta o escritório de novo', () => {
        const cmp = abrirCom({ tipo: 'PESSOAL' }).componentInstance;
        vi.spyOn(TestBed.inject(ToastService), 'error').mockImplementation(() => undefined);
        preencher(cmp);

        cmp.tornarEmpresarial();
        httpMock
          .expectOne('/escritorio/tornar-empresarial')
          .flush(
            { errors: [{ code: 'ESCRITORIO_JA_EMPRESARIAL', message: 'Já é.' }] },
            { status: 409, statusText: 'Conflict' },
          );

        expect(cmp.tornando()).toBe(false);
        httpMock
          .expectOne('/escritorio')
          .flush({
            id: 'e1',
            nome: 'X',
            tipo: 'EMPRESARIAL',
            minhaFuncao: 'ADMINISTRADOR',
            membros: 1,
          });
        expect(cmp.pessoal()).toBe(false);
      });
    });
  });
});
