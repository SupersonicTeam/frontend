export const environment = {
  production: false,
  apiUrl: '/api',
  /**
   * O domínio base dos hosts de escritório (#175): `ruraloeste.localhost` em dev. Ninguém lê isto
   * direto; o token `DOMINIO_BASE` (`core/utils/host-escritorio.ts`) é que lê.
   */
  dominioBase: 'localhost',
  /** Em dev o endereço próprio já "existe" (`*.localhost` resolve sozinho). Lido pelo token. */
  enderecoProprioNoAr: true,
};
