// HTML -> PowerPoint EDITÁVEL.
// Lê a posição real de cada elemento no navegador e recria no .pptx:
//   texto  -> caixa de texto nativa (mesma fonte/tamanho/cor/espaçamento)
//   caixas -> formas nativas (retângulo, arredondado, elipse)
//   SVG/figuras/widgets -> imagem PNG 2x com fundo transparente
//   gráficos (opcional --native-charts) -> gráfico nativo do PowerPoint
//   cliques (data-step/data-exit) -> animações de entrada/saída no mesmo clique
//   transição fade entre slides + notas do apresentador
import fs from "node:fs";
import PptxGenJS from "pptxgenjs";
import JSZip from "jszip";
import { openDeck } from "./browser.js";
import { pptxFontMap } from "../themes.js";
import { notesPlain } from "../markup.js";

const PX = 1 / 144; // 1920 px = 13,333 in
const PT = 0.5; // 1 px (na tela de 1920) = 0,5 pt

// ------------------------------------------------------------------ coleta no navegador
function collectInPage([idx, nativeCharts]) {
  const slide = document.querySelectorAll("#stage > .slide")[idx];
  document.querySelectorAll("[data-pid]").forEach((e) => e.removeAttribute("data-pid"));
  const cv = document.createElement("canvas"); cv.width = cv.height = 1;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  const rgba = (c) => {
    if (!c || c === "transparent") return { hex: "000000", a: 0 };
    cx.clearRect(0, 0, 1, 1); cx.fillStyle = "#000"; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    if (d[3] === 0) return { hex: "000000", a: 0 };
    const un = (v) => Math.round(Math.min(255, (v * 255) / d[3]));
    return { hex: [un(d[0]), un(d[1]), un(d[2])].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase(), a: d[3] / 255 };
  };
  const sr = slide.getBoundingClientRect();
  const box = (r) => ({ x: r.left - sr.left, y: r.top - sr.top, w: r.width, h: r.height });
  const INLINE = new Set(["B", "I", "EM", "STRONG", "MARK", "SPAN", "A", "S", "CODE", "BR", "SUB", "SUP", "U", "SMALL"]);
  let pid = 0;
  const items = [];

  const stepOf = (e) => {
    let s = 0, ex = null;
    for (let p = e; p && p !== slide; p = p.parentElement) {
      if (p.dataset && p.dataset.step) s = Math.max(s, +p.dataset.step);
      if (p.dataset && p.dataset.exit && ex == null) ex = +p.dataset.exit;
    }
    return { step: s, exit: ex };
  };
  const opac = (e) => { let o = 1; for (let p = e; p && p !== slide.parentElement; p = p.parentElement) o *= +getComputedStyle(p).opacity; return o; };
  const isLeaf = (e) => {
    const d = getComputedStyle(e).display;
    if ((d.includes("flex") || d.includes("grid")) && e.children.length) return false;
    let has = false;
    for (const c of e.childNodes) {
      if (c.nodeType === 3) { if (c.textContent.trim()) has = true; }
      else if (c.nodeType === 1) {
        if (!INLINE.has(c.tagName)) return false;
        if (c.querySelector && c.querySelector("svg,img,div,canvas")) return false;
        if (c.textContent.trim()) has = true;
      }
    }
    return has;
  };
  const transformed = (cs) => (cs.transform && cs.transform !== "none" && !/^matrix\(1, 0, 0, 1,/.test(cs.transform)) || (cs.writingMode && cs.writingMode !== "horizontal-tb");
  // área visual real de um SVG (desenhos podem "vazar" da caixa com overflow:visible)
  const visualRect = (e) => {
    let L = Infinity, T = Infinity, Rr = -Infinity, B = -Infinity;
    const add = (r) => { if (r.width || r.height) { L = Math.min(L, r.left); T = Math.min(T, r.top); Rr = Math.max(Rr, r.right); B = Math.max(B, r.bottom); } };
    add(e.getBoundingClientRect());
    if (e.tagName.toLowerCase() === "svg") e.querySelectorAll("*").forEach((c) => { if (c.getBoundingClientRect && !["defs", "marker", "clippath", "lineargradient", "filter"].includes(c.tagName.toLowerCase()) && !c.closest("defs")) add(c.getBoundingClientRect()); });
    L = Math.max(L, sr.left); T = Math.max(T, sr.top); Rr = Math.min(Rr, sr.right); B = Math.min(B, sr.bottom);
    return { left: L, top: T, width: Rr - L, height: B - T, right: Rr, bottom: B };
  };

  // Texto em "runs", com as MESMAS quebras de linha que o navegador fez (palavra a palavra).
  function runsOf(leaf, lh) {
    const paras = [[]];
    const baseW = +getComputedStyle(leaf).fontWeight;
    const baseItalic = getComputedStyle(leaf).fontStyle === "italic";
    const rng = document.createRange();
    let lastTop = null, pendingSpace = false;
    const styleOf = (el) => {
      const cs = getComputedStyle(el);
      const faceEl = el.closest('[class*="f-"]');
      const role = faceEl ? ([...faceEl.classList].find((k) => /^f-(display|heading|body|label|mono|quote)$/.test(k)) || "").slice(2) : "";
      const link = el.closest("a");
      const col = rgba(cs.color);
      return {
        color: col.hex, alpha: col.a, size: parseFloat(cs.fontSize), weight: +cs.fontWeight, baseW,
        italic: cs.fontStyle === "italic", baseItalic, family: cs.fontFamily.split(",")[0].replace(/["']/g, "").trim(), role,
        spacing: parseFloat(cs.letterSpacing) || 0, upper: cs.textTransform === "uppercase", stretch: parseFloat(cs.fontStretch) || 100,
        strike: cs.textDecorationLine.includes("line-through"), underline: !link && cs.textDecorationLine.includes("underline"),
        href: link ? link.href : null,
      };
    };
    const same = (a, b) => ["color", "alpha", "size", "weight", "italic", "family", "role", "spacing", "strike", "underline", "href"].every((k) => a[k] === b[k]);
    const push = (txt, st, newLine) => {
      if (newLine && paras[paras.length - 1].length) paras.push([]);
      const P = paras[paras.length - 1], prev = P[P.length - 1];
      if (prev && same(prev, st)) prev.text += txt; else P.push({ ...st, text: txt });
    };
    const walk = (n) => {
      for (const c of n.childNodes) {
        if (c.nodeType === 3) {
          const raw = c.textContent, st = styleOf(c.parentElement);
          const re = /\S+/g; let m, lastEnd = 0;
          while ((m = re.exec(raw))) {
            if (m.index > lastEnd) pendingSpace = true;
            rng.setStart(c, m.index); rng.setEnd(c, m.index + m[0].length);
            const rects = rng.getClientRects();
            const top = rects.length ? rects[0].top : lastTop;
            const newLine = lastTop != null && top != null && top > lastTop + lh * 0.5;
            let word = st.upper ? m[0].toUpperCase() : m[0];
            const lineHasText = paras[paras.length - 1].length && !newLine;
            push((pendingSpace && lineHasText ? " " : "") + word, st, newLine);
            pendingSpace = false; lastTop = top; lastEnd = m.index + m[0].length;
          }
          if (raw.length > lastEnd && /\s/.test(raw.slice(lastEnd))) pendingSpace = true;
        } else if (c.nodeType === 1) {
          if (c.tagName === "BR") { paras.push([]); lastTop = null; pendingSpace = false; continue; }
          const blk = getComputedStyle(c).display === "block";
          if (blk && paras[paras.length - 1].length) { paras.push([]); lastTop = null; pendingSpace = false; }
          walk(c);
          if (blk) { paras.push([]); lastTop = null; pendingSpace = false; }
        }
      }
    };
    walk(leaf);
    return paras.filter((p) => p.length);
  }

  function visit(e) {
    const cs = getComputedStyle(e);
    if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity === 0) return;
    const r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) { if (e.children.length) [...e.children].forEach(visit); return; }
    const tag = e.tagName;
    const st = stepOf(e);
    const tagIt = (o) => { e.setAttribute("data-pid", String(++pid)); items.push({ pid, ...box(r), ...st, opacity: opac(e), ...o }); };

    // gráfico nativo
    if (nativeCharts && tag.toLowerCase() === "svg" && e.classList.contains("chart")) {
      const spec = JSON.parse(e.dataset.chart || "{}");
      if (["bar", "column", "line", "donut"].includes(spec.type)) {
        const sel = spec.type === "line" ? ".draw" : spec.type === "donut" ? ".arc" : spec.type === "bar" ? ".gx" : ".gy";
        const colors = [...e.querySelectorAll(sel)].map((n) => rgba(getComputedStyle(n)[spec.type === "line" || spec.type === "donut" ? "stroke" : "fill"]).hex);
        const fg = rgba(getComputedStyle(slide).color).hex;
        tagIt({ kind: "chart", spec, colors, fg });
        return;
      }
    }
    // coisas que viram imagem
    if (tag.toLowerCase() === "svg" || tag === "IMG" || tag === "CANVAS" || tag === "VIDEO" ||
        e.classList.contains("widget") || e.classList.contains("timer") || e.classList.contains("code") || e.classList.contains("raster") || transformed(cs)) {
      const vr = visualRect(e);
      e.setAttribute("data-pid", String(++pid));
      items.push({ pid, kind: "image", ...box(vr), clip: { x: vr.left, y: vr.top, width: vr.width, height: vr.height }, ...st, opacity: opac(e) });
      return;
    }
    // caixa (fundo/borda)
    const bg = rgba(cs.backgroundColor);
    const bw = parseFloat(cs.borderTopWidth) || 0;
    const sameBorder = ["Right", "Bottom", "Left"].every((s) => cs[`border${s}Width`] === cs.borderTopWidth && cs[`border${s}Color`] === cs.borderTopColor);
    const bc = rgba(cs.borderTopColor);
    const hasBorder = bw > 0 && bc.a > 0.01 && cs.borderTopStyle !== "none" && sameBorder;
    if (tag !== "MARK" && cs.backgroundImage !== "none" && !cs.backgroundImage.startsWith("linear-gradient(rgb") ) {
      tagIt({ kind: "image", bgOnly: true });
    } else if (bg.a > 0.01 || hasBorder) {
      const rad = cs.borderTopLeftRadius;
      const rpx = rad.endsWith("%") ? (parseFloat(rad) / 100) * Math.min(r.width, r.height) : parseFloat(rad) || 0;
      const shape = rpx >= Math.min(r.width, r.height) / 2 - 0.5 ? (Math.abs(r.width - r.height) < 2 ? "ellipse" : "pill") : rpx > 0 ? "round" : "rect";
      e.setAttribute("data-pid", String(++pid));
      items.push({ pid, kind: "shape", ...box(r), ...st, opacity: opac(e), shape, radius: rpx, fill: bg.a > 0.01 ? bg.hex : null, fillA: bg.a, line: hasBorder ? bc.hex : null, lineA: bc.a, lineW: hasBorder ? bw : 0 });
    }
    // texto
    if (isLeaf(e)) {
      const pl = parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth || 0), pr = parseFloat(cs.paddingRight) + parseFloat(cs.borderRightWidth || 0);
      const pt = parseFloat(cs.paddingTop) + parseFloat(cs.borderTopWidth || 0), pb = parseFloat(cs.paddingBottom) + parseFloat(cs.borderBottomWidth || 0);
      const b = box(r);
      const flexCenter = cs.display.includes("flex") && cs.alignItems === "center";
      const ta = cs.textAlign === "start" || cs.textAlign === "left" ? "left" : cs.textAlign === "end" ? "right" : cs.textAlign === "justify" ? "left" : cs.textAlign;
      const align = cs.display.includes("flex") && cs.justifyContent === "center" ? "center" : ta;
      const lh = cs.lineHeight === "normal" ? parseFloat(cs.fontSize) * 1.2 : parseFloat(cs.lineHeight);
      // marca-texto: um retângulo por linha, atrás do texto
      e.querySelectorAll("mark").forEach((m) => {
        const mcs = getComputedStyle(m);
        if (!m.classList.contains("play") && !document.documentElement.classList.contains("export")) return;
        const hi = rgba(mcs.getPropertyValue("--hi").trim() || mcs.backgroundColor);
        for (const cr of m.getClientRects()) {
          const bh = cr.height * 0.92, by = cr.top + cr.height * 0.044;
          items.push({ pid: ++pid, kind: "shape", x: cr.left - sr.left, y: by - sr.top, w: cr.width, h: bh, ...st, opacity: opac(e), shape: "rect", radius: 0, fill: hi.hex, fillA: hi.a, line: null, lineA: 0, lineW: 0 });
        }
      });
      items.push({
        pid: ++pid, kind: "text", x: b.x + pl, y: b.y + pt, w: b.w - pl - pr, h: b.h - pt - pb, ...st, opacity: opac(e),
        align, valign: flexCenter ? "middle" : "top", lineHeight: lh, paras: runsOf(e, lh), nowrap: true,
      });
      return;
    }
    [...e.children].forEach(visit);
  }
  [...slide.children].forEach(visit);
  const sbg = rgba(getComputedStyle(slide).backgroundColor).hex;
  return { bg: sbg, tr: slide.dataset.tr || "fade", items };
}

