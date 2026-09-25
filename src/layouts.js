// Layouts: cada um recebe o objeto do slide (YAML) e devolve o HTML da área útil.
// Todos aceitam: kicker, title, source, add (elementos extras no fim), tone, notes, time.
import { md, esc } from "./markup.js";
import { el, text, figureHTML, attrs, SIZES, list, cards, stats, steps, poll, timer, counter, code } from "./elements.js";

const kicker = (s, d = 0) => (s.kicker ? `<div class="kicker t f-label e" style="--d:${d}">${md(s.kicker)}</div>` : "");
const title = (s, as = "h2", d = 1, extra = {}) => (s.title ? text(s.title, as, { class: "ttl e", style: `--d:${d};`, fit: s.fit, ...extra, ...(s.titleSize ? { size: s.titleSize } : {}) }) : "");
const head = (s, as = "h2") => (s.kicker || s.title ? `<header class="hd">${kicker(s)}${title(s, as)}</header>` : "");
const src = (s) => (s.source ? `<div class="src t f-body">${md(s.source)}</div>` : "");
const add = (s, ctx) => (s.add ? el(s.add, ctx) : "");
const fig = (f, ctx, w, h, cls = "") => (f ? `<div class="figbox ${cls}" style="${w ? `width:${w}px;` : ""}${h ? `height:${h}px;` : ""}">${typeof f === "object" ? el(f, ctx, w, h) : el({ image: f }, ctx)}</div>` : "");
const build = (s, i, base = 1) => (s.build ? base + i : undefined);

