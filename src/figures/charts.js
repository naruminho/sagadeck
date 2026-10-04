// Gráficos em SVG (animados no HTML; bar/column/line/donut viram gráfico NATIVO no PowerPoint).
//
//   { chart: bar,    data: [{label: "Médicos", value: 74}, …], suffix: "%", highlight: [2] }
//   { chart: column, data: […], max: 100 }
//   { chart: column, labels: [2024, 2025], series: [{name: "Receita", values: [10, 14]}, {name: "Custo", values: [8, 9]}] }  (agrupado; bar também)
//   { chart: line,   labels: [...], series: [{name, values: [...]}], annotations: [{at: 5, text: "lanche"}], min: 0, max: 80 }
//   { chart: donut,  value: 79, label: "menos acidentes" }            (ou parts: [{label, value}])
//   { chart: waffle, total: 100, cols: 10, groups: [{count: 21, label: "…"}, {count: 79, label: "…"}] }
//   { chart: isotype, total: 20, highlight: 4, icon: car }             (ícone repetido)
//   { chart: stacked, data: [{label, value}, …] }
//
// Cores: por padrão usam o tom do slide (--cb base, --ca destaque, --s1..--s5 séries).
// Qualquer item aceita color: hi | em | fg | muted | "FF0000".
import { esc } from "../markup.js";
import { iconSVG } from "./icons.js";
import { humanBody } from "./pictos.js";

