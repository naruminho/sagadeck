// Elementos: os "tijolos" que os layouts (e o layout livre `canvas`) usam.
// Todo elemento aceita: step (clique em que aparece), exit (clique em que some),
// anim (up|fade|pop|left|right|zoom|none), w, h, flex, align, class, style, card.
import { qrSVG } from "./figures/qr.js";
import fs from "node:fs";
import path from "node:path";
import { md, esc } from "./markup.js";
import { iconSVG } from "./figures/icons.js";
import { picto } from "./figures/pictos.js";
import { diagram } from "./figures/diagrams.js";
import { chart } from "./figures/charts.js";

export const SIZES = { hero: 210, number: 250, title: 128, h2: 92, h3: 56, quote: 72, lead: 46, body: 36, small: 29, label: 24, mono: 30, tiny: 22 };
const FACE = { hero: "display", number: "display", title: "display", h2: "display", h3: "heading", quote: "quote", lead: "body", body: "body", small: "body", label: "label", mono: "mono", tiny: "label" };

const px = (v) => (v == null ? null : typeof v === "number" ? `${v}px` : String(v));
const colorVal = (c) => (!c ? null : /^#?[0-9a-f]{6}$/i.test(c) ? `#${c.replace("#", "")}` : `var(--${c})`);

export function attrs(el = {}, extraCls = "", extraStyle = "") {
  const cls = [extraCls, el.class, el.card ? "card" : "", el.card === "hi" ? "card-hi" : ""].filter(Boolean).join(" ");
  let st = extraStyle;
  if (el.w != null) st += `width:${px(el.w)};`;
  if (el.h != null) st += `height:${px(el.h)};flex-shrink:0;`;
  if (el.w != null && el.h != null) st += `flex:none;`;
  if (el.flex != null) st += `flex:${el.flex};min-width:0;min-height:0;`;
  if (el.color) st += `color:${colorVal(el.color)};`;
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

export function figureHTML(el, ctx, w, h) {
  if (el.qr) {
    const size = el.size || 360;
    const svg = qrSVG(el.qr, { ec: el.ec, ink: el.ink || "#111", paper: el.paper || "#fff" });
    return `<div${attrs(el, "fig fig-qr")}><div class="qr-box" style="width:${size}px;">${svg}</div>${el.label ? `<div class="qr-label f-label">${md(el.label)}</div>` : ""}</div>`;
  }
  if (el.icon) return `<div${attrs(el, "fig fig-icon", `color:${colorVal(el.color) || "var(--fg)"};`)}>${iconSVG(el.icon, { size: el.size || 160, stroke: el.stroke || 1.6 })}</div>`;
  if (el.picto) return `<div${attrs(el, "fig")}>${picto(el)}</div>`;
  if (el.diagram) return `<div${attrs(el, "fig")}>${diagram(el)}</div>`;
  if (el.chart) return `<div${attrs(el, "fig fig-chart")}>${chart(el, el.cw || w || 1200, el.ch || h || 620)}</div>`;
  if (el.svg) return `<div${attrs(el, "fig")}>${el.svg}</div>`;
  if (el.image) return `<div${attrs(el, "fig fig-img")}><img src="${imageSrc(el.image, ctx)}" alt="${esc(el.alt || "")}" style="object-fit:${el.fit || "cover"};${el.radius ? `border-radius:${el.radius}px;` : ""}"></div>`;
  return "";
}

function imageSrc(p, ctx) {
  if (/^(https?:|data:)/.test(p)) return p;
  const f = path.resolve(ctx.baseDir, p);
  if (!fs.existsSync(f)) throw new Error(`Imagem não encontrada: ${f}`);
  const ext = path.extname(f).slice(1).toLowerCase().replace("jpg", "jpeg").replace("svg", "svg+xml");
  return `data:image/${ext};base64,${fs.readFileSync(f).toString("base64")}`;
}

const isFigure = (el) => el && (el.icon || el.picto || el.diagram || el.chart || el.svg || el.image || el.qr);

// Renderiza qualquer elemento
export function el(e, ctx, w, h) {
  if (e == null) return "";
  if (typeof e === "string" || typeof e === "number") return text(String(e), "body");
  if (Array.isArray(e)) return e.map((x) => el(x, ctx, w, h)).join("");
  if (e.image_prompt && !e.image && !isFigure(e)) {
    return `<div${attrs(e, "fig fig-pending")}><div class="fp-in"><span class="fp-tag f-label">imagem a gerar</span><span class="fp-text f-body">${esc(String(e.image_prompt).slice(0, 180))}</span></div></div>`;
  }
  if (isFigure(e)) return figureHTML(e, ctx, w, h);
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
  if (e.video) return video(e, ctx);
  if (e.widget) return `<div${attrs(e, "widget")} data-widget="${esc(e.widget)}" data-opts="${esc(JSON.stringify(e))}"></div>`;
  if (e.html) return `<div${attrs(e, "raw")}>${e.html}</div>`;
  if (e.spacer != null) return `<div class="spacer" style="flex:${e.spacer === true ? 1 : 0} 0 ${px(e.spacer === true ? 0 : e.spacer)}"></div>`;
  // atalhos de texto: { h2: "…" }, { label: "…" }, { quote: "…" } …
  for (const r of ["title", "h2", "h3", "lead", "body", "small", "label", "quote", "mono", "hero", "number", "tiny"]) {
    if (e[r] != null && typeof e[r] !== "object") return text(e[r], r, e);
  }
  throw new Error(`Elemento não reconhecido: ${JSON.stringify(e).slice(0, 160)}`);
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
    return `<li${attrs({ ...o, step }, "li")}>${mark}<div class="li-t t f-${o.face || "body"}" style="font-size:${o.size || e.size || SIZES.lead}px">${md(o.text)}${o.sub ? `<div class="li-sub t f-body" style="font-size:${SIZES.small}px">${md(o.sub)}</div>` : ""}</div></li>`;
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
      badgeHtml = `<span class="st-trend ${isUp ? 'trend-up' : 'trend-down'}">${isUp ? '↑ ' : '↓ '}${esc(c.trend)}</span>`;
    }

    let extraWidgets = "";
    if (c.progress != null) extraWidgets += progress({ progress: c.progress, label: c.progressLabel });
    if (c.tags) extraWidgets += tags({ tags: c.tags });
    if (c.rating != null) extraWidgets += rating({ rating: c.rating, label: c.ratingLabel });
    if (c.check === true || c.status === "pro") extraWidgets += `<div class="check-pill pro">✓ ${c.checkText ? md(c.checkText) : "Recomendado"}</div>`;
    if (c.check === false || c.status === "con") extraWidgets += `<div class="check-pill con">✗ ${c.checkText ? md(c.checkText) : "Evitar"}</div>`;

    return `<div${attrs({ ...c, step, card: c.hl ? "hi" : true }, "cd")}>
      <div style="display:flex;justify-content:space-between;align-items:center;width:100%;">
        ${top}
        ${badgeHtml}
      </div>
      ${c.title ? `<div class="cd-title t f-heading">${md(c.title)}</div>` : ""}
      ${c.text ? `<div class="cd-text t f-body">${md(c.text)}</div>` : ""}
      ${extraWidgets}
      ${c.foot ? `<div class="cd-foot t f-label">${md(c.foot)}</div>` : ""}
    </div>`;
  }).join("");
  return `<div${attrs(e, "cards", `grid-template-columns:repeat(${cols},1fr);`)}>${body}</div>`;
}

