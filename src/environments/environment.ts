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
  /**
   * De onde vêm os quadros da jornada 3D (#174). Em dev, o `proxy.conf.json` leva `/jornada` a um
   * servidor de arquivos local; em produção, é um caminho servido fora do bundle. Ninguém lê isto
   * direto: quem lê é o token `BASE_JORNADA`.
   */
  baseJornada: '/jornada/v0.1/',
};
