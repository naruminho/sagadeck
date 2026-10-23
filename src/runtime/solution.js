// Exercício resolvido com contas de verdade (layout solution): o número do passo nasce da fórmula, não do texto.
// Os dados com símbolo e valor viram variáveis; cada passo com `fn` é calculado na ordem (um usa os anteriores pelo
// nome) com o compilador de src/runtime/formula.js (sem eval), e `{{nome}}` ou `{{expressão:casas}}` no LaTeX ou no
// texto vira o valor. O mesmo arquivo roda no motor (prévia, PDF) e na apresentação (interactive: o dado vira
// controle e os passos recalculam). Precisa de SagaFormula carregado antes.
(function (root) {
  const ID = /^[A-Za-z][A-Za-z0-9_]*$/;
  // "L_1" → L1 · "\rho" → rho · "v_{0}" → v0 · "h_f" → hf
  function varName(symbol) {
    const n = String(symbol ?? "").replace(/\\(?:mathrm|mathit|text|bar|vec|hat)\b/g, "").replace(/[\\_{}\s]/g, "");
    return ID.test(n) ? n : "";
  }
  // "0,05" → 0.05 · "1.000" → 1000 · "9.81" → 9.81 · "1{,}5" → 1.5 · "2,5e-3" → 0.0025; texto → null
  function parseNum(v) {
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    let t = String(v ?? "").replace(/\{,\}/g, ",").replace(/\\,|[\s  ]/g, "");
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, "");
    t = t.replace(",", ".");
    return /^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t) ? Number(t) : null;
  }
  // casas que a pessoa escreveu ("0,026" → 3): o dado aparece como foi escrito
  const writtenDecimals = (v) => { const m = String(v).replace(/\{,\}/g, ",").match(/[.,](\d+)$/); return m && !/^\d{1,3}(\.\d{3})+$/.test(String(v)) ? m[1].length : 0; };

  // o modelo: variáveis (dados) e contas (passos e resposta com fn), na ordem
  function model(s) {
    const vars = [];
    for (const g of [].concat(s.givens || s.data || [])) {
      if (!g || typeof g !== "object") continue;
      const name = g.name ? String(g.name) : varName(g.symbol), value = parseNum(g.value);
      if (!ID.test(name) || value == null || vars.some((v) => v.name === name)) continue;
      const min = g.min != null ? Number(g.min) : value > 0 ? value / 10 : value < 0 ? value * 10 : -10;
      const max = g.max != null ? Number(g.max) : value > 0 ? value * 10 : value < 0 ? value / 10 : 10;
      const decimals = g.decimals != null ? Number(g.decimals) : writtenDecimals(g.value);
      // passo do controle nas casas do dado (1000 anda de 1 em 1, 0,026 de 0,001), sem passar de ~20 mil posições
      const fine = 10 ** -decimals, range = Math.abs(max - min) || 1;
      const step = g.step != null ? Number(g.step) : range / fine <= 20000 ? fine : 10 ** Math.floor(Math.log10(range / 1000));
      // mínimo e máximo na grade do passo: o controle só para em múltiplos do mínimo, e 0,01 virava 0,011
      const snap = (x, f) => Number((f(x / step) * step).toPrecision(12));
      vars.push({ name, value, decimals, min: snap(min, Math.floor), max: snap(max, Math.ceil), step, label: String(g.label || g.symbol || name) });
    }
    const calcs = [];
    const add = (o, key, label) => {
      if (!o || typeof o !== "object" || o.fn == null || o.fn === "") return;
      const name = o.name && ID.test(String(o.name)) ? String(o.name) : `_${key}`;
      calcs.push({ key, label, name, fn: String(o.fn), ...(o.decimals != null ? { decimals: Number(o.decimals) } : {}) });
    };
    (s.steps || []).forEach((st, i) => add(st, `p${i}`, `passo ${i + 1}`));
    add(s.answer, "resp", "resposta");
    return { vars, calcs };
  }

  // calcula tudo na ordem; cada conta devolve { value, error } (erro em português, para o slide e para a IA)
  function evaluate(m, values = {}) {
    const env = Object.create(null);
    for (const v of m.vars) env[v.name] = Number.isFinite(values[v.name]) ? values[v.name] : v.value;
    const known = [...m.vars.map((v) => v.name), ...m.calcs.map((c) => c.name)];
    const out = {};
    for (const c of m.calcs) {
      let value = null, error = "";
      try {
        const f = root.SagaFormula.compile(c.fn, known);
        const missing = f.params.filter((p) => !(p in env));
        if (missing.length) error = `a fórmula usa ${missing.map((p) => `"${p}"`).join(", ")}, que não está nos dados (símbolo e valor) nem nos passos anteriores (name)`;
        else { value = f.eval(env); if (value == null) error = "a conta não deu um número (divisão por zero ou raiz de negativo?)"; }
      } catch (e) { error = `fórmula "${c.fn}": ${e.message}`; }
      if (value != null) env[c.name] = value;
      out[c.key] = { value, error };
    }
    return { env, results: out };
  }
  // valor de {{expressão}}: nome, ou conta com os nomes já calculados
  function evalExpr(expr, env) {
    if (expr in env) return env[expr];
    try { const f = root.SagaFormula.compile(expr, Object.keys(env)); return f.params.every((p) => p in env) ? f.eval(env) : null; } catch { return null; }
  }

  // número para a tela: casas pedidas, ou 4 algarismos (inteiro a partir de 1000); 10 elevado se for extremo.
  // tex: "1\,430{,}77" · math: "1 430,77" (o mesmo, em texto, para trocar dentro da fórmula) · text: "1.430,77"
  const SUP = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
  function format(v, decimals, mode = "tex") {
    if (v == null || !Number.isFinite(v)) return mode === "tex" ? "\\text{—}" : "—";
    const comma = mode === "tex" ? "{,}" : ",", group = mode === "tex" ? "\\," : mode === "math" ? " " : ".";
    const a = Math.abs(v);
    if (v !== 0 && (a < 1e-3 || a >= 1e7) && !(decimals != null && a >= 1e7)) {
      const [mant, e] = v.toExponential(decimals != null ? Math.min(decimals, 4) : 2).split("e");
      const mm = String(Number(mant)).replace(".", comma);
      return mode === "tex" ? `${mm}\\times10^{${Number(e)}}` : `${mm} × 10${String(Number(e)).split("").map((c) => SUP[c] ?? c).join("")}`;
    }
    const s = decimals != null ? v.toFixed(decimals) : a >= 1000 ? v.toFixed(0) : String(Number(v.toPrecision(4)));
    const [int, frac] = s.replace(/^-0(\.0*)?$/, "0$1").split(".");
    return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, group)}${frac ? `${comma}${frac}` : ""}`;
  }

  // na apresentação: o dado vira controle; mexeu, recalcula e troca os números marcados (data-solv)
  function mount(doc) {
    doc.querySelectorAll("[data-solution]:not([data-solution-ready])").forEach((el) => {
      el.dataset.solutionReady = "1";
      const m = JSON.parse(el.querySelector(".sol-model").textContent);
      const inputs = [...el.querySelectorAll("[data-solv-in]")];
      // a cópia em MathML (para leitor de tela) não acompanha o número novo: quem lê passa a ser o próprio desenho
      el.querySelectorAll(".katex").forEach((k) => {
        if (!k.querySelector("[data-solv]")) return;
        k.querySelector(".katex-mathml")?.setAttribute("hidden", "");
        k.querySelector(".katex-html")?.removeAttribute("aria-hidden");
      });
      const redraw = () => {
        const values = Object.fromEntries(inputs.map((i) => [i.dataset.solvIn, Number(i.value)]));
        const { env } = evaluate(m, values);
        el.querySelectorAll("[data-solv]").forEach((n) => {
          const mk = m.marks[+n.dataset.solv];
          if (mk) n.textContent = format(evalExpr(mk.expr, env), mk.decimals, n.dataset.solvMode === "text" ? "text" : "math");
        });
        const slide = el.closest(".slide");
        if (slide && root.SagadeckFit?.fitSteps) root.requestAnimationFrame(() => root.SagadeckFit.fitSteps(el));
      };
      const stop = (e) => e.stopPropagation(); // setas e cliques no controle não trocam de slide nem de passo
      inputs.forEach((i) => { ["keydown", "pointerdown", "click"].forEach((ev) => i.addEventListener(ev, stop)); i.addEventListener("input", redraw); });
      const reset = el.querySelector("[data-solv-reset]");
      if (reset) {
        ["keydown", "pointerdown", "click"].forEach((ev) => reset.addEventListener(ev, stop));
        reset.addEventListener("click", () => { inputs.forEach((i) => { i.value = String(m.vars.find((v) => v.name === i.dataset.solvIn)?.value ?? i.value); }); redraw(); });
      }
    });
  }

  root.SagaSolution = { model, evaluate, evalExpr, format, varName, parseNum, mount };
  if (typeof document !== "undefined") {
    const go = () => mount(document);
    document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", go) : go();
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
