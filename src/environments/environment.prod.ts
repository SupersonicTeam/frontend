export const environment = {
  production: true,
  apiUrl: '/api',
  /** `{slug}.agroconia.com.br` (#175). Chega ao build pelo `fileReplacements` do `angular.json`. */
  dominioBase: 'agroconia.com.br',
  /**
   * Desligado até o DNS curinga e o Caddy existirem (#175): com ele em `false`, www não aponta para
   * nenhum subdomínio. Ligar é esta linha, no dia da ativação.
   */
  enderecoProprioNoAr: false,
  /** Os quadros da jornada 3D (#174), servidos fora do bundle. A versão vai no caminho. */
  baseJornada: '/jornada/v0.1/',
};
