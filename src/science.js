import fs from 'node:fs';
import path from 'node:path';
import katex from 'katex';
import { esc } from './markup.js';
import './runtime/formula.js';

const F = globalThis.SagaFormula;

export function mathHTML(equations = []) {
  if (!Array.isArray(equations) || equations.length > 5) throw new Error('Use até cinco equações por slide.');
  return equations.map((eq,i) => {
    const e = typeof eq === 'string' ? {latex:eq} : eq;
    const html = katex.renderToString(String(e.latex || ''), {displayMode:true,throwOnError:false,trust:false,maxExpand:1000,maxSize:20});
    return `<article class="science-equation raster"><span class="science-number">${String(i+1).padStart(2,'0')}</span><div>${e.label ? `<p class="t f-label">${esc(e.label)}</p>` : ''}${html}</div></article>`;
  }).join('');
}

// ---- gráfico do slide "Fórmulas e funções" ----
//   plot: { functions: ["a*sin(b*x)", {fn: "cos(x)", name: "cosseno"}], x: [-10, 10], y: [-3, 3],
//           params: {a: {value: 1, min: 0, max: 5, step: 0.1, label: "amplitude"}},
//           points: "x;y\n1;2\n…" | [[1, 2], …] | "dados/medidas.csv", pointsName: "medições",
//           surface: "sin(sqrt(x^2+y^2))", data: [traces Plotly], layout: {…} }
// Letra da fórmula que não é x (ou y na superfície) vira controle deslizante (valor 1, de -5 a 5, se não vier em params).
const PRESETS = { wave: {functions:['sin(x)'], x:[-6.3,6.3]}, parabola: {functions:['x^2'], x:[-4,4]}, surface: {surface:'sin(sqrt(x^2+y^2))', x:[-4,4]} };
const num = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v != null ? Number(v) : d);
const range = (r, d) => (Array.isArray(r) && r.length === 2 && r.every((v) => Number.isFinite(Number(v))) && Number(r[0]) < Number(r[1]) ? [Number(r[0]), Number(r[1])] : d);

// tabela colada do Excel/CSV (tab, ponto e vírgula ou vírgula) -> linhas de células; vírgula decimal vira ponto
export function parseTable(text) {
  const lines = String(text ?? '').replace(/\r/g, '').split('\n').filter((l) => l.trim());
  if (!lines.length) return [];
  const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
  return lines.map((l) => l.split(sep).map((c) => c.trim().replace(/^"(.*)"$/, '$1')));
}
const toNum = (c) => { const s = String(c ?? '').trim().replace(/\s/g, ''); const n = Number(/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(',', '.')); return s !== '' && Number.isFinite(n) ? n : null; };
export { toNum };

function readPoints(points, ctx) {
  if (points == null || points === '') return null;
  let rows;
  if (Array.isArray(points)) rows = points.map((p) => (Array.isArray(p) ? p : [p.x, p.y]));
  else {
    let text = String(points);
    if (/\.(csv|tsv|txt)$/i.test(text.trim()) && !text.includes('\n')) {
      const file = path.resolve(ctx?.baseDir || process.cwd(), text.trim());
      try { text = fs.readFileSync(file, 'utf8'); }
      catch { ctx?.warnings?.push(`pontos do gráfico: "${points}" não encontrado ao lado do deck`); return null; }
    }
    rows = parseTable(text);
  }
  const pts = rows.map((r) => [toNum(r[0]), toNum(r[1])]).filter(([x, y]) => x != null && y != null);
  const head = rows[0] && toNum(rows[0][1]) == null ? String(rows[0][1] || '') : '';
  return pts.length ? { x: pts.map((p) => p[0]), y: pts.map((p) => p[1]), head } : null;
}