const cvar = (c, d) => (!c ? `var(--${d})` : /^#?[0-9a-f]{6}$/i.test(c) ? `#${String(c).replace("#", "")}` : `var(--${c})`);
const fmt = (v, o) => {
  if (v == null || isNaN(v)) return "";
  const d = o.decimals ?? (Math.abs(v) < 10 && v % 1 ? 1 : 0);
  const s = Number(v).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
  return `${o.prefix || ""}${s}${o.suffix || ""}`;
};
const norm = (o) => {
  if (Array.isArray(o.data)) return o.data.map((d) => (typeof d === "number" ? { label: "", value: d } : d));
  if (o.labels && o.values) return o.labels.map((l, i) => ({ label: l, value: o.values[i] }));
  if (o.labels && o.series?.length === 1) return o.labels.map((l, i) => ({ label: l, value: o.series[0].values?.[i] ?? 0 }));
  return [];
};
// várias séries (colada do Excel com mais de uma coluna de números): barras/colunas agrupadas
const grouped = (o) => !Array.isArray(o.data) && Array.isArray(o.labels) && Array.isArray(o.series) && o.series.length > 1;
// nomes dos eixos (xLabel embaixo, yLabel na vertical à esquerda): cabem nas margens que o gráfico reserva
const axisTitles = (o, W, H, left = 0) => `${o.xLabel ? `<text x="${left + (W - left) / 2}" y="${H - 6}" text-anchor="middle" class="ch-axis f-label" font-size="22" style="fill:var(--muted)">${esc(o.xLabel)}</text>` : ""}${o.yLabel ? `<text x="0" y="0" transform="translate(22 ${H / 2}) rotate(-90)" text-anchor="middle" class="ch-axis f-label" font-size="22" style="fill:var(--muted)">${esc(o.yLabel)}</text>` : ""}`;
const seriesColor = (s, i) => (s.color ? cvar(s.color) : `var(--s${(i % 5) + 1})`);
function legendSVG(series, W, y = 30) {
  let x = W, g = "";
  [...series].reverse().forEach((s, ri) => {
    const i = series.length - 1 - ri, name = String(s.name || `Série ${i + 1}`);
    x -= textW(name, 24) + 60;
    g += `<rect x="${x}" y="${y - 20}" width="24" height="24" rx="5" style="fill:${seriesColor(s, i)}"/><text x="${x + 34}" y="${y}" class="f-label" font-size="24" style="fill:var(--muted)">${esc(name)}</text>`;
  });
  return g;
}
const isHL = (o, d, i) => {
  const h = o.highlight;
  if (h == null) return false;
  const arr = Array.isArray(h) ? h : [h];
  return arr.includes(i) || arr.includes(d.label) || d.highlight;
};
// ---- rótulos que cabem (todo texto de gráfico tem uma largura para respeitar) ----
// largura aproximada por caractere, em "em": texto comum ~0,62 (fontes largas como Century Gothic);
// rótulos f-label são MAIÚSCULOS e espaçados, bem mais largos (~0,86). O fit.js mede de verdade depois.
const EM = { text: 0.62, caps: 0.86 };
const textW = (s, fs, k = EM.text) => String(s ?? "").length * fs * k;
// reduz a fonte até `minFs`; se ainda não couber, quebra em 2 linhas (no espaço mais perto do meio)
function fitLabel(label, maxW, fs, minFs = 22, k = EM.text) {
  const s = String(label ?? "");
  const one = Math.min(fs, maxW / Math.max(1, s.length * k));
  if (one >= minFs || !/\s/.test(s)) return { fs: Math.max(12, Math.round(one)), lines: [s] };
  const words = s.split(/\s+/);
  let best = [s, ""], longest = Infinity;
  for (let k = 1; k < words.length; k++) {
    const a = words.slice(0, k).join(" "), b = words.slice(k).join(" ");
    if (Math.max(a.length, b.length) < longest) { longest = Math.max(a.length, b.length); best = [a, b]; }
  }
  return { fs: Math.max(12, Math.round(Math.min(fs, maxW / (longest * k)))), lines: best };
}
// rótulos do mesmo eixo com o mesmo tamanho (o menor que coube): tamanhos diferentes parecem erro
const sameSize = (lbls) => { const fs = Math.min(...lbls.map((l) => l.fs)); lbls.forEach((l) => (l.fs = fs)); return lbls; };
// <text> com 1 ou 2 linhas; `y` é a linha de base da PRIMEIRA linha (2 linhas sobem meia linha)
function labelSVG(lbl, x, y, attrs, center = true) {
  const lh = lbl.fs * 1.12, y0 = center && lbl.lines.length > 1 ? y - lh / 2 : y;
  const body = lbl.lines.length > 1
    ? lbl.lines.map((l, i) => `<tspan x="${x}" y="${y0 + i * lh}">${esc(l)}</tspan>`).join("")
    : esc(lbl.lines[0]);
  return `<text x="${x}" y="${y0}" font-size="${lbl.fs}" ${attrs}>${body}</text>`;
}

const wrap = (w, h, inner, o, type) =>
  `<svg class="chart chart-${type}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" data-chart='${esc(JSON.stringify(nativeSpec(o, type)))}'>${inner}</svg>`;

// especificação usada pelo exportador de PPTX para montar gráfico nativo
function nativeSpec(o, type) {
  if ((type === "bar" || type === "column") && grouped(o)) return { type, labels: o.labels, series: o.series.map((s) => ({ name: s.name || "", values: s.values })), suffix: o.suffix || "", prefix: o.prefix || "", max: o.max };
  if (type === "bar" || type === "column") {
    const d = norm(o);
    return { type, labels: d.map((x) => x.label), values: d.map((x) => x.value), suffix: o.suffix || "", prefix: o.prefix || "", max: o.max, highlight: d.map((x, i) => !!isHL(o, x, i)) };
  }
  if (type === "line") return { type, labels: o.labels, series: o.series.map((s) => ({ name: s.name || "", values: s.values })), min: o.min, max: o.max, suffix: o.suffix || "" };
  if (type === "donut") return { type, parts: o.parts || [{ label: o.label || "", value: o.value }, { label: "", value: (o.total || 100) - o.value }] };
  return { type: "image" };
}

function barGrouped(o, W, H) {
  const { labels, series } = o, k = series.length;
  const all = series.flatMap((s) => s.values).filter((v) => v != null);
  const max = o.max ?? Math.max(...all) * 1.08, top = 50;
  const fs0 = o.fontSize || 34;
  const lw = o.labelWidth ?? Math.round(Math.min(W * 0.4, Math.max(W * 0.18, Math.max(0, ...labels.map((l) => textW(l, fs0))) + 40)));
  const vw = 140, rowH = (H - top) / labels.length, bh = Math.min(o.barHeight || 60, (rowH * 0.78) / k);
  let g = legendSVG(series, W);
  const lbls = sameSize(labels.map((l) => fitLabel(l, lw - 30, fs0)));
  labels.forEach((_, i) => {
    const y0 = top + i * rowH + (rowH - bh * k) / 2;
    g += labelSVG(lbls[i], lw - 24, y0 + (bh * k) / 2 + 12, `text-anchor="end" class="f-heading" style="fill:var(--fg)"`);
    series.forEach((s, j) => {
      const v = s.values[i]; if (v == null) return;
      const y = y0 + j * bh, bw = Math.max(4, ((W - lw - vw) * v) / max);
      g += `<rect class="gx" style="--i:${i};fill:${seriesColor(s, j)}" x="${lw}" y="${y}" width="${bw}" height="${bh - 4}" rx="${Math.min(6, bh / 4)}"/>`;
      g += `<text class="fade-in f-display" style="--i:${i};fill:var(--fg)" x="${lw + bw + 14}" y="${y + bh / 2 + 10}" font-size="${o.valueSize || Math.min(34, bh * 0.8)}">${esc(fmt(v, o))}</text>`;
    });
  });
  return wrap(W, H, g, o, "bar");
}

function columnGrouped(o, W, H) {
  const { labels, series } = o, k = series.length;
  const all = series.flatMap((s) => s.values).filter((v) => v != null);
  const max = o.max ?? Math.max(...all) * 1.12;
  const top = 110, bottom = o.xLabel ? 130 : 90, ch = H - top - bottom, slot = W / labels.length;
  const bw = Math.min(o.barWidth || 120, (slot * 0.8) / k);
  let g = legendSVG(series, W) + `<line x1="0" y1="${top + ch}" x2="${W}" y2="${top + ch}" style="stroke:var(--line)" stroke-width="3"/>`;
  const lbls = sameSize(labels.map((l) => fitLabel(l, slot * 0.94, o.fontSize || 30)));
  labels.forEach((_, i) => {
    const x0 = i * slot + (slot - bw * k) / 2;
    series.forEach((s, j) => {
      const v = s.values[i]; if (v == null) return;
      const bh = Math.max(4, (ch * v) / max), X = x0 + j * bw, Y = top + ch - bh;
      g += `<rect class="gy" style="--i:${i};fill:${seriesColor(s, j)}" x="${X + 3}" y="${Y}" width="${bw - 6}" height="${bh}" rx="5"/>`;
      g += `<text class="fade-in f-display" style="--i:${i};fill:var(--fg)" x="${X + bw / 2}" y="${Y - 14}" text-anchor="middle" font-size="${o.valueSize || Math.min(40, Math.max(20, bw * 0.4))}">${esc(fmt(v, o))}</text>`;
    });
    g += labelSVG(lbls[i], i * slot + slot / 2, top + ch + 52, `text-anchor="middle" class="f-heading" style="fill:var(--fg)"`, false);
  });
  return wrap(W, H, g + axisTitles(o, W, H), o, "column");
}

function bar(o, W, H) {
  if (grouped(o)) return barGrouped(o, W, H);
  const d = norm(o);
  const max = o.max ?? Math.max(...d.map((x) => x.value)) * 1.08;
  const fs0 = o.fontSize || 36;
  const longest = Math.max(0, ...d.map((x) => textW(x.label, fs0)));
  const lw = o.labelWidth ?? Math.round(Math.min(W * 0.45, Math.max(W * 0.22, longest + 40)));
  const vw = 150;
  const n = d.length, rowH = H / n, bh = Math.min(o.barHeight || 84, rowH * 0.64);
  let g = "";
  const lbls = sameSize(d.map((x) => fitLabel(x.label, lw - 30, fs0)));
  d.forEach((x, i) => {
    const y = i * rowH + (rowH - bh) / 2;
    const bw = Math.max(4, ((W - lw - vw) * x.value) / max);
    const hl = isHL(o, x, i);
    const color = x.color ? cvar(x.color) : hl ? "var(--ca)" : "var(--cb)";
    g += labelSVG(lbls[i], lw - 24, y + bh / 2 + 12, `text-anchor="end" class="f-heading" style="fill:var(--fg)"`);
    g += `<rect class="gx" style="--i:${i};fill:${color}" x="${lw}" y="${y}" width="${bw}" height="${bh}" rx="${Math.min(8, bh / 4)}"/>`;
    g += `<text class="fade-in f-display" style="--i:${i};fill:var(--fg)" x="${lw + bw + 18}" y="${y + bh / 2 + 16}" font-size="${o.valueSize || 46}">${esc(fmt(x.value, o))}</text>`;
  });
  return wrap(W, H, g, o, "bar");
}

function column(o, W, H) {
  if (grouped(o)) return columnGrouped(o, W, H);
  const d = norm(o);
  const max = o.max ?? Math.max(...d.map((x) => x.value)) * 1.1;
  const n = d.length, top = 80, bottom = o.xLabel ? 130 : 90, ch = H - top - bottom;
  const slot = W / n, bw = Math.min(o.barWidth || 220, slot * 0.62);
  let g = `<line x1="0" y1="${top + ch}" x2="${W}" y2="${top + ch}" style="stroke:var(--line)" stroke-width="3"/>`;
  const lbls = sameSize(d.map((x) => fitLabel(x.label, slot * 0.94, o.fontSize || 32)));
  d.forEach((x, i) => {
    const bh = Math.max(4, (ch * x.value) / max);
    const X = i * slot + (slot - bw) / 2, Y = top + ch - bh;
    const hl = isHL(o, x, i);
    const color = x.color ? cvar(x.color) : hl ? "var(--ca)" : "var(--cb)";
    g += `<rect class="gy" style="--i:${i};fill:${color}" x="${X}" y="${Y}" width="${bw}" height="${bh}" rx="6"/>`;
    g += `<text class="fade-in f-display" style="--i:${i};fill:var(--fg)" x="${X + bw / 2}" y="${Y - 18}" text-anchor="middle" font-size="${o.valueSize || 56}">${esc(fmt(x.value, o))}</text>`;
    g += labelSVG(lbls[i], X + bw / 2, top + ch + 52, `text-anchor="middle" class="f-heading" style="fill:var(--fg)"`, false);
  });
  return wrap(W, H, g + axisTitles(o, W, H), o, "column");
}

// marcações "redondas" do eixo (passo 1, 2, 2,5 ou 5 × 10^k, umas 4 a 6): arredondar para inteiro deixava um eixo de
// 0 a 1 só com "0" e "1"
export function niceTicks(min, max, want = 5) {
  if (!(max > min)) return [min];
  const raw = (max - min) / want, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((x) => x >= raw);
  const out = [];
  for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + 1e-9; v += step) out.push(+v.toPrecision(12));
  return out;
}
function line(o, W, H) {
  const series = o.series || [{ values: o.values }];
  // rótulo que veio como número (0.5): com vírgula, como o resto do gráfico
  const labels = (o.labels || series[0].values.map((_, i) => String(i + 1))).map((l) => (typeof l === "number" ? l.toLocaleString("pt-BR", { useGrouping: false }) : l));
  const all = series.flatMap((s) => s.values).filter((v) => v != null);
  const min = o.min ?? Math.min(0, ...all), max = o.max ?? Math.max(...all) * 1.1;
  // nomes no fim das linhas, a não ser que se encostem (as linhas terminam juntas) ou o slide peça legenda: aí, legenda em cima
  const ends = series.length > 1 ? series.map((s) => s.values.filter((v) => v != null).at(-1)) : [];
  const useLegend = series.length > 1 && (o.legend === true || ends.some((a, i) => ends.some((b, j) => j > i && Math.abs(a - b) <= (max - min) * 0.08)));
  const L = (o.axis === false ? 10 : 90) + (o.yLabel ? 40 : 0), R = 40, T = useLegend ? 80 : 50, B = o.xLabel ? 110 : 70;
  const cw = W - L - R, ch = H - T - B, n = labels.length;
  const X = (i) => L + (n === 1 ? cw / 2 : (cw * i) / (n - 1));
  const Y = (v) => T + ch - ((v - min) / (max - min)) * ch;
  let g = useLegend ? legendSVG(series, W) : "";
  const ticks = o.ticks ?? niceTicks(min, max);
  // casas do passo (0,25 não vira "0,3"); o decimals do slide vale
  const tickDec = Math.min(4, Math.max(0, ...ticks.map((t) => (String(t).split(".")[1] || "").length)));
  if (o.axis !== false) ticks.forEach((t) => {
    g += `<line x1="${L}" x2="${W - R}" y1="${Y(t)}" y2="${Y(t)}" style="stroke:var(--line)" stroke-width="2"/>`;
    g += `<text x="${L - 16}" y="${Y(t) + 9}" text-anchor="end" class="f-label" font-size="22" style="fill:var(--muted)">${esc(fmt(t, { decimals: tickDec, ...o }))}</text>`;
  });
  const gap = n > 1 ? cw / (n - 1) : cw;
  const axis = labels.map((l, i) => {
    if (!l) return null;
    const edge = n > 1 && (i === 0 || i === n - 1);
    const anchor = !edge ? "middle" : i === 0 ? "start" : "end";
    // cada rótulo usa só a SUA metade do vão para o lado do vizinho; as pontas podem avançar na margem externa
    const x = !edge ? X(i) : i === 0 ? Math.max(4, X(i) - (L - 14)) : Math.min(W - 4, X(i) + (R - 4));
    const room = !edge ? gap * 0.9 : Math.abs(X(i) - x) + gap * 0.45;
    return { anchor, x, lbl: fitLabel(l, room, 22, 15, EM.caps) };
  });
  sameSize(axis.filter(Boolean).map((a) => a.lbl));
  axis.forEach((a) => {
    if (!a) return;
    g += labelSVG(a.lbl, a.x, H - (o.xLabel ? 64 : 24) - (a.lbl.lines.length - 1) * a.lbl.fs * 1.12, `text-anchor="${a.anchor}" class="f-label" style="fill:var(--muted)"`, false);
  });
  (o.bands || []).forEach((b) => {
    g += `<line x1="${X(b.at)}" x2="${X(b.at)}" y1="${T - 20}" y2="${T + ch}" style="stroke:var(--em)" stroke-width="3" stroke-dasharray="10 10"/>`;
    if (b.text) g += `<text x="${X(b.at) + 12}" y="${T - 4}" class="f-label" font-size="22" style="fill:var(--em)">${esc(b.text)}</text>`;
  });
  series.forEach((s, si) => {
    const color = s.color ? cvar(s.color) : `var(--s${si + 1})`;
    // quebra em segmentos nos null
    let segs = [[]];
    s.values.forEach((v, i) => { if (v == null) segs.push([]); else segs[segs.length - 1].push([X(i), Y(v)]); });
    segs = segs.filter((sg) => sg.length);
    segs.forEach((sg, k) => {
      const d = sg.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
      if (o.area) g += `<path class="fade-in" style="--i:${k};fill:${color}" opacity=".14" d="${d} L${sg[sg.length - 1][0]} ${T + ch} L${sg[0][0]} ${T + ch} Z"/>`;
      g += `<path class="draw" pathLength="1" style="--i:${si * 2 + k};stroke:${color}" d="${d}" fill="none" stroke-width="${s.width || 7}" stroke-linejoin="round" stroke-linecap="round"/>`;
      if (o.markers !== false) sg.forEach((p, i) => {
        const last = i === sg.length - 1;
        g += `<circle class="fade-in" style="--i:${si * 2 + k};fill:${last ? color : "var(--bg)"};stroke:${color}" cx="${p[0]}" cy="${p[1]}" r="${last ? 11 : 7}" stroke-width="4"/>`;
      });
    });
    if (series.length > 1 && s.name && !useLegend) {
      // rótulo no fim da linha: a série mais alta ali ganha o rótulo acima; as outras, abaixo
      const lastIdx = s.values.map((v, i) => (v != null ? i : -1)).filter((i) => i >= 0).pop();
      const endVals = series.map((x) => x.values[lastIdx] ?? -Infinity);
      const isTop = s.values[lastIdx] >= Math.max(...endVals);
      g += `<text x="${X(lastIdx)}" y="${Y(s.values[lastIdx]) + (isTop ? -26 : 46)}" text-anchor="end" class="f-label" font-size="24" style="fill:${color}">${esc(s.name)}</text>`;
    }
  });
  (o.annotations || []).forEach((a, i) => {
    const s = series[a.series || 0];
    const v = a.value ?? s.values[a.at];
    const x = X(a.at), y = Y(v);
    const dy = a.dy ?? -60;
    g += `<g class="fade-in" style="--i:${6 + i}"><line x1="${x}" y1="${y}" x2="${x}" y2="${y + dy + 14}" style="stroke:var(--fg)" stroke-width="2"/>
      <text x="${x}" y="${y + dy}" text-anchor="${a.anchor || "middle"}" class="f-heading" font-size="${a.size || 30}" style="fill:var(--fg)">${esc(a.text)}</text></g>`;
  });
  return wrap(W, H, g + axisTitles(o, W, H, L), o, "line");
}