// ------------------------------------------------------------------ fontes
// Fontes variáveis do Windows: (peso, largura) -> nome exato da instância no PowerPoint
const VARIABLE = {
  Bahnschrift: {
    weights: [300, 350, 400, 600, 700], widths: [75, 87.5, 100],
    name: (w, x) => {
      const wn = { 300: " Light", 350: " SemiLight", 400: "", 600: " SemiBold", 700: "" }[w];
      const xn = x === 75 ? " Condensed" : x === 87.5 ? (w === 600 ? " SemiConden" : w === 350 ? " SemiConde" : " SemiCondensed") : "";
      return { face: `Bahnschrift${wn}${xn}`, bold: w === 700 };
    },
  },
};
const near = (arr, v) => arr.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
function fontFor(run, fmap, aliases = {}) {
  const fam = aliases[run.family] || run.family;
  if (VARIABLE[fam]) {
    const V = VARIABLE[fam];
    const r = V.name(near(V.weights, run.weight), near(V.widths, run.stretch || 100));
    return { face: r.face, bold: r.bold, italic: run.italic };
  }
  const m = fmap[run.role];
  let face = fam, bold = run.weight >= 600, italic = run.italic;
  if (m) {
    const extraBold = run.weight >= Math.max(600, run.baseW + 150);
    const f = extraBold ? m.bold : m.regular;
    face = f.face; bold = !!f.bold; italic = !!f.italic || (run.italic && !run.baseItalic);
  }
  return { face, bold, italic };
}

