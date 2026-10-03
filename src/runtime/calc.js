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
      if (src && !Number.isFinite(value)) error ||= 'A fórmula não produziu um número finito para estas entradas.';
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
  function curveData(model, values, output) {
    const input = model.inputs.find(i => i.name === model.sweep);
    if (!input) return { path: '', min: null, max: null };
    const points = Array.from({ length: 41 }, (_, k) => {
      const x = input.min + (input.max - input.min) * k / 40;
      return { x, y: evaluate(model, { ...values, [input.name]: x })[output]?.value };
    });
    const valid = points.filter(p => Number.isFinite(p.y));
    if (!valid.length) return { path: '', min: null, max: null };
    const lo = Math.min(...valid.map(p => p.y)), hi = Math.max(...valid.map(p => p.y));
    let lift = true;
    const path = points.map((p, k) => {
      if (!Number.isFinite(p.y)) { lift = true; return ''; }
      const command = lift ? 'M' : 'L'; lift = false;
      return `${command}${(k * 8).toFixed(1)},${(75 - (p.y - lo) / (hi - lo || 1) * 70).toFixed(1)}`;
    }).join(' ');
    return { path, min: lo, max: hi };
  }
  const curve = (model, values, output) => curveData(model, values, output).path;
  // na apresentação: mexeu no controle, recalcula e atualiza números, selos e ponteiros
  function mount(doc) {
    doc.querySelectorAll("[data-calc]:not([data-calc-ready])").forEach((rootEl) => {
      rootEl.dataset.calcReady = "1";
      const model = JSON.parse(rootEl.querySelector(".calc-model").textContent);
      let frozen = null;
      let previous = null;
      const resultsEl = rootEl.querySelector('.calc-outputs');
      const explain = rootEl.querySelector('[data-calc-explanation]');
      const setValues = (v) => rootEl.querySelectorAll('[data-calc-in]').forEach(el => { el.value = v[el.dataset.calcIn] ?? model.inputs.find(i => i.name === el.dataset.calcIn).value; });
      if (model.prediction) rootEl.classList.add('calc-unrevealed');
      const values = () => Object.fromEntries([...rootEl.querySelectorAll("[data-calc-in]")].map((i) => [i.dataset.calcIn, Number(i.value)]));
      const revealButton = rootEl.querySelector('[data-calc-reveal]');
      const reveal = () => { rootEl.classList.remove('calc-unrevealed'); if (revealButton) { revealButton.textContent = 'Resultado revelado'; revealButton.disabled = true; } };
      const redraw = () => {
        const v = values(), res = evaluate(model, v);
        for (const i of model.inputs) { const el = rootEl.querySelector(`[data-calc-show="${i.name}"]`); if (el) el.textContent = format(v[i.name], i); }
        for (const o of model.outputs) {
          const r = res[o.name];
          const out = rootEl.querySelector(`[data-calc-out="${o.name}"]`); if (out) out.textContent = format(r.value, o);
          if (out) out.classList.toggle('calc-changed', !!previous && previous[o.name]?.value !== r.value);
          const comparison = rootEl.querySelector(`[data-calc-compare="${o.name}"]`);
          if (comparison) {
            comparison.hidden = !frozen;
            comparison.textContent = frozen ? `Antes: ${format(frozen.results[o.name].value, o)} ${o.unit || ''} · Variação: ${format(r.value == null || frozen.results[o.name].value == null ? null : r.value - frozen.results[o.name].value, o)}` : '';
          }
          const b = rootEl.querySelector(`[data-calc-badge="${o.name}"]`); if (b) { b.textContent = r.text; b.style.background = r.color ? `var(--${r.color})` : ""; }
          const ptr = rootEl.querySelector(`[data-calc-pointer="${o.name}"]`);
          if (ptr && o.scale) ptr.style.left = `${scalePos(o.of ? res[o.of] ? res[o.of].value : v[o.of] : r.value, o.scale)}%`;
          const path = rootEl.querySelector(`[data-calc-curve="${o.name}"]`);
          if (path) {
            const data = curveData(model, v, o.name);
            path.setAttribute('d', data.path);
            const axis = rootEl.querySelector(`[data-calc-axis="${o.name}"]`);
            if (axis) axis.textContent = `${o.label}: ${format(data.min, o)} a ${format(data.max, o)} ${o.unit || ''} (escala automática)`;
          }
        }
        previous = res;
        rootEl.dispatchEvent(new CustomEvent('sagadeck:values', { bubbles: true, detail: { inputs: { ...v }, outputs: res } }));
      };
      rootEl.querySelectorAll('button').forEach(button => {
        ['keydown', 'pointerdown', 'click'].forEach(ev => button.addEventListener(ev, e => e.stopPropagation()));
      });
      rootEl.querySelectorAll('[data-calc-scenario]').forEach(button => button.addEventListener('click', () => {
        const scenario = model.scenarios[Number(button.dataset.calcScenario)];
        setValues(scenario.values || {});
        if (explain) explain.textContent = scenario.explanation || model.explanation;
        rootEl.querySelectorAll('[data-calc-scenario]').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
        redraw();
      }));
      const freezeButton = rootEl.querySelector('[data-calc-freeze]');
      freezeButton?.addEventListener('click', () => { frozen = { values: values(), results: evaluate(model, values()) }; freezeButton.textContent = 'Comparação fixada'; freezeButton.setAttribute('aria-pressed', 'true'); redraw(); });
      rootEl.querySelector('[data-calc-reset]')?.addEventListener('click', () => {
        frozen = null; previous = null; setValues({});
        if (revealButton) { revealButton.textContent = 'Ver resultado'; revealButton.disabled = false; }
        if (freezeButton) { freezeButton.textContent = 'Comparar com este'; freezeButton.setAttribute('aria-pressed', 'false'); }
        rootEl.querySelectorAll('[data-calc-scenario]').forEach(b => b.setAttribute('aria-pressed', 'false'));
        if (explain) explain.textContent = model.explanation;
        rootEl.classList.toggle('calc-unrevealed', !!model.prediction); redraw();
      });
      revealButton?.addEventListener('click', reveal);
      rootEl.querySelector('[data-calc-free]')?.addEventListener('click', () => { reveal(); if (explain) explain.textContent = `Modo livre: ajuste as entradas. ${model.explanation || ''}`; rootEl.querySelector('[data-calc-in]')?.focus(); });
      rootEl.querySelectorAll("[data-calc-in]").forEach((inp) => {
        const stop = (e) => e.stopPropagation(); // setas e cliques no controle não trocam de slide
        ["keydown", "pointerdown", "click"].forEach((ev) => inp.addEventListener(ev, stop));
        inp.addEventListener("input", () => {
          rootEl.querySelectorAll('[data-calc-scenario]').forEach(b => b.setAttribute('aria-pressed', 'false'));
          if (explain) explain.textContent = model.explanation;
          redraw();
        });
      });
      redraw();
    });
  }
  root.SagaCalc = { evaluate, format, scalePos, curve, curveData, mount };
  if (typeof document !== "undefined") {
    const go = () => mount(document);
    document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", go) : go();
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