function donut(o, W, H) {
  const parts = o.parts || [{ value: o.value, color: o.color || "ca" }, { value: (o.total || 100) - o.value, color: "cb" }];
  const tot = parts.reduce((a, p) => a + p.value, 0);
  const r = Math.min(W, H) / 2 - 40, cx = W / 2, cy = H / 2, sw = o.thickness || r * 0.3;
  const C = 2 * Math.PI * r;
  let acc = 0, g = "";
  parts.forEach((p, i) => {
    const frac = p.value / tot;
    const color = cvar(p.color, i === 0 ? "ca" : `s${i + 1}`);
    g += `<circle class="arc" pathLength="1" style="--i:${i};stroke:${color};--frac:${frac};--off:${-acc}" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke-width="${sw}" transform="rotate(-90 ${cx} ${cy})" stroke-dasharray="${frac} ${1 - frac}" stroke-dashoffset="${-acc}"/>`;
    acc += frac;
  });
  if (o.center !== false) g += `<text x="${cx}" y="${cy + (o.centerSize || r * 0.42) * 0.34}" text-anchor="middle" class="f-display" font-size="${o.centerSize || r * 0.42}" style="fill:var(--fg)">${esc(o.center ?? fmt(o.value ?? parts[0].value, { suffix: "%", ...o }))}</text>`;
  return wrap(W, H, g, o, "donut");
}