// ------------------------------------------------------------------ animações
function timingXML(anims, ids) {
  // anims: [{spid, step, exit, isSp}]
  let id = 2;
  const clicks = new Map();
  for (const a of anims) {
    if (a.step > 0) { if (!clicks.has(a.step)) clicks.set(a.step, []); clicks.get(a.step).push({ ...a, type: "in" }); }
    if (a.exit != null && a.exit > 0) { if (!clicks.has(a.exit)) clicks.set(a.exit, []); clicks.get(a.exit).push({ ...a, type: "out" }); }
  }
  if (!clicks.size) return "";
  const keys = [...clicks.keys()].sort((a, b) => a - b);
  let seq = "";
  const bld = new Set();
  for (const k of keys) {
    const list = clicks.get(k);
    let inner = "";
    list.forEach((a, j) => {
      const node = j === 0 ? "clickEffect" : "withEffect";
      const grp = a.type === "in" ? 0 : 1;
      if (a.isSp) bld.add(`<p:bldP spid="${a.spid}" grpId="${grp}" animBg="1"/>`);
      if (a.type === "in") {
        inner += `<p:par><p:cTn id="${++id}" presetID="10" presetClass="entr" presetSubtype="0" fill="hold" grpId="${grp}" nodeType="${node}"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>` +
          `<p:set><p:cBhvr><p:cTn id="${++id}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="${a.spid}"/></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set>` +
          `<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="${++id}" dur="500"/><p:tgtEl><p:spTgt spid="${a.spid}"/></p:tgtEl></p:cBhvr></p:animEffect>` +
          `</p:childTnLst></p:cTn></p:par>`;
      } else {
        inner += `<p:par><p:cTn id="${++id}" presetID="10" presetClass="exit" presetSubtype="0" fill="hold" grpId="${grp}" nodeType="${node}"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>` +
          `<p:animEffect transition="out" filter="fade"><p:cBhvr><p:cTn id="${++id}" dur="400"/><p:tgtEl><p:spTgt spid="${a.spid}"/></p:tgtEl></p:cBhvr></p:animEffect>` +
          `<p:set><p:cBhvr><p:cTn id="${++id}" dur="1" fill="hold"><p:stCondLst><p:cond delay="399"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="${a.spid}"/></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="hidden"/></p:to></p:set>` +
          `</p:childTnLst></p:cTn></p:par>`;
      }
    });
    seq += `<p:par><p:cTn id="${++id}" fill="hold"><p:stCondLst><p:cond delay="indefinite"/></p:stCondLst><p:childTnLst><p:par><p:cTn id="${++id}" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst><p:childTnLst>${inner}</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par>`;
  }
  return `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>${seq}</p:childTnLst></p:cTn><p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq></p:childTnLst></p:cTn></p:par></p:tnLst>${bld.size ? `<p:bldLst>${[...bld].join("")}</p:bldLst>` : ""}</p:timing>`;
}

