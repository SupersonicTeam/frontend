import { Component, input, model } from '@angular/core';
import { UFS } from '@core/utils/endereco';
import { aplicarMascara, mascaraCep, soDigitos } from '@core/utils/mascaras';
import type { EnderecoEscritorio } from '@services/escritorio/data-access/escritorio.service';

/** O endereço como a pessoa o digita: tudo texto, com a máscara do CEP. */
export interface EnderecoDigitado {
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  codigoMunicipioIbge: string;
  uf: string;
}

export function enderecoVazio(): EnderecoDigitado {
  return {
    cep: '',
    logradouro: '',
    numero: '',
    complemento: '',
    bairro: '',
    municipio: '',
    codigoMunicipioIbge: '',
    uf: '',
  };
}

/** Do servidor para o formulário. `null` (escritório antigo, sem endereço) vira o formulário vazio. */
export function enderecoParaDigitar(e: EnderecoEscritorio | null | undefined): EnderecoDigitado {
  if (!e) return enderecoVazio();
  return {
    cep: mascaraCep(e.cep ?? ''),
    logradouro: e.logradouro ?? '',
    numero: e.numero ?? '',
    complemento: e.complemento ?? '',
    bairro: e.bairro ?? '',
    municipio: e.municipio ?? '',
    codigoMunicipioIbge: e.codigoMunicipioIbge ?? '',
    uf: e.uf ?? '',
  };
}

/** Nada foi digitado: na edição, é o jeito de dizer "não mexi no endereço". */
export function enderecoEmBranco(e: EnderecoDigitado): boolean {
  return Object.values(e).every((v) => v.trim() === '');
}

/**
 * Por que o endereço digitado não pode ir, campo a campo — com as chaves `cep`, `numero`… que quem
 * usa prefixa como o servidor (`endereco.cep` ou `escritorio.endereco.cep`). Vazio = pode ir.
 *
 * Só o que dá para saber aqui: campo obrigatório vazio, CEP com 8 dígitos, IBGE com 7. Que o
 * município é mesmo daquele estado, só o servidor sabe.
 */
export function errosDoEndereco(e: EnderecoDigitado): Record<string, string> {
  const erros: Record<string, string> = {};
  if (soDigitos(e.cep).length !== 8) erros['cep'] = 'O CEP tem 8 dígitos.';
  if (!e.logradouro.trim()) erros['logradouro'] = 'Informe o logradouro.';
  if (!e.numero.trim()) erros['numero'] = 'Informe o número.';
  if (!e.bairro.trim()) erros['bairro'] = 'Informe o bairro.';
  if (!e.municipio.trim()) erros['municipio'] = 'Informe o município.';
  if (soDigitos(e.codigoMunicipioIbge).length !== 7) {
    erros['codigoMunicipioIbge'] = 'O código do IBGE tem 7 dígitos.';
  }
  if (!e.uf) erros['uf'] = 'Escolha a UF.';
  return erros;
}

/** Do formulário para o servidor: só dígitos no CEP e no IBGE, e o complemento vazio não vai. */
export function enderecoParaEnviar(e: EnderecoDigitado): EnderecoEscritorio {
  return {
    cep: soDigitos(e.cep),
    logradouro: e.logradouro.trim(),
    numero: e.numero.trim(),
    ...(e.complemento.trim() ? { complemento: e.complemento.trim() } : {}),
    bairro: e.bairro.trim(),
    codigoMunicipioIbge: soDigitos(e.codigoMunicipioIbge),
    municipio: e.municipio.trim(),
    uf: e.uf.toUpperCase(),
  };
}

/** "Rua Paraná, 1200, Sala 3 · Centro · Cascavel/PR · 85810-000", para ler. */
export function enderecoPorExtenso(e: EnderecoEscritorio): string {
  const rua = [e.logradouro, e.numero, e.complemento].filter(Boolean).join(', ');
  return [rua, e.bairro, `${e.municipio}/${e.uf}`, mascaraCep(e.cep)].filter(Boolean).join(' · ');
}

/**
 * Os campos do endereço postal do escritório (#186): CEP, logradouro, número, complemento, bairro,
 * município, UF e o código do IBGE.
 *
 * Existe como componente porque a aba Equipe o usa em dois lugares — editar os dados e "tornar
 * empresarial" —, e duas cópias de oito campos divergem na primeira correção. O `/cadastro` tem a
 * própria cópia, escrita antes; unificá-la fica para depois do congelamento.
 *
 * **O código do IBGE é digitado**, como no endereço da NF-e: não há consulta de CEP no projeto.
 *
 * O valor é um `model()`: quem usa guarda o endereço num signal e o liga com `[(endereco)]`. Os
 * erros entram prontos, pelas chaves curtas (`cep`, `numero`…).
 */