function waffle(o, W, H) {
  const total = o.total || 100, cols = o.cols || 10, rows = Math.ceil(total / cols);
  const groups = o.groups || [{ count: o.value || 0, color: "ca" }];
  const colorOf = (gr, gi) => cvar(gr.color, gi === 0 ? "ca" : gi === 1 ? "cb" : `s${gi + 1}`);
  // legenda: itens em linhas, quebrando quando não cabem na largura (e cada rótulo cabe sozinho)
  const items = o.legend === false ? [] : groups.map((gr, gi) => ({ gr, gi, lbl: fitLabel(gr.label, W - 50, 30, 20) })).filter((x) => x.gr.label);
  const place = (x0) => {
    const lines = [[]];
    let lx = x0;
    for (const it of items) {
      const iw = 40 + Math.max(...it.lbl.lines.map((l) => textW(l, it.lbl.fs)));  // f-heading
      if (lines.at(-1).length && lx + iw > W) { lines.push([]); lx = x0; }
      lines.at(-1).push({ ...it, x: lx });
      lx += iw + 44;
    }
    return lines;
  };
  const lineH = (line) => Math.max(0, ...line.map((it) => it.lbl.lines.length * it.lbl.fs * 1.12)) + 14;
  const legendH = (lines) => (items.length ? 30 + lines.reduce((h, l) => h + lineH(l), 0) : 0);
  let lines = place(0);
  let cell = Math.min(W / cols, (H - legendH(lines)) / rows);
  let ox = (W - cols * cell) / 2;
  lines = place(ox);
  cell = Math.min(cell, (H - legendH(lines)) / rows);
  ox = (W - cols * cell) / 2;
  const r = cell * 0.36;
  const colors = [];
  groups.forEach((gr, gi) => { for (let k = 0; k < gr.count; k++) colors.push(colorOf(gr, gi)); });
  let g = "";
  for (let i = 0; i < total; i++) {
    const x = ox + (i % cols) * cell + cell / 2, y = Math.floor(i / cols) * cell + cell / 2;
    const c = colors[i] || "var(--line)";
    g += o.shape === "square"
      ? `<rect class="pop" style="--i:${i};fill:${c}" x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}" rx="${r * 0.2}"/>`
      : `<circle class="pop" style="--i:${i};fill:${c}" cx="${x}" cy="${y}" r="${r}"/>`;
  }
  let ly = rows * cell + 30;
  for (const line of place(ox)) {
    for (const it of line) {
      const base = ly + it.lbl.fs * 0.9;
      g += `<circle cx="${it.x + 14}" cy="${base - it.lbl.fs * 0.33}" r="14" style="fill:${colorOf(it.gr, it.gi)}"/>`;
      g += labelSVG(it.lbl, it.x + 40, base, `class="f-heading" style="fill:var(--fg)"`, false);
    }
    ly += lineH(line);
  }
  return wrap(W, H, g, o, "waffle");
}