export function stats(e, ctx) {
  const items = e.stats || e.kpis || [];
  const cols = e.cols || Math.min(items.length, 4) || 3;
  const body = items.map((st, i) => {
    const step = e.build ? (e.buildFrom ?? 1) + i : st.step;
    const valColor = st.color ? `color:${colorVal(st.color)};` : "";
    let iconHtml = "";
    if (st.icon) {
      iconHtml = `<div class="st-icon">${iconSVG(st.icon, { size: 48, stroke: 1.8 })}</div>`;
    }
    let trendHtml = "";
    if (st.trend) {
      const isUp = st.trendUp !== false && !String(st.trend).startsWith("-");
      trendHtml = `<div class="st-trend ${isUp ? 'trend-up' : 'trend-down'}">${isUp ? '↑ ' : '↓ '}${esc(st.trend)}</div>`;
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
      ${i < items.length - 1 ? `<div class="step-connector" aria-hidden="true">➔</div>` : ""}
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
    <div class="rating-stars">${"★".repeat(stars)}${"☆".repeat(5 - stars)}</div>
    ${score ? `<span class="rating-score t f-display">${esc(score)}</span>` : ""}
    ${e.label ? `<span class="rating-label t f-body">${md(e.label)}</span>` : ""}
  </div>`;
}

export function code(e) {
  const lines = String(e.code).replace(/\s+$/, "").split("\n");
  const hl = new Set([].concat(e.highlight || []));
  const body = lines.map((l, i) => `<div class="cl${hl.has(i + 1) ? " hl" : ""}"><span class="cn">${i + 1}</span><span class="cc">${esc(l) || " "}</span></div>`).join("");
  return `<div${attrs(e, "code f-mono", `font-size:${e.size || 34}px;`)}>${body}</div>`;
}

export function shape(e) {
  const k = e.shape;
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