// o que a apresentação precisa para desenhar (e redesenhar quando um controle deslizante muda)
export function plotModel(plot = {}, ctx) {
  const p = { ...(PRESETS[plot.preset] || {}), ...plot };
  if (Array.isArray(p.data) && p.data.length) return { kind: 'plotly', data: p.data, layout: p.layout || {} };
  const errors = [];
  const fns = [].concat(p.functions ?? p.function ?? []).map((f) => (typeof f === 'string' ? { fn: f } : f || {})).filter((f) => String(f.fn ?? '').trim());
  const surface = String(p.surface ?? '').trim();
  const names = new Set();
  const compiled = fns.map((f, i) => {
    try { const c = F.compile(f.fn, ['x']); c.params.forEach((n) => names.add(n)); return c; }
    catch (e) { errors.push(`fórmula ${i + 1} ("${f.fn}"): ${e.message}`); return null; }
  });
  let surf = null;
  if (surface) {
    try { surf = F.compile(surface, ['x', 'y']); surf.params.forEach((n) => names.add(n)); }
    catch (e) { errors.push(`superfície ("${surface}"): ${e.message}`); }
  }
  const given = p.params && typeof p.params === 'object' ? p.params : {};
  const params = {};
  for (const n of [...names]) {
    const g = typeof given[n] === 'number' ? { value: given[n] } : given[n] || {};
    const value = num(g.value, 1);
    params[n] = { value, min: num(g.min, Math.min(-5, value)), max: num(g.max, Math.max(5, value)), step: num(g.step, 0.1), ...(g.label ? { label: String(g.label) } : {}) };
  }
  const points = readPoints(p.points, ctx);
  return {
    kind: 'formula', errors,
    functions: fns.map((f, i) => ({ fn: String(f.fn), name: String(f.name || `y = ${f.fn}`), ...(f.color ? { color: String(f.color) } : {}), ok: !!compiled[i] })),
    surface: surf ? surface : '',
    x: range(p.x, [-10, 10]), ...(range(p.y, null) ? { y: range(p.y, null) } : {}),
    params, ...(points ? { points: { x: points.x, y: points.y, name: String(p.pointsName || points.head || 'dados') } } : {}),
    layout: p.layout || {}, _compiled: compiled, _surf: surf,
  };
}

// traces do Plotly de um modelo (a apresentação usa a mesma conta em src/runtime/science.js)
export function plotData(plot = {}, ctx) {
  const m = plotModel(plot, ctx);
  if (m.kind === 'plotly') return m.data;
  const vals = Object.fromEntries(Object.entries(m.params).map(([k, v]) => [k, v.value]));
  const out = m._compiled.map((c, i) => c && { type: 'scatter', mode: 'lines', name: m.functions[i].name, ...F.sample(c, m.x, vals) }).filter(Boolean);
  if (m.points) out.push({ type: 'scatter', mode: 'markers', name: m.points.name, x: m.points.x, y: m.points.y });
  return out;
}

