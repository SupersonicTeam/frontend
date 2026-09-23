/**
 * Auditoria de UX — mede a tela aberta e devolve número, não opinião (#45).
 *
 * Nasceu da crítica da banca ("o produtor não consegue navegar, por causa do
 * tamanho"). Em vez de discutir se melhorou, cada fase da remodelação (#35) roda
 * isto antes e depois e compara.
 *
 * COMO USAR
 *   1. Abra a tela no navegador, no tamanho que quer medir (F12 > modo dispositivo).
 *   2. Cole este arquivo inteiro no console.
 *   3. Rode:  uxAudit()            -> tabela no console
 *             uxAudit({ json: true }) -> objeto, para colar em issue/PR
 *
 * METAS (critério de aceite do épico #35)
 *   alvosPequenos ......... 0
 *   textosPequenos ........ 0
 *   telaAproveitada ....... >= 75% em 1920px
 *   maiorCard ............. <= 720px em 2560px
 *   estouroHorizontal ..... nenhum
 */
(function () {
  const ALVO_MINIMO = 44;
  const TEXTO_MINIMO = 14;

  const visivel = (el) => {
    const r = el.getBoundingClientRect();
    return el.offsetParent !== null && r.width > 0 && r.height > 0;
  };

  function medir() {
    const interativos = [
      ...document.querySelectorAll('button, a[href], input, select, textarea, [role="button"], summary'),
    ].filter(visivel);

    const pequenos = interativos
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width < ALVO_MINIMO || r.height < ALVO_MINIMO)
      .map(({ el, r }) => ({
        elemento: el.tagName.toLowerCase(),
        tamanho: `${Math.round(r.width)}x${Math.round(r.height)}`,
        rotulo: (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 28),
      }));

    const textos = [...document.querySelectorAll('p, span, td, th, li, label, small, a, button, h1, h2, h3')]
      .filter((el) => visivel(el) && el.innerText && el.innerText.trim().length > 2);

    const porTamanho = {};
    textos.forEach((el) => {
      const px = Math.round(parseFloat(getComputedStyle(el).fontSize));
      porTamanho[px] = (porTamanho[px] || 0) + 1;
    });
    const textosPequenos = textos.filter(
      (el) => parseFloat(getComputedStyle(el).fontSize) < TEXTO_MINIMO,
    ).length;

    // Quanto da largura da janela o conteúdo realmente ocupa.
    const main = document.querySelector('main') || document.body;
    const conteudo = [...main.children].filter(visivel);
    const larguraConteudo = conteudo.length
      ? Math.max(...conteudo.map((c) => c.getBoundingClientRect().width))
      : 0;

    // Maior bloco visual — acusa card esticado em tela grande.
    const cards = [...main.querySelectorAll('[class*="rounded-"]')]
      .filter(visivel)
      .map((c) => Math.round(c.getBoundingClientRect().width))
      .sort((a, b) => b - a);

    const estouro = [...document.querySelectorAll('*')]
      .filter(visivel)
      .filter((el) => el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0)
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]}`);

    return {
      viewport: `${innerWidth}x${innerHeight}`,
      rota: location.pathname,
      alvosInterativos: interativos.length,
      alvosPequenos: pequenos.length,
      exemplosDeAlvoPequeno: pequenos.slice(0, 6),
      textosPequenos,
      tamanhosDeTexto: porTamanho,
      larguraUtil: Math.round(larguraConteudo),
      telaAproveitada: `${Math.round((larguraConteudo / innerWidth) * 100)}%`,
      maiorCard: cards[0] ?? 0,
      estouroHorizontal: document.documentElement.scrollWidth > innerWidth,
      elementosQueEstouram: estouro,
    };
  }

  window.uxAudit = function (opcoes = {}) {
    const r = medir();
    if (opcoes.json) return r;

    console.group(`%cux-audit — ${r.rota} @ ${r.viewport}`, 'font-weight:bold');
    console.log(
      `alvos < ${ALVO_MINIMO}px: ${r.alvosPequenos} de ${r.alvosInterativos}`,
      r.alvosPequenos ? '❌' : '✅',
    );
    console.log(`textos < ${TEXTO_MINIMO}px: ${r.textosPequenos}`, r.textosPequenos ? '❌' : '✅');
    console.log(`tela aproveitada: ${r.telaAproveitada} (útil ${r.larguraUtil}px)`);
    console.log(`maior card: ${r.maiorCard}px`);
    console.log(`estouro horizontal: ${r.estouroHorizontal ? '❌ ' + r.elementosQueEstouram.join(', ') : '✅ nenhum'}`);
    if (r.alvosPequenos) console.table(r.exemplosDeAlvoPequeno);
    console.table(r.tamanhosDeTexto);
    console.groupEnd();
    return r;
  };

  console.log('ux-audit pronto. Rode: uxAudit()');
})();
