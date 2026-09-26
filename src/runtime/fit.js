// Ajuste para caber. O MESMO código roda na apresentação/exportação (build.js embute este arquivo antes do
// runtime) e no Studio (editor e miniaturas, servido em /fit.js). Nada de cópias divergentes.
//
//   SagadeckFit.fitText(root)  reduz a fonte dos títulos marcados com data-fit até caberem
//   SagadeckFit.shrink(slide)  se o conteúdo da área útil vaza (uma caixa por cima da outra, ou para
//                              fora da área), reduz TUDO proporcionalmente até parar de vazar.
//                              Devolve o fator (1 = nada mudou) e marca section[data-shrink].
(function (g) {
  const scaleOf = (el) => ((el.closest && el.closest(".slide")) || el).getBoundingClientRect().width / 1920 || 1;

  function fitText(root) {
    root.querySelectorAll("[data-fit]").forEach((el) => {
      const safe = el.closest(".safe") || el.closest(".slide");
      if (!safe) return;
      if (!el.dataset.fs0) el.dataset.fs0 = parseFloat(getComputedStyle(el).fontSize);
      let fs = +el.dataset.fs0;
      el.style.fontSize = fs + "px";
      const sc = scaleOf(safe);
      const over = () => {
        const sr = safe.getBoundingClientRect(), r = el.getBoundingClientRect();
        const tol = fs * 0.3; // ignora a "sobra" natural de acentos/descendentes com entrelinha curta
        if (el.scrollHeight > el.clientHeight + tol || el.scrollWidth > el.clientWidth + 2 || (r.bottom - sr.bottom) / sc > tol) return true;
        // qualquer outro texto do slide passando da área útil também conta: o título "cede" espaço
        for (const t of safe.querySelectorAll(".t")) {
          const tr = t.getBoundingClientRect();
          if ((tr.bottom - sr.bottom) / sc > 6 || (sr.top - tr.top) / sc > 6) return true;
        }
        return false;
      };
      let guard = 0;
      while (over() && fs > +el.dataset.fs0 * 0.3 && guard++ < 60) { fs *= 0.95; el.style.fontSize = fs.toFixed(1) + "px"; }
    });
  }

  const MIN = 0.62; // abaixo disso fica ilegível: melhor o fiscal apontar o problema

  // Durante a medição, animações e deslocamentos de entrada (itens que só aparecem no clique N ficam
  // "abaixados" por transform) são desligados: senão parecem vazar sem vazar.
  function measuring(slide, on) {
    const doc = slide.ownerDocument;
    if (!doc.getElementById("sd-measure-css")) {
      const st = doc.createElement("style");
      st.id = "sd-measure-css";
      st.textContent = ".sd-measure, .sd-measure * { animation: none !important; transition: none !important; transform: none !important; }";
      doc.head.appendChild(st);
    }
    slide.classList.toggle("sd-measure", on);
  }

  function shrink(slide) {
    const safe = slide && slide.querySelector(":scope > .safe");
    const box = safe && safe.firstElementChild;
    if (!box) return 1;
    measuring(slide, true);
    try { return shrinkNow(slide, safe, box); } finally { measuring(slide, false); }
  }

  function shrinkNow(slide, safe, box) {
    box.style.zoom = "";
    const sc = scaleOf(slide);
    const leaking = () => {
      // caixa (linha/coluna/cartão) com conteúdo maior que ela: o excesso cai por cima do vizinho
      for (const e of box.querySelectorAll(".row, .col")) if (e.scrollHeight > e.clientHeight + 2) return true;
      const sr = safe.getBoundingClientRect();
      for (const t of box.querySelectorAll(".t, .fig")) {
        const r = t.getBoundingClientRect();
        if ((r.bottom - sr.bottom) / sc > 6 || (r.right - sr.right) / sc > 6) return true;
      }
      return false;
    };
    let z = 1;
    while (leaking() && z > MIN) {
      z = +(z - 0.03).toFixed(2);
      box.style.zoom = z;
    }
    if (z < 1) slide.dataset.shrink = String(z);
    else delete slide.dataset.shrink;
    return z;
  }

  // Texto de gráfico (SVG) que passa da borda do gráfico: fonte menor até caber (os gráficos já calculam os
  // rótulos para caber; isto pega o que a estimativa errou — fonte mais larga, rótulo inesperado).
  function fitChartText(root) {
    root.querySelectorAll("svg.chart").forEach((svg) => {
      const box = svg.getBoundingClientRect();
      if (!box.width) return;
      svg.querySelectorAll("text").forEach((t) => {
        if (!t.dataset.fs0) t.dataset.fs0 = parseFloat(t.getAttribute("font-size")) || parseFloat(getComputedStyle(t).fontSize);
        let fs = +t.dataset.fs0;
        t.setAttribute("font-size", fs);
        const out = () => { const r = t.getBoundingClientRect(); return r.width && (r.right > box.right + 1 || r.left < box.left - 1); };
        let guard = 0;
        while (out() && fs > +t.dataset.fs0 * 0.5 && guard++ < 30) { fs *= 0.94; t.setAttribute("font-size", fs.toFixed(1)); }
      });
      // rótulos um por cima do outro: os dois diminuem juntos
      const texts = [...svg.querySelectorAll("text")];
      const hit = (a, b) => { const r = a.getBoundingClientRect(), q = b.getBoundingClientRect();
        return r.width && q.width && r.left < q.right - 1 && q.left < r.right - 1 && r.top < q.bottom - 1 && q.top < r.bottom - 1; };
      for (let guard = 0; guard < 20; guard++) {
        const pairs = [];
        for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) if (hit(texts[i], texts[j])) pairs.push(texts[i], texts[j]);
        if (!pairs.length) break;
        for (const t of new Set(pairs)) {
          const fs = parseFloat(t.getAttribute("font-size"));
          if (fs > +t.dataset.fs0 * 0.5) t.setAttribute("font-size", (fs * 0.94).toFixed(1));
        }
      }
    });
  }

  function fitAllIn(root) {
    fitChartText(root);
    fitText(root);
  }

  g.SagadeckFit = { fitText: fitAllIn, fitChartText, shrink };
})(typeof window !== "undefined" ? window : globalThis);