// ------------------------------------------------------------------ principal
export async function exportPptx(htmlFile, outFile, { theme, meta, nativeCharts = false, log = () => {} } = {}) {
  const { browser, page, errors } = await openDeck(htmlFile, { scale: 2 });
  await page.addStyleTag({ content: `
    html.solo,html.solo body,html.solo #viewport,html.solo .slide{background:transparent!important}
    html.solo .slide::after,html.solo .slide::before{display:none!important}
    html.solo *{visibility:hidden!important}
    html.solo .solo-t,html.solo .solo-t *{visibility:visible!important}
    html.solo .solo-t.solo-bg *{visibility:hidden!important}` });
  const fmap = pptxFontMap(theme);
  // apelidos CSS (ex.: SagaDIN -> Bahnschrift) declarados em fontFaces do tema
  const aliases = Object.fromEntries((theme.fontFaces || []).map((f) => [f.family, (f.src.match(/local\(['"]?([^'")]+)/) || [])[1]]).filter((x) => x[1]));
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_WIDE";
  pres.title = meta.title || "";
  pres.author = meta.author || "";
  const n = await page.evaluate(() => window.sagadeck.n);
  const animBySlide = [];

  for (let i = 0; i < n; i++) {
    const S = await page.evaluate((j) => window.sagadeck.steps(j), i);
    await page.evaluate(([j, k]) => window.sagadeck.goto(j, k, true), [i, S]);
    await page.waitForTimeout(40);
    const data = await page.evaluate(collectInPage, [i, nativeCharts]);
    const slide = pres.addSlide();
    slide.background = { color: data.bg };
    const anims = [];
    for (const it of data.items) {
      const name = `sagadeck-${it.pid}`;
      const geo = { x: it.x * PX, y: it.y * PX, w: Math.max(it.w, 1) * PX, h: Math.max(it.h, 1) * PX };
      const alpha = it.opacity ?? 1;
      if (it.kind === "shape") {
        const shape = it.shape === "ellipse" ? pres.ShapeType.ellipse : it.shape === "rect" ? pres.ShapeType.rect : pres.ShapeType.roundRect;
        const o = { ...geo, objectName: name };
        o.fill = it.fill ? { color: it.fill, transparency: Math.round((1 - it.fillA * alpha) * 100) } : { type: "none" };
        o.line = it.line ? { color: it.line, width: it.lineW * PT, transparency: Math.round((1 - it.lineA * alpha) * 100) } : { type: "none" };
        if (shape === pres.ShapeType.roundRect) o.rectRadius = Math.min(it.radius, Math.min(it.w, it.h) / 2) * PX;
        slide.addShape(shape, o);
        anims.push({ name, step: it.step, exit: it.exit, isSp: true });
      } else if (it.kind === "text") {
        const runs = [];
        it.paras.forEach((p, pi) => p.forEach((r, ri) => {
          const f = fontFor(r, fmap, aliases);
          const o = { fontFace: f.face, fontSize: +(r.size * PT).toFixed(2), bold: f.bold, italic: f.italic, color: r.color };
          const tr = Math.round((1 - r.alpha * alpha) * 100); if (tr > 0) o.transparency = tr;
          if (r.spacing) o.charSpacing = +(r.spacing * PT).toFixed(2);
          if (r.hi) o.highlight = r.hi;
          if (r.strike) o.strike = "sngStrike";
          if (r.underline) o.underline = { style: "sng" };
          if (r.href) o.hyperlink = { url: r.href };
          if (ri === p.length - 1 && pi < it.paras.length - 1) o.breakLine = true;
          runs.push({ text: r.text, options: o });
        }));
        if (!runs.length) continue;
        // folga para diferenças mínimas de métrica entre navegador e PowerPoint
        const slack = it.nowrap ? 0.12 : 0.01;
        const extra = it.w * slack;
        let x = it.x - (it.align === "center" ? extra / 2 : it.align === "right" ? extra : 0);
        slide.addText(runs, {
          x: x * PX, y: it.y * PX, w: (it.w + extra) * PX, h: Math.max(it.h, it.lineHeight) * PX,
          margin: 0, align: it.align, valign: it.valign, lineSpacing: +(it.lineHeight * PT).toFixed(2),
          paraSpaceBefore: 0, paraSpaceAfter: 0, fit: "none", wrap: !it.nowrap, isTextBox: true, objectName: name,
        });
        anims.push({ name, step: it.step, exit: it.exit, isSp: true });
      } else if (it.kind === "image") {
        const loc = page.locator(`[data-pid="${it.pid}"]`);
        await page.evaluate(([pid, bgOnly]) => {
          document.documentElement.classList.add("solo");
          const el = document.querySelector(`[data-pid="${pid}"]`);
          el.classList.add("solo-t"); if (bgOnly) el.classList.add("solo-bg");
        }, [it.pid, !!it.bgOnly]);
        const buf = it.clip
          ? await page.screenshot({ omitBackground: true, animations: "disabled", clip: it.clip })
          : await loc.screenshot({ omitBackground: true, animations: "disabled" });
        await page.evaluate((pid) => {
          document.documentElement.classList.remove("solo");
          const el = document.querySelector(`[data-pid="${pid}"]`); el.classList.remove("solo-t", "solo-bg");
        }, it.pid);
        slide.addImage({ data: "image/png;base64," + buf.toString("base64"), ...geo, objectName: name });
        anims.push({ name, step: it.step, exit: it.exit, isSp: false });
      } else if (it.kind === "chart") {
        addNativeChart(pres, slide, it, geo, name, fmap);
        anims.push({ name, step: it.step, exit: it.exit, isSp: false });
      }
    }
    const notes = meta.slides[i]?.notesRaw ?? "";
    if (notes) slide.addNotes(notesPlain(notes));
    animBySlide.push({ anims, tr: data.tr });
    log(`  slide ${i + 1}/${n}: ${data.items.length} objetos`);
  }
  await browser.close();

  // pós-processamento: animações + transições
  const buf = await pres.write({ outputType: "nodebuffer" });
  const zip = await JSZip.loadAsync(buf);
  for (let i = 0; i < animBySlide.length; i++) {
    const f = `ppt/slides/slide${i + 1}.xml`;
    let xml = await zip.file(f).async("string");
    const ids = {};
    for (const m of xml.matchAll(/<p:cNvPr id="(\d+)" name="(sagadeck-\d+)"/g)) ids[m[2]] = m[1];
    const anims = animBySlide[i].anims.filter((a) => ids[a.name] && (a.step > 0 || a.exit != null)).map((a) => ({ ...a, spid: ids[a.name] }));
    const tr = animBySlide[i].tr === "cut" ? "" : `<p:transition spd="med"><p:fade/></p:transition>`;
    const timing = timingXML(anims);
    xml = xml.replace(/<\/p:clrMapOvr>/, `</p:clrMapOvr>${tr}${timing}`);
    if (!/<\/p:clrMapOvr>/.test(xml)) xml = xml.replace(/<\/p:sld>/, `${tr}${timing}</p:sld>`);
    zip.file(f, xml);
  }
  const out = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  fs.writeFileSync(outFile, out);
  return { errors };
}

function addNativeChart(pres, slide, it, geo, name, fmap) {
  const s = it.spec, font = fmap.body?.regular?.face || "Arial";
  const base = { ...geo, objectName: name, fontFace: font, catAxisLabelColor: it.fg, valAxisLabelColor: it.fg, dataLabelColor: it.fg, showLegend: false,
    valGridLine: { style: "none" }, catGridLine: { style: "none" }, catAxisLabelFontSize: 16, dataLabelFontSize: 20, dataLabelFontFace: font, catAxisLabelFontFace: font };
  if (s.type === "bar" || s.type === "column") {
    slide.addChart(pres.ChartType.bar, [{ name: "série", labels: s.labels, values: s.values }], {
      ...base, barDir: s.type === "bar" ? "bar" : "col", chartColors: it.colors.length ? it.colors : ["888888"], barGapWidthPct: 50,
      showValue: true, dataLabelPosition: "outEnd", dataLabelFormatCode: `"${s.prefix || ""}"0"${s.suffix || ""}"`, valAxisHidden: true,
      valAxisMaxVal: s.max, catAxisOrientation: s.type === "bar" ? "maxMin" : "minMax", catAxisLineShow: false,
    });
  } else if (s.type === "line") {
    slide.addChart(pres.ChartType.line, s.series.map((x) => ({ name: x.name, labels: s.labels, values: x.values.map((v) => (v == null ? "" : v)) })), {
      ...base, chartColors: it.colors.length ? it.colors : undefined, lineSize: 3, lineDataSymbolSize: 6, valAxisMinVal: s.min, valAxisMaxVal: s.max,
      valGridLine: { color: "DDDDDD", size: 0.5 }, showLegend: s.series.length > 1, legendPos: "b",
    });
  } else if (s.type === "donut") {
    slide.addChart(pres.ChartType.doughnut, [{ name: "série", labels: s.parts.map((p) => p.label), values: s.parts.map((p) => p.value) }], {
      ...base, chartColors: it.colors, holeSize: 62, showValue: false, showPercent: false,
    });
  }
}
