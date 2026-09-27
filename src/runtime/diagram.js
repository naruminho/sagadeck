// Diagramas (layout diagram): o Mermaid desenha, o sagadeck veste.
//  - Famílias de cor tiradas do tema: cada grupo (subgraph) ganha um matiz e seus nós herdam esse matiz, com
//    preenchimento claro e contorno da mesma cor mais escura; o grupo tem fundo bem claro e título na cor dele.
//    O primeiro matiz é o destaque do tema; os outros são vizinhos harmônicos. Nada de preto puro: texto em grafite
//    (ou no tom escuro da família), setas em cinza. Setas retas com cantos arredondados.
//  - Ênfase só onde pedir: :::hi (tom forte do destaque), :::em (tom forte da ênfase), :::escuro, :::suave (cinza
//    neutro: usuário, sistemas externos, bancos), :::vazado (tracejado: opcional, futuro).
//  - Direção automática (fluxograma): desenha deitado (LR) e em pé (TB) e fica com o que deixa a letra maior na área
//    do slide (autoDirection: false no slide mantém a do código).
//  - Compacto: o desenho escala para ocupar a área do slide (sem vazios enormes).
//  - Fonte do tema; ícones do sagadeck nos rótulos (":rocket:" vira o desenho, medido antes do layout).
//  - Código errado ou desenho que precisou encolher demais: window.sagadeckDiagramErrors / sagadeckDiagramWarnings
//    (o Studio devolve à IA para corrigir) e, no caso do erro, um aviso legível no slide.
(function () {
  let loader, seq = 0;
  window.sagadeckDiagramErrors = window.sagadeckDiagramErrors || [];
  window.sagadeckDiagramWarnings = window.sagadeckDiagramWarnings || [];
  function load() {
    if (window.mermaid) return Promise.resolve();
    return loader ||= new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "mermaid.min.js"; s.onload = resolve;
      s.onerror = () => { loader = null; s.remove(); reject(new Error("Não foi possível carregar o desenhador de diagramas.")); };
      document.head.append(s);
    });
  }

  // ---- cores -------------------------------------------------------------------------------------------------
  const cv = document.createElement("canvas").getContext("2d");
  // cor CSS qualquer (var, rgb, color-mix) -> #rrggbb
  function hex(color, host) {
    const i = document.createElement("i");
    i.style.color = color; host.append(i);
    const c = getComputedStyle(i).color; i.remove();
    const m = c.match(/[\d.]+/g) || [0, 0, 0];
    if (/^color\(srgb/.test(c)) return "#" + m.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
    cv.fillStyle = c; const f = cv.fillStyle;
    return f.startsWith("#") ? f : "#" + m.slice(0, 3).map((v) => (+v).toString(16).padStart(2, "0")).join("");
  }
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const toHex = (a) => "#" + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
  const mix = (a, b, p) => toHex(rgb(a).map((v, i) => v * p + rgb(b)[i] * (1 - p)));
  const lum = (h) => { const [r, g, b] = rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const contrast = (a, b) => { const [p, q] = [lum(a), lum(b)].sort((m, n) => n - m); return (p + 0.05) / (q + 0.05); };
  const on = (bgc, a, b) => (contrast(bgc, a) >= contrast(bgc, b) ? a : b);
  function hueOf(h) {
    const [r, g, b] = rgb(h).map((v) => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (!d) return { h: 220, s: 0 };
    const hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: (hh * 60 + 360) % 360, s: d / (1 - Math.abs(mx + mn - 1)) };
  }
  function hsl(h, s, l) {
    s /= 100; l /= 100;
    const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    return toHex([0, 8, 4].map((n) => 255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))))));
  }
  const dist = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };

  // Uma família = um matiz em vários tons. Tema claro: fundo claro, contorno médio, letra escura da mesma cor.
  // Tema escuro: o contrário. "forte" é a ênfase (:::hi/:::em), mais saturada, sem virar um bloco chapado.
  function family(h, dark, sat = 1) {
    const s = (v) => v * sat;
    return dark ? {
      fill: hsl(h, s(28), 21), stroke: hsl(h, s(48), 58), text: hsl(h, s(55), 88),
      cbg: hsl(h, s(22), 12.5), cstroke: hsl(h, s(28), 28), ctext: hsl(h, s(50), 74),
      strong: hsl(h, s(45), 36), strongStroke: hsl(h, s(60), 70), strongText: hsl(h, s(40), 95), line: hsl(h, s(40), 60),
    } : {
      fill: hsl(h, s(62), 91), stroke: hsl(h, s(42), 46), text: hsl(h, s(48), 23),
      cbg: hsl(h, s(55), 97.5), cstroke: hsl(h, s(40), 83), ctext: hsl(h, s(45), 36),
      strong: hsl(h, s(62), 79), strongStroke: hsl(h, s(48), 36), strongText: hsl(h, s(55), 17), line: hsl(h, s(40), 52),
    };
  }
  // matizes: o destaque do tema, a ênfase (a do tema, ou a complementar se ela for parecida com o destaque ou
  // cinza) e vizinhos harmônicos bem separados
  const CANDIDATOS = [212, 272, 145, 175, 28, 335, 48, 195, 300, 100];
  function hues(L) {
    const out = [L.hueHi.h];
    out.push(L.hueEm.s > 0.15 && dist(L.hueEm.h, out[0]) > 30 ? L.hueEm.h : (L.hueHi.h + 180) % 360);
    for (const c of CANDIDATOS) if (out.every((h) => dist(h, c) > 32)) out.push(c);
    return out;
  }

  function look(box) {
    const slide = box.closest(".slide") || document.body, cs = getComputedStyle(slide);
    const v = (n, fb) => hex(cs.getPropertyValue(n).trim() || fb, slide);
    const bg = v("--bg", "#ffffff"), fg = v("--fg", "#111111"), hi = v("--hi", "#0f6cbd"), em = v("--em", "#d33a2c");
    // a fonte do tema: um texto de corpo de mentira dentro do slide (o slide de diagrama pode não ter nenhum)
    const probe = document.createElement("div");
    probe.className = "t f-body"; probe.style.cssText = "position:absolute;visibility:hidden;pointer-events:none";
    slide.append(probe);
    const font = getComputedStyle(probe).fontFamily.replace(/"/g, "'"); // aspas simples: o Mermaid põe a fonte em atributos
    probe.remove();
    const dark = lum(bg) < 0.25;
    const L = { bg, fg, hi, em, font, dark, hueHi: hueOf(hi), hueEm: hueOf(em) };
    // grafite no lugar do preto (e um cinza claro no lugar do branco, no tema escuro); setas em cinza médio
    L.ink = mix(fg, bg, 0.8); L.soft = mix(fg, bg, 0.6); L.arrow = mix(fg, bg, 0.5); L.faint = mix(fg, bg, 0.12);
    // tema quase sem cor (preto e branco): as famílias ficam discretas
    const sat = Math.max(0.35, Math.min(1, L.hueHi.s * 1.4));
    L.fams = hues(L).map((h) => family(h, dark, sat));
    L.neutral = family(220, dark, 0.12);
    L.hiFam = L.fams[0];
    L.emFam = L.fams[1];
    // grupos: nem a família do destaque (dos nós soltos) nem a da ênfase (a ênfase tem que se destacar do grupo)
    L.groupFams = L.fams.slice(2);
    return L;
  }

  function config(L) {
    const F = L.hiFam;
    const themeCSS = [
      `.node rect,.node polygon,.node circle,.node ellipse,.node path{stroke-width:1.6px;filter:drop-shadow(0 1px 2px rgba(0,0,0,${L.dark ? 0.35 : 0.08}))}`,
      `.node rect{rx:9px;ry:9px}`,
      `.nodeLabel,.label,.edgeLabel,text,.messageText,.actor,.noteText,.cluster-label{font-family:${L.font}!important}`,
      `.flowchart-link,.edgePath .path,.relation,.transition{stroke:${L.arrow}!important;stroke-width:1.7px!important}`,
      `marker path,.marker,.arrowheadPath,.arrowMarkerPath{fill:${L.arrow}!important;stroke:${L.arrow}!important}`,
      `.edgeLabel,.edgeLabel p,.edgeLabel span,.edgeLabel rect{background:${L.bg}!important;color:${L.soft}!important;font-size:17px;font-weight:600}`,
      `.cluster rect{rx:14px!important;ry:14px!important;stroke-width:1.5px!important}`,
      `.cluster-label .nodeLabel,.cluster-label span,.cluster-label p{font-weight:700;letter-spacing:.02em}`,
      `.dgi{display:inline-flex;align-items:center;height:26px;vertical-align:-6px}.dgi svg{width:26px;height:26px;display:block;flex:none}`,
      // o ícone fica dentro do nó: as regras de forma do Mermaid (.node path…) não podem pintá-lo
      `.dgi svg *{stroke:currentColor!important;fill:none!important;filter:none!important;stroke-width:inherit!important}`,
      // (nada de mudar peso/tamanho da letra dos nós aqui: o Mermaid já mediu o texto, e o rótulo cortaria)
      `.actor{stroke-width:1.6px}.messageLine0,.messageLine1{stroke:${L.arrow}!important}`,
      // números da sequência (autonumber): bolinha no tom forte, número legível
      `[id$="-sequencenumber"],[id$="-sequencenumber"] circle{fill:${F.strongStroke}!important;stroke:${F.strongStroke}!important}.sequenceNumber{fill:${on(F.strongStroke, L.bg, L.ink)}!important}`,
      // mapa mental, jornada e linha do tempo: uma família por ramo, com contorno e linha da própria cor
      // (o Mermaid pinta o ramo N com a cor N+1 da escala: o contorno e a linha acompanham)
      ...L.fams.slice(1, 12).map((f, i) => `.section-${i} rect,.section-${i} path,.section-${i} circle,.section-${i} polygon{stroke:${f.stroke};stroke-width:1.6px}.section-edge-${i}{stroke:${f.line}!important}`),
      `.section-root rect,.section-root path,.section-root circle,.section-root polygon{fill:${F.strong}!important;stroke:${F.strongStroke}!important;stroke-width:2px}`,
    ].join("\n");
    const sizes = { useMaxWidth: false };
    const cs = Object.fromEntries(L.fams.slice(0, 12).flatMap((f, i) => [["cScale" + i, f.fill], ["cScaleLabel" + i, f.text], ["cScalePeer" + i, f.stroke]]));
    const N = L.neutral, E = L.emFam;
    return {
      startOnLoad: false, securityLevel: "antiscript", theme: "base", fontFamily: L.font, themeCSS,
      themeVariables: {
        fontFamily: L.font, fontSize: "22px", background: L.bg, textColor: L.ink, titleColor: L.ink, lineColor: L.arrow,
        primaryColor: F.fill, primaryBorderColor: F.stroke, primaryTextColor: F.text,
        secondaryColor: E.fill, secondaryBorderColor: E.stroke, secondaryTextColor: E.text,
        tertiaryColor: N.fill, tertiaryBorderColor: N.stroke, tertiaryTextColor: N.text,
        mainBkg: F.fill, nodeBorder: F.stroke, clusterBkg: N.cbg, clusterBorder: N.cstroke, edgeLabelBackground: L.bg,
        actorBkg: F.fill, actorBorder: F.stroke, actorTextColor: F.text, actorLineColor: L.faint, signalColor: L.arrow, signalTextColor: L.ink,
        labelBoxBkgColor: F.fill, labelBoxBorderColor: F.stroke, labelTextColor: F.text, loopTextColor: L.soft,
        noteBkgColor: E.fill, noteBorderColor: E.stroke, noteTextColor: E.text,
        activationBkgColor: F.strong, activationBorderColor: F.strongStroke, sequenceNumberColor: L.bg,
        stateBkg: F.fill, stateLabelColor: F.text, compositeBackground: N.cbg, transitionColor: L.arrow, transitionLabelColor: L.soft,
        classText: F.text, git0: F.strong, gitBranchLabel0: F.strongText, pie1: F.stroke, pie2: E.stroke, pie3: N.stroke, pie4: F.fill, ...cs,
      },
      flowchart: { ...sizes, htmlLabels: true, nodeSpacing: 34, rankSpacing: 50, padding: 14, diagramPadding: 6, curve: window.__dgCurve || "step", subGraphTitleMargin: { top: 6, bottom: 14 } },
      sequence: { ...sizes, actorMargin: 44, boxMargin: 6, messageMargin: 28, mirrorActors: false, diagramMarginX: 6, diagramMarginY: 6 },
      state: { ...sizes, padding: 10 }, class: sizes, er: sizes, journey: sizes, gantt: sizes, mindmap: sizes, timeline: sizes, block: sizes, requirement: sizes,
    };
  }

  // ---- pintura depois do desenho: famílias por grupo -------------------------------------------------------
  const ENFASE = ["hi", "em", "escuro", "suave", "vazado"];
  function paint(svg, L) {
    // mapa mental, jornada, linha do tempo…: as famílias vão por ramo (CSS .section-N), não por grupo
    if (!/flowchart|state|class|block|er/i.test(svg.getAttribute("aria-roledescription") || "")) return;
    const area = (r) => r.width * r.height;
    const inside = (r, c) => c.x >= r.left && c.x <= r.right && c.y >= r.top && c.y <= r.bottom;
    const center = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    // grupos (subgraph / estado composto), na ordem em que aparecem: cada um ganha uma família
    const clusters = [...svg.querySelectorAll("g.cluster")].map((g, i) => {
      const rect = g.querySelector("rect");
      return rect && { g, rect, box: rect.getBoundingClientRect(), fam: L.groupFams[i % L.groupFams.length] };
    }).filter(Boolean);
    const owner = (r) => clusters.filter((c) => inside(c.box, center(r))).sort((a, b) => area(a.box) - area(b.box))[0];
    for (const c of clusters) {
      c.rect.style.fill = c.fam.cbg; c.rect.style.stroke = c.fam.cstroke;
      c.g.querySelectorAll(".cluster-label *, .cluster-label").forEach((t) => { t.style.color = c.fam.ctext; t.style.fill = c.fam.ctext; });
    }
    const set = (n, fill, stroke, text, dash) => {
      n.querySelectorAll("rect, polygon, circle, ellipse, path").forEach((s) => {
        if (s.closest(".label, .dgi, foreignObject")) return;
        s.style.fill = fill; s.style.stroke = stroke;
        if (dash) { s.style.strokeDasharray = "7 5"; s.style.filter = "none"; }
      });
      n.querySelectorAll(".nodeLabel, .nodeLabel *, span, p, text, tspan").forEach((t) => { if (!t.closest(".dgi")) { t.style.color = text; t.style.fill = text; } });
      n.querySelectorAll(".dgi svg").forEach((s) => { s.style.color = text; s.style.stroke = text; });
    };
    svg.querySelectorAll("g.node").forEach((n) => {
      const c = owner(n.getBoundingClientRect());
      const F = c ? c.fam : L.hiFam;
      const k = ENFASE.find((x) => n.classList.contains(x));
      if (k === "hi") set(n, L.hiFam.strong, L.hiFam.strongStroke, L.hiFam.strongText);
      else if (k === "em") set(n, L.emFam.strong, L.emFam.strongStroke, L.emFam.strongText);
      else if (k === "escuro") set(n, L.ink, L.ink, L.bg);
      else if (k === "suave") set(n, L.neutral.fill, L.neutral.stroke, L.neutral.text);
      else if (k === "vazado") set(n, c ? c.fam.cbg : L.bg, F.stroke, F.text, true);
      else set(n, F.fill, F.stroke, F.text);
    });
    // rótulo de seta dentro de um grupo: fundo do grupo (e não um retângulo da cor do slide)
    svg.querySelectorAll(".edgeLabel").forEach((e) => {
      const r = e.getBoundingClientRect(); if (!r.width) return;
      const c = owner(r); if (!c) return;
      e.querySelectorAll("*").forEach((x) => { x.style.setProperty("background", c.fam.cbg, "important"); });
      e.querySelectorAll("rect").forEach((x) => { x.style.fill = c.fam.cbg; });
    });
  }

  // ---- direção e tamanho -------------------------------------------------------------------------------------
  const size = (svgText) => {
    const m = svgText.match(/viewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"/);
    return m ? { w: +m[1], h: +m[2] } : null;
  };
  const scaleFor = (box, s) => Math.min(box.clientWidth / s.w, box.clientHeight / s.h, 2.2);
  // fluxograma: a mesma coisa deitada e em pé (as direções dentro dos grupos ficam como estão)
  function flipped(code) {
    const m = code.match(/^(\s*(?:flowchart|graph))(?:[ \t]+(LR|RL|TB|TD|BT))?[ \t]*(\r?\n|$)/);
    if (!m) return null;
    const dir = m[2] || "TB";
    const other = /LR|RL/.test(dir) ? "TB" : "LR";
    return code.replace(m[0], `${m[1]} ${other}${m[3]}`);
  }

  // o desenho ocupa a área do slide: pequeno cresce (até 2,2×), grande encolhe; devolve a escala usada
  function fit(box, svg) {
    const vb = svg.viewBox && svg.viewBox.baseVal;
    const w = vb && vb.width ? vb.width : svg.getBBox().width, h = vb && vb.height ? vb.height : svg.getBBox().height;
    const k = Math.min(box.clientWidth / w, box.clientHeight / h, 2.2);
    svg.setAttribute("width", Math.floor(w * k));
    svg.setAttribute("height", Math.floor(h * k));
    svg.style.maxWidth = "none";
    return k;
  }

  async function renderOne(box) {
    const code = box.querySelector(".dg-src").textContent.trim();
    const slide = box.closest(".slide");
    const slideNo = slide ? Number(slide.dataset.idx) + 1 : null;
    box.querySelectorAll("svg,.dg-error").forEach((e) => e.remove());
    const id = "dg" + (++seq) + "-" + Math.random().toString(36).slice(2, 7);
    try {
      const L = look(box);
      let icons = {};
      try { icons = JSON.parse(box.dataset.dgIcons || "{}"); } catch {}
      // Ícone: o Mermaid não conta imagem (nem espaço especial) na medida do rótulo, e o nó sairia estreito cortando o
      // texto. Então, antes do desenho, no lugar do ícone vai um texto de verdade ("MM"), que ele mede com a fonte real;
      // depois do desenho esse trecho vira o ícone, com a MESMA largura medida: o rótulo cabe no nó com qualquer fonte.
      const withMarks = code.replace(/<i class=dgi-([a-z0-9-]+)><\/i>/g, (m, name) => (icons[name] ? `<span class=dgp-${name}>MM</span>` : ""));
      window.mermaid.initialize(config(L));
      let { svg } = await window.mermaid.render(id, withMarks);
      // direção: fica com a que deixa a letra maior (a do código ganha no empate: só troca se for bem melhor)
      const other = box.dataset.dgAuto !== "0" && flipped(withMarks);
      if (other) {
        try {
          const alt = await window.mermaid.render(id + "b", other);
          const a = size(svg), b = size(alt.svg);
          if (a && b && scaleFor(box, b) > scaleFor(box, a) * 1.12) svg = alt.svg;
        } catch {}
        document.getElementById(id + "b")?.remove(); document.getElementById("d" + id + "b")?.remove();
      }
      box.insertAdjacentHTML("beforeend", svg);
      const el = box.querySelector("svg");
      el.removeAttribute("style");
      el.querySelectorAll('span[class^="dgp-"]').forEach((ph) => {
        const w = ph.offsetWidth || 33;
        const span = document.createElement("span"); span.className = "dgi";
        span.style.width = w + "px";
        span.innerHTML = (icons[ph.className.slice(4)] || "").replace(/\swidth="\d+"/, ' width="26"').replace(/\sheight="\d+"/, ' height="26"');
        ph.replaceWith(span);
      });
      const k = fit(box, el);
      paint(el, L);
      box.dataset.dgScale = k.toFixed(2);
      // encolheu demais para caber: a letra fica pequena na tela (a IA recebe o aviso e reorganiza)
      if (k < 0.62) window.sagadeckDiagramWarnings.push({ slide: slideNo, scale: +k.toFixed(2),
        warning: `o diagrama precisou encolher para ${Math.round(k * 100)}% para caber (letra pequena), mesmo na melhor direção: use menos nós, rótulos mais curtos, agrupe em subgraph ou divida em dois slides (área ${box.clientWidth}×${box.clientHeight}).` });
      box.dataset.dg = "ready";
    } catch (e) {
      document.getElementById(id)?.remove(); document.getElementById("d" + id)?.remove();
      const msg = String((e && (e.str || e.message)) || e).replace(/\s+/g, " ").slice(0, 400);
      const err = document.createElement("div");
      err.className = "dg-error";
      err.innerHTML = "<b>O diagrama tem um erro no código</b><span></span>";
      err.querySelector("span").textContent = msg;
      box.append(err);
      box.dataset.dg = "error";
      window.sagadeckDiagramErrors.push({ slide: slideNo, error: msg });
    }
  }

  // um de cada vez (o Mermaid tem configuração global); devolve quando todos estiverem desenhados
  let chain = Promise.resolve();
  function mount(root = document) {
    const boxes = [...root.querySelectorAll(".dg-box:not([data-dg])")];
    if (!boxes.length) return chain;
    boxes.forEach((b) => { b.dataset.dg = "pending"; });
    chain = chain.then(load).then(async () => { for (const b of boxes) await renderOne(b); })
      .catch((e) => boxes.forEach((b) => { if (b.dataset.dg === "pending") { b.dataset.dg = "error"; b.insertAdjacentHTML("beforeend", `<div class="dg-error"><b>${e.message}</b></div>`); } }));
    return chain;
  }
  window.SagaDiagrams = { mount, redraw(root = document) { root.querySelectorAll(".dg-box[data-dg]").forEach((b) => b.removeAttribute("data-dg")); return mount(root); } };
  window.SagaDiagramsReady = mount();
})();
