// Desenho da execução rastreada (layout algo com program:, ou um algoritmo do catálogo). Cada passo vira um quadro:
// à esquerda as estruturas, desenhadas conforme o tipo do dado (lista de números → barras, texto e listas → casas,
// lista de listas → grade, dicionário → tabela, dicionário de vizinhos → grafo, objeto com filhos → árvore ou lista
// ligada), com os ponteiros (i, j, atual…) e o que foi lido, escrito e comparado aceso; à direita o código com a linha
// atual e o painel de variáveis de cada chamada, como num depurador.
import { runProgram, PyError } from "./pytrace.js";
import { CATALOG } from "./algo-catalog.js";
import { esc } from "./markup.js";

const MAX_STRUCTS = 4;
const isRef = (v) => v !== null && typeof v === "object" && "ref" in v;
const normView = (v) => (Array.isArray(v) ? v.map((e) => (typeof e === "string" ? { var: e } : e)).filter((e) => e && e.var) : null);

// o que rodar: programa do slide (program + call) ou do catálogo (algorithm: kmp …)
const EXEMPLO = { program: ["def soma(v):", "    total = 0", "    for x in v:", "        total += x  # soma {x}: total = {total}", "    return total"].join("\n"), call: "soma([3, 1, 4, 1, 5])" };
export function tracePlan(s) {
  if (!s.program && s.algorithm === "program") return { ...EXEMPLO, view: normView(s.view ?? s.show), name: s.name || "" };
  if (s.program) return { program: String(s.program), call: s.call ? String(s.call) : null, view: normView(s.view ?? s.show), name: s.name || "" };
  const cat = CATALOG[String(s.algorithm || "")];
  if (cat) return { program: cat.program, call: cat.call(s), view: normView(s.view ?? s.show ?? cat.view), name: s.name || cat.name };
  return null;
}

const fmtNum = (n) => (n === Infinity ? "∞" : n === -Infinity ? "-∞" : Number.isInteger(n) ? String(n) : String(+n.toFixed(4)));
function short(v, heap, max = 36, seen = new Set()) {
  let s;
  if (v === null || v === undefined) s = "None";
  else if (v === true) s = "True"; else if (v === false) s = "False";
  else if (typeof v === "number") s = fmtNum(v);
  else if (typeof v === "string") s = `'${v}'`;
  else if (v.repr) s = v.repr;
  else if (seen.has(v.ref)) s = "…";
  else {
    const n = heap[v.ref]; seen = new Set([...seen, v.ref]);
    const r = (x) => short(x, heap, max, seen);
    if (!n) s = "?";
    else if (n.t === "list") s = `[${n.items.map(r).join(", ")}]`;
    else if (n.t === "tuple") s = `(${n.items.map(r).join(", ")})`;
    else if (n.t === "deque") s = `deque([${n.items.map(r).join(", ")}])`;
    else if (n.t === "set") s = n.items.length ? `{${n.items.map(r).join(", ")}}` : "set()";
    else if (n.t === "dict") s = `{${n.entries.map(([k, x]) => `${r(k)}: ${r(x)}`).join(", ")}}`;
    else s = `${n.cls}(${n.label === undefined ? "" : r(n.label)})`;
  }
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}
const cellText = (v, heap) => (typeof v === "string" ? v : short(v, heap, 12));

function findVar(st, name, from) {
  const fr = st.frames;
  for (let k = fr.length - 1; k >= 0; k--) if ((!from || fr[k].name === from) && name in fr[k].vars) return { v: fr[k].vars[name], k };
  return null;
}
// ids alcançáveis a partir de um valor (para não desenhar de novo o que já está dentro de outra estrutura)
function reach(v, heap, acc = new Set()) {
  if (!isRef(v) || acc.has(v.ref)) return acc;
  acc.add(v.ref);
  const n = heap[v.ref];
  if (!n) return acc;
  (n.items || []).forEach((x) => reach(x, heap, acc));
  (n.entries || []).forEach(([k, x]) => { reach(k, heap, acc); reach(x, heap, acc); });
  Object.values(n.attrs || {}).forEach((x) => reach(x, heap, acc));
  return acc;
}
function isAdjacency(n, heap) {
  if (n.t !== "dict" || n.entries.length < 2) return false;
  const keys = new Set(n.entries.map(([k]) => k));
  if ([...keys].some((k) => k !== null && typeof k === "object")) return false;
  let hits = 0;
  for (const [, v] of n.entries) {
    if (!isRef(v)) return false;
    const c = heap[v.ref];
    if (!c || !["list", "set", "tuple", "dict"].includes(c.t)) return false;
    for (const nb of neighborsOf(c, heap)) if (keys.has(nb.to)) hits++;
  }
  return hits > 0;
}
function neighborsOf(c, heap) {
  if (c.t === "dict") return c.entries.map(([k, w]) => ({ to: k, w }));
  return c.items.map((x) => {
    if (isRef(x)) { const p = heap[x.ref]; if (p && (p.t === "tuple" || p.t === "list") && p.items.length === 2 && !isRef(p.items[0])) return { to: p.items[0], w: p.items[1] }; return { to: short(x, heap) }; }
    return { to: x };
  });
}