function isotype(o, W, H) {
  const total = o.total || 10, hl = o.highlight || 0, cols = o.cols || Math.min(total, 10);
  const rows = Math.ceil(total / cols);
  const cell = Math.min(W / cols, H / rows);
  let g = "";
  const ox = (W - cols * cell) / 2;
  const glyph = o.icon ? iconSVG(o.icon, { size: cell * 0.8, stroke: o.stroke || 2 }) : null;
  for (let i = 0; i < total; i++) {
    const x = ox + (i % cols) * cell, y = Math.floor(i / cols) * cell;
    const on = o.from === "end" ? i >= total - hl : i < hl;
    const color = on ? cvar(o.color, "ca") : "var(--cb)";
    if (glyph) g += `<g class="pop" style="--i:${i};color:${color}" transform="translate(${x + cell * 0.1} ${y + cell * 0.1})">${glyph}</g>`;
    else g += `<g class="pop" style="--i:${i};--pc:${color}" transform="translate(${x + cell * 0.14} ${y + cell * 0.02}) scale(${cell / 170})">${humanBody(o.pose || "stand")}</g>`;
  }
  return wrap(W, H, g, o, "isotype");
}

function stacked(o, W, H) {
  const d = norm(o);
  const tot = d.reduce((a, x) => a + x.value, 0);
  const bh = Math.min(o.barHeight || 120, H * 0.5);
  let x = 0, g = "";
  d.forEach((p, i) => {
    const w = (W * p.value) / tot;
    const c = cvar(p.color, i === 0 ? "ca" : i === 1 ? "cb" : `s${i + 1}`);
    g += `<rect class="gx" style="--i:${i};fill:${c}" x="${x}" y="0" width="${w - 4}" height="${bh}" rx="6"/>`;
    g += `<text class="fade-in f-display" style="--i:${i};fill:var(--fg)" x="${x + 6}" y="${bh + 64}" font-size="54">${esc(fmt(p.value, { suffix: o.suffix ?? "%" }))}</text>`;
    g += `<text class="f-heading" style="fill:var(--muted)" x="${x + 6}" y="${bh + 104}" font-size="28">${esc(p.label)}</text>`;
    x += w;
  });
  return wrap(W, H, g, o, "stacked");
}

