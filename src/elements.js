// Elementos: os "tijolos" que os layouts (e o layout livre `canvas`) usam.
// Todo elemento aceita: step (clique em que aparece), exit (clique em que some),
// anim (up|fade|pop|left|right|zoom|none), w, h, flex, align, class, style, card.
import { tableHTML } from "./table.js";
import { qrSVG } from "./figures/qr.js";
import katex from "katex";
import fs from "node:fs";
import path from "node:path";
import { md, esc } from "./markup.js";
import { iconSVG } from "./figures/icons.js";
import { picto } from "./figures/pictos.js";
import { diagram } from "./figures/diagrams.js";
import { chart } from "./figures/charts.js";
import { parseTable, toNum } from "./science.js";
import { ufmap } from "./figures/ufmap.js";
import { highlightCode } from "./code-highlight.js";
import { resolveCodeLanguage } from "./code-language.js";

export const SIZES = { hero: 210, number: 250, title: 128, h2: 92, h3: 56, quote: 72, lead: 46, body: 36, small: 29, label: 24, mono: 30, tiny: 22 };
const FACE = { hero: "display", number: "display", title: "display", h2: "display", h3: "heading", quote: "quote", lead: "body", body: "body", small: "body", label: "label", mono: "mono", tiny: "label" };

const px = (v) => (v == null ? null : typeof v === "number" ? `${v}px` : String(v));
const colorVal = (c) => (!c ? null : /^#?[0-9a-f]{6}$/i.test(c) ? `#${c.replace("#", "")}` : `var(--${c})`);
// cor de texto: "hi" (cor de destaque) vira a versão legível sobre o fundo (--hi-ink, src/themes.js)
const textColorVal = (c) => (c === "hi" ? "var(--hi-ink,var(--hi))" : colorVal(c));

export function attrs(el = {}, extraCls = "", extraStyle = "") {
  const cls = [extraCls, el.class, el.card ? "card" : "", el.card === "hi" ? "card-hi" : "", el.goto != null && el.goto !== "" ? "goto" : ""].filter(Boolean).join(" ");
  let st = extraStyle;
  if (el.w != null) st += `width:${px(el.w)};`;
  if (el.h != null) st += `height:${px(el.h)};flex-shrink:0;`;
  if (el.w != null && el.h != null) st += `flex:none;`;
  if (el.flex != null) st += `flex:${el.flex};min-width:0;min-height:0;`;
  if (el.color) st += `color:${textColorVal(el.color)};`;
  if (el.bg) st += `background:${colorVal(el.bg)};`;
  if (el.align) st += `text-align:${el.align};`;
  if (el.pad != null) st += `padding:${px(el.pad)};`;
  if (el.x != null) st += `position:absolute;left:${px(el.x)};top:${px(el.y ?? 0)};`;
  if (el.opacity != null) st += `opacity:${el.opacity};`;
  if (el.rotate) st += `transform:rotate(${el.rotate}deg);`;
  if (el.style) st += el.style;
  let a = "";
  if (cls) a += ` class="${cls}"`;
  if (st) a += ` style="${esc(st)}"`;
  if (el.step != null && el.step > 0) a += ` data-step="${el.step}"`;
  if (el.exit != null) a += ` data-exit="${el.exit}"`;
  if (el.anim) a += ` data-anim="${el.anim}"`;
  if (el.id) a += ` id="${esc(el.id)}"`;
  if (el.continuity) a += ` data-continuity="${esc(el.continuity)}"`;
  if (el.goto != null && el.goto !== "") a += ` data-goto="${esc(el.goto)}"`;
  if (el.deco) a += ` data-locked="deco"`; // moldura/logos do original: no Studio o clique atravessa (destrava na lista de objetos)
  return a;
}

// Texto com papel tipográfico. `as` define tamanho+face; `size` sobrescreve px.
export function text(t, as = "body", el = {}) {
  const role = el.as || as;
  const face = el.face || FACE[role] || "body";
  const size = el.size || SIZES[role] || 36;
  const fit = el.fit ? " data-fit" : "";
  const style = `font-size:${size}px;` + (el.weight ? `font-weight:${el.weight};` : "") + (el.upper ? "text-transform:uppercase;" : "") + (el.lh ? `line-height:${el.lh};` : "");
  return `<div${attrs(el, `t f-${face} r-${role}`, style)}${fit}>${md(t)}</div>`;
}

// gráfico que lê um CSV ao lado do deck (csv: dados/vendas.csv): atualizou o arquivo, o slide atualiza.
// Primeira coluna = rótulo; uma coluna de números = data; várias = labels + series (linhas, colunas agrupadas).
function csvChart(el, ctx) {
  if (typeof el.csv !== "string" || !el.csv.trim()) return el;
  const file = path.resolve(ctx?.baseDir || process.cwd(), el.csv.trim());
  let text;
  try { text = fs.readFileSync(file, "utf8"); }
  catch { ctx?.warnings?.push(`gráfico: "${el.csv}" não encontrado ao lado do deck — ficaram os dados do slide`); return el; }
  const rows = parseTable(text);
  const head = rows[0] && rows[0].slice(1).some((c) => toNum(c) == null) ? rows.shift() : null;
  if (!rows.length) return el;
  const cols = Math.max(...rows.map((r) => r.length)) - 1;
  const names = Array.from({ length: cols }, (_, j) => head?.[j + 1] || `Série ${j + 1}`);
  const { data, labels, series, csv, ...rest } = el;
  if (cols === 1 && el.chart !== "line") return { ...rest, data: rows.map((r) => ({ label: r[0], value: toNum(r[1]) ?? 0 })) };
  return { ...rest, labels: rows.map((r) => r[0]), series: names.map((name, j) => ({ name, values: rows.map((r) => toNum(r[j + 1])) })) };
}

export function figureHTML(el, ctx, w, h) {
  if (el.qr) {
    const size = el.size || 360;
    const svg = qrSVG(el.qr, { ec: el.ec, ink: el.ink || "#111", paper: el.paper || "#fff" });
    return `<div${attrs(el, "fig fig-qr")}><div class="qr-box" style="width:${size}px;">${svg}</div>${el.label ? `<div class="qr-label f-label">${md(el.label)}</div>` : ""}</div>`;
  }
  if (el.icon) return `<div${attrs(el, "fig fig-icon", `color:${textColorVal(el.color) || "var(--fg)"};`)}>${iconSVG(el.icon, { size: el.size || 160, stroke: el.stroke || 1.6 })}</div>`;
  if (el.picto) return `<div${attrs(el, "fig")}>${picto(el)}</div>`;
  if (el.diagram) return `<div${attrs(el, "fig")}>${diagram(el)}</div>`;
  // (com title: o nome do gráfico em cima, como a IA escreve quando põe dois lado a lado)
  if (el.chart) return `<div${attrs(el, `fig fig-chart${el.title ? " has-title" : ""}`)}>${el.title ? `<div class="t f-label fc-title">${md(String(el.title))}</div>` : ""}${chart(csvChart(el, ctx), el.cw || w || 1200, el.ch || h || 620)}</div>`;
  if (el.ufmap) return `<div${attrs(el, "fig fig-ufmap")}>${ufmap({ cw: w, ...el }, ctx?.warnings)}</div>`;
  if (el.svg) return `<div${attrs(el, "fig")}>${el.svg}</div>`;
  if (el.image) {
    const src = imageSrc(el.image, ctx);
    if (!src) return `<div${attrs(el, "fig fig-pending fig-missing")} role="img" aria-label="Imagem não encontrada: ${esc(el.image)}"><div class="fp-in"><span class="fp-tag f-label">imagem não encontrada</span><span class="fp-text f-body">${esc(el.image)}</span></div></div>`;
    const flip = el.flipH || el.flipV ? `transform:scale(${el.flipH ? -1 : 1},${el.flipV ? -1 : 1});` : "";
    // recorte (crop: l/t/r/b em fração do lado, como o srcRect do PowerPoint): a imagem cresce e a caixa corta
    if (el.crop) {
      const c = { l: +el.crop.l || 0, t: +el.crop.t || 0, r: +el.crop.r || 0, b: +el.crop.b || 0 };
      const fw = Math.max(0.01, 1 - c.l - c.r), fh = Math.max(0.01, 1 - c.t - c.b);
      return `<div${attrs(el, "fig fig-img fig-crop")}><img src="${src}" alt="${esc(el.alt || "")}" style="left:${(-c.l / fw) * 100}%;top:${(-c.t / fh) * 100}%;width:${100 / fw}%;height:${100 / fh}%;${flip}"></div>`;
    }
    // sem fit escolhido: preenche (cover), mas quando a proporção da imagem é muito diferente da caixa (fórmula, esquema
    // largo numa coluna alta; gráfico com eixo e legenda na borda) cortar perderia informação: passou de 1,25× (corte de
    // mais de 20%), cabe inteira (contain). Sem o tamanho da caixa aqui (figura do split, do layout), a mesma conta é feita
    // na apresentação, com a caixa medida (data-autofit; src/runtime/fit.js: fitImages)
    let fit = el.fit;
    if (!fit) {
      const sz = w && h ? imageSize(el.image, ctx) : null;
      const box = w && h ? w / h : 0, img = sz && sz.h ? sz.w / sz.h : 0;
      fit = box && img && Math.max(box / img, img / box) > 1.25 ? "contain" : "cover";
    }
    // imagem solta no fluxo, sem altura (num add, numa row; largura nenhuma ou em %): ganha a proporção do arquivo, cabe
    // inteira e não passa de 420 px de altura (senão aparecia no tamanho natural do arquivo, enorme, e espremia o
    // layout do slide até sumir)
    let flow = "", box = el;
    const pct = typeof el.w === "string" && /^\s*\d+(\.\d+)?%\s*$/.test(el.w);
    if (!w && !h && (el.w == null || pct) && el.h == null && el.x == null) {
      const sz = imageSize(el.image, ctx);
      if (sz && sz.w && sz.h) {
        flow = `aspect-ratio:${sz.w}/${sz.h};width:min(${pct ? el.w.trim() : "100%"}, ${Math.round((420 * sz.w) / sz.h)}px);`;
        if (!el.fit) fit = "contain";
        if (pct) { box = { ...el }; delete box.w; }
      }
    }
    return `<div${attrs(box, "fig fig-img", flow)}><img src="${src}" alt="${esc(el.alt || "")}"${el.fit ? "" : " data-autofit"} style="object-fit:${fit};${el.radius ? `border-radius:${el.radius}px;` : ""}${flip}"></div>`;
  }
  return "";
}

// largura × altura do arquivo de imagem (cabeçalho de PNG, JPEG, GIF, WebP) ou null
export function imageSize(p, ctx) {
  try {
    if (/^(https?:|data:)/.test(p)) return null;
    const b = fs.readFileSync(path.resolve(ctx.baseDir, p));
    if (b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    if (b.toString("ascii", 0, 3) === "GIF") return { w: b.readUInt16LE(6), h: b.readUInt16LE(8) };
    if (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") {
      const kind = b.toString("ascii", 12, 16);
      if (kind === "VP8X") return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
      if (kind === "VP8 ") return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
      if (kind === "VP8L") { const v = b.readUInt32LE(21); return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 }; }
    }
    if (b[0] === 0xff && b[1] === 0xd8) {
      for (let i = 2; i < b.length - 9;) {
        if (b[i] !== 0xff) { i++; continue; }
        const m = b[i + 1], len = b.readUInt16BE(i + 2);
        if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
        i += 2 + len;
      }
    }
  } catch {}
  return null;
}

export function imageSrc(p, ctx) {
  if (/^(https?:|data:)/.test(p)) return p;
  const f = path.resolve(ctx.baseDir, p);
  if (!fs.existsSync(f)) {
    ctx.warnings?.push(`Imagem "${p}" não encontrada em ${ctx.baseDir}`);
    return null;
  }
  const ext = path.extname(f).slice(1).toLowerCase().replace("jpg", "jpeg").replace("svg", "svg+xml");
  return `data:image/${ext};base64,${fs.readFileSync(f).toString("base64")}`;
}

const isFigure = (el) => el && (el.icon || el.picto || el.diagram || el.chart || el.ufmap || el.svg || el.image || el.qr);

// Caixa de aviso/dica: { aviso: { tipo: importante|atencao|dica|perigo, titulo, texto } }.
// Atalho: { aviso: "texto" } vira dica sem título. O tipo aceita "atenção" com ou sem acento.
const AVISO_KINDS = {
  importante: { icon: "sparkles", titulo: "Importante" },
  atencao: { icon: "alert-triangle", titulo: "Atenção" },
  dica: { icon: "lightbulb", titulo: "Dica" },
  perigo: { icon: "x-circle", titulo: "Perigo" },
};
export function aviso(e) {
  const a = typeof e.aviso === "string" ? { texto: e.aviso } : e.aviso || {};
  const norm = String(a.tipo || "dica").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const kind = AVISO_KINDS[norm] ? norm : "dica";
  const { icon, titulo } = AVISO_KINDS[kind];
  // (texto com .t: o ajuste para caber e o fiscal enxergam o aviso; antes ele ficava por cima de outro sem ninguém ver)
  return `<div${attrs(e, `aviso av-${kind}`)}><span class="av-icon">${iconSVG(a.icon || icon, { size: 44, stroke: 2 })}</span><div class="av-body"><div class="av-title t f-heading">${md(a.titulo || titulo)}</div><div class="av-text t f-body">${md(a.texto || "")}</div></div></div>`;
}

// Renderiza qualquer elemento
export function el(e, ctx, w, h) {
  if (e == null) return "";
  if (typeof e === "string" || typeof e === "number") return text(String(e), "body");
  if (Array.isArray(e)) return e.map((x) => el(x, ctx, w, h)).join("");
  if (e.image_prompt && !e.image && !isFigure(e)) {
    return `<div${attrs(e, "fig fig-pending")}><div class="fp-in"><span class="fp-tag f-label">imagem a gerar</span><span class="fp-text f-body">${esc(String(e.image_prompt).slice(0, 180))}</span></div></div>`;
  }
  if (isFigure(e)) return figureHTML(e, ctx, w, h);
  if (e.textbox) return textbox(e, ctx);
  if (e.table && e.table.cells) return importedTable(e, ctx);
  // tabela de verdade: { table: { head, rows, style, color… } }, { table: [[…], […]] } ou { table: "csv colado" }
  if (e.table) { const t = Array.isArray(e.table) ? { rows: e.table, header: true } : typeof e.table === "string" ? { csv: e.table } : e.table; return `<div${attrs(e, "tbl")}>${tableHTML(t, { theme: ctx?.theme })}</div>`; }
  if (e.drawing) return `<div${attrs(e, "drw")}>${String(e.drawing).replace(/href="media:([^"]+)"/g, (m, p) => `href="${imageSrc(p, ctx) || ""}"`)}</div>`;
  if (e.text != null) return text(e.text, e.as || "body", e);
  if (e.row) return `<div${attrs(e, "row", `gap:${px(e.gap ?? 48)};align-items:${e.valign || "stretch"};justify-content:${e.justify || "flex-start"};`)}>${e.row.map((x) => el(x, ctx)).join("")}</div>`;
  if (e.col) return `<div${attrs(e, "col", `gap:${px(e.gap ?? 28)};justify-content:${e.justify || "flex-start"};align-items:${e.items || "stretch"};`)}>${e.col.map((x) => el(x, ctx)).join("")}</div>`;
  if (e.counter != null) return counter(e);
  if (e.timer != null) return timer(e);
  if (e.poll) return poll(e, ctx);
  if (e.list) return list(e);
  if (e.cards) return cards(e, ctx);
  if (e.stats || e.kpis) return stats(e, ctx);
  if (e.steps || e.process || e.flow) return steps(e, ctx);
  if (e.progress != null) return progress(e);
  if (e.tags || e.chips) return tags(e);
  if (e.rating != null) return rating(e);
  if (e.code) return code(e);
  if (e.shape) return shape(e);
  if (e.badge) return `<div${attrs(e, "badge f-label")}>${md(e.badge)}</div>`;
  if (e.aviso) return aviso(e);
  if (e.video) return video(e, ctx);
  if (e.widget) return `<div${attrs(e, "widget")} data-widget="${esc(e.widget)}" data-opts="${esc(JSON.stringify(e))}"></div>`;
  if (e.html) return `<div${attrs(e, "raw")}>${e.html}</div>`;
  if (e.spacer != null) return `<div class="spacer" style="flex:${e.spacer === true ? 1 : 0} 0 ${px(e.spacer === true ? 0 : e.spacer)}"></div>`;
  if (!e.image && Object.keys(e).every((key) => ["image", "fit", "alt", "radius"].includes(key))) return "";
  // atalhos de texto: { h2: "…" }, { label: "…" }, { quote: "…" } …
  for (const r of ["title", "h2", "h3", "lead", "body", "small", "label", "quote", "mono", "hero", "number", "tiny"]) {
    if (e[r] != null && typeof e[r] !== "object") return text(e[r], r, e);
  }
  throw new Error(`Elemento não reconhecido: ${JSON.stringify(e).slice(0, 160)}`);
}

// ------------------------------------------------------------------------------------------------ texto importado
// Caixa de texto que veio de um PowerPoint (src/import/pptx.js) com a formatação original: parágrafos com recuo,
// marcador, alinhamento e espaçamento; trechos com fonte, tamanho, negrito, itálico, sublinhado, cor e equação.
const FONT_FALLBACK = "Calibri, Carlito, 'Segoe UI', Arial, sans-serif";
const fontStack = (f) => (f ? `'${String(f).replace(/'/g, "")}', ${FONT_FALLBACK}` : FONT_FALLBACK);
// marcadores de Wingdings/Symbol desenhados (o caractere do PowerPoint só existe naquela fonte)
// caractere de fonte de símbolo (Wingdings/Symbol, inclusive na faixa F0xx que o Office grava): desenho ou o
// equivalente comum; null = não sei (fica o caractere)
const SYMBOL_FONT = { 0xae: 0x2192, 0xac: 0x2190, 0xad: 0x2191, 0xaf: 0x2193, 0xde: 0x21d2, 0xdc: 0x21d0, 0xdb: 0x21d4, 0xab: 0x2194, 0xb3: 0x2265, 0xa3: 0x2264, 0xb9: 0x2260, 0xb1: 0xb1, 0xb4: 0xd7, 0xb8: 0xf7, 0xb0: 0xb0, 0xd6: 0x221a, 0xa5: 0x221e, 0xbb: 0x2248, 0xb6: 0x2202, 0x44: 0x394, 0x61: 0x3b1, 0x62: 0x3b2, 0x67: 0x3b3, 0x64: 0x3b4, 0x6d: 0x3bc, 0x70: 0x3c0, 0x72: 0x3c1, 0x73: 0x3c3, 0x53: 0x3a3, 0x71: 0x3b8, 0x6c: 0x3bb, 0x77: 0x3c9, 0x57: 0x3a9, 0xe5: 0x2211, 0xf2: 0x222b }; // código do Symbol para o código Unicode
function symbolGlyph(code, font, c, px) {
  if (code >= 0xf000 && code <= 0xf0ff) code -= 0xf000;
  const f = String(font || "").toLowerCase();
  const s = Math.round(px * 0.62);
  const svg = (inner) => `<svg viewBox="0 0 10 10" width="${s}" height="${s}" style="vertical-align:${-Math.round(s * 0.06)}px" aria-hidden="true">${inner}</svg>`;
  const arrow = (rot) => svg(`<g transform="rotate(${rot} 5 5)"><path d="M0.8 5H8.4M5.6 2L8.8 5L5.6 8" fill="none" stroke="${c}" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"/></g>`);
  if (f.includes("wingdings")) {
    if (code === 0xd8) return svg(`<path d="M1 1L9.5 5L1 9L3.2 5Z" fill="${c}"/>`);
    if (code === 0xe0 || code === 0xe8) return arrow(0);
    if (code === 0xdf || code === 0xe7) return arrow(180);
    if (code === 0xe1 || code === 0xe9) return arrow(-90);
    if (code === 0xe2 || code === 0xea) return arrow(90);
    if (code === 0xf0) return svg(`<path d="M0.8 3.6H5.4V1.5L9.2 5L5.4 8.5V6.4H0.8Z" fill="none" stroke="${c}" stroke-width="0.9" stroke-linejoin="round"/>`);
    if (code === 0xfc || code === 0xfe) return svg(`<path d="M1.5 5.4L4 8L8.6 2" fill="none" stroke="${c}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`);
    if (code === 0xfb || code === 0xfd) return svg(`<path d="M2 2L8 8M8 2L2 8" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/>`);
    if (code === 0xa7 || code === 0x6e) return svg(`<rect x="2.5" y="2.5" width="5" height="5" fill="${c}"/>`);
    if (code === 0x71 || code === 0x6f || code === 0xa8) return svg(`<rect x="2" y="2" width="6" height="6" fill="none" stroke="${c}" stroke-width="1"/>`);
    if (code === 0x76) return svg(`<path d="M5 0.5L6.4 3.6L9.5 5L6.4 6.4L5 9.5L3.6 6.4L0.5 5L3.6 3.6Z" fill="${c}"/>`);
    if (code === 0x75) return svg(`<path d="M5 0.8L9.2 5L5 9.2L0.8 5Z" fill="${c}"/>`);
    if (code === 0x6c || code === 0x9f || code === 0xa1) return svg(`<circle cx="5" cy="5" r="2.6" fill="${c}"/>`);
    return svg(`<circle cx="5" cy="5" r="2.4" fill="${c}"/>`);
  }
  if (f.includes("symbol")) {
    if (code === 0xb7) return svg(`<circle cx="5" cy="5" r="2.4" fill="${c}"/>`);
    if (SYMBOL_FONT[code]) return `<span style="font-family:'Cambria Math','Segoe UI Symbol',sans-serif;color:${c}">${String.fromCodePoint(SYMBOL_FONT[code])}</span>`;
  }
  return null;
}
function bulletHTML(b, size, color) {
  if (b.num) return esc(b.num);
  const ch = String(b.char || ""), c = b.color || color || "currentColor";
  const g = symbolGlyph(ch.codePointAt(0) || 0, b.font, c, size * (b.scale || 1));
  if (g) return g;
  return `<span style="font-family:${esc(fontStack(b.font))};color:${esc(c)}">${esc(ch)}</span>`;
}
function runHTML(r) {
  if (r.br) return "<br>";
  if (r.latex != null) return `<span class="tbx-math" style="font-size:${r.size || 36}px">${katex.renderToString(String(r.latex), { throwOnError: false, strict: "ignore", trust: false, maxExpand: 1000 })}</span>`;
  let st = `font-size:${r.sup || r.sub ? Math.round((r.size || 36) * 0.7) : r.size || 36}px;font-family:${fontStack(r.font)};`;
  if (r.b) st += "font-weight:700;";
  if (r.i) st += "font-style:italic;";
  if (r.u || r.s) st += `text-decoration:${[r.u && "underline", r.s && "line-through"].filter(Boolean).join(" ")};`;
  if (r.color) st += `color:${r.color};`;
  if (r.sup) st += "vertical-align:super;";
  if (r.sub) st += "vertical-align:sub;";
  // symPua: só os caracteres da faixa de símbolos (F0xx) são da fonte de símbolo; o resto é texto comum
  const txt = r.sym ? [...String(r.t ?? "")].map((ch) => { const cp = ch.codePointAt(0); return (!r.symPua || (cp >= 0xf000 && cp <= 0xf0ff)) ? symbolGlyph(cp, r.sym, r.color || "currentColor", r.size || 36) || esc(ch) : esc(ch); }).join("") : esc(r.t ?? "");
  const body = `<span style="${esc(st)}">${txt}</span>`;
  return r.link && /^(https?:|mailto:)/i.test(r.link) ? `<a href="${esc(r.link)}" target="_blank" rel="noopener">${body}</a>` : body;
}
// altura de linha "simples" de cada fonte (o PowerPoint usa a medida da própria fonte, não um fator fixo)
const LINE = [[/calibri|carlito/i, 1.22], [/times|tinos|liberation serif/i, 1.15], [/cambria/i, 1.17], [/arial|helvetica|liberation sans|arimo/i, 1.15], [/segoe/i, 1.33], [/georgia/i, 1.14], [/verdana|tahoma/i, 1.21], [/source sans/i, 1.26], [/montserrat/i, 1.22], [/century gothic/i, 1.23]];
const lineOf = (font) => (LINE.find(([re]) => re.test(font || "")) || [null, 1.2])[1];
function paragraphHTML(p, idx = 1) {
  const size = p.runs?.find((r) => r.size)?.size || p.size || 36;
  const factor = lineOf(p.runs?.find((r) => r.font)?.font);
  const lh = p.lineHeight == null ? factor : p.lineHeight <= 5 ? +(p.lineHeight * factor).toFixed(3) : `${p.lineHeight}px`;
  let st = `margin:0;font-size:${size}px;line-height:${lh};`;
  if (p.marL) st += `padding-left:${p.marL}px;`;
  if (p.indent) st += `text-indent:${p.indent}px;`;
  if (p.align) st += `text-align:${p.align};`;
  if (p.spaceBefore && idx > 0) st += `margin-top:${p.spaceBefore}px;`; // o PowerPoint ignora o espaço antes do 1º parágrafo
  if (p.spaceAfter) st += `margin-bottom:${p.spaceAfter}px;`;
  if (p.empty) return `<p style="${st}">&nbsp;</p>`;
  const firstColor = p.runs?.find((r) => r.color)?.color;
  const bu = p.bullet ? `<span class="tbx-bu" style="display:inline-block;text-indent:0;min-width:${Math.max(0, -(p.indent || 0))}px;${(p.indent || 0) >= 0 ? "margin-right:0.4em;" : ""}">${bulletHTML(p.bullet, size, firstColor)}</span>` : "";
  return `<p style="${esc(st)}">${bu}${(p.runs || []).map(runHTML).join("")}</p>`;
}
export function textbox(e) {
  const tb = e.textbox || {};
  const [pl, pt, pr, pb] = tb.pad || [0, 0, 0, 0];
  const jc = tb.anchor === "middle" ? "center" : tb.anchor === "bottom" ? "flex-end" : "flex-start";
  let st = `display:flex;flex-direction:column;justify-content:${jc};padding:${pt}px ${pr}px ${pb}px ${pl}px;box-sizing:border-box;`;
  if (tb.nowrap) st += "white-space:nowrap;";
  if (tb.vertical) st += `writing-mode:vertical-rl;${tb.vertical === "up" ? "transform:rotate(180deg);" : ""}`;
  const body = (tb.paragraphs || []).map((p, i) => paragraphHTML(p, i)).join("");
  return `<div${attrs(e, "tbx", st)}>${tb.columns ? `<div style="column-count:${+tb.columns}">${body}</div>` : body}</div>`;
}
// tabela importada: colunas e alturas na medida, preenchimento e bordas por célula
export function importedTable(e) {
  const t = e.table;
  const cols = (t.cols || []).map((w) => `<col style="width:${w}px">`).join("");
  const rows = (t.cells || []).map((row, ri) => `<tr style="height:${t.heights?.[ri] || 0}px">${(row || []).map((c) => {
    if (!c) return "";
    const [pl, pt, pr, pb] = c.pad || [9, 5, 9, 5];
    let st = `padding:${pt}px ${pr}px ${pb}px ${pl}px;vertical-align:${c.anchor === "ctr" ? "middle" : c.anchor === "b" ? "bottom" : "top"};border:${t.border || "1px solid #999"};`;
    if (c.fill) st += `background:${c.fill};`;
    for (const [side, v] of Object.entries(c.borders || {})) st += `border-${side}:${v};`;
    return `<td${c.span > 1 ? ` colspan="${c.span}"` : ""}${c.rowSpan > 1 ? ` rowspan="${c.rowSpan}"` : ""} style="${esc(st)}">${(c.tb?.paragraphs || []).map((p, i) => paragraphHTML(p, i)).join("")}</td>`;
  }).join("")}</tr>`).join("");
  return `<div${attrs(e, "tbx-table")}><table style="border-collapse:collapse;table-layout:fixed;width:100%"><colgroup>${cols}</colgroup>${rows}</table></div>`;
}

export function counter(e) {
  const v = Number(e.counter);
  const dec = e.decimals ?? (v % 1 ? 1 : 0);
  const shown = v.toLocaleString("pt-BR", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const size = e.size || SIZES[e.as || "number"];
  return `<div${attrs(e, `t f-display r-number counter pl`, `font-size:${size}px;`)}${e.fit ? " data-fit" : ""} data-to="${v}" data-from="${e.from ?? 0}" data-dec="${dec}" data-prefix="${esc(e.prefix || "")}" data-suffix="${esc(e.suffix || "")}"><span class="cv">${esc(e.prefix || "")}${shown}${esc(e.suffix || "")}</span></div>`;
}

export function timer(e) {
  const s = Number(e.timer);
  const mm = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const size = e.size || 220;
  return `<div${attrs(e, "timer pl", `width:${size}px;height:${size}px;`)} data-seconds="${s}" data-auto="${e.auto === false ? 0 : 1}" title="clique para iniciar/pausar">
<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" class="tr-bg"/><circle cx="50" cy="50" r="44" class="tr-fg" pathLength="1" transform="rotate(-90 50 50)"/></svg>
<div class="tv f-display" style="font-size:${Math.round(size * 0.3)}px">${mm}</div>${e.label ? `<div class="tm-lab f-label">${md(e.label)}</div>` : ""}</div>`;
}

export function poll(e, ctx) {
  const opts = e.options || [];
  const letters = "ABCDEFGH";
  let h = `<div${attrs(e, "poll pl")} data-poll="${esc(e.poll)}" ${e.compare ? `data-compare="${esc(e.compare)}"` : ""}>`;
  opts.forEach((o, i) => {
    const label = typeof o === "string" ? o : o.label;
    h += `<div class="po-row" data-i="${i}"><div class="po-key f-display">${letters[i]}</div><div class="po-main"><div class="po-label f-heading">${md(label)}</div><div class="po-track"><div class="po-ghost"></div><div class="po-fill"></div></div></div><div class="po-val f-display" title="clique para digitar o resultado">—</div></div>`;
  });
  h += `<div class="po-hint f-label">${e.hint ? md(e.hint) : "clique no número para digitar o resultado"}</div></div>`;
  return h;
}

export function list(e) {
  const items = e.list;
  const build = e.build;
  const tag = e.numbered ? "ol" : "ul";
  let n = 0;
  const body = items.map((it, i) => {
    const o = typeof it === "string" ? { text: it } : it;
    const step = build ? (e.buildFrom ?? 1) + i : o.step;
    const mark = e.numbered ? `<span class="li-n f-display">${String(++n).padStart(2, "0")}</span>` : `<span class="li-b"></span>`;
    const go = o.goto != null && o.goto !== "" ? `<span class="goto-mark" aria-hidden="true">${iconSVG("arrow-up-right", { size: 30, stroke: 2 })}</span>` : "";
    return `<li${attrs({ ...o, step }, "li")}>${mark}<div class="li-t t f-${o.face || "body"}" style="font-size:${o.size || e.size || SIZES.lead}px">${md(o.text)}${o.sub ? `<div class="li-sub t f-body" style="font-size:${SIZES.small}px">${md(o.sub)}</div>` : ""}</div>${go}</li>`;
  }).join("");
  return `<${tag}${attrs(e, `list ${e.numbered ? "numbered" : ""}`)}>${body}</${tag}>`;
}

export function cards(e, ctx) {
  const cols = e.cols || e.cards.length;
  const body = e.cards.map((c, i) => {
    const step = e.build ? (e.buildFrom ?? 1) + i : c.step;
    let top = "";
    if (c.icon) top = `<div class="cd-ico">${iconSVG(c.icon, { size: 64, stroke: 1.8 })}</div>`;
    else if (c.picto) top = `<div class="cd-pic">${picto(c)}</div>`;
    else if (c.number != null) top = `<div class="cd-num t f-display">${md(String(c.number))}</div>`;

    let badgeHtml = "";
    if (c.badge) badgeHtml = `<span class="cd-badge badge">${md(c.badge)}</span>`;
    else if (c.trend) {
      const isUp = c.trendUp !== false && !String(c.trend).startsWith("-");
      badgeHtml = `<span class="st-trend ${isUp ? 'trend-up' : 'trend-down'}">${iconSVG(isUp ? "trending-up" : "trending-down", { size: 26, stroke: 2.2, cls: "st-trend-ic" })} ${esc(c.trend)}</span>`;
    }

    let extraWidgets = "";
    if (c.progress != null) extraWidgets += progress({ progress: c.progress, label: c.progressLabel });
    if (c.tags) extraWidgets += tags({ tags: c.tags });
    if (c.rating != null) extraWidgets += rating({ rating: c.rating, label: c.ratingLabel });
    if (c.check === true || c.status === "pro") extraWidgets += `<div class="check-pill pro">${iconSVG("check", { size: 26, stroke: 2.4 })} ${c.checkText ? md(c.checkText) : "Recomendado"}</div>`;
    if (c.check === false || c.status === "con") extraWidgets += `<div class="check-pill con">${iconSVG("x", { size: 26, stroke: 2.4 })} ${c.checkText ? md(c.checkText) : "Evitar"}</div>`;

    return `<div${attrs({ ...c, step, card: c.hl ? "hi" : true }, "cd")}>
      <div style="display:flex;justify-content:space-between;align-items:center;width:100%;">
        ${top}
        ${badgeHtml}
      </div>
      ${c.title ? `<div class="cd-title t f-heading">${md(c.title)}</div>` : ""}
      ${c.text ? `<div class="cd-text t f-body">${md(c.text)}</div>` : ""}
      ${extraWidgets}
      ${c.foot ? `<div class="cd-foot t f-label">${md(c.foot)}</div>` : ""}
      ${c.goto != null && c.goto !== "" ? `<span class="goto-mark" aria-hidden="true">${iconSVG("arrow-up-right", { size: 30, stroke: 2 })}</span>` : ""}
    </div>`;
  }).join("");
  return `<div${attrs(e, "cards", `grid-template-columns:repeat(${cols},1fr);`)}>${body}</div>`;
}

export function stats(e, ctx) {
  const items = e.stats || e.kpis || [];
  const cols = e.cols || Math.min(items.length, 4) || 3;
  const body = items.map((st, i) => {
    const step = e.build ? (e.buildFrom ?? 1) + i : st.step;
    const valColor = st.color ? `color:${textColorVal(st.color)};` : "";
    let iconHtml = "";
    if (st.icon) {
      iconHtml = `<div class="st-icon">${iconSVG(st.icon, { size: 48, stroke: 1.8 })}</div>`;
    }
    let trendHtml = "";
    if (st.trend) {
      const isUp = st.trendUp !== false && !String(st.trend).startsWith("-");
      trendHtml = `<div class="st-trend ${isUp ? 'trend-up' : 'trend-down'}">${iconSVG(isUp ? "trending-up" : "trending-down", { size: 26, stroke: 2.2, cls: "st-trend-ic" })} ${esc(st.trend)}</div>`;
    }
    return `<div${attrs({ ...st, step, card: st.card ?? true }, "stat-card")}>
      <div class="st-top">
        ${iconHtml}
        ${trendHtml}
      </div>
      <div class="st-val t f-display" style="${valColor}">${esc(String(st.value ?? st.stat ?? ""))}</div>
      ${st.label ? `<div class="st-lab t f-heading">${md(st.label)}</div>` : ""}
      ${st.text ? `<div class="st-sub t f-body">${md(st.text)}</div>` : ""}
    </div>`;
  }).join("");
  return `<div${attrs(e, "stats-grid", `grid-template-columns:repeat(${cols},1fr);`)}>${body}</div>`;
}

export function steps(e, ctx) {
  const items = e.steps || e.process || e.flow || [];
  const cols = e.cols || items.length || 3;
  const body = items.map((st, i) => {
    const step = e.build ? (e.buildFrom ?? 1) + i : st.step;
    const num = st.stepNum ?? (i + 1);
    let iconHtml = "";
    if (st.icon) {
      iconHtml = `<div class="step-icon">${iconSVG(st.icon, { size: 42, stroke: 1.8 })}</div>`;
    }
    return `<div${attrs({ ...st, step, card: st.card ?? true }, "step-card")}>
      <div class="step-header">
        <span class="step-num t f-display">${String(num).padStart(2, "0")}</span>
        ${iconHtml}
      </div>
      ${st.title ? `<div class="step-title t f-heading">${md(st.title)}</div>` : ""}
      ${st.text ? `<div class="step-text t f-body">${md(st.text)}</div>` : ""}
      ${st.tag ? `<div class="tag-pill" style="align-self:flex-start;margin-top:auto;">${md(st.tag)}</div>` : ""}
      ${st.goto != null && st.goto !== "" ? `<span class="goto-mark" aria-hidden="true">${iconSVG("arrow-up-right", { size: 30, stroke: 2 })}</span>` : ""}
      ${i < items.length - 1 ? `<div class="step-connector" aria-hidden="true">${iconSVG("arrow-right", { size: 40, stroke: 2 })}</div>` : ""}
    </div>`;
  }).join("");
  return `<div${attrs(e, "steps-flow", `grid-template-columns:repeat(${cols},1fr);`)}>${body}</div>`;
}

export function progress(e) {
  const val = Math.min(100, Math.max(0, Number(e.progress ?? e.value ?? 0)));
  const label = e.label || "";
  const color = e.color ? colorVal(e.color) : "var(--hi)";
  return `<div${attrs(e, "prog-widget")}>
    <div class="prog-top">
      ${label ? `<span class="prog-label t f-heading">${md(label)}</span>` : ""}
      <span class="prog-val t f-display">${val}%</span>
    </div>
    <div class="prog-track">
      <div class="prog-fill" style="width:${val}%;background:${color};"></div>
    </div>
  </div>`;
}

export function tags(e) {
  const list = e.tags || e.chips || [];
  return `<div${attrs(e, "tags-cloud")}>${list.map((t) => `<span class="tag-pill">${md(typeof t === "string" ? t : t.text)}</span>`).join("")}</div>`;
}

export function rating(e) {
  const stars = Math.min(5, Math.max(1, Math.round(Number(e.rating || 5))));
  const score = e.score || `${stars}.0/5`;
  return `<div${attrs(e, "rating-widget")}>
    <div class="rating-stars">${Array.from({ length: 5 }, (_, k) => iconSVG("star", { size: 30, stroke: 1.8, cls: k < stars ? "star-on" : "star-off" })).join("")}</div>
    ${score ? `<span class="rating-score t f-display">${esc(score)}</span>` : ""}
    ${e.label ? `<span class="rating-label t f-body">${md(e.label)}</span>` : ""}
  </div>`;
}

export function code(e) {
  const source = String(e.code).replace(/\s+$/, "");
  const language = resolveCodeLanguage(e.language, e.filename);
  const lines = language ? highlightCode(source, language) : source.split("\n").map(esc);
  const hl = new Set([].concat(e.highlight || []));
  const body = lines.map((l, i) => `<div class="cl${hl.has(i + 1) ? " hl" : ""}"><span class="cn">${i + 1}</span><span class="cc">${l || " "}</span></div>`).join("");
  return `<div${attrs(e, "code f-mono", `font-size:${e.size || 34}px;`)}${language ? ` data-language="${esc(language)}"` : ""}>${body}</div>`;
}

// Formas desenhadas (caixa 100×100 esticada no w×h): preenchimento e contorno de verdade, não só um retângulo
const SHAPE_PATHS = {
  triangle: "50,0 100,100 0,100",
  diamond: "50,0 100,50 50,100 0,50",
  hexagon: "25,0 75,0 100,50 75,100 25,100 0,50",
  star: "50,0 61,35 98,35 68,57 79,91 50,70 21,91 32,57 2,35 39,35",
  arrow: "0,30 62,30 62,5 100,50 62,95 62,70 0,70",
  chevron: "0,0 70,0 100,50 70,100 0,100 30,50",
  bubble: "M8,0 H92 Q100,0 100,8 V64 Q100,72 92,72 H40 L22,100 L26,72 H8 Q0,72 0,64 V8 Q0,0 8,0 Z",
};

export function shape(e) {
  const k = e.shape;
  if (SHAPE_PATHS[k]) {
    const fill = colorVal(e.fill || e.bg) || "var(--surface)";
    const stroke = colorVal(e.stroke);
    // --shape-fill: o Preenchimento do Studio (visualEdits.fill) troca a cor sem mexer no desenho
    // --shape-fill / --shape-stroke / --shape-sw: o inspetor do Studio troca cor e contorno sem mexer no desenho
    const paint = `fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="${e.strokeWidth || 4}"` : ""} vector-effect="non-scaling-stroke" stroke-linejoin="round" style="fill:var(--shape-fill,${fill});stroke:var(--shape-stroke,${stroke || "none"});stroke-width:var(--shape-sw,${e.strokeWidth || 4}px)"`;
    const d = SHAPE_PATHS[k];
    const svg = `<svg class="shape-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${d.startsWith("M") ? `<path d="${d}" ${paint}/>` : `<polygon points="${d}" ${paint}/>`}</svg>`;
    return `<div${attrs({ ...e, bg: undefined }, `shape shape-${k}`)}>${svg}${e.content ? `<div class="shape-content">${el(e.content)}</div>` : ""}</div>`;
  }
  const fill = colorVal(e.fill) || (k === "line" ? null : "var(--surface)");
  const stroke = colorVal(e.stroke);
  let st = "";
  if (fill) st += `background:${fill};`;
  if (stroke) st += `border:${e.strokeWidth || 4}px solid ${stroke};`;
  if (k === "circle") st += "border-radius:50%;";
  if (k === "pill") st += "border-radius:999px;";
  if (k === "rounded") st += `border-radius:${e.radius ?? "var(--radius)"};`;
  if (k === "line") st += `background:${colorVal(e.color || e.stroke) || "var(--fg)"};height:${px(e.thickness || 4)};`;
  return `<div${attrs(e, `shape shape-${k}`, st)}>${e.content ? el(e.content) : ""}</div>`;
}

function video(e) {
  return `<a${attrs(e, "video")} href="${esc(e.video)}" target="_blank" rel="noopener"><span class="vd-play"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span><span class="vd-label t f-heading">${md(e.label || "Assistir")}</span><span class="vd-url t f-label">${esc(e.video.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60))}</span></a>`;
}
