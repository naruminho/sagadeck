// Calculadora ao vivo (layout calc): a mesma conta no motor (Node: prévia, PDF) e na apresentação (controles).
// Precisa de src/runtime/formula.js carregado antes (SagaFormula).
(function (root) {
  const SUP = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
  function format(v, o = {}) {
    if (v == null || !Number.isFinite(v)) return "—";
    if (o.sci || Math.abs(v) >= 1e7 || (Math.abs(v) < 1e-3 && v !== 0)) {
      const [m, e] = v.toExponential(2).split("e");
      return `${m.replace(".", ",")} × 10${String(Number(e)).split("").map((c) => SUP[c] ?? c).join("")}`;
    }
    if (o.decimals != null) return v.toLocaleString("pt-BR", { minimumFractionDigits: o.decimals, maximumFractionDigits: o.decimals });
    return v.toLocaleString("pt-BR", { maximumSignificantDigits: Math.abs(v) >= 1000 ? 7 : 4 });
  }
  // todas as saídas na ordem (uma saída usa as anteriores); `cases` escolhe texto/cor/fórmula pela faixa de `of`
  function evaluate(model, values = {}) {
    const F = root.SagaFormula;
    const env = Object.fromEntries(model.inputs.map((i) => [i.name, values[i.name] ?? i.value]));
    const vars = [...model.inputs.map((i) => i.name), ...model.outputs.map((o) => o.name)];
    const out = {};
    for (const o of model.outputs) {
      const ofVal = o.of ? env[o.of] : null;
      const kase = o.cases.length ? o.cases.find((c) => c.below == null || (ofVal ?? NaN) < c.below) || o.cases[o.cases.length - 1] : null;
      const src = (kase && kase.fn) || o.fn;
      let value = null, error = "";
      if (src) { try { value = F.compile(src, vars).eval(env); } catch (e) { error = e.message; } }
      if (value != null) env[o.name] = value;
      out[o.name] = { value, error, text: (kase && kase.text) || "", color: (kase && kase.color) || "" };
    }
    return out;
  }
  function scalePos(v, sc) {
    if (v == null) return 0;
    const lg = (x) => Math.log10(Math.max(x, 1e-12));
    const t = sc.log ? (lg(v) - lg(sc.min)) / (lg(sc.max) - lg(sc.min)) : (v - sc.min) / (sc.max - sc.min);
    return Math.max(0, Math.min(1, t)) * 100;
  }
  // na apresentação: mexeu no controle, recalcula e atualiza números, selos e ponteiros
  function mount(doc) {
    doc.querySelectorAll("[data-calc]:not([data-calc-ready])").forEach((rootEl) => {
      rootEl.dataset.calcReady = "1";
      const model = JSON.parse(rootEl.querySelector(".calc-model").textContent);
      const values = () => Object.fromEntries([...rootEl.querySelectorAll("[data-calc-in]")].map((i) => [i.dataset.calcIn, Number(i.value)]));
      const redraw = () => {
        const v = values(), res = evaluate(model, v);
        for (const i of model.inputs) { const el = rootEl.querySelector(`[data-calc-show="${i.name}"]`); if (el) el.textContent = format(v[i.name], i); }
        for (const o of model.outputs) {
          const r = res[o.name];
          const out = rootEl.querySelector(`[data-calc-out="${o.name}"]`); if (out) out.textContent = format(r.value, o);
          const b = rootEl.querySelector(`[data-calc-badge="${o.name}"]`); if (b) { b.textContent = r.text; b.style.background = r.color ? `var(--${r.color})` : ""; }
          const ptr = rootEl.querySelector(`[data-calc-pointer="${o.name}"]`);
          if (ptr && o.scale) ptr.style.left = `${scalePos(o.of ? res[o.of] ? res[o.of].value : v[o.of] : r.value, o.scale)}%`;
        }
      };
      rootEl.querySelectorAll("[data-calc-in]").forEach((inp) => {
        const stop = (e) => e.stopPropagation(); // setas e cliques no controle não trocam de slide
        ["keydown", "pointerdown", "click"].forEach((ev) => inp.addEventListener(ev, stop));
        inp.addEventListener("input", redraw);
      });
    });
  }
  root.SagaCalc = { evaluate, format, scalePos, mount };
  if (typeof document !== "undefined") {
    const go = () => mount(document);
    document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", go) : go();
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
