import { EMAIL_CONTATO } from './landing-dados';

/**
 * As interações da landing (#174) que mexem direto no DOM: menu, âncoras, a entrada e o parallax
 * do hero, as entradas ao aparecer, a linha do tempo, o simulador, a carteira, a Ceres, as abas dos planos.
 *
 * Vieram do `<script>` da prévia estática (`rascunhos/previa-landing/`), presas à raiz da página e
 * com tudo desfeito no fim: cada ouvinte usa o mesmo `AbortSignal`, e o observador e os timers são
 * encerrados no retorno. Nada aqui escreve em signal: no app zoneless isso agendaria uma
 * renderização a cada rolagem.
 *
 * `reduzido()` é lido **na hora**, não guardado: "Reduzir animações" pode mudar no meio da página.
 */
/**
 * O deslocamento do parallax, limitado a uma tela de distância do centro (#215).
 *
 * Sem limite, o ponteiro capturado fora do hero (um arrasto que começa dentro) manda valores
 * sem teto, e os cartões saem voando. O CSS multiplica isto por até 22 px.
 */
export function limitarParallax(valor: number): number {
  if (!Number.isFinite(valor)) return 0;
  return Math.max(-1, Math.min(1, valor));
}

export function ligarInteracoes(raiz: HTMLElement, reduzido: () => boolean): () => void {
  const controle = new AbortController();
  const { signal } = controle;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const depois = (fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  };
  const um = <T extends Element = HTMLElement>(seletor: string) => raiz.querySelector<T>(seletor);
  const todos = <T extends Element = HTMLElement>(seletor: string) =>
    Array.from(raiz.querySelectorAll<T>(seletor));

  // Copiar o e-mail
  for (const botao of todos('[data-copiar]')) {
    botao.addEventListener(
      'click',
      () => {
        const texto = botao.textContent;
        const feito = () => {
          botao.textContent = 'E-mail copiado';
          depois(() => (botao.textContent = texto), 2000);
        };
        if (navigator.clipboard) navigator.clipboard.writeText(EMAIL_CONTATO).then(feito, feito);
        else feito();
      },
      { signal },
    );
  }

  // Pular para o conteúdo
  um('#pular')?.addEventListener(
    'click',
    (e) => {
      e.preventDefault();
      um('#conteudo')?.focus();
    },
    { signal },
  );

  // Cabeçalho: sombra ao rolar e o menu do celular
  const cabecalho = um('#cabecalho');
  addEventListener('scroll', () => cabecalho?.classList.toggle('rolou', scrollY > 8), {
    passive: true,
    signal,
  });
  const menuBtn = um('#menu-btn');
  const painel = um('#menu-painel');
  const fecharMenu = () => {
    painel?.classList.remove('aberto');
    menuBtn?.setAttribute('aria-expanded', 'false');
  };
  menuBtn?.addEventListener(
    'click',
    () => {
      const abrir = !painel?.classList.contains('aberto');
      painel?.classList.toggle('aberto', abrir);
      menuBtn.setAttribute('aria-expanded', String(abrir));
    },
    { signal },
  );
  painel?.addEventListener(
    'click',
    (e) => {
      if ((e.target as Element).closest('a')) fecharMenu();
    },
    { signal },
  );
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape' && painel?.classList.contains('aberto')) {
        fecharMenu();
        menuBtn?.focus();
      }
    },
    { signal },
  );

  // Âncoras da página. O `href="#x"` puro, numa rota que não é a raiz, levaria o navegador a
  // `/#x` e para fora da landing: a rolagem é feita aqui, e o foco vai ao título da seção.
  for (const link of todos<HTMLAnchorElement>('a[href^="#"]')) {
    link.addEventListener(
      'click',
      (e) => {
        const id = link.getAttribute('href')?.slice(1);
        const alvo = id ? raiz.querySelector<HTMLElement>(`#${CSS.escape(id)}`) : null;
        if (!alvo) return;
        e.preventDefault();
        alvo.scrollIntoView({ behavior: reduzido() ? 'auto' : 'smooth', block: 'start' });
        const secao = alvo.matches('section') ? alvo : alvo.closest('section');
        const titulo = secao?.querySelector<HTMLElement>('h2[tabindex]');
        if (titulo) depois(() => titulo.focus({ preventScroll: true }), 400);
      },
      { signal },
    );
  }

  // A entrada do hero (#215), uma vez. O estado final é o padrão: sem a classe, nada fica
  // invisível — era o que o protótipo fazia ao contrário, e numa aba em segundo plano o conteúdo
  // demorava a aparecer.
  const heroTexto = um('.hero-texto');
  const heroProva = um('.hero-prova');
  if (!reduzido()) {
    heroTexto?.classList.add('anima');
    heroProva?.classList.add('anima');
  }

  // Parallax leve dos cartões do hero no ponteiro. Só com ponteiro fino: no toque não há hover, e
  // `pointermove` ali viraria arrasto. O ouvinte é passivo e só guarda dois números; quem escreve
  // no estilo é um `requestAnimationFrame`, um por quadro. Nada de ouvinte de rolagem (#174, 6.7).
  const hero = um('.hero');
  const ponteiroFino =
    typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (hero && heroProva && ponteiroFino) {
    let px = 0;
    let py = 0;
    let quadro = 0;
    const aplicar = () => {
      quadro = 0;
      heroProva.style.setProperty('--px', String(px));
      heroProva.style.setProperty('--py', String(py));
    };
    const agendar = () => {
      if (!quadro) quadro = requestAnimationFrame(aplicar);
    };
    hero.addEventListener(
      'pointermove',
      (evento) => {
        if (reduzido()) return;
        const area = hero.getBoundingClientRect();
        px = limitarParallax(((evento.clientX - area.left) / area.width - 0.5) * 2);
        py = limitarParallax(((evento.clientY - area.top) / area.height - 0.5) * 2);
        agendar();
      },
      { passive: true, signal },
    );
    // Sair do hero devolve os cartões ao lugar, em vez de deixá-los tortos para sempre.
    hero.addEventListener(
      'pointerleave',
      () => {
        px = 0;
        py = 0;
        agendar();
      },
      { signal },
    );
    signal.addEventListener('abort', () => {
      if (quadro) cancelAnimationFrame(quadro);
    });
  }

  // Entradas ao aparecer (uma vez)
  const acoes = new Map<Element, () => void>();
  const observador =
    'IntersectionObserver' in window
      ? new IntersectionObserver(
          (entradas) => {
            for (const entrada of entradas) {
              if (!entrada.isIntersecting) continue;
              observador?.unobserve(entrada.target);
              acoes.get(entrada.target)?.();
              acoes.delete(entrada.target);
            }
          },
          { threshold: 0.25 },
        )
      : null;
  const aoAparecer = (el: Element | null, fn: () => void) => {
    if (!el || !observador) return;
    acoes.set(el, fn);
    observador.observe(el);
  };
  for (const el of todos('.revela')) {
    aoAparecer(el, () => {
      if (!reduzido()) el.classList.add('anima');
    });
  }

  // A linha do tempo da reforma, até o ano atual
  const ano = new Date().getFullYear();
  const marcos = [2026, 2027, 2029, 2033];
  let indice = 0;
  marcos.forEach((m, i) => {
    if (ano >= m) indice = i;
  });
  const trilho = um('#trilho');
  trilho?.style.setProperty('--progresso', Math.min(1, (indice + 0.5) / marcos.length).toFixed(3));
  const marcosNaTela = todos('#tempo li');
  const voceAqui = um('#voce-aqui');
  const doAno = marcosNaTela[indice];
  if (doAno && voceAqui) doAno.insertBefore(voceAqui, doAno.firstChild);
  aoAparecer(trilho, () => {
    if (!reduzido()) trilho?.classList.add('anima-linha');
  });

  // Grupos de rádio com setas
  const grupoRadio = (grupo: HTMLElement | null, aoEscolher: (b: HTMLElement) => void) => {
    const botoes = grupo ? Array.from(grupo.querySelectorAll<HTMLElement>('[role="radio"]')) : [];
    const escolher = (botao: HTMLElement, foco: boolean) => {
      for (const b of botoes) {
        const sim = b === botao;
        b.setAttribute('aria-checked', String(sim));
        b.tabIndex = sim ? 0 : -1;
      }
      if (foco) botao.focus();
      aoEscolher(botao);
    };
    botoes.forEach((botao, i) => {
      botao.addEventListener('click', () => escolher(botao, false), { signal });
      botao.addEventListener(
        'keydown',
        (e) => {
          const passo = ['ArrowRight', 'ArrowDown'].includes(e.key)
            ? 1
            : ['ArrowLeft', 'ArrowUp'].includes(e.key)
              ? -1
              : 0;
          const proximo = botoes[(i + passo + botoes.length) % botoes.length];
          if (!passo || !proximo) return;
          e.preventDefault();
          escolher(proximo, true);
        },
        { signal },
      );
    });
    return botoes;
  };

  // O simulador de redução
  grupoRadio(um('#radios-produto'), (b) => {
    const barra = um('#barra');
    if (barra) barra.style.transform = `scaleX(${b.dataset['fator'] ?? '1'})`;
    const resultado = um('#resultado');
    if (resultado) resultado.textContent = b.dataset['texto'] ?? '';
    const fonte = um('#resultado-fonte');
    if (fonte) fonte.textContent = b.dataset['fonte'] ?? '';
  });

  // O pulso do prazo
  aoAparecer(um('#eventos'), () => {
    if (!reduzido()) um('#selo-prazo')?.classList.add('pulsa');
  });

  // A carteira reordenada, com FLIP
  const lista = um('#clientes');
  const ordenar = (por: string, animar: boolean) => {
    if (!lista) return;
    const els = Array.from(lista.children) as HTMLElement[];
    const antes = new Map(els.map((el) => [el, el.getBoundingClientRect().top]));
    els.sort((a, b) =>
      por === 'nome'
        ? (a.dataset['nome'] ?? '').localeCompare(b.dataset['nome'] ?? '', 'pt-BR')
        : Number(a.dataset['urg']) - Number(b.dataset['urg']),
    );
    for (const el of els) lista.appendChild(el);
    if (!animar || reduzido() || !lista.animate) return;
    for (const el of els) {
      const d = (antes.get(el) ?? 0) - el.getBoundingClientRect().top;
      if (d) {
        el.animate([{ transform: `translateY(${d}px)` }, { transform: 'none' }], {
          duration: 320,
          easing: 'ease-out',
        });
      }
    }
  };
  const marcar = (botoes: HTMLElement[], escolhido: number) =>
    botoes.forEach((b, i) => {
      b.setAttribute('aria-checked', String(i === escolhido));
      b.tabIndex = i === escolhido ? 0 : -1;
    });
  const botoesOrdem = grupoRadio(um('#ordem'), (b) => {
    ordenar(b.dataset['ordem'] ?? 'urgencia', true);
    const anuncio = um('#anuncio-ordem');
    if (anuncio) {
      anuncio.textContent =
        b.dataset['ordem'] === 'nome' ? 'Lista ordenada por nome' : 'Lista ordenada por urgência';
    }
  });
  if (!reduzido() && observador && botoesOrdem.length === 2) {
    // Começa por nome e reordena uma vez, por urgência, quando a seção aparece.
    marcar(botoesOrdem, 0);
    ordenar('nome', false);
    aoAparecer(lista, () =>
      depois(() => {
        marcar(botoesOrdem, 1);
        ordenar('urgencia', true);
      }, 500),
    );
  }

  // A resposta da Ceres
  const chat = um('#chat');
  aoAparecer(chat, () => {
    if (reduzido() || !chat) return;
    chat.classList.add('esperando');
    depois(() => chat.classList.remove('esperando'), 1200);
  });

  // Abas dos planos
  const abas = todos('[role="tab"]');
  const abrirAba = (qual: string, foco: boolean) => {
    for (const aba of abas) {
      const sim = aba.id === `aba-${qual}`;
      aba.setAttribute('aria-selected', String(sim));
      aba.tabIndex = sim ? 0 : -1;
      const painelDaAba = raiz.querySelector<HTMLElement>(`#${aba.getAttribute('aria-controls')}`);
      if (painelDaAba) painelDaAba.hidden = !sim;
      if (sim && foco) aba.focus();
    }
    const tabela = um('.tabela-caixa');
    if (tabela) tabela.hidden = qual !== 'produtor';
  };
  abas.forEach((aba, i) => {
    aba.addEventListener('click', () => abrirAba(aba.id.replace('aba-', ''), false), { signal });
    aba.addEventListener(
      'keydown',
      (e) => {
        const passo = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        const proxima = abas[(i + passo + abas.length) % abas.length];
        if (!passo || !proxima) return;
        e.preventDefault();
        abrirAba(proxima.id.replace('aba-', ''), true);
      },
      { signal },
    );
  });
  for (const link of todos('[data-aba-link]')) {
    link.addEventListener('click', () => abrirAba(link.dataset['abaLink'] ?? 'produtor', false), {
      signal,
    });
  }
  if (location.hash === '#planos-escritorio') abrirAba('escritorio', false);

  // "Como o limite é medido?"
  um('#o-que-uso')?.addEventListener(
    'click',
    (e) => {
      const botao = e.currentTarget as HTMLElement;
      const aberto = botao.getAttribute('aria-expanded') === 'true';
      botao.setAttribute('aria-expanded', String(!aberto));
      const texto = um('#texto-uso');
      if (texto) texto.hidden = aberto;
    },
    { signal },
  );

  return () => {
    controle.abort();
    observador?.disconnect();
    timers.forEach(clearTimeout);
    timers.clear();
  };
}