const TYPES = { bar, column, line, donut, waffle, isotype, stacked };

// o tipo como chave, como a IA às vezes escreve: { chart: { line: { labels, series } } } ou { line: { labels, series } }
function unwrapType(o) {
  if (o && o.chart && typeof o.chart === "object") {
    const [k, v] = Object.entries(o.chart)[0] || [];
    if (TYPES[k] && v && typeof v === "object") return { ...o, ...v, chart: k };
    return { ...o, ...o.chart, chart: o.chart.chart || o.chart.type };
  }
  if (o && !TYPES[o.chart]) {
    const k = Object.keys(TYPES).find((t) => o[t] && typeof o[t] === "object" && !Array.isArray(o[t]));
    if (k) { const { [k]: v, ...rest } = o; return { ...rest, ...v, chart: k }; }
  }
  return o;
}

export function chart(o, w = 1200, h = 620) {
  o = unwrapType(o);
  const fn = TYPES[o.chart];
  if (!fn) throw new Error(o.chart ? `gráfico "${o.chart}" desconhecido (${Object.keys(TYPES).join(" | ")})` : `gráfico sem tipo: diga qual em chart (${Object.keys(TYPES).join(" | ")}), ex.: { chart: line, labels: [...], series: [...] }`);
  return fn(o, o.w || w, o.h || h);
}
