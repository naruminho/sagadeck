// Diagramas (layout diagram): o Mermaid desenha, o sagadeck veste.
//  - Cores da paleta do próprio slide (tema + paleta + tom): nada do roxo/amarelo genérico do Mermaid.
//  - Nós em tom leve da cor de destaque, com contorno; ênfase só onde pedir: :::hi (destaque cheio), :::em (ênfase
//    cheia), :::escuro, :::suave (quase sem cor), :::vazado (tracejado). Cantos arredondados e sombra suave.
//  - Compacto: espaçamentos curtos e o desenho escala para ocupar a área do slide (sem vazios enormes).
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

  // cor CSS qualquer (var, rgb, color-mix) -> #rrggbb
  const cv = document.createElement("canvas").getContext("2d");
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
  const mix = (a, b, p) => "#" + rgb(a).map((v, i) => Math.round(v * p + rgb(b)[i] * (1 - p)).toString(16).padStart(2, "0")).join("");
  const lum = (h) => { const [r, g, b] = rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const on = (bgc, a, b) => { const c = (x) => { const [p, q] = [lum(bgc), lum(x)].sort((m, n) => n - m); return (p + 0.05) / (q + 0.05); }; return c(a) >= c(b) ? a : b; };

  function look(box) {
    const slide = box.closest(".slide") || document.body, cs = getComputedStyle(slide);
    const v = (n, fb) => hex(cs.getPropertyValue(n).trim() || fb, slide);
    const bg = v("--bg", "#ffffff"), fg = v("--fg", "#111111"), hi = v("--hi", "#0f6cbd"), em = v("--em", "#d33a2c");
    const line = v("--line", mix(fg, bg, 0.2)), surface = v("--surface", mix(fg, bg, 0.06));
    // a fonte do tema: um texto de corpo de mentira dentro do slide (o slide de diagrama pode não ter nenhum)
    const probe = document.createElement("div");
    probe.className = "t f-body"; probe.style.cssText = "position:absolute;visibility:hidden;pointer-events:none";
    slide.append(probe);
    const font = getComputedStyle(probe).fontFamily.replace(/"/g, "'"); // aspas simples: o Mermaid põe a fonte em atributos
    probe.remove();
    return { bg, fg, hi, em, line, surface, font, onHi: on(hi, bg, fg), onEm: on(em, bg, fg), tint: mix(hi, bg, 0.12), muted: mix(fg, bg, 0.55) };
  }

  // escala de cores (mapa mental, linha do tempo, jornada) tirada da paleta
  const scale = (L) => [L.hi, L.em, mix(L.hi, L.fg, 0.55), mix(L.em, L.bg, 0.55), mix(L.hi, L.bg, 0.4), mix(L.fg, L.bg, 0.7),
    mix(L.em, L.fg, 0.5), mix(L.hi, L.em, 0.5), L.surface, L.line, mix(L.hi, L.bg, 0.2), mix(L.em, L.bg, 0.25)];

  function config(L) {
    const shape = ".node rect,.node polygon,.node circle,.node ellipse,.node path";
    const cls = (c, fill, stroke, text, extra = "") => `.node.${c} rect,.node.${c} polygon,.node.${c} circle,.node.${c} ellipse,.node.${c} path{fill:${fill}!important;stroke:${stroke}!important;${extra}}.node.${c} .nodeLabel,.node.${c} .nodeLabel *,.node.${c} span,.node.${c} p,.node.${c} text{color:${text}!important;fill:${text}!important}`;
    const themeCSS = [
      `${shape}{stroke-width:2px;filter:drop-shadow(0 3px 5px rgba(0,0,0,.13))}`,
      `.node rect{rx:12px;ry:12px}`,
      `.nodeLabel,.label,.edgeLabel,text,.messageText,.actor,.noteText{font-family:${L.font}!important}`,
      cls("hi", L.hi, L.hi, L.onHi), cls("em", L.em, L.em, L.onEm), cls("escuro", L.fg, L.fg, L.bg),
      cls("suave", L.surface, L.line, L.fg), cls("vazado", "transparent", L.hi, L.fg, "stroke-dasharray:7 5;filter:none"),
      `.flowchart-link,.edgePath .path,.relation,.transition{stroke-width:2.4px!important}`,
      `.edgeLabel,.edgeLabel p,.edgeLabel span{background:${L.bg}!important;color:${L.muted}!important;font-size:18px;font-weight:600}`,
      `.cluster rect{rx:16px!important;ry:16px!important;stroke-dasharray:6 5}`,
      `.dgi{display:inline-flex;align-items:center;height:26px;vertical-align:-6px}.dgi svg{width:26px;height:26px;display:block;flex:none}`,
      // (nada de mudar peso/tamanho da letra dos nós aqui: o Mermaid já mediu o texto, e o rótulo cortaria)
      `.actor{stroke-width:2px}`,
    ].join("\n");
    const sizes = { useMaxWidth: false };
    const cs = Object.fromEntries(scale(L).flatMap((c, i) => [["cScale" + i, c], ["cScaleLabel" + i, on(c, L.bg, L.fg)], ["cScalePeer" + i, c]]));
    return {
      startOnLoad: false, securityLevel: "antiscript", theme: "base", fontFamily: L.font, themeCSS,
      themeVariables: {
        fontFamily: L.font, fontSize: "22px", background: L.bg, textColor: L.fg, titleColor: L.fg, lineColor: L.muted,
        primaryColor: L.tint, primaryBorderColor: L.hi, primaryTextColor: L.fg,
        secondaryColor: mix(L.em, L.bg, 0.12), secondaryBorderColor: L.em, secondaryTextColor: L.fg,
        tertiaryColor: mix(L.fg, L.bg, 0.04), tertiaryBorderColor: L.line, tertiaryTextColor: L.fg,
        mainBkg: L.tint, nodeBorder: L.hi, clusterBkg: mix(L.fg, L.bg, 0.035), clusterBorder: L.line, edgeLabelBackground: L.bg,
        actorBkg: L.tint, actorBorder: L.hi, actorTextColor: L.fg, actorLineColor: L.line, signalColor: L.fg, signalTextColor: L.fg,
        labelBoxBkgColor: L.tint, labelBoxBorderColor: L.hi, labelTextColor: L.fg, loopTextColor: L.fg,
        noteBkgColor: mix(L.em, L.bg, 0.14), noteBorderColor: L.em, noteTextColor: L.fg,
        activationBkgColor: mix(L.hi, L.bg, 0.25), activationBorderColor: L.hi, sequenceNumberColor: L.onHi,
        stateBkg: L.tint, stateLabelColor: L.fg, compositeBackground: mix(L.fg, L.bg, 0.035), transitionColor: L.muted,
        classText: L.fg, git0: L.hi, git1: L.em, pie1: L.hi, pie2: L.em, pie3: L.muted, pie4: L.tint, ...cs,
      },
      flowchart: { ...sizes, htmlLabels: true, nodeSpacing: 30, rankSpacing: 44, padding: 12, diagramPadding: 6, curve: "basis" },
      sequence: { ...sizes, actorMargin: 44, boxMargin: 6, messageMargin: 28, mirrorActors: false, diagramMarginX: 6, diagramMarginY: 6 },
      state: { ...sizes, padding: 10 }, class: sizes, er: sizes, journey: sizes, gantt: sizes, mindmap: sizes, timeline: sizes, block: sizes, requirement: sizes,
    };
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
      const { svg } = await window.mermaid.render(id, withMarks);
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
      // encolheu demais para caber: a letra fica pequena na tela (a IA recebe o aviso e reorganiza)
      if (k < 0.62) window.sagadeckDiagramWarnings.push({ slide: slideNo, scale: +k.toFixed(2),
        warning: `o diagrama precisou encolher para ${Math.round(k * 100)}% para caber (letra pequena): use menos nós por linha, rótulos mais curtos ou troque a direção (LR/TB) para acompanhar o formato da área (${box.clientWidth}×${box.clientHeight}).` });
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