@Component({
  selector: 'app-endereco-postal',
  standalone: true,
  template: `
    <div class="flex flex-col gap-3">
      <div class="grid gap-3 sm:grid-cols-2">
        <label class="flex flex-col gap-1 text-apoio font-medium text-foreground">
          CEP
          <input
            class="tap-target rounded-controle border bg-background px-3 text-apoio font-normal"
            inputmode="numeric"
            placeholder="85810-000"
            [class.border-border]="!erros()['cep']"
            [class.border-perigo]="erros()['cep']"
            [value]="endereco().cep"
            (input)="mascararCep($event)"
          />
          @if (erros()['cep']; as e) {
            <span class="font-normal text-perigo-ink">{{ e }}</span>
          }
        </label>
        <label class="flex flex-col gap-1 text-apoio font-medium text-foreground">
          Número
          <input
            class="tap-target rounded-controle border bg-background px-3 text-apoio font-normal"
            maxlength="60"
            [class.border-border]="!erros()['numero']"
            [class.border-perigo]="erros()['numero']"
            [value]="endereco().numero"
            (input)="mudar('numero', $event)"
          />
          @if (erros()['numero']; as e) {
            <span class="font-normal text-perigo-ink">{{ e }}</span>
          }
        </label>
      </div>

      <label class="flex flex-col gap-1 text-apoio font-medium text-foreground">
        Logradouro
        <input
          class="tap-target rounded-controle border bg-background px-3 text-apoio font-normal"
          maxlength="60"
          [class.border-border]="!erros()['logradouro']"
          [class.border-perigo]="erros()['logradouro']"
          [value]="endereco().logradouro"
          (input)="mudar('logradouro', $event)"
        />
        @if (erros()['logradouro']; as e) {
          <span class="font-normal text-perigo-ink">{{ e }}</span>
        }
      </label>

      <div class="grid gap-3 sm:grid-cols-2">
        <label class="flex flex-col gap-1 text-apoio font-medium text-foreground">
          Complemento (opcional)
          <input
            class="tap-target rounded-controle border border-border bg-background px-3 text-apoio font-normal"
            maxlength="60"
            [value]="endereco().complemento"
            (input)="mudar('complemento', $event)"
          />
        </label>
        <label class="flex flex-col gap-1 text-apoio font-medium text-foreground">
          Bairro
          <input
            class="tap-target rounded-controle border bg-background px-3 text-apoio font-normal"
            maxlength="60"
            [class.border-border]="!erros()['bairro']"
            [class.border-perigo]="erros()['bairro']"
            [value]="endereco().bairro"
            (input)="mudar('bairro', $event)"
          />
          @if (erros()['bairro']; as e) {
            <span class="font-normal text-perigo-ink">{{ e }}</span>
          }
        </label>
      </div>

      <div class="grid gap-3 sm:grid-cols-[1fr_6rem]">
        <label class="flex flex-col gap-1 text-apoio font-medium text-foreground">
          Município
          <input
            class="tap-target rounded-controle border bg-background px-3 text-apoio font-normal"
            maxlength="60"
            [class.border-border]="!erros()['municipio']"
            [class.border-perigo]="erros()['municipio']"
            [value]="endereco().municipio"
            (input)="mudar('municipio', $event)"
          />
          @if (erros()['municipio']; as e) {
            <span class="font-normal text-perigo-ink">{{ e }}</span>
          }
        </label>
        <label class="flex flex-col gap-1 text-apoio font-medium text-foreground">
          UF
          <select
            class="tap-target rounded-controle border bg-background px-2 text-apoio font-normal"
            [class.border-border]="!erros()['uf']"
            [class.border-perigo]="erros()['uf']"
            (change)="mudar('uf', $event)"
          >
            <option value="" [selected]="!endereco().uf">—</option>
            @for (uf of ufs; track uf) {
              <option [value]="uf" [selected]="uf === endereco().uf">{{ uf }}</option>
            }
          </select>
        </label>
      </div>

      <label class="flex flex-col gap-1 text-apoio font-medium text-foreground">
        Código do município no IBGE
        <input
          class="tap-target rounded-controle border bg-background px-3 text-apoio font-normal"
          inputmode="numeric"
          maxlength="7"
          placeholder="4104808"
          [class.border-border]="!erros()['codigoMunicipioIbge']"
          [class.border-perigo]="erros()['codigoMunicipioIbge']"
          [value]="endereco().codigoMunicipioIbge"
          (input)="mudar('codigoMunicipioIbge', $event)"
        />
        @if (erros()['codigoMunicipioIbge']; as e) {
          <span class="font-normal text-perigo-ink">{{ e }}</span>
        } @else {
          <span class="font-normal text-muted-foreground">
            São 7 dígitos, do mesmo estado da UF. É o mesmo código que vai na nota fiscal.
          </span>
        }
      </label>
    </div>
  `,
})
export class EnderecoPostal {
  readonly endereco = model.required<EnderecoDigitado>();
  /** Erros por campo, com as chaves curtas (`cep`, `numero`…). */
  readonly erros = input<Readonly<Record<string, string>>>({});

  readonly ufs = UFS;

  mudar(campo: keyof EnderecoDigitado, evento: Event): void {
    const valor = (evento.target as HTMLInputElement | HTMLSelectElement).value;
    this.endereco.update((atual) => ({ ...atual, [campo]: valor }));
  }

  mascararCep(evento: Event): void {
    const cep = aplicarMascara(evento, mascaraCep);
    this.endereco.update((atual) => ({ ...atual, cep }));
  }
}
