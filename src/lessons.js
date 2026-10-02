// Slides de aula que qualquer matéria usa:
//   solution — exercício resolvido: enunciado e dados à esquerda; cada clique revela o próximo passo da conta;
//              no fim, a resposta em destaque
//   calc     — calculadora ao vivo: entradas com controle deslizante, saídas por fórmula (inclusive por faixas:
//              "abaixo de 2300 é laminar"), régua com as faixas e o ponteiro do valor atual
// A conta usa o mesmo compilador de fórmulas do slide de funções (src/runtime/formula.js): sem eval.
import katex from "katex";
import { md, esc } from "./markup.js";
import "./runtime/formula.js";
import "./runtime/calc.js";

const F = globalThis.SagaFormula;
const tex = (s, display = true) => katex.renderToString(String(s ?? ""), { displayMode: display, throwOnError: false, strict: "ignore", trust: false, maxExpand: 1000, maxSize: 20 });
// valor de um dado em LaTeX: número vira vírgula decimal (e 10 elevado, se for muito grande ou muito pequeno)
const commaTex = (v) => {
  if (typeof v === "number" && Number.isFinite(v)) {
    if (v !== 0 && (Math.abs(v) < 1e-3 || Math.abs(v) >= 1e6)) { const [m, e] = v.toExponential(2).split("e"); return `${String(Number(m)).replace(".", "{,}")}\\times10^{${Number(e)}}`; }
    // 1500 → 1\,500 (espaço fino no milhar) · 1.5 → 1{,}5
    const [int, frac] = String(+v.toFixed(6)).split(".");
    return `${int.replace(/\B(?=(\d{3})+(?!\d))/g, "\\,")}${frac ? `{,}${frac}` : ""}`;
  }
  return String(v ?? "").replace(/(\d),(\d)/g, "$1{,}$2");
};
const panel = (i, inner, cls = "") => `<section class="lesson-panel dyn-frame ${cls}${i === 0 ? " active" : ""}" data-lesson-panel="${i}">${inner}</section>`;