function kindOf(v, heap, as, indexed) {
  if (as) return as;
  if (typeof v === "string") return "cells";
  const n = heap[v.ref];
  if (!n) return "cells";
  if (n.t === "list" || n.t === "tuple" || n.t === "deque") {
    if (n.t === "list" && n.items.length && n.items.every((x) => isRef(x) && heap[x.ref]?.t === "list")) return "grid";
    if (n.t === "list" && indexed.has(v.ref) && n.items.length >= 2 && n.items.length <= 24 && n.items.every((x) => typeof x === "number" && x >= 0 && Number.isFinite(x))) return "bars";
    return "cells";
  }
  if (n.t === "set") return "cells";
  if (n.t === "dict") return isAdjacency(n, heap) ? "graph" : "table";
  return n.cls ? "tree" : "cells";
}

// ponteiros aprendidos: a variável inteira cujo valor bate com o índice lido/escrito numa estrutura quase sempre
function learnPointers(steps) {
  const hits = new Map(), tot = new Map();
  const bump = (m, k, n) => { const x = m.get(k) || new Map(); x.set(n, (x.get(n) || 0) + 1); m.set(k, x); };
  for (const st of steps) {
    const top = st.frames.at(-1)?.vars || {};
    const ints = Object.entries(top).filter(([, v]) => typeof v === "number" && Number.isInteger(v));
    for (const r of [...st.reads, ...st.writes]) {
      const key = r[0] === "s" ? "s:" + r[1] : "r:" + r[0], idx = r[0] === "s" ? r[2] : r[1];
      if (typeof idx !== "number") continue;
      for (const [name, val] of ints) { bump(tot, key, name); if (val === idx) bump(hits, key, name); }
    }
  }
  const out = new Map();
  for (const [key, m] of hits) {
    const names = [...m].filter(([n, h]) => h >= 2 && h / tot.get(key).get(n) >= 0.5).map(([n]) => n);
    if (names.length) out.set(key, names);
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ estruturas
function structuresFor(st, plan, ctxT) {
  const out = [];
  if (plan.view) {
    for (const e of plan.view) {
      const f = findVar(st, e.var, e.from);
      if (!f) continue;
      out.push({ name: e.label || e.var, v: f.v, k: f.k, e });
    }
    return out;
  }
  const covered = new Set();
  for (let k = 0; k < st.frames.length && out.length < MAX_STRUCTS; k++) {
    for (const [name, v] of Object.entries(st.frames[k].vars)) {
      if (out.length >= MAX_STRUCTS) break;
      if (isRef(v)) {
        const n = st.heap[v.ref];
        if (!n || covered.has(v.ref) || n.t === "tuple") continue;
        reach(v, st.heap, covered);
        out.push({ name, v, k, e: {} });
      } else if (typeof v === "string" && ctxT.indexedStrings.has(v) && !covered.has("s:" + v)) {
        covered.add("s:" + v);
        out.push({ name, v, k, e: {} });
      }
    }
  }
  return out;
}

function hlFor(st, key) {
  const m = new Map();
  const add = (i, c) => { const s = m.get(i) || new Set(); s.add(c); m.set(i, s); };
  const keyOfRead = (r) => (r[0] === "s" ? "s:" + r[1] : "r:" + r[0]);
  const idxOf = (r) => (r[0] === "s" ? r[2] : r[1]);
  for (const r of st.reads) if (keyOfRead(r) === key) add(idxOf(r), "cmp");
  for (const w of st.writes) if ("r:" + w[0] === key) add(w[1], "wr");
  for (const mt of st.matches) for (const r of mt.reads) if (keyOfRead(r) === key) add(idxOf(r), mt.eq ? "eq" : "ne");
  return m;
}
const clsOf = (m, i) => { const s = m.get(i); if (!s) return ""; if (s.has("ne")) return " ne"; if (s.has("eq")) return " eq"; if (s.has("wr")) return " wr"; return " cmp"; };

function pointerMap(st, s, keyStr, learned, len) {
  const map = new Map();
  const add = (i, name) => { if (!Number.isInteger(i) || i < 0 || i > len) return; const a = map.get(i) || []; if (!a.includes(name)) a.push(name); map.set(i, a); };
  if (s.e.pointers) for (const p of s.e.pointers) { const v = st.watch?.[p]; if (typeof v === "number") add(v, p.replace(/\s+/g, "")); }
  else {
    const top = st.frames.at(-1).vars;
    for (const n of learned.get(keyStr) || []) if (typeof top[n] === "number") add(top[n], n);
  }
  return map;
}

function seqItems(v, heap) {
  if (typeof v === "string") return [...v];
  const n = heap[v.ref];
  return n.items || n.entries?.map(([k]) => k) || [];
}

// linha de casas (texto, lista, fila…), com as de baixo alinhadas quando o slide pede (padrão sob o texto)
function cellsBlock(st, group, prevSt, T) {
  const [base, ...unders] = group;
  const heap = st.heap;
  const baseItems = seqItems(base.v, heap);
  const rows = [{ s: base, items: baseItems, off: 0 }];
  for (const u of unders) {
    const off = st.watch?.[u.e.offset];
    rows.push({ s: u, items: seqItems(u.v, heap), off: typeof off === "number" ? off : 0 });
  }
  const ptrs = rows.map((r) => pointerMap(st, r.s, keyStrOf(r.s.v), T.learned, r.items.length));
  let C = Math.max(1, ...rows.map((r) => r.off + r.items.length), ...ptrs.map((m, k) => Math.max(0, ...[...m.keys()].map((i) => i + rows[k].off + 1))));
  C = Math.min(C, Math.max(...rows.map((r) => r.off + r.items.length)) + 1);
  const html = rows.map((r, k) => {
    const key = keyStrOf(r.s.v), hl = hlFor(st, key);
    const cells = r.items.map((x, i) => `<span class="tr-cell${clsOf(hl, i)}${k ? " under" : ""}" style="grid-column:${r.off + i + 1}">${esc(cellText(x, heap))}</span>`).join("");
    const idx = k === 0 ? `<div class="tr-grid-row tr-idx" style="--c:${C}">${r.items.map((_, i) => `<span style="grid-column:${i + 1}">${i}</span>`).join("")}</div>` : "";
    const pm = ptrs[k];
    const tags = pm.size ? `<div class="tr-grid-row tr-ptrs" style="--c:${C}">${[...pm].filter(([i]) => r.off + i < C).map(([i, names]) => `<span class="tr-ptr" style="grid-column:${r.off + i + 1}">${esc(names.join(" · "))}</span>`).join("")}</div>` : "";
    const empty = r.items.length ? "" : `<span class="tr-empty">vazio</span>`;
    return `<div class="tr-seq"><span class="tr-lab t f-label">${esc(r.s.name)}</span><div class="tr-seq-body"><div class="tr-grid-row tr-cells" style="--c:${C}">${cells}${empty}</div>${idx}${tags}</div></div>`;
  }).join("");
  void prevSt;
  const len = Math.max(1, ...rows.flatMap((r) => r.items.map((x) => cellText(x, heap).length)));
  return `<div class="tr-struct tr-k-cells" style="--c:${C};--len:${len};--cw:${Math.max(92, len * 17)}px">${html}</div>`;
}
const keyStrOf = (v) => (typeof v === "string" ? "s:" + v : "r:" + v.ref);

function barsBlock(st, s, prevSt, T) {
  const heap = st.heap, n = heap[s.v.ref], items = n.items;
  const key = keyStrOf(s.v), hl = hlFor(st, key), ptrs = pointerMap(st, s, key, T.learned, items.length);
  const top = Math.max(1, ...items);
  // troca: duas posições escritas cujos valores se inverteram desde o passo anterior
  const prev = prevSt && (() => { const f = findVar(prevSt, s.e.var || s.name, s.e.from); return f && isRef(f.v) && f.v.ref === s.v.ref ? prevSt.heap[f.v.ref]?.items : null; })();
  const w = st.writes.filter((x) => "r:" + x[0] === key).map((x) => x[1]);
  const swap = prev && w.length === 2 && prev[w[0]] === items[w[1]] && prev[w[1]] === items[w[0]] && w[0] !== w[1] ? w : null;
  return `<div class="tr-struct tr-k-bars"><span class="tr-lab t f-label">${esc(s.name)}</span><div class="algo-bars" style="--n:${items.length}">${items.map((v, i) => {
    const c = clsOf(hl, i).trim();
    const from = swap && swap.includes(i) ? (i === swap[0] ? swap[1] - swap[0] : swap[0] - swap[1]) : 0;
    const cls = [c === "wr" && swap ? "swp" : c, c === "eq" ? "cmp" : ""].filter(Boolean).join(" ");
    const tag = ptrs.get(i) ? `<span class="tr-ptr">${esc(ptrs.get(i).join(" · "))}</span>` : "";
    return `<div class="algo-bar ${cls}" style="--h:${(v / top) * 100}%;--from:${from}"><span class="algo-val t f-display">${esc(fmtNum(v))}</span><i></i><span class="algo-idx t f-label">${i}</span>${tag}</div>`;
  }).join("")}</div></div>`;
}

function gridBlock(st, s) {
  const heap = st.heap, rows = heap[s.v.ref].items.map((r) => ({ id: r.ref, items: heap[r.ref].items }));
  const cols = Math.max(1, ...rows.map((r) => r.items.length));
  const body = rows.map((r, i) => {
    const hl = hlFor(st, "r:" + r.id);
    return `<tr><th>${i}</th>${r.items.map((x, j) => `<td class="tr-cell${clsOf(hl, j)}">${esc(cellText(x, heap))}</td>`).join("")}</tr>`;
  }).join("");
  return `<div class="tr-struct tr-k-grid"><span class="tr-lab t f-label">${esc(s.name)}</span><table class="tr-table"><thead><tr><th></th>${Array.from({ length: cols }, (_, j) => `<th>${j}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function tableBlock(st, s) {
  const heap = st.heap, n = heap[s.v.ref], key = keyStrOf(s.v), hl = hlFor(st, key);
  const k2 = (k) => (typeof k === "boolean" ? Number(k) : k);
  const ents = n.entries;
  if (!ents.length) return `<div class="tr-struct tr-k-table"><span class="tr-lab t f-label">${esc(s.name)}</span><span class="tr-empty">vazio</span></div>`;
  const cell = (k, v) => `<td class="tr-cell${clsOf(hl, k2(k))}">${esc(cellText(v, heap))}</td>`;
  if (ents.length <= 12) {
    return `<div class="tr-struct tr-k-table"><span class="tr-lab t f-label">${esc(s.name)}</span><table class="tr-table tr-horiz"><tr>${ents.map(([k]) => `<th>${esc(cellText(k, heap))}</th>`).join("")}</tr><tr>${ents.map(([k, v]) => cell(k, v)).join("")}</tr></table></div>`;
  }
  return `<div class="tr-struct tr-k-table"><span class="tr-lab t f-label">${esc(s.name)}</span><table class="tr-table">${ents.map(([k, v]) => `<tr><th>${esc(cellText(k, heap))}</th>${cell(k, v)}</tr>`).join("")}</table></div>`;
}

// árvore (ou lista ligada): filhos são os atributos que apontam para outro objeto; o vazio de um lado ocupa meia casa
function treeBlock(st, s, prevSt) {
  const heap = st.heap;
  const all = reach(s.v, heap);
  const childAttrs = new Set();
  for (const id of all) { const n = heap[id]; if (n?.attrs) for (const [k, v] of Object.entries(n.attrs)) if (isRef(v) && (heap[v.ref]?.cls || (heap[v.ref]?.t === "list" && heap[v.ref].items.every((x) => isRef(x) && heap[x.ref]?.cls)))) childAttrs.add(k); }
  const slotsOf = (id) => {
    const n = heap[id];
    if (!n?.attrs) return [];
    const out = [];
    for (const k of Object.keys(n.attrs)) {
      if (!childAttrs.has(k)) continue;
      const v = n.attrs[k];
      if (v === null) out.push(null);
      else if (isRef(v) && heap[v.ref]?.cls) out.push(v.ref);
      else if (isRef(v) && heap[v.ref]?.t === "list") heap[v.ref].items.forEach((x) => out.push(x.ref));
    }
    return out;
  };
  const chain = [...all].every((id) => !heap[id]?.cls || slotsOf(id).length <= 1);
  const pos = new Map(); const edges = [];
  let maxD = 0, maxX = 0;
  const seen = new Set();
  const width = (id, stack = new Set()) => {
    if (stack.has(id)) return 1;
    const sl = slotsOf(id);
    if (!sl.some((x) => x !== null)) return 1;
    const st2 = new Set([...stack, id]);
    return Math.max(1, sl.reduce((a, c) => a + (c === null ? 0.5 : width(c, st2)), 0));
  };
  const place = (id, x0, d) => {
    if (seen.has(id)) return; seen.add(id);
    maxD = Math.max(maxD, d);
    if (chain) { pos.set(id, { x: d, y: 0 }); maxX = Math.max(maxX, d); const c = slotsOf(id).find((x) => x !== null); if (c) { edges.push([id, c]); place(c, 0, d + 1); } return; }
    const w = width(id);
    pos.set(id, { x: x0 + w / 2, y: d }); maxX = Math.max(maxX, x0 + w);
    let x = x0;
    for (const c of slotsOf(id)) { if (c === null) { x += 0.5; continue; } edges.push([id, c]); place(c, x, d + 1); x += width(c); }
  };
  if (isRef(s.v) && heap[s.v.ref]?.cls) place(s.v.ref, 0, 0);
  const W = chain ? (maxX + 1) * 170 : Math.max(1, maxX) * 120, H = chain ? 160 : (maxD + 1) * 120;
  const px = (p) => (chain ? 85 + p.x * 170 : p.x * 120), py = (p) => (chain ? 80 : 60 + p.y * 120);
  const reads = new Set(st.reads.map((r) => r[0])), writes = new Set(st.writes.map((w) => w[0]));
  const prevHeap = prevSt?.heap || {};
  const top = st.frames.at(-1).vars;
  const tags = new Map();
  for (const [name, v] of Object.entries(top)) if (isRef(v) && pos.has(v.ref)) tags.set(v.ref, [...(tags.get(v.ref) || []), name]);
  const edgeSVG = edges.map(([a, b]) => { const p = pos.get(a), q = pos.get(b); return `<line class="tr-edge" x1="${px(p)}" y1="${py(p)}" x2="${px(q)}" y2="${py(q)}"${chain ? ' marker-end="url(#tr-arrow)"' : ""}/>`; }).join("");
  const nodeSVG = [...pos].map(([id, p]) => {
    const n = heap[id];
    const cls = [reads.has(Number(id)) && "cmp", writes.has(Number(id)) && "wr", !prevHeap[id] && prevSt && "new"].filter(Boolean).join(" ");
    const tag = tags.get(id) ? `<text class="tr-node-tag" x="${px(p)}" y="${py(p) - 50}">${esc(tags.get(id).join(" · "))}</text>` : "";
    return `<g class="tr-node ${cls}"><circle cx="${px(p)}" cy="${py(p)}" r="38"/><text x="${px(p)}" y="${py(p)}">${esc(cellText(n.label, heap))}</text>${tag}</g>`;
  }).join("");
  const vw = W + (chain ? 0 : 120), vh = H + 20;
  const svg = pos.size ? `<svg class="tr-svg" viewBox="${chain ? 0 : -60} -10 ${vw} ${vh}" style="max-width:${vw}px;max-height:${vh}px" preserveAspectRatio="xMidYMid meet"><defs><marker id="tr-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="currentColor"/></marker></defs>${edgeSVG.replace(/x2="([\d.]+)"/g, (m, x) => (chain ? `x2="${Number(x) - 40}"` : m))}${nodeSVG}</svg>` : `<span class="tr-empty">vazia (None)</span>`;
  return `<div class="tr-struct tr-k-tree"><span class="tr-lab t f-label">${esc(s.name)}</span>${svg}</div>`;
}

function graphBlock(st, s) {
  const heap = st.heap, n = heap[s.v.ref];
  const keys = n.entries.map(([k]) => k);
  const nodes = [...keys];
  const edges = [];
  for (const [k, v] of n.entries) for (const nb of neighborsOf(heap[v.ref], heap)) { if (!nodes.includes(nb.to)) nodes.push(nb.to); edges.push({ a: k, b: nb.to, w: nb.w }); }
  // camadas a partir do primeiro nó (como a busca em largura enxerga); dentro da camada, perto dos vizinhos de cima
  const adj = new Map(nodes.map((k) => [k, new Set()]));
  for (const e of edges) { adj.get(e.a).add(e.b); adj.get(e.b).add(e.a); }
  const layer = new Map(), layers = [];
  for (const root of nodes) {
    if (layer.has(root)) continue;
    let frontier = [root]; layer.set(root, layers.length); layers.push([root]);
    for (;;) {
      const nextL = [];
      for (const u of frontier) for (const w of adj.get(u)) if (!layer.has(w)) { layer.set(w, layers.length); nextL.push(w); }
      if (!nextL.length) break;
      const prevIdx = new Map(layers.at(-1).map((k, i) => [k, i]));
      const bary = (k) => { const ps = [...adj.get(k)].filter((w) => prevIdx.has(w)).map((w) => prevIdx.get(w)); return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : 0; };
      nextL.sort((a, b) => bary(a) - bary(b) || nodes.indexOf(a) - nodes.indexOf(b));
      layers.push(nextL); frontier = nextL;
    }
  }
  const GW = Math.max(520, Math.max(...layers.map((l) => l.length)) * 190), GH = layers.length * 170 + 40;
  const pos = new Map();
  layers.forEach((l, d) => l.forEach((k, i) => pos.set(k, { x: (GW * (i + 1)) / (l.length + 1), y: 105 + d * 170, d, i })));
  const top = st.frames.at(-1).vars;
  const vals = (v) => (isRef(v) ? (heap[v.ref]?.items || heap[v.ref]?.entries?.map(([k]) => k) || []).flatMap((x) => (isRef(x) ? heap[x.ref]?.items || [] : [x])) : []);
  const ok = new Set(), queued = new Set(), tags = new Map();
  for (const [name, v] of Object.entries(top)) {
    if (isRef(v) && v.ref === s.v.ref) continue;
    if (isRef(v) && heap[v.ref]?.t === "set") vals(v).forEach((x) => ok.add(x));
    else if (isRef(v) && ["deque", "list"].includes(heap[v.ref]?.t)) vals(v).forEach((x) => queued.add(x));
    else if (!isRef(v) && pos.has(v)) tags.set(v, [...(tags.get(v) || []), name]);
  }
  const hotPairs = new Set();
  const params = new Set(st.frames.at(-1).params || []);
  const scal = Object.entries(top).filter(([k, v]) => !params.has(k) && !isRef(v) && pos.has(v)).map(([, v]) => v);
  for (const a of scal) for (const b of scal) if (a !== b) hotPairs.add(`${a}\u0000${b}`);
  const drawn = new Set();
  const edgeSVG = edges.map((e) => {
    const back = edges.some((f) => f.a === e.b && f.b === e.a);
    const id = back ? [e.a, e.b].map(String).sort().join("\u0000") : `${e.a}\u0000${e.b}`;
    if (drawn.has(id)) return ""; drawn.add(id);
    const p = pos.get(e.a), q = pos.get(e.b);
    const d = Math.hypot(q.x - p.x, q.y - p.y) || 1, ux = (q.x - p.x) / d, uy = (q.y - p.y) / d;
    const hot = hotPairs.has(`${e.a}\u0000${e.b}`) ? " hot" : "";
    const arrow = back ? "" : ' marker-end="url(#tr-garrow)"';
    const hasW = e.w !== undefined && e.w !== null && !isRef(e.w);
    // mesma camada e com gente no meio: arco por cima para não atravessar os nós
    if (p.d === q.d && Math.abs(p.i - q.i) > 1) {
      const mx = (p.x + q.x) / 2, my = p.y - 70 - 25 * Math.abs(p.i - q.i);
      const wl = hasW ? `<text class="tr-weight" x="${mx}" y="${(p.y + my) / 2 - 8}">${esc(cellText(e.w, heap))}</text>` : "";
      return `<path class="tr-edge${hot}" fill="none" d="M${p.x} ${p.y - 42}Q${mx} ${my} ${q.x} ${q.y - 42}"${arrow}/>${wl}`;
    }
    const wl = hasW ? `<text class="tr-weight" x="${(p.x + q.x) / 2 - uy * 26}" y="${(p.y + q.y) / 2 + ux * 26}">${esc(cellText(e.w, heap))}</text>` : "";
    return `<line class="tr-edge${hot}" x1="${p.x + ux * 44}" y1="${p.y + uy * 44}" x2="${q.x - ux * 46}" y2="${q.y - uy * 46}"${arrow}/>${wl}`;
  }).join("");
  const reads = st.reads.filter((r) => r[0] === s.v.ref).map((r) => r[1]);
  const nodeSVG = nodes.map((k) => {
    const p = pos.get(k);
    const cls = [ok.has(k) && "ok", queued.has(k) && "queued", tags.has(k) && "cur", reads.includes(k) && "cmp"].filter(Boolean).join(" ");
    const tag = tags.get(k) ? `<text class="tr-node-tag" x="${p.x}" y="${p.y - 58}">${esc(tags.get(k).join(" · "))}</text>` : "";
    return `<g class="tr-node ${cls}"><circle cx="${p.x}" cy="${p.y}" r="42"/><text x="${p.x}" y="${p.y}">${esc(cellText(k, heap))}</text>${tag}</g>`;
  }).join("");
  return `<div class="tr-struct tr-k-graph"><span class="tr-lab t f-label">${esc(s.name)}</span><svg class="tr-svg" viewBox="0 0 ${GW} ${GH}" style="max-width:${GW}px;max-height:${GH}px" preserveAspectRatio="xMidYMid meet"><defs><marker id="tr-garrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="currentColor"/></marker></defs>${edgeSVG}${nodeSVG}</svg></div>`;
}

function stageHTML(st, prevSt, plan, T) {
  const structs = structuresFor(st, plan, T);
  const parts = [];
  const used = new Set();
  for (const s of structs) {
    if (used.has(s)) continue;
    const kind = kindOf(s.v, st.heap, s.e.as, T.indexed);
    if (kind === "cells") {
      // quem se alinha embaixo desta linha (padrão sob o texto)
      const unders = structs.filter((u) => u !== s && u.e.under && u.e.under === (s.e.var || s.name) && kindOf(u.v, st.heap, u.e.as, T.indexed) === "cells");
      unders.forEach((u) => used.add(u));
      used.add(s);
      parts.push(cellsBlock(st, [s, ...unders], prevSt, T));
    } else if (kind === "bars") parts.push(barsBlock(st, s, prevSt, T));
    else if (kind === "grid") parts.push(gridBlock(st, s));
    else if (kind === "table") parts.push(tableBlock(st, s));
    else if (kind === "tree") parts.push(treeBlock(st, s, prevSt));
    else if (kind === "graph") parts.push(graphBlock(st, s));
    used.add(s);
  }
  return parts.join("");
}

function varsHTML(st, prevSt) {
  const frames = st.frames.map((f, k) => ({ ...f, k })).filter((f) => f.k > 0 || Object.keys(f.vars).length).reverse().slice(0, 3);
  const prevText = (k, name) => { const f = prevSt?.frames[k]; if (!f || !(name in f.vars) || prevSt.frames.length <= k || prevSt.frames[k].name !== st.frames[k].name) return undefined; return short(f.vars[name], prevSt.heap); };
  return `<div class="tr-vars">${frames.map((f, i) => `<div class="tr-frame${i === 0 ? " now" : ""}${Object.keys(f.vars).length > 6 ? " many" : ""}"><div class="tr-fname t f-label">${esc(f.name === "<programa>" ? "programa" : f.name)}</div><dl>${Object.entries(f.vars).map(([n, v]) => {
    const txt = short(v, st.heap), before = prevText(f.k, n);
    return `<dt>${esc(n)}</dt><dd${prevSt && before !== txt ? ' class="chg"' : ""}>${esc(txt)}</dd>`;
  }).join("") || "<dd class=\"tr-none\">sem variáveis</dd>"}</dl></div>`).join("")}</div>`;
}

function codeLines(res) {
  return res.lines.map((l, i) => {
    const c = res.comments[i + 1];
    if (!c) return l;
    const at = l.lastIndexOf(c), hash = l.lastIndexOf("#", at);
    return hash >= 0 ? l.slice(0, hash).trimEnd() : l;
  });
}
function codeHTML(lines, line) {
  const first = lines.findIndex((l) => l.trim()), lastNon = lines.length - [...lines].reverse().findIndex((l) => l.trim());
  let a = Math.max(0, first), b = lastNon;
  const WIN = 18;
  if (b - a > WIN) { const c = line > 0 ? line - 1 : a; a = Math.max(a, Math.min(c - 6, b - WIN)); b = a + WIN; }
  return `<ol class="algo-code dyn-mono tr-code" style="counter-reset:ln ${a}">${lines.slice(a, b).map((l, i) => `<li${a + i + 1 === line ? ' class="now"' : ""}>${esc(l) || " "}</li>`).join("")}</ol>`;
}

function pickSteps(steps, comments, max, warn) {
  if (steps.length <= max) return steps;
  const important = (st, i) => i === 0 || i === steps.length - 1 || st.writes.length || st.matches.length || comments[st.line] || st.kind === "return" || st.kind === "done";
  let keep = steps.filter(important);
  if (keep.length > max) { warn(`${steps.length} passos; mostrando ${max} (use uma entrada menor ou maxSteps)`); keep = keep.slice(0, max - 1).concat(steps.slice(-1)); }
  return keep;
}

export function traceHTML(s, plan, ctx, head, panel) {
  const warn = (m) => ctx?.warnings?.push(`algoritmo: ${m}`);
  const watch = [];
  for (const e of plan.view || []) { (e.pointers || []).forEach((p) => watch.push(String(p))); if (e.offset) watch.push(String(e.offset)); }
  let res;
  try { res = runProgram(plan.program, { call: plan.call, watch }); }
  catch (e) {
    if (!(e instanceof PyError)) throw e;
    warn(e.message);
    return `<div class="L-algo">${head(s)}<div class="dyn-error f-body">${esc(e.message)}</div></div>`;
  }
  const all = res.steps;
  const T = { indexed: new Set(), indexedStrings: new Set(), learned: learnPointers(all) };
  for (const st of all) for (const r of st.reads) { if (r[0] === "s") T.indexedStrings.add(r[1]); else if (typeof r[1] === "number") T.indexed.add(r[0]); }
  const steps = pickSteps(all, res.comments, Number(s.maxSteps) || 120, warn);
  const lines = codeLines(res);
  const printed = res.output.length > 0;
  const n = steps.length;
  const body = steps.map((st, k) => panel(k, `<div class="algo-row tr-row"><div class="algo-stage tr-stage"><div class="tr-structs">${stageHTML(st, steps[k - 1], plan, T)}</div><div class="algo-caption t f-body">${esc(st.text || "")}</div></div>
    <aside class="algo-side tr-side"><div class="algo-name t f-label">${esc(plan.name || "Programa")}<span class="tr-count">${k}/${n - 1}</span></div>${codeHTML(lines, st.line)}${varsHTML(st, steps[k - 1])}${printed ? `<div class="tr-out dyn-mono"><span class="t f-label">saída</span>${st.out.map((l) => `<div>${esc(l)}</div>`).join("") || "<div></div>"}</div>` : ""}</aside></div>`)).join("");
  return `<div class="L-algo L-trace dyn" data-lesson="algo" data-lesson-count="${n}" data-autoplay-ms="${Number(s.speed) || 900}">${head(s)}<button type="button" class="algo-play" data-autoplay aria-pressed="false" title="Tocar sozinho (clique de novo para pausar)"><span class="algo-play-ic" aria-hidden="true"></span><span>Tocar</span></button><div class="dyn-frames">${body}</div></div>`;
}
