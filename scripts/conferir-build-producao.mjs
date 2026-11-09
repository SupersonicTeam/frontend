// Confere que o build de produção usa o `environment.prod.ts` (#175).
//
// Sem o `fileReplacements` no `angular.json`, a produção empacota o `environment.ts`: o
// `dominioBase` vira `localhost`, nenhum host é de escritório, e o modo escritório, a marca no login
// e o redirecionamento ficam mortos no ar, com todos os specs verdes. Este script roda na CI depois
// do `Build` e falha quando:
//
// 1. a configuração `production` do `angular.json` não troca o `environment.ts` pelo `.prod.ts`;
// 2. nenhum `.js` do build contém `agroconia.com.br` (o domínio só pode chegar lá pelo `.prod.ts`);
// 3. algum fonte que vai para o bundle escreve `agroconia.com.br` à mão (`.ts` de `src/` fora dos
//    environments e dos specs, e os templates `.html` de `src/app/`) — um texto assim faria a
//    conferência 2 passar mesmo sem o `fileReplacements`. Os textos que citam www montam o endereço
//    com o `urlDoHost` (`core/utils/host-escritorio.ts`). O `src/index.html` fica de fora: ele não
//    vira `.js`, e a landing (#174) põe o domínio nas tags de SEO dele.
//
// Node puro, sem dependência. Uso: `node scripts/conferir-build-producao.mjs` (depois do build).

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const DOMINIO = 'agroconia.com.br';
const SRC = join(RAIZ, 'src');
const APP = join(SRC, 'app');
const ENVIRONMENTS = join(SRC, 'environments');

const falhas = [];

// 1. O par do fileReplacements na configuração production.
const angular = JSON.parse(readFileSync(join(RAIZ, 'angular.json'), 'utf8'));
const [nomeDoProjeto, projeto] = Object.entries(angular.projects)[0];
const producao = projeto?.architect?.build?.configurations?.production ?? {};
const trocaOEnvironment = (producao.fileReplacements ?? []).some(
  (f) =>
    f.replace === 'src/environments/environment.ts' &&
    f.with === 'src/environments/environment.prod.ts',
);
// O bundle fica no `outputPath` do próprio angular.json (padrão do Angular: `dist/<projeto>`), e o
// builder põe os .js em `browser/`.
const saida = projeto?.architect?.build?.options?.outputPath;
const baseDaSaida =
  typeof saida === 'string' ? saida : (saida?.base ?? join('dist', nomeDoProjeto));
const DIST = join(RAIZ, baseDaSaida, 'browser');

if (!trocaOEnvironment) {
  falhas.push(
    'angular.json: a configuração "production" do build não troca src/environments/environment.ts ' +
      'por src/environments/environment.prod.ts (fileReplacements).',
  );
}

/** Todos os arquivos de `pasta` (recursivo) cujo nome passa em `aceita`. */
function arquivos(pasta, aceita) {
  if (!existsSync(pasta)) return [];
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho, aceita);
    return aceita(nome) ? [caminho] : [];
  });
}

// 2. O domínio de produção chegou ao bundle.
const bundles = arquivos(DIST, (nome) => nome.endsWith('.js'));
if (bundles.length === 0) {
  falhas.push(`Nenhum .js em ${relative(RAIZ, DIST)}: rode o build de produção antes do script.`);
} else if (!bundles.some((arquivo) => readFileSync(arquivo, 'utf8').includes(DOMINIO))) {
  falhas.push(
    `Nenhum .js de ${relative(RAIZ, DIST)} contém "${DOMINIO}": o build de produção não usou o ` +
      'environment.prod.ts.',
  );
}

// 3. Ninguém escreve o domínio à mão num fonte que vai para o bundle.
const fontes = [
  ...arquivos(SRC, (nome) => nome.endsWith('.ts') && !nome.endsWith('.spec.ts')).filter(
    (arquivo) => !arquivo.startsWith(ENVIRONMENTS),
  ),
  ...arquivos(APP, (nome) => nome.endsWith('.html')),
];
for (const arquivo of fontes) {
  if (readFileSync(arquivo, 'utf8').includes(DOMINIO)) {
    falhas.push(
      `${relative(RAIZ, arquivo)} escreve "${DOMINIO}" à mão: monte o endereço com o urlDoHost.`,
    );
  }
}

if (falhas.length) {
  console.error('Conferência do build de produção falhou:');
  for (const falha of falhas) console.error(`- ${falha}`);
  process.exit(1);
}
console.log(
  `Build de produção conferido: fileReplacements no lugar, "${DOMINIO}" no bundle e em nenhum ` +
    'fonte do app.',
);