// ------------------------------------------------------------------------------------------------ solution
// frase (palavra de 3+ letras, fora sen/log/max…) sem nada de LaTeX: é texto, não fórmula — senão "ver tabela" vira
// "vertabela" em itálico, sem espaços
const PROSE = /\p{L}{3,}/u;
const isProse = (s) => !/\\[a-zA-Z]|[\^_{}]/.test(s) && PROSE.test(String(s).replace(/\b(sen|cos|tan|tg|log|ln|exp|max|min|lim|mod)\b/g, ""));
const mathOrText = (s) => (isProse(String(s ?? "")) ? `<span class="sol-txt t f-body">${md(String(s))}</span>` : tex(s, false));
function givenTex(g) {
  if (typeof g === "string") return g;
  if (g.latex) return g.latex;
  const value = typeof g.value === "string" && isProse(g.value) ? `\\text{${g.value.replace(/[{}\\$]/g, "")}}` : commaTex(g.value);
  // % (e # & _ $) são comandos no LaTeX: "60 %" saía como erro vermelho na conta da criança
  const unit = g.unit ? String(g.unit).replace(/[%#&_$]/g, (c) => `\\${c}`).replace(/°/g, "^{\\circ}").replace(/ /g, "\\,") : "";
  return `${g.symbol ?? ""} = ${value}${unit ? `\\ \\mathrm{${unit}}` : ""}`;
}
export function solutionHTML(s, ctx, head) {
  const steps = (s.steps || []).map((x) => (typeof x === "string" ? { latex: x } : x || {}));
  const givens = [].concat(s.givens || s.data || []);
  const hasAnswer = !!s.answer;
  const n = 1 + steps.length + (hasAnswer ? 1 : 0); // enunciado · cada passo · resposta
  const left = `<div class="sol-problem">${s.problem ? `<div class="sol-text t f-body">${md(s.problem)}</div>` : ""}
    ${givens.length ? `<div class="sol-givens"><div class="sol-label t f-label">Dados</div>${givens.map((g) => `<div class="sol-given"><div class="sol-tex">${typeof g === "string" ? mathOrText(g) : tex(givenTex(g), false)}</div>${g.label ? `<span class="t f-body">${md(g.label)}</span>` : ""}</div>`).join("")}</div>` : ""}
    ${s.find ? `<div class="sol-find"><span class="sol-label t f-label">Pede-se</span><div class="sol-tex">${mathOrText(s.find)}</div></div>` : ""}</div>`;
  const stepHTML = (st, i, k) => `<article class="sol-step${i === k - 1 ? " now" : ""}"><span class="sol-n t f-label">${String(i + 1).padStart(2, "0")}</span><div class="sol-body">${st.text ? `<div class="sol-why t f-body">${md(st.text)}</div>` : ""}${st.latex ? `<div class="sol-math">${tex(st.latex)}</div>` : ""}${st.note ? `<div class="sol-note t f-body">${md(st.note)}</div>` : ""}</div></article>`;
  const answer = hasAnswer ? (typeof s.answer === "string" ? { latex: s.answer } : s.answer) : null;
  const frames = Array.from({ length: n }, (_, k) => {
    const done = Math.min(k, steps.length);
    const list = steps.slice(0, done).map((st, i) => stepHTML(st, i, done)).join("");
    const final = hasAnswer && k === n - 1 ? `<div class="sol-answer"><span class="sol-label t f-label">${esc(answer.label || "Resposta")}</span>${answer.latex ? `<div class="sol-math">${tex(answer.latex)}</div>` : ""}${answer.text ? `<div class="t f-body">${md(answer.text)}</div>` : ""}</div>` : "";
    const empty = k === 0 ? `<div class="sol-think t f-display">${md(s.prompt || "Por onde você começaria?")}</div>` : "";
    return panel(k, `<div class="sol-steps">${empty}${list}${final}</div>`);
  }).join("");
  return `<div class="L-solution dyn" data-lesson="solution" data-lesson-count="${n}">${head(s)}<div class="sol-row">${left}<div class="dyn-frames">${frames}</div></div></div>`;
}

// ------------------------------------------------------------------------------------------------ calc
// o modelo da calculadora (o mesmo no motor e na apresentação): entradas, saídas em ordem, faixas e régua
export function calcModel(s) {
  const inputs = Object.entries(s.inputs || {}).map(([name, v]) => {
    const o = typeof v === "number" ? { value: v } : v || {};
    const value = Number(o.value ?? 1);
    return { name, label: String(o.label || name), unit: o.unit ? String(o.unit) : "", value, min: Number(o.min ?? (value > 0 ? value / 10 : -10)), max: Number(o.max ?? (value > 0 ? value * 10 : 10)), step: Number(o.step ?? ((Number(o.max ?? value * 10) - Number(o.min ?? 0)) / 200 || 0.01)), fixed: !!o.fixed, ...(o.latex ? { latex: String(o.latex) } : {}), ...(o.decimals != null ? { decimals: Number(o.decimals) } : {}) };
  });
  const outputs = [].concat(s.outputs || []).map((o, i) => ({ name: String(o.name || `saida${i + 1}`), label: String(o.label || o.name || `Resultado ${i + 1}`), fn: o.fn ? String(o.fn) : "", of: o.of ? String(o.of) : "", unit: o.unit ? String(o.unit) : "", latex: o.latex ? String(o.latex) : "",
    ...(o.decimals != null ? { decimals: Number(o.decimals) } : {}), ...(o.sci ? { sci: true } : {}),
    cases: [].concat(o.cases || []).map((c) => ({ ...(c.below != null ? { below: Number(c.below) } : {}), ...(c.fn ? { fn: String(c.fn) } : {}), ...(c.text ? { text: String(c.text) } : {}), ...(c.color ? { color: String(c.color) } : {}) })),
    ...(o.scale ? { scale: { min: Number(o.scale.min ?? 0), max: Number(o.scale.max ?? 1), ...(o.scale.log ? { log: true } : {}) } } : {}) }));
  return { inputs, outputs, scenarios: s.scenarios || [], sweep: s.sweep || '', explanation: String(s.explanation || ''), prediction: String(s.prediction || ''), illustrative: !!s.illustrative };
}
const C = globalThis.SagaCalc;
export const calcEvaluate = (m, v) => C.evaluate(m, v);
const formatNum = (v, o) => C.format(v, o);
const scalePos = (v, sc) => C.scalePos(v, sc);
export function calcHTML(s, ctx, head) {
  const m = calcModel(s);
  const res = calcEvaluate(m);
  const errs = Object.entries(res).filter(([, r]) => r.error).map(([k, r]) => `${k}: ${r.error}`);
  if (errs.length) ctx?.warnings?.push(...errs.map((e) => `calculadora: ${e}`));
  const input = (i) => i.fixed
    ? `<div class="calc-in fixed"><span class="calc-l t f-label">${esc(i.label)}</span><b class="calc-const">${i.latex ? tex(i.latex, false) : `${esc(formatNum(i.value, i))}${i.unit ? ` <small>${esc(i.unit)}</small>` : ""}`}</b></div>`
    : `<label class="calc-in"><span class="calc-l t f-label">${esc(i.label)}${i.latex ? ` <span class="calc-sym">${tex(i.latex, false)}</span>` : ""}</span><input type="range" data-calc-in="${esc(i.name)}" min="${i.min}" max="${i.max}" step="${i.step}" value="${i.value}" aria-label="${esc(i.label)}"><output class="calc-v" data-calc-show="${esc(i.name)}">${esc(formatNum(i.value, i))}</output><small class="calc-u">${esc(i.unit)}</small></label>`;
  const output = (o) => {
    const r = res[o.name];
    const scale = o.scale ? (() => {
      const zones = o.cases.filter((c) => c.below != null || c.text);
      let prev = o.scale.min;
      const bands = zones.map((c) => { const to = c.below ?? o.scale.max, a = scalePos(prev, o.scale), b = scalePos(to, o.scale); prev = to; // rótulo da faixa: fora do ajuste de texto (não é .t) e só se a faixa tiver largura para ele
        return `<span class="calc-band" style="left:${a}%;width:${Math.max(0, b - a)}%;background:${c.color ? `var(--${c.color})` : "var(--line)"}">${b - a >= 14 ? `<em class="f-label">${esc(c.text || "")}</em>` : ""}</span>`; }).join("");
      const val = o.of ? res[o.of]?.value ?? null : r.value;
      return `<div class="calc-scale"><div class="calc-track">${bands}</div><span class="calc-pointer" data-calc-pointer="${esc(o.name)}" style="left:${scalePos(val, o.scale)}%"></span></div>`;
    })() : "";
    const badge = r.text ? `<span class="calc-badge t f-display" data-calc-badge="${esc(o.name)}" style="${r.color ? `background:var(--${r.color})` : ""}">${esc(r.text)}</span>` : (o.cases.some((c) => c.text) ? `<span class="calc-badge t f-display" data-calc-badge="${esc(o.name)}"></span>` : "");
    const value = o.fn || o.cases.some((c) => c.fn) ? `<div class="calc-out-v"><b data-calc-out="${esc(o.name)}">${esc(formatNum(r.value, o))}</b>${o.unit ? ` <small>${esc(o.unit)}</small>` : ""}</div>` : "";
    const compare = `<small class="calc-compare" data-calc-compare="${esc(o.name)}" hidden></small>`;
    const sweep = m.inputs.find(i => i.name === m.sweep);
    const curve = sweep && o.fn ? C.curveData(m, {}, o.name) : null;
    const chart = curve ? `<figure class="calc-curve"><svg viewBox="0 0 320 80" role="img" aria-label="${esc(o.label)} em função de ${esc(sweep.label)}"><path data-calc-curve="${esc(o.name)}" d="${curve.path}" fill="none" stroke="currentColor" stroke-width="3"/></svg><figcaption><span data-calc-axis="${esc(o.name)}">${esc(o.label)}: ${esc(formatNum(curve.min, o))} a ${esc(formatNum(curve.max, o))} ${esc(o.unit)} (escala automática)</span><br>${esc(sweep.label)}: ${esc(formatNum(sweep.min))} a ${esc(formatNum(sweep.max))} ${esc(sweep.unit)}</figcaption></figure>` : '';
    return `<div class="calc-out"><div class="calc-l t f-label">${esc(o.label)}</div>${o.latex ? `<div class="calc-formula">${tex(o.latex, false)}</div>` : ""}${value}${badge}${scale}${chart}${compare}</div>`;
  };
  const payload = JSON.stringify(m).replace(/</g, "\\u003c");
  const controls = `<div class="calc-tools">${m.scenarios.map((c, i) => `<button type="button" data-calc-scenario="${i}">${esc(c.label || `Cenário ${i + 1}`)}</button>`).join('')}<button type="button" data-calc-free>Explorar</button><button type="button" data-calc-freeze>Comparar com este</button><button type="button" data-calc-reset>Restaurar</button></div>`;
  const prediction = m.prediction ? `<div class="calc-prediction"><span>${esc(m.prediction)}</span> <button type="button" data-calc-reveal>Ver resultado</button></div>` : '';
  const explanation = `<p class="calc-explanation" data-calc-explanation aria-live="polite">${esc(m.explanation)}</p>`;
  return `<div class="L-calc" data-calc>${head(s)}${m.illustrative ? '<small class="calc-disclaimer">Simulação ilustrativa</small>' : ''}${prediction}${controls}<div class="calc-body"><div class="calc-inputs">${m.inputs.map(input).join("")}</div><div class="calc-outputs">${m.outputs.map(output).join("")}</div></div>${explanation}<script type="application/json" class="calc-model">${payload}</script>${s.note ? `<div class="calc-note t f-body">${md(s.note)}</div>` : ""}</div>`;
}

// ------------------------------------------------------------------------------------------------ algo
import { traceAlgorithm, ALGO_CODE, ALGO_NAMES } from "./algo-trace.js";
import { tracePlan, traceHTML } from "./trace-view.js";
// Prever → rodar → explicar: `predict` vira o primeiro quadro (a turma aposta antes de ver), `explain` o último (o
// porquê, com a resposta da aposta em destaque). Os passos do algoritmo ficam no meio, renumerados.
function bookends(s, html) {
  const p = s.predict == null || s.predict === "" ? null : typeof s.predict === "string" ? { question: s.predict } : s.predict;
  const x = s.explain == null || s.explain === "" ? null : typeof s.explain === "string" ? { text: s.explain } : s.explain;
  if (!p && !x) return html;
  let out = html;
  if (p) {
    const opts = Array.isArray(p.options) ? p.options : [];
    const pre = `<div class="algo-predict-in"><div class="algo-predict-tag t f-label">${esc(p.label || "Antes de rodar")}</div><div class="algo-predict-q t f-heading">${md(p.question || "")}</div>${opts.length ? `<ol class="algo-predict-opts">${opts.map((o, i) => `<li class="t f-body"><b>${String.fromCharCode(65 + i)}</b>${md(String(o))}</li>`).join("")}</ol>` : ""}</div>`;
    out = out.replace(/data-lesson-panel="(\d+)"/g, (_, k) => `data-lesson-panel="${+k + 1}"`).replace(/(<section class="lesson-panel dyn-frame [^"]*?) active"/, "$1\"");
    out = out.replace('<div class="dyn-frames">', `<div class="dyn-frames">${panel(0, pre, "algo-predict")}`);
  }
  const count = Number(out.match(/data-lesson-count="(\d+)"/)?.[1] || 0) + (p ? 1 : 0) + (x ? 1 : 0);
  out = out.replace(/data-lesson-count="\d+"/, `data-lesson-count="${count}"`);
  if (x) {
    const ans = x.answer ?? p?.answer;
    const post = `<div class="algo-explain-in"><div class="algo-predict-tag t f-label">${esc(x.label || "Por quê")}</div>${ans != null && ans !== "" ? `<div class="algo-explain-ans t f-heading">${md(String(ans))}</div>` : ""}<div class="algo-explain-text t f-body">${md(x.text || "")}</div></div>`;
    const at = out.lastIndexOf("</section>");
    if (at >= 0) out = out.slice(0, at + 10) + panel(count - 1, post, "algo-explain") + out.slice(at + 10);
  }
  return out;
}

export function algoHTML(s, ctx, head) {
  return bookends(s, algoCore(s, ctx, head));
}
function algoCore(s, ctx, head) {
  // programa do professor (program:) ou do catálogo (kmp, bfs…): execução rastreada genérica (src/pytrace.js)
  const plan = tracePlan(s);
  if (plan) return traceHTML(s, plan, ctx, head, panel);
  const algorithm = String(s.algorithm || "bubble");
  let steps;
  try { steps = traceAlgorithm(algorithm, s.array || [5, 1, 4, 2, 8, 3], { target: s.target }); }
  catch (e) { ctx?.warnings?.push(`algoritmo: ${e.message}`); return `<div class="L-algo">${head(s)}<div class="dyn-error f-body">${esc(e.message)}</div></div>`; }
  // passos demais para clicar: some só com as comparações sem troca (o essencial fica)
  const max = Number(s.maxSteps) || 90;
  if (steps.length > max) steps = steps.filter((st, i) => i === 0 || i === steps.length - 1 || !(st.compare && !st.swap && st.write == null && st.found == null));
  if (steps.length > max) { ctx?.warnings?.push(`algoritmo: ${steps.length} passos; use um vetor menor para caber no clique (até ${max})`); steps = steps.slice(0, max - 1).concat(steps.slice(-1)); }
  const code = s.code ? String(s.code).split("\n") : ALGO_CODE[algorithm];
  const top = Math.max(...steps.flatMap((st) => st.arr), 1);
  const n = steps.length, search = ["linear", "binary"].includes(algorithm);
  const bars = (st, prev) => {
    const cmp = new Set(st.compare || []), sw = new Set(st.swap || []), sorted = new Set(st.sorted || []);
    const [lo, hi] = st.range || [0, st.arr.length - 1];
    return `<div class="algo-bars" style="--n:${st.arr.length}">${st.arr.map((v, i) => {
      const from = st.swap && sw.has(i) ? (i === st.swap[0] ? st.swap[1] - st.swap[0] : st.swap[0] - st.swap[1]) : 0;
      const cls = [cmp.has(i) && "cmp", sw.has(i) && "swp", st.write === i && "wr", st.pivot === i && "piv", sorted.has(i) && "ok", (i < lo || i > hi) && "out", st.found === i && "found"].filter(Boolean).join(" ");
      return `<div class="algo-bar ${cls}" style="--h:${(v / top) * 100}%;--from:${from}"><span class="algo-val t f-display">${v}</span><i></i><span class="algo-idx t f-label">${i}</span></div>`;
    }).join("")}</div>`;
  };
  const codeHTML = (line) => `<ol class="algo-code dyn-mono">${code.map((l, i) => `<li${i === line ? ' class="now"' : ""}>${esc(l)}</li>`).join("")}</ol>`;
  const body = steps.map((st, k) => panel(k, `<div class="algo-row"><div class="algo-stage">${bars(st, steps[k - 1])}<div class="algo-caption t f-body">${md(st.text || "")}</div></div>
    <aside class="algo-side"><div class="algo-name t f-label">${esc(s.name || ALGO_NAMES[algorithm] || algorithm)}${search && s.target != null ? ` · alvo <b>${esc(s.target)}</b>` : ""}</div>${codeHTML(st.line)}
      <div class="algo-counters"><div><b class="t f-display">${st.comparisons}</b><span class="t f-label">comparações</span></div>${search ? "" : `<div><b class="t f-display">${st.swaps}</b><span class="t f-label">${algorithm === "merge" ? "escritas" : "trocas"}</span></div>`}<div><b class="t f-display">${k}/${n - 1}</b><span class="t f-label">passo</span></div></div>
    </aside></div>`)).join("");
  return `<div class="L-algo dyn" data-lesson="algo" data-lesson-count="${n}" data-autoplay-ms="${Number(s.speed) || 900}">${head(s)}<button type="button" class="algo-play" data-autoplay aria-pressed="false" title="Tocar sozinho (clique de novo para pausar)"><span class="algo-play-ic" aria-hidden="true"></span><span>Tocar</span></button><div class="dyn-frames">${body}</div></div>`;
}