// prévia desenhada no próprio slide: aparece na miniatura, na galeria, no PDF e até o Plotly carregar
function previewSVG(m) {
  const W = 800, H = 480, L = 50, R = 20, T = 20, B = 40;
  const vals = Object.fromEntries(Object.entries(m.params).map(([k, v]) => [k, v.value]));
  if (m._surf) {
    const n = 22, cells = [];
    const zs = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = m.x[0] + ((m.x[1] - m.x[0]) * i) / (n - 1), y = m.x[0] + ((m.x[1] - m.x[0]) * j) / (n - 1);
      zs.push(m._surf.eval({ ...vals, x, y }));
    }
    const fin = zs.filter((z) => z != null), lo = Math.min(...fin), hi = Math.max(...fin);
    zs.forEach((z, k) => {
      const t = z == null ? 0 : (z - lo) / ((hi - lo) || 1);
      cells.push(`<rect x="${L + ((k % n) * (W - L - R)) / n}" y="${T + (Math.floor(k / n) * (H - T - B)) / n}" width="${(W - L - R) / n + 0.5}" height="${(H - T - B) / n + 0.5}" style="fill:color-mix(in srgb,var(--s1) ${Math.round(t * 100)}%,var(--s2))"/>`);
    });
    return `<svg class="science-preview" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${cells.join('')}</svg>`;
  }
  const series = m._compiled.map((c, i) => c && { i, ...F.sample(c, m.x, vals, 160) }).filter(Boolean);
  const ys = [...series.flatMap((s) => s.y), ...(m.points?.y || [])].filter((v) => v != null).sort((a, b) => a - b);
  let [y0, y1] = m.y || (ys.length ? [ys[Math.floor(ys.length * 0.02)], ys[Math.ceil(ys.length * 0.98) - 1]] : [-1, 1]);
  if (y0 === y1) { y0 -= 1; y1 += 1; }
  const pad = m.y ? 0 : (y1 - y0) * 0.08; y0 -= pad; y1 += pad;
  const X = (x) => L + ((x - m.x[0]) / (m.x[1] - m.x[0])) * (W - L - R), Y = (y) => T + (1 - (y - y0) / (y1 - y0)) * (H - T - B);
  let g = `<line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" class="sp-axis"/><line x1="${L}" x2="${L}" y1="${T}" y2="${H - B}" class="sp-axis"/>`;
  if (y0 < 0 && y1 > 0) g += `<line x1="${L}" x2="${W - R}" y1="${Y(0)}" y2="${Y(0)}" class="sp-zero"/>`;
  if (m.x[0] < 0 && m.x[1] > 0) g += `<line x1="${X(0)}" x2="${X(0)}" y1="${T}" y2="${H - B}" class="sp-zero"/>`;
  series.forEach((s, k) => {
    let d = '', pen = false;
    s.x.forEach((x, i) => { const y = s.y[i]; if (y == null || y < y0 - (y1 - y0) || y > y1 + (y1 - y0)) { pen = false; return; } d += `${pen ? 'L' : 'M'}${X(x).toFixed(1)} ${Y(y).toFixed(1)}`; pen = true; });
    const color = m.functions[s.i].color ? `var(--${m.functions[s.i].color})` : `var(--s${(k % 5) + 1})`;
    g += `<path d="${d}" fill="none" style="stroke:${color}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>`;
  });
  (m.points?.x || []).forEach((x, i) => { g += `<circle cx="${X(x).toFixed(1)}" cy="${Y(m.points.y[i]).toFixed(1)}" r="6" style="fill:var(--s${(series.length % 5) + 1})"/>`; });
  const lab = (v) => (Math.abs(v) >= 100 ? Math.round(v) : +v.toFixed(2)).toLocaleString('pt-BR');
  g += `<text x="${L}" y="${H - 12}" class="sp-tick">${lab(m.x[0])}</text><text x="${W - R}" y="${H - 12}" text-anchor="end" class="sp-tick">${lab(m.x[1])}</text>`;
  g += `<text x="${L - 8}" y="${T + 12}" text-anchor="end" class="sp-tick">${lab(y1)}</text><text x="${L - 8}" y="${H - B}" text-anchor="end" class="sp-tick">${lab(y0)}</text>`;
  return `<svg class="science-preview" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${g}</svg>`;
}

function slidersHTML(params) {
  const ks = Object.keys(params);
  if (!ks.length) return '';
  return `<div class="science-params">${ks.map((k) => {
    const p = params[k];
    return `<label class="science-param"><span class="sp-name f-label">${esc(p.label ? `${p.label} (${k})` : k)}</span><input type="range" data-param="${esc(k)}" min="${p.min}" max="${p.max}" step="${p.step}" value="${p.value}" aria-label="${esc(p.label || k)}"><output class="sp-val">${esc(String(+p.value.toFixed(3)).replace('.', ','))}</output></label>`;
  }).join('')}</div>`;
}

export function plotHTML(plot = {}, ctx) {
  const m = plotModel(plot, ctx);
  if (m.kind === 'formula' && m.errors.length) ctx?.warnings?.push(...m.errors.map((e) => `gráfico: ${e}`));
  const { _compiled, _surf, ...pub } = m;
  const payload = JSON.stringify(pub).replace(/</g, '\\u003c');
  const empty = m.kind === 'formula' && !m.functions.length && !m.surface && !m.points;
  const help = m.kind === 'formula' && m.errors.length ? `Fórmula com erro: ${m.errors[0]}` : empty ? 'Escreva uma fórmula, como a*sin(b*x), ou cole pontos (x e y)' : 'Arraste para explorar · passe o mouse para ver valores · duplo clique para restaurar';
  const preview = m.kind === 'formula' && !empty ? previewSVG(m) : '';
  return `<div class="science-plot raster${m.errors?.length ? ' has-error' : ''}" aria-label="Gráfico interativo"><div class="science-plot-target">${preview}</div><script type="application/json" class="science-data">${payload}</script>${m.kind === 'formula' ? slidersHTML(m.params) : ''}<p class="science-help f-label">${esc(help)}</p></div>`;
}