export const LAYOUTS = {
  cover(s, ctx) {
    return `<div class="L-cover">
      <div class="cv-main">${kicker(s)}${text(s.title, "hero", { class: "ttl e", style: "--d:1;", fit: true, size: s.titleSize })}
      ${s.subtitle ? text(s.subtitle, "lead", { class: "sub e", style: "--d:2;" }) : ""}
      ${s.author ? `<div class="author e" style="--d:3">${text(s.author, "h3", { size: 40 })}${s.role ? text(s.role, "small", { class: "muted" }) : ""}</div>` : ""}</div>
      ${s.figure ? `<div class="cv-fig e" style="--d:2">${el(s.figure, ctx, 700, 760)}</div>` : ""}
    </div>${add(s, ctx)}`;
  },

  section(s, ctx) {
    return `<div class="L-section">
      ${s.number != null ? `<div class="sc-num t f-display e">${esc(s.number)}</div>` : ""}
      <div class="sc-text">${kicker(s, 1)}${text(s.title, "title", { class: "ttl e", style: "--d:2;", size: s.titleSize || 150, fit: true })}${s.subtitle ? text(s.subtitle, "lead", { class: "sub e", style: "--d:3;" }) : ""}</div>
      ${s.figure ? `<div class="sc-fig e" style="--d:3">${el(s.figure, ctx, 560, 560)}</div>` : ""}
    </div>${add(s, ctx)}`;
  },

  statement(s, ctx) {
    const lines = s.lines
      ? s.lines.map((l, i) => {
          const o = typeof l === "string" ? { text: l } : l;
          return text(o.text, o.as || "title", { ...o, step: o.step ?? build(s, i, 0), class: `st-line ${o.class || ""}`, size: o.size || s.size });
        }).join("")
      : text(s.text, s.as || "title", { class: "st-line e", style: "--d:1;", fit: true, size: s.size });
    return `<div class="L-statement ${s.center ? "center" : ""}">${kicker(s)}<div class="st-body">${lines}</div>
      ${s.by ? text(s.by, "label", { class: "st-by e", style: "--d:3;", step: s.byStep }) : ""}${src(s)}</div>${add(s, ctx)}`;
  },

  quote(s, ctx) {
    return `<div class="L-quote">${kicker(s)}
      <div class="q-mark t f-quote e" aria-hidden="true">“</div>
      ${text(s.quote, "quote", { class: "q-text e", style: "--d:1;", fit: true, size: s.size })}
      ${s.by ? `<div class="q-by e" style="--d:2">${text(s.by, "h3", { size: 40 })}${s.role ? text(s.role, "small", { class: "muted" }) : ""}</div>` : ""}
      ${s.after ? text(s.after, "lead", { class: "q-after", step: s.afterStep ?? 1, color: "em" }) : ""}
    </div>${add(s, ctx)}`;
  },

  number(s, ctx) {
    const v = typeof s.value === "object" ? s.value : { counter: s.value, prefix: s.prefix, suffix: s.suffix, decimals: s.decimals, from: s.from };
    return `<div class="L-number">
      <div class="nb-main">${kicker(s)}
        <div class="nb-val e" style="--d:1;${s.valueColor ? `color:var(--${s.valueColor});` : ""}">${counter({ ...v, size: s.size || 300, fit: true })}</div>
        ${s.label ? text(s.label, "lead", { class: "nb-label e", style: "--d:2;", size: s.labelSize || 52 }) : ""}
        ${s.context ? text(s.context, "body", { class: "nb-ctx muted", step: s.contextStep }) : ""}
      </div>
      ${s.side ? `<div class="nb-side" ${s.sideStep ? `data-step="${s.sideStep}"` : ""}>${el(s.side, ctx, 640, 700)}</div>` : ""}
    </div>${src(s)}${add(s, ctx)}`;
  },

  split(s, ctx) {
    const ratio = String(s.ratio || "1:1").split(":").map(Number);
    const left = `${s.body ? text(s.body, s.bodyAs || "lead", { class: "sp-body e", style: "--d:2;" }) : ""}
      ${s.bullets ? list({ list: s.bullets, build: s.build, size: s.bulletSize }) : ""}
      ${s.content ? el(s.content, ctx) : ""}`;
    const W = Math.round(1680 * ratio[1] / (ratio[0] + ratio[1]));
    const right = s.figure ? `<div class="sp-fig e" style="--d:2;flex:${ratio[1]}" ${s.figureStep ? `data-step="${s.figureStep}"` : ""}>${el(s.figure, ctx, W - 40, 740)}</div>` : "";
    return `<div class="L-split ${s.reverse ? "rev" : ""}">
      <div class="sp-text" style="flex:${ratio[0]}">${head(s, s.titleAs || "h2")}${left}</div>${right}
    </div>${src(s)}${add(s, ctx)}`;
  },

  cards(s, ctx) {
    return `<div class="L-cards">${head(s)}${cards({ cards: s.items, cols: s.cols, build: s.build, class: "e", style: "--d:2;" }, ctx)}</div>${src(s)}${add(s, ctx)}`;
  },

  stats(s, ctx) {
    const items = s.stats || s.kpis || s.items || [];
    return `<div class="L-stats">${head(s)}${stats({ stats: items, cols: s.cols, build: s.build, class: "e", style: "--d:2;" }, ctx)}</div>${src(s)}${add(s, ctx)}`;
  },

  steps(s, ctx) {
    const items = s.steps || s.process || s.flow || s.items || [];
    return `<div class="L-steps">${head(s)}${steps({ steps: items, cols: s.cols, build: s.build, class: "e", style: "--d:2;" }, ctx)}</div>${src(s)}${add(s, ctx)}`;
  },

  list(s, ctx) {
    return `<div class="L-list">${head(s)}${list({ list: s.items, numbered: s.numbered !== false, build: s.build, size: s.size })}</div>${src(s)}${add(s, ctx)}`;
  },

  timeline(s, ctx) {
    const ev = s.events || [];
    const hl = new Set([].concat(s.highlight ?? []));
    const body = ev.map((e, i) => `<div${attrs({ step: e.step ?? build(s, i) }, `tl-ev ${hl.has(i) ? "hl" : ""}`)}>
        <div class="tl-dot"></div><div class="tl-when t f-display">${md(e.when)}</div>
        <div class="tl-title t f-heading">${md(e.title || "")}</div>${e.text ? `<div class="tl-text t f-body">${md(e.text)}</div>` : ""}
        ${e.tag ? `<div class="tl-tag t f-label">${md(e.tag)}</div>` : ""}</div>`).join("");
    return `<div class="L-timeline">${head(s)}<div class="tl" style="--n:${ev.length}"><div class="tl-line"></div>${body}</div>${s.after ? text(s.after, "h3", { class: "tl-after", step: s.afterStep ?? (s.build ? ev.length + 1 : 1), face: "quote", size: 48 }) : ""}</div>${src(s)}${add(s, ctx)}`;
  },

  chart(s, ctx) {
    const side = s.side || s.note;
    const w = side ? 1120 : 1680, h = s.chartHeight || (s.title ? 600 : 720);
    const ch = { ...s.chart, chart: s.chart.chart || s.chart.type };
    return `<div class="L-chart">${head(s)}<div class="ch-row">
      <div class="ch-fig e" style="--d:2" ${s.chartStep ? `data-step="${s.chartStep}"` : ""}>${figureHTML(ch, ctx, w, h)}</div>
      ${side ? `<div class="ch-side" ${s.sideStep ? `data-step="${s.sideStep}"` : ""}>${typeof side === "string" ? text(side, "lead") : el(side, ctx)}</div>` : ""}
    </div></div>${src(s)}${add(s, ctx)}`;
  },

  compare(s, ctx) {
    const col = (c, k, i) => `<div${attrs({ step: c.step ?? build(s, i) }, `cp-col cp-${k} ${c.hl ? "hl" : ""}`)}>
      ${c.label ? text(c.label, "label", { class: "cp-label" }) : ""}
      ${c.figure ? `<div class="cp-fig">${el(c.figure, ctx, 520, 320)}</div>` : ""}
      ${c.value != null ? text(String(c.value), "h2", { class: "cp-value", size: c.valueSize || 150 }) : ""}
      ${c.title ? text(c.title, "h3", { class: "cp-title" }) : ""}
      ${c.text ? text(c.text, "body", { class: "cp-text" }) : ""}
      ${c.items ? list({ list: c.items, size: 32 }) : ""}</div>`;
    return `<div class="L-compare">${head(s)}<div class="cp-row">${col(s.left, "l", 0)}<div class="cp-vs t f-display">${esc(s.vs ?? "×")}</div>${col(s.right, "r", 1)}</div>
      ${s.after ? text(s.after, "h3", { class: "cp-after", step: s.afterStep ?? (s.build ? 3 : 1), face: "quote", size: 50 }) : ""}</div>${src(s)}${add(s, ctx)}`;
  },

  matrix(s, ctx) {
    const cells = s.cells || [];
    const body = cells.map((c, i) => `<div${attrs({ step: c.step ?? build(s, i) }, `mx-cell ${c.hl ? "hl" : ""}`)}>
      ${c.icon || c.picto ? `<div class="mx-ico">${el(c.icon ? { icon: c.icon, size: 60 } : c, ctx)}</div>` : ""}
      ${text(c.title, "h3", { class: "mx-title" })}${c.text ? text(c.text, "body", { class: "mx-text" }) : ""}${c.example ? text(c.example, "small", { class: "mx-ex" }) : ""}</div>`).join("");
    const [xl, xr] = s.x || ["", ""], [yt, yb] = s.y || ["", ""];
    return `<div class="L-matrix">${head(s)}<div class="mx">
      <div class="mx-y"><span class="t f-label">${md(yt)}</span><span class="t f-label">${md(yb)}</span></div>
      <div class="mx-grid">${body}</div>
      <div class="mx-x"><span class="t f-label">${md(xl)}</span><span class="t f-label">${md(xr)}</span></div></div></div>${src(s)}${add(s, ctx)}`;
  },

  question(s, ctx) {
    const letters = "ABCDEFGH";
    const opts = (s.options || []).map((o, i) => {
      const obj = typeof o === "string" ? { text: o } : o;
      return `<div${attrs({ step: obj.step ?? build(s, i) }, "qs-opt")}><span class="qs-key t f-display">${esc(obj.key || (s.keys || letters)[i])}</span>${text(obj.text, "lead", { class: "qs-text", size: s.optionSize })}${obj.sub ? text(obj.sub, "small", { class: "qs-sub muted" }) : ""}</div>`;
    }).join("");
    return `<div class="L-question">
      <div class="qs-top">${kicker(s)}${text(s.question || s.title, "h2", { class: "ttl e", style: "--d:1;", fit: true, size: s.titleSize })}${s.context ? text(s.context, "lead", { class: "muted e", style: "--d:2;" }) : ""}</div>
      <div class="qs-row"><div class="qs-opts" style="grid-template-columns:repeat(${s.cols || Math.min(3, (s.options || []).length || 1)},1fr)">${opts}</div>
      ${s.timer ? `<div class="qs-timer">${timer({ timer: s.timer, size: 230, label: s.timerLabel })}</div>` : ""}</div>
      ${s.hint ? text(s.hint, "h3", { class: "qs-hint e", style: "--d:3;", size: 42 }) : ""}
    </div>${add(s, ctx)}`;
  },

  poll(s, ctx) {
    return `<div class="L-poll">${kicker(s)}${text(s.question || s.title, "h2", { class: "ttl e", style: "--d:1;", size: s.titleSize })}
      ${s.context ? text(s.context, "lead", { class: "muted" }) : ""}
      ${poll({ poll: s.id || s.poll, options: s.options, compare: s.compare, hint: s.hint, class: "e", style: "--d:2;" }, ctx)}</div>${add(s, ctx)}`;
  },

  image(s, ctx) {
    return `<div class="L-image"><div class="im-fig">${el(s.figure || { image: s.image, fit: s.fit || "cover" }, ctx, 1920, 1080)}</div>
      ${s.title || s.caption ? `<div class="im-cap">${kicker(s)}${s.title ? text(s.title, "h2", { class: "ttl" }) : ""}${s.caption ? text(s.caption, "body") : ""}</div>` : ""}</div>${add(s, ctx)}`;
  },

  code(s, ctx) {
    return `<div class="L-code">${head(s)}<div class="cd-row">${code({ code: s.code, highlight: s.highlight, size: s.size, class: "e", style: "--d:2;" })}
      ${s.note ? `<div class="cd-note" ${s.noteStep ? `data-step="${s.noteStep}"` : ""}>${typeof s.note === "string" ? text(s.note, "lead") : el(s.note, ctx)}</div>` : ""}</div></div>${src(s)}${add(s, ctx)}`;
  },

  blocks(s, ctx) {
    return `<div class="L-blocks">${head(s, s.titleAs || "h2")}<div class="bl-body">${el(s.content || [], ctx)}</div></div>${src(s)}${add(s, ctx)}`;
  },

  end(s, ctx) {
    return `<div class="L-end"><div class="en-main">${kicker(s)}${text(s.title || "Obrigado.", "hero", { class: "ttl e", style: "--d:1;", fit: true, size: s.titleSize })}
      ${s.subtitle ? text(s.subtitle, "lead", { class: "sub e", style: "--d:2;" }) : ""}
      ${s.contacts ? `<div class="en-contacts e" style="--d:3">${s.contacts.map((c) => text(c, "h3", { size: 38 })).join("")}</div>` : ""}</div>
      ${s.figure ? `<div class="en-fig e" style="--d:2">${el(s.figure, ctx, 640, 700)}</div>` : ""}
      ${s.qr ? `<div class="en-fig e" style="--d:3">${el(typeof s.qr === "object" ? { size: 420, ...s.qr } : { qr: s.qr, size: 420, label: s.qrLabel }, ctx)}</div>` : ""}</div>${add(s, ctx)}`;
  },

  references(s, ctx) {
    const items = s.items || [];
    return `<div class="L-refs">${head(s, "h3")}<div class="rf-cols">${items.map((r) => `<div class="rf t f-body">${md(r)}</div>`).join("")}</div></div>${add(s, ctx)}`;
  },

  video(s, ctx) {
    return `<div class="L-video">${head(s)}<div class="vd-row">${el({ video: s.url, label: s.label, class: "e", style: "--d:2;" }, ctx)}${s.figure ? `<div class="vd-fig">${el(s.figure, ctx, 600, 560)}</div>` : ""}</div>${s.caption ? text(s.caption, "body", { class: "muted" }) : ""}</div>${add(s, ctx)}`;
  },

  // Página inteira: uma figura (imagem, imagem gerada pela IA, SVG, HTML, gráfico…) ocupa o slide todo;
  // texto opcional por cima, com um véu para garantir leitura. overlay: bottom | left | center | none
  full(s, ctx) {
    const f = s.figure ?? (s.image || s.image_prompt ? { image: s.image, image_prompt: s.image_prompt } : null);
    const fig = f == null ? "" : typeof f === "object" ? { fit: s.fit || "cover", ...f } : { image: f, fit: s.fit || "cover" };
    const hasText = s.title || s.caption || s.kicker;
    const pos = s.overlay || (hasText ? "bottom" : "none");
    // figura desenhada (gráfico, ícone, diagrama) com texto à esquerda: vai para a direita em vez de ficar por baixo do texto
    const drawn = fig && !(fig.image || fig.image_prompt || fig.video);
    return `<div class="L-full${drawn && pos === "left" ? " fl-shift" : ""}">${fig ? `<div class="fl-fig">${el(fig, ctx, 1920, 1080)}</div>` : ""}
      ${hasText && pos !== "none" ? `<div class="fl-over fl-${pos}"><div class="fl-txt">${kicker(s)}${s.title ? text(s.title, "h2", { class: "ttl e", style: "--d:1;", fit: true, size: s.titleSize }) : ""}${s.caption ? text(s.caption, "lead", { class: "e", style: "--d:2;" }) : ""}</div></div>` : ""}</div>`;
  },

  // Manchete: uma frase enorme que ocupa o slide (encolhe para caber)
  headline(s, ctx) {
    return `<div class="L-headline">${kicker(s)}${text(s.text || s.title, s.as || "hero", { class: "hl-text e", style: "--d:1;", fit: true, size: s.size || 300 })}
      ${s.caption ? text(s.caption, "lead", { class: "hl-cap muted e", style: "--d:2;" }) : ""}</div>${src(s)}${add(s, ctx)}`;
  },

  // Funil: etapas que afunilam (largura decrescente), com valor e texto ao lado
  funnel(s, ctx) {
    const st = s.stages || s.items || [];
    const n = Math.max(1, st.length);
    const rows = st.map((x, i) => {
      const o = typeof x === "string" ? { title: x } : x;
      const w = 100 - i * (48 / Math.max(1, n - 1));
      const mix = 100 - i * (40 / Math.max(1, n - 1));
      return `<div${attrs({ step: o.step ?? build(s, i) }, `fn-row ${o.hl ? "hl" : ""}`)}>
        <div class="fn-barwrap"><div class="fn-bar" style="width:${w.toFixed(1)}%;--mix:${mix.toFixed(0)}%">${o.value != null ? `<span class="fn-val t f-display">${md(String(o.value))}</span>` : ""}<span class="fn-title t f-heading">${md(o.title || "")}</span></div></div>
        ${o.text ? `<div class="fn-text t f-body">${md(o.text)}</div>` : "<div></div>"}</div>`;
    }).join("");
    return `<div class="L-funnel">${head(s)}<div class="fn">${rows}</div></div>${src(s)}${add(s, ctx)}`;
  },

  // Pirâmide: níveis do topo (estreito) para a base (larga)
  pyramid(s, ctx) {
    const lv = s.levels || s.items || [];
    const n = Math.max(1, lv.length);
    const rows = lv.map((x, i) => {
      const o = typeof x === "string" ? { title: x } : x;
      const w = 34 + i * (66 / Math.max(1, n - 1));
      return `<div${attrs({ step: o.step ?? build(s, i) }, `py-row ${o.hl ? "hl" : ""}`)}>
        <div class="py-barwrap"><div class="py-bar" style="width:${w.toFixed(1)}%"><span class="t f-heading">${md(o.title || "")}</span></div></div>
        ${o.text ? `<div class="py-text t f-body">${md(o.text)}</div>` : "<div></div>"}</div>`;
    }).join("");
    return `<div class="L-pyramid">${head(s)}<div class="py">${rows}</div></div>${src(s)}${add(s, ctx)}`;
  },

  // Agenda: seções numeradas; current = número da seção em que estamos (as anteriores ficam "feitas")
  agenda(s, ctx) {
    const it = s.items || [];
    const cur = Number(s.current) || 0;
    const rows = it.map((x, i) => {
      const o = typeof x === "string" ? { title: x } : x;
      const state = cur ? (i + 1 === cur ? "cur" : i + 1 < cur ? "done" : "") : "";
      return `<div${attrs({ step: o.step ?? build(s, i) }, `ag-row ${state}`)}><span class="ag-n t f-display">${String(i + 1).padStart(2, "0")}</span>
        <div class="ag-txt">${text(o.title || "", "h3", { class: "ag-title" })}${o.text ? text(o.text, "body", { class: "ag-sub muted" }) : ""}</div>${o.time ? `<span class="ag-time t f-label">${md(o.time)}</span>` : ""}</div>`;
    }).join("");
    return `<div class="L-agenda">${head(s)}<div class="ag">${rows}</div></div>${src(s)}${add(s, ctx)}`;
  },

  // Mosaico (bento): blocos de tamanhos diferentes. size: big (2×2) | wide (2×1) | tall (1×2) | normal
  bento(s, ctx) {
    const tiles = s.tiles || s.items || [];
    const anySize = tiles.some((t) => t && typeof t === "object" && t.size);
    const body = tiles.map((x, i) => {
      const t = typeof x === "string" ? { title: x } : x;
      const size = t.size || (!anySize && i === 0 ? "big" : "");
      const fig = t.figure ? el(t.figure, ctx, 700, 500) : t.icon ? el({ icon: t.icon, size: size === "big" ? 180 : 96 }, ctx) : "";
      return `<div${attrs({ step: t.step ?? build(s, i) }, `bt-tile ${size ? "bt-" + size : ""} ${t.hl ? "hl" : ""}`)}>
        ${fig ? `<div class="bt-fig">${fig}</div>` : ""}${t.value != null ? `<div class="bt-val t f-display">${md(String(t.value))}</div>` : ""}
        ${t.title ? text(t.title, size === "big" ? "h2" : "h3", { class: "bt-title" }) : ""}${t.text ? text(t.text, "body", { class: "bt-text" }) : ""}</div>`;
    }).join("");
    return `<div class="L-bento">${head(s)}<div class="bt" style="--cols:${s.cols || 4}">${body}</div></div>${src(s)}${add(s, ctx)}`;
  },

  // Posicionamento livre (x, y, w, h em px numa tela de 1920 × 1080)
  canvas(s, ctx) {
    return (s.elements || []).map((e) => el({ ...e, x: e.x ?? 0, y: e.y ?? 0 }, ctx, e.w, e.h)).join("");
  },
};
