/**
 * As 27 unidades da federação, para os `<select>` de UF.
 *
 * Moravam dentro de `pages/documentos/documentos.ts`, onde só a NF-e as enxergava. O cadastro
 * empresarial (#186) precisa da mesma lista, e uma segunda cópia é a forma de as duas
 * divergirem — a primeira já estava sem ordenação alfabética garantida por nada além do olho.
 */
export const UFS = [
  'AC',
  'AL',
  'AM',
  'AP',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MG',
  'MS',
  'MT',
  'PA',
  'PB',
  'PE',
  'PI',
  'PR',
  'RJ',
  'RN',
  'RO',
  'RR',
  'RS',
  'SC',
  'SE',
  'SP',
  'TO',
] as const;

export type Uf = (typeof UFS)[number];

/** A sigla é uma UF conhecida? */
export function ufValida(uf: string): boolean {
  return (UFS as readonly string[]).includes(uf.toUpperCase());
}

/**
 * O formato do slug do endereço próprio, o mesmo do backend (contrato da backend#464): 3 a 32
 * caracteres, letras minúsculas, dígitos e hífen, sem hífen nas pontas. A lista de **reservados
 * não** fica aqui: ela muda e mora só no servidor, que responde 409 `SLUG_INDISPONIVEL`.
 *
 * Mora neste util desde a #186: o cadastro empresarial escolhe o slug no mesmo formulário, e
 * importá-lo do componente da aba Equipe arrastaria aquela tela inteira para o chunk do cadastro.
 */
const FORMATO_DO_SLUG = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;

/** Por que o valor digitado não serve, antes de ir ao servidor. `null` = serve (pelo formato). */
export function erroDoFormatoDoSlug(slug: string): string | null {
  if (!slug) return null;
  if (slug.length < 3 || slug.length > 32) return 'Use de 3 a 32 caracteres.';
  if (/^\d+$/.test(slug)) return 'Use ao menos uma letra.';
  if (slug.includes('--')) return 'Não use dois hífens seguidos.';
  if (!FORMATO_DO_SLUG.test(slug)) {
    return 'Use só letras minúsculas sem acento, números e hífen, sem hífen no começo ou no fim.';
  }
  return null;
}
