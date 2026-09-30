// Importar .pptx fielmente: cada slide vira um slide `canvas` com os elementos na mesma posição (a tela do sagadeck
// tem 1920 px de largura; a altura acompanha a proporção do arquivo). Lê o que o PowerPoint lê:
//   - texto: caixas com parágrafos e trechos (fonte, tamanho, negrito, itálico, sublinhado, cor, sobrescrito),
//     marcadores (inclusive os de Wingdings, desenhados), recuo por nível, alinhamento, ancoragem e o auto-ajuste
//     (fontScale); a herança completa: slide > layout > mestre > estilos do mestre > padrão da apresentação
//   - formas: geometria pronta (retângulo, elipse, setas, conectores…) e desenho livre (custGeom), preenchimento
//     sólido/gradiente, contorno, tracejado, pontas de seta; grupos achatados
//   - imagens (com recorte), tabelas (com o estilo de tabela do arquivo), equações (OMML → LaTeX), fundo do slide
//   - o que o mestre e o layout desenham em todo slide (logos, faixas), anotações do apresentador
// O leitor é puro: devolve o deck e a lista de mídias; quem grava no disco é o chamador (src/import/index.js).
import JSZip from "jszip";
import { parseXML, kids, kid, path, all, textOf, num } from "./xml.js";
import { ommlToLatex } from "./omml.js";

const W = 1920;
const r1 = (v) => Math.round(v * 10) / 10;

// ------------------------------------------------------------------------------------------------ cores
const PRESET = { black: "000000", white: "FFFFFF", red: "FF0000", green: "008000", blue: "0000FF", yellow: "FFFF00", gray: "808080", grey: "808080", darkGray: "A9A9A9", lightGray: "D3D3D3", orange: "FFA500", navy: "000080", darkBlue: "00008B", darkRed: "8B0000", darkGreen: "006400", cyan: "00FFFF", magenta: "FF00FF", purple: "800080", silver: "C0C0C0", maroon: "800000", teal: "008080", olive: "808000", lime: "00FF00", aqua: "00FFFF" };
const hexToRgb = (h) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgbToHex = (rgb) => rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("").toUpperCase();
function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}
function hslToRgb([h, s, l]) {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}
function applyMods(hex, node) {
  let rgb = hexToRgb(hex), alpha = 1;
  for (const m of kids(node)) {
    const v = num(m.attrs.val) / 100000;
    const n = m.name.split(":").pop();
    if (n === "lumMod" || n === "lumOff") { const hsl = rgbToHsl(rgb); hsl[2] = n === "lumMod" ? hsl[2] * v : hsl[2] + v; hsl[2] = Math.max(0, Math.min(1, hsl[2])); rgb = hslToRgb(hsl); }
    else if (n === "satMod") { const hsl = rgbToHsl(rgb); hsl[1] = Math.max(0, Math.min(1, hsl[1] * v)); rgb = hslToRgb(hsl); }
    else if (n === "tint") rgb = rgb.map((c) => c + (255 - c) * (1 - v));
    else if (n === "shade") rgb = rgb.map((c) => c * v);
    else if (n === "alpha") alpha = v;
  }
  return { hex: rgbToHex(rgb), alpha };
}

// ------------------------------------------------------------------------------------------------ leitura
export async function readPptx(buf) {
  const zip = await JSZip.loadAsync(buf);
  const xmlCache = new Map();
  const xml = async (p) => {
    if (!xmlCache.has(p)) { const f = zip.file(p); xmlCache.set(p, f ? parseXML(await f.async("string")) : null); }
    return xmlCache.get(p);
  };
  const relsOf = async (part) => {
    const dir = part.slice(0, part.lastIndexOf("/")), base = part.slice(part.lastIndexOf("/") + 1);
    const r = await xml(`${dir}/_rels/${base}.rels`);
    const map = new Map();
    for (const rel of kids(r, "Relationship")) {
      const t = rel.attrs.Target || "";
      const target = rel.attrs.TargetMode === "External" ? t : resolvePath(dir, t);
      map.set(rel.attrs.Id, { type: (rel.attrs.Type || "").split("/").pop(), target, external: rel.attrs.TargetMode === "External" });
    }
    return map;
  };
  const pres = await xml("ppt/presentation.xml");
  if (!pres) throw new Error("Não parece um .pptx (falta ppt/presentation.xml).");
  const sz = kid(pres, "sldSz");
  const cx = num(sz?.attrs.cx, 12192000), cy = num(sz?.attrs.cy, 6858000);
  const presRels = await relsOf("ppt/presentation.xml");
  const slideFiles = kids(kid(pres, "sldIdLst"), "sldId").map((s) => presRels.get(s.attrs["r:id"])?.target).filter(Boolean);
  const themeFile = [...presRels.values()].find((r) => r.type === "theme")?.target;
  return { zip, xml, relsOf, pres, cx, cy, slideFiles, themeFile };
}
function resolvePath(dir, t) {
  if (t.startsWith("/")) return t.slice(1);
  const parts = dir.split("/");
  for (const seg of t.split("/")) { if (seg === "..") parts.pop(); else if (seg !== ".") parts.push(seg); }
  return parts.join("/");
}

// ------------------------------------------------------------------------------------------------ importar
export async function importPptx(buf, { mediaDir = "imagens/original" } = {}) {
  const P = await readPptx(buf);
  const S = W / P.cx, H = Math.round(P.cy * S);
  const PT = S * 12700; // px por ponto
  // tema: cada mestre tem o seu (cores, fontes, estilos de preenchimento e linha)
  const themeCache = new Map();
  async function themeOf(file) {
    if (themeCache.has(file)) return themeCache.get(file);
    const theme = await P.xml(file);
    const scheme = {};
    for (const c of kids(path(theme, "themeElements", "clrScheme"))) {
      const v = kid(c, "srgbClr")?.attrs.val || kid(c, "sysClr")?.attrs.lastClr;
      if (v) scheme[c.name.split(":").pop()] = v.toUpperCase();
    }
    const fontScheme = path(theme, "themeElements", "fontScheme");
    const fmt = path(theme, "themeElements", "fmtScheme");
    const t = { scheme, fonts: { major: path(fontScheme, "majorFont", "latin")?.attrs.typeface || "Calibri Light", minor: path(fontScheme, "minorFont", "latin")?.attrs.typeface || "Calibri" }, bgFills: kids(kid(fmt, "bgFillStyleLst")), lnStyles: kids(kid(fmt, "lnStyleLst")), fillStyles: kids(kid(fmt, "fillStyleLst")) };
    themeCache.set(file, t);
    return t;
  }
  const base = await themeOf(P.themeFile || "ppt/theme/theme1.xml");
  const { scheme, fonts } = base;
  let { bgFills, lnStyles, fillStyles } = base;
  const defaultText = kid(P.pres, "defaultTextStyle");
  const tableStylesXml = await P.xml("ppt/tableStyles.xml");
  const tableStyles = new Map(kids(tableStylesXml, "tblStyle").map((t) => [t.attrs.styleId, t]));

  const media = new Map(); // caminho no zip -> { name, ext }
  const mediaName = (target) => {
    if (!media.has(target)) {
      const base = target.split("/").pop();
      media.set(target, { zipPath: target, name: `${mediaDir}/${base}`, ext: base.split(".").pop().toLowerCase() });
    }
    return media.get(target).name;
  };
  const warnings = [];
  const dimCache = new Map();
  async function imageDims(zipPath) {
    if (dimCache.has(zipPath)) return dimCache.get(zipPath);
    let d = null;
    try {
      const b = await P.zip.file(zipPath)?.async("uint8array");
      if (b && b[0] === 0x89 && b[1] === 0x50) d = { w: (b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19], h: (b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23] };
      else if (b && b[0] === 0x47 && b[1] === 0x49) d = { w: b[6] | (b[7] << 8), h: b[8] | (b[9] << 8) };
      else if (b && b[0] === 0xff && b[1] === 0xd8) {
        for (let i = 2; i < b.length - 9;) {
          if (b[i] !== 0xff) { i++; continue; }
          const m = b[i + 1], len = (b[i + 2] << 8) | b[i + 3];
          if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) { d = { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] }; break; }
          i += 2 + len;
        }
      }
    } catch { d = null; }
    dimCache.set(zipPath, d);
    return d;
  }

  // cor de um nó (solidFill, srgbClr…) no contexto de um mapa de cores e de uma cor de "placeholder" (phClr)
  const colorOf = (node, ctx) => {
    if (!node) return null;
    const c = ["srgbClr", "schemeClr", "sysClr", "prstClr", "scrgbClr", "hslClr"].map((n) => kid(node, n)).find(Boolean) || (/(srgbClr|schemeClr|sysClr|prstClr)$/.test(node.name) ? node : null);
    if (!c) return null;
    const n = c.name.split(":").pop();
    let hex = null;
    if (n === "srgbClr") hex = c.attrs.val;
    else if (n === "sysClr") hex = c.attrs.lastClr || (c.attrs.val === "window" ? "FFFFFF" : "000000");
    else if (n === "prstClr") hex = PRESET[c.attrs.val] || "000000";
    else if (n === "scrgbClr") hex = rgbToHex(["r", "g", "b"].map((k) => (num(c.attrs[k]) / 100000) * 255));
    else if (n === "schemeClr") {
      let v = c.attrs.val;
      if (v === "phClr") return ctx?.ph ? { ...ctx.ph, ...applyMods(ctx.ph.hex, c) } : null;
      v = ctx?.clrMap?.[v] || { bg1: "lt1", tx1: "dk1", bg2: "lt2", tx2: "dk2" }[v] || v;
      hex = (ctx?.scheme || scheme)[v];
    }
    if (!hex) return null;
    return applyMods(hex.toUpperCase(), c);
  };
  const css = (c) => (!c ? null : c.alpha < 1 ? `rgba(${hexToRgb(c.hex).join(",")},${+c.alpha.toFixed(3)})` : `#${c.hex}`);

  // mestre e layout de cada slide (com cache)
  const partCache = new Map();
  async function partInfo(file) {
    if (partCache.has(file)) return partCache.get(file);
    const x = await P.xml(file), rels = await P.relsOf(file);
    const info = { file, x, rels, tree: path(x, "cSld", "spTree"), bg: path(x, "cSld", "bg"), clrMap: kid(x, "clrMap")?.attrs, phs: new Map() };
    for (const sp of [...kids(info.tree, "sp"), ...kids(info.tree, "pic")]) {
      const ph = placeholderOf(sp);
      if (ph) { if (ph.idx != null) info.phs.set(`idx:${ph.idx}`, sp); if (!info.phs.has(`type:${ph.type}`)) info.phs.set(`type:${ph.type}`, sp); }
    }
    partCache.set(file, info);
    return info;
  }
  const placeholderOf = (sp) => { const ph = all(sp, "ph")[0]; return ph ? { type: ph.attrs.type || "body", idx: ph.attrs.idx } : null; };
  const findPh = (info, ph) => {
    if (!info || !ph) return null;
    const alias = { ctrTitle: "title", subTitle: "body", obj: "body" };
    return (ph.idx != null && info.phs.get(`idx:${ph.idx}`)) || info.phs.get(`type:${ph.type}`) || info.phs.get(`type:${alias[ph.type] || ph.type}`) || (ph.type === "body" ? info.phs.get("type:obj") : null);
  };

  const slides = [];
  let masterOut = null;
  for (let si = 0; si < P.slideFiles.length; si++) {
    const file = P.slideFiles[si];
    const slide = await partInfo(file);
    const layoutFile = [...slide.rels.values()].find((r) => r.type === "slideLayout")?.target;
    const layout = layoutFile ? await partInfo(layoutFile) : null;
    const masterFile = layout ? [...layout.rels.values()].find((r) => r.type === "slideMaster")?.target : null;
    const master = masterFile ? await partInfo(masterFile) : null;
    const cmap = { ...(master?.clrMap || { bg1: "lt1", tx1: "dk1", bg2: "lt2", tx2: "dk2" }), ...(path(slide.x, "clrMapOvr", "overrideClrMapping")?.attrs || {}) };
    const txStyles = kid(master?.x, "txStyles");
    const mt = master ? await themeOf([...master.rels.values()].find((r) => r.type === "theme")?.target || P.themeFile || "ppt/theme/theme1.xml") : base;
    ({ bgFills, lnStyles, fillStyles } = mt);
    const env = { slide, layout, master, clrMap: cmap, txStyles, scheme: mt.scheme, fonts: mt.fonts };
    const elements = [];

    // fundo
    const bgNode = slide.bg || layout?.bg || master?.bg;
    const bgPart = slide.bg ? slide : layout?.bg ? layout : master;
    const background = backgroundOf(bgNode, bgPart, env);

    // o que o mestre e o layout desenham (sem os placeholders), se o slide/layout não desligar
    const showMaster = slide.x?.attrs?.showMasterSp !== "0" && layout?.x?.attrs?.showMasterSp !== "0";
    const deco = [];
    if (showMaster && master) await walk(master.tree, master, env, deco, { deco: true });
    if (layout) await walk(layout.tree, layout, env, deco, { deco: true });
    elements.push(...deco);
    await walk(slide.tree, slide, env, elements, {});

    // título (para a lista de slides e para a IA) e anotações
    const titleEl = elements.find((e) => e.ph === "title" || e.ph === "ctrTitle");
    const title = titleEl ? plainOf(titleEl) : (elements.find((e) => e.textbox && !e.deco && plainOf(e).trim().length > 2 && !/^\d+$/.test(plainOf(e).trim())) ? plainOf(elements.find((e) => e.textbox && !e.deco && plainOf(e).trim().length > 2 && !/^\d+$/.test(plainOf(e).trim()))) : "");
    const notesFile = [...slide.rels.values()].find((r) => r.type === "notesSlide")?.target;
    let notes = "";
    if (notesFile) {
      const nx = await P.xml(notesFile);
      for (const sp of kids(path(nx, "cSld", "spTree"), "sp")) {
        const ph = placeholderOf(sp);
        if (ph && ph.type !== "body") continue;
        notes += kids(kid(sp, "txBody"), "p").map((p) => all(p, "t").map(textOf).join("")).join("\n");
      }
    }
    slides.push({ n: si + 1, file, hidden: slide.x?.attrs?.show === "0", layoutName: path(layout?.x, "cSld")?.attrs?.name || "", title: title.replace(/\s+/g, " ").trim().slice(0, 160), background, elements, notes: notes.trim(), decoCount: deco.length });
    if (!masterOut && master) masterOut = { file: master.file, background, deco: deco.map((d) => ({ ...d })) };
  }

  function backgroundOf(bg, part, env) {
    if (!bg) return { color: "FFFFFF" };
    const pr = kid(bg, "bgPr");
    if (pr) {
      const blip = path(pr, "blipFill", "blip");
      if (blip) { const t = part.rels.get(blip.attrs["r:embed"])?.target; if (t) return { image: mediaName(t) }; }
      const f = fillOf(pr, env, null);
      return f ? (f.gradient ? { gradient: f.gradient } : { color: f.hex, alpha: f.alpha }) : { color: "FFFFFF" };
    }
    const ref = kid(bg, "bgRef");
    if (ref) {
      const idx = num(ref.attrs.idx);
      const ph = colorOf(ref, env);
      const style = idx >= 1001 ? bgFills[idx - 1001] : fillStyles[idx - 1];
      if (style && style.name.endsWith("solidFill")) return { color: (colorOf(style, { ...env, ph }) || ph)?.hex || "FFFFFF" };
      if (ph) return { color: ph.hex };
    }
    return { color: "FFFFFF" };
  }

  // preenchimento de spPr (ou bgPr): { hex, alpha } | { gradient } | { none: true } | null (não definido)
  function fillOf(pr, env, phClr, part = null) {
    if (!pr) return null;
    const bf = kid(pr, "blipFill");
    if (bf && part) {
      const t = part.rels.get(kid(bf, "blip")?.attrs["r:embed"])?.target;
      if (t) { const tile = kid(bf, "tile"); return { hex: "FFFFFF", alpha: 1, image: mediaName(t), zip: t, tile: tile ? { sx: num(tile.attrs.sx, 100000) / 100000, sy: num(tile.attrs.sy, 100000) / 100000 } : null }; }
    }
    if (kid(pr, "noFill")) return { none: true };
    const sf = kid(pr, "solidFill");
    if (sf) return colorOf(sf, { ...env, ph: phClr });
    const gf = kid(pr, "gradFill");
    if (gf) {
      const stops = kids(kid(gf, "gsLst"), "gs").map((g) => ({ pos: num(g.attrs.pos) / 1000, c: colorOf(g, { ...env, ph: phClr }) })).filter((s) => s.c);
      if (!stops.length) return null;
      const ang = num(kid(gf, "lin")?.attrs.ang) / 60000;
      return { hex: stops[0].c.hex, alpha: stops[0].c.alpha, gradient: { angle: ang, stops: stops.map((s) => ({ pos: s.pos, color: css(s.c) })) } };
    }
    const pf = kid(pr, "pattFill");
    if (pf) {
      const fg = colorOf(kid(pf, "fgClr"), { ...env, ph: phClr }) || { hex: "000000", alpha: 1 }, bg = colorOf(kid(pf, "bgClr"), { ...env, ph: phClr }) || { hex: "FFFFFF", alpha: 1 };
      return { ...bg, pattern: { prst: pf.attrs.prst || "pct50", fg: css(fg), bg: css(bg) } };
    }
    return null;
  }

  // percorre a árvore de formas (grupos achatados): cada forma vira um elemento do canvas
  async function walk(tree, part, env, out, opts, tf = null) {
    for (const node of kids(tree)) {
      const n = node.name.split(":").pop();
      try {
        if (n === "grpSp") {
          const x = path(node, "grpSpPr", "xfrm");
          const off = kid(x, "off"), ext = kid(x, "ext"), chOff = kid(x, "chOff"), chExt = kid(x, "chExt");
          const g = { ox: num(off?.attrs.x), oy: num(off?.attrs.y), sx: num(ext?.attrs.cx) / (num(chExt?.attrs.cx) || 1) || 1, sy: num(ext?.attrs.cy) / (num(chExt?.attrs.cy) || 1) || 1, cx: num(chOff?.attrs.x), cy: num(chOff?.attrs.y) };
          const composed = (px, py) => { const X = g.ox + (px - g.cx) * g.sx, Y = g.oy + (py - g.cy) * g.sy; return tf ? tf.map(X, Y) : [X, Y]; };
          const scale = { x: g.sx * (tf?.scale.x || 1), y: g.sy * (tf?.scale.y || 1) };
          await walk(node, part, env, out, opts, { map: composed, scale });
        } else if (n === "sp" || n === "cxnSp") await shape(node, part, env, out, opts, tf);
        else if (n === "pic") await picture(node, part, env, out, opts, tf);
        else if (n === "graphicFrame") await frame(node, part, env, out, opts, tf);
        else if (n === "AlternateContent") {
          const choice = kid(node, "Choice"), fb = kid(node, "Fallback");
          const use = choice && all(choice, "oMath").length ? choice : fb || choice;
          if (use) await walk(use, part, env, out, opts, tf);
        }
      } catch (e) { warnings.push(`slide ${slides.length + 1}: ${n} ignorado (${e.message})`); }
    }
  }
  function boxOf(xfrm, tf) {
    const off = kid(xfrm, "off"), ext = kid(xfrm, "ext");
    if (!off || !ext) return null;
    let x = num(off.attrs.x), y = num(off.attrs.y), w = num(ext.attrs.cx), h = num(ext.attrs.cy);
    if (tf) { const [X, Y] = tf.map(x, y); x = X; y = Y; w *= tf.scale.x; h *= tf.scale.y; }
    return { x: r1(x * S), y: r1(y * S), w: r1(Math.max(0, w * S)), h: r1(Math.max(0, h * S)), rot: num(xfrm.attrs.rot) / 60000, flipH: xfrm.attrs.flipH === "1", flipV: xfrm.attrs.flipV === "1" };
  }
  // xfrm da forma, ou herdado do placeholder do layout/mestre
  function xfrmOf(node, part, env, prName = "spPr") {
    const own = path(node, prName, "xfrm");
    if (own && kid(own, "off")) return own;
    const ph = placeholderOf(node);
    if (!ph) return own;
    for (const info of part === env.slide ? [env.layout, env.master] : part === env.layout ? [env.master] : []) {
      const p = findPh(info, ph);
      const x = p && path(p, "spPr", "xfrm");
      if (x && kid(x, "off")) return x;
    }
    return own;
  }
  function phChain(node, part, env) {
    const ph = placeholderOf(node);
    if (!ph) return [];
    const chain = [];
    for (const info of part === env.slide ? [env.layout, env.master] : part === env.layout ? [env.master] : []) { const p = findPh(info, ph); if (p) chain.push(p); }
    return chain;
  }

  async function shape(node, part, env, out, opts, tf) {
    const ph = placeholderOf(node);
    if (opts.deco && ph) return; // placeholders do mestre/layout só valem pelo estilo
    const box = boxOf(xfrmOf(node, part, env), tf);
    if (!box) return;
    const spPr = kid(node, "spPr"), style = kid(node, "style");
    const chain = phChain(node, part, env);
    // cores da referência de estilo (p:style): o PowerPoint pinta formas "padrão" por aqui
    const fillRef = kid(style, "fillRef"), lnRef = kid(style, "lnRef"), fontRef = kid(style, "fontRef");
    let fill = fillOf(spPr, env, null, part);
    for (const c of chain) if (fill == null) fill = fillOf(kid(c, "spPr"), env, null);
    if (fill == null && fillRef && num(fillRef.attrs.idx) > 0) { const phc = colorOf(fillRef, env); const fs = fillStyles[num(fillRef.attrs.idx) - 1]; fill = (fs && fillOf({ children: [fs] }, env, phc)) || phc; }
    const lnNode = kid(spPr, "ln") || chain.map((c) => path(c, "spPr", "ln")).find(Boolean);
    let line = null;
    const lnRefColor = lnRef && num(lnRef.attrs.idx) > 0 ? colorOf(lnRef, env) : null;
    if (lnNode && kid(lnNode, "noFill")) line = null;
    else {
      const lc = lnNode && kid(lnNode, "solidFill") ? colorOf(kid(lnNode, "solidFill"), env) : lnRefColor;
      if (lc) {
        const refW = lnRef ? num(lnStyles[num(lnRef.attrs.idx) - 1]?.attrs.w, 9525) : 9525;
        line = { color: css(lc), width: Math.max(0.6, num(lnNode?.attrs.w, refW) * S), dash: kid(lnNode, "prstDash")?.attrs.val, head: kid(lnNode, "headEnd")?.attrs.type, tail: kid(lnNode, "tailEnd")?.attrs.type, headLen: kid(lnNode, "headEnd")?.attrs.len, tailLen: kid(lnNode, "tailEnd")?.attrs.len };
      }
    }
    const geom = kid(spPr, "prstGeom")?.attrs.prst || (kid(spPr, "custGeom") ? "cust" : chain.map((c) => path(c, "spPr", "prstGeom")?.attrs.prst).find(Boolean) || "rect");
    if (fill?.tile && fill.zip) { const dim = await imageDims(fill.zip); if (dim) { fill.tileW = r1(dim.w * 9525 * S * fill.tile.sx); fill.tileH = r1(dim.h * 9525 * S * fill.tile.sy); } }
    const drawn = fill && !fill.none || line;
    if (drawn && box.w + box.h > 0) {
      const svg = shapeSVG(geom, box, fill && !fill.none ? fill : null, line, kid(spPr, "custGeom"), kid(spPr, "prstGeom"));
      if (svg) out.push({ drawing: svg, x: box.x, y: box.y, w: Math.max(box.w, 1), h: Math.max(box.h, 1), ...(box.rot ? { rotate: r1(box.rot) } : {}), ...(opts.deco ? { deco: true } : {}), kind: "shape" });
    }
    // texto
    const tx = kid(node, "txBody");
    if (tx && all(tx, "t").some((t) => textOf(t).length) || tx && all(tx, "oMath").length) {
      const fontColor = fontRef ? colorOf(fontRef, env) : null;
      const tb = textBody(tx, node, part, env, chain, ph, fontColor);
      if (tb.paragraphs.length) out.push({ textbox: tb, x: box.x, y: box.y, w: box.w, h: box.h, ...(box.rot ? { rotate: r1(box.rot) } : {}), ...(ph ? { ph: ph.type } : {}), ...(opts.deco ? { deco: true } : {}) });
    }
  }

  async function picture(node, part, env, out, opts, tf) {
    if (opts.deco && placeholderOf(node)) return;
    const box = boxOf(xfrmOf(node, part, env), tf);
    const blip = path(node, "blipFill", "blip");
    if (!box || !blip) return;
    const t = part.rels.get(blip.attrs["r:embed"])?.target;
    if (!t) return;
    const src = kid(kid(node, "blipFill"), "srcRect");
    const crop = src ? { l: num(src.attrs.l) / 100000, t: num(src.attrs.t) / 100000, r: num(src.attrs.r) / 100000, b: num(src.attrs.b) / 100000 } : null;
    const alt = kid(path(node, "nvPicPr"), "cNvPr")?.attrs.descr || "";
    const ln = path(node, "spPr", "ln");
    const lc = ln && !kid(ln, "noFill") && kid(ln, "solidFill") ? colorOf(kid(ln, "solidFill"), env) : null;
    const outline = lc ? `outline:${Math.max(0.6, num(ln.attrs.w, 9525) * S).toFixed(1)}px solid ${css(lc)};outline-offset:-${(Math.max(0.6, num(ln.attrs.w, 9525) * S) / 2).toFixed(1)}px;` : "";
    out.push({ image: mediaName(t), x: box.x, y: box.y, w: box.w, h: box.h, fit: "fill", ...(crop && (crop.l || crop.t || crop.r || crop.b) ? { crop: { l: r3(crop.l), t: r3(crop.t), r: r3(crop.r), b: r3(crop.b) } } : {}), ...(box.rot ? { rotate: r1(box.rot) } : {}), ...(box.flipH ? { flipH: true } : {}), ...(alt ? { alt } : {}), ...(outline ? { style: outline } : {}), ...(opts.deco ? { deco: true } : {}) });
  }
  function r3(v) { return Math.round(v * 1000) / 1000; }

  async function frame(node, part, env, out, opts, tf) {
    const box = boxOf(kid(node, "xfrm"), tf);
    const gd = path(node, "graphic", "graphicData");
    if (!box || !gd) return;
    const uri = gd.attrs.uri || "";
    if (uri.endsWith("/table")) out.push({ ...tableEl(kid(gd, "tbl"), box, env), x: box.x, y: box.y, w: box.w, h: box.h });
    else if (uri.endsWith("/chart")) {
      const rid = all(gd, "chart")[0]?.attrs["r:id"];
      const t = part.rels.get(rid)?.target;
      const ch = t ? await chartEl(t) : null;
      if (ch) out.push({ ...ch, x: box.x, y: box.y, w: box.w, h: box.h });
    } else {
      // objeto OLE (equação do Equation Editor, planilha…): a imagem de prévia que o PowerPoint guarda
      const pic = all(gd, "pic")[0];
      if (pic) { await picture(pic, part, env, out, opts, tf); const last = out[out.length - 1]; if (last?.image) Object.assign(last, { x: box.x, y: box.y, w: box.w, h: box.h, ole: true }); }
      else {
        const ole = all(gd, "oleObj")[0];
        const t = ole && part.rels.get(ole.attrs["r:id"])?.target;
        const img = ole && [...part.rels.values()].find((r) => r.type === "image" && r.target && t);
        if (img) out.push({ image: mediaName(img.target), x: box.x, y: box.y, w: box.w, h: box.h, fit: "fill", ole: true });
        // SmartArt e o que mais não sei desenhar: recortado da foto do original, se houver (src/import/index.js)
        else out.push({ fromSnapshot: uri.split("/").pop() || "objeto", x: box.x, y: box.y, w: box.w, h: box.h });
      }
    }
  }

  // ---------------------------------------------------------------------------------------------- texto
  function lvlProps(list, lvl) { return list ? kid(list, `lvl${lvl + 1}pPr`) : null; }
  function textBody(tx, node, part, env, chain, ph, fontColor) {
    const bodyPr = kid(tx, "bodyPr");
    const bodyChain = [bodyPr, ...chain.map((c) => path(c, "txBody", "bodyPr"))].filter(Boolean);
    const bp = (k, d) => { for (const b of bodyChain) if (b.attrs[k] != null) return b.attrs[k]; return d; };
    const autofit = bodyChain.map((b) => kid(b, "normAutofit")).find(Boolean);
    const fontScale = autofit ? num(autofit.attrs.fontScale, 100000) / 100000 : 1;
    const lnReduce = autofit ? num(autofit.attrs.lnSpcReduction, 0) / 100000 : 0;
    // listas de estilo em ordem de prioridade (primeiro que definir ganha)
    const kind = !ph ? "other" : ["title", "ctrTitle"].includes(ph.type) ? "title" : ["body", "subTitle", "obj"].includes(ph.type) ? "body" : "other";
    // caixa de texto comum (sem placeholder) segue o padrão da apresentação; o otherStyle do mestre é dos
    // placeholders que não são título nem corpo (data, rodapé, número)
    const lists = [kid(tx, "lstStyle"), ...chain.map((c) => path(c, "txBody", "lstStyle")), kind === "title" ? kid(env.txStyles, "titleStyle") : kind === "body" ? kid(env.txStyles, "bodyStyle") : ph ? kid(env.txStyles, "otherStyle") : null, defaultText].filter(Boolean);
    const pick = (lvl, get) => { for (const l of lists) { const p = lvlProps(l, lvl); const v = p && get(p); if (v != null) return v; } return null; };
    const paragraphs = [];
    let autoNum = new Map();
    for (const p of kids(tx, "p")) {
      const pPr = kid(p, "pPr");
      const lvl = num(pPr?.attrs.lvl, 0);
      const get = (fn) => { const v = pPr && fn(pPr); return v != null ? v : pick(lvl, fn); };
      const defR = (k) => get((pp) => kid(pp, "defRPr")?.attrs[k]);
      const size = num(defR("sz"), 1800) / 100;
      const para = { runs: [] };
      const algn = get((pp) => pp.attrs.algn);
      if (algn && algn !== "l") para.align = { ctr: "center", r: "right", just: "justify", dist: "justify" }[algn] || "left";
      const marL = num(get((pp) => pp.attrs.marL), 0) * S, indent = num(get((pp) => pp.attrs.indent), 0) * S;
      if (marL) para.marL = r1(marL);
      if (indent) para.indent = r1(indent);
      const spc = (tag) => { const n = get((pp) => kid(pp, tag)); if (!n) return null; const pts = kid(n, "spcPts"), pct = kid(n, "spcPct"); return pts ? { pt: num(pts.attrs.val) / 100 } : pct ? { pct: num(pct.attrs.val) / 100000 } : null; };
      const lnSpc = spc("lnSpc"), spcBef = spc("spcBef"), spcAft = spc("spcAft");
      if (lnSpc) para.lineHeight = lnSpc.pct != null ? +Math.max(0.6, lnSpc.pct - lnReduce).toFixed(3) : r1(lnSpc.pt * PT * fontScale);
      else if (lnReduce) para.lineHeight = +(1 - lnReduce).toFixed(3);
      const bef = spcBef ? (spcBef.pt != null ? spcBef.pt * PT : spcBef.pct * size * PT) : 0, aft = spcAft ? (spcAft.pt != null ? spcAft.pt * PT : spcAft.pct * size * PT) : 0;
      if (bef) para.spaceBefore = r1(bef * fontScale);
      if (aft) para.spaceAfter = r1(aft * fontScale);
      // marcador
      const buNone = get((pp) => (kid(pp, "buNone") ? true : kid(pp, "buChar") || kid(pp, "buAutoNum") ? false : null));
      if (!buNone) {
        const ch = get((pp) => kid(pp, "buChar")?.attrs.char), an = get((pp) => kid(pp, "buAutoNum")?.attrs.type);
        const buFont = get((pp) => kid(pp, "buFont")?.attrs.typeface);
        const buClr = get((pp) => kid(pp, "buClr") ? colorOf(kid(pp, "buClr"), env) : null);
        const buSz = get((pp) => kid(pp, "buSzPct")?.attrs.val);
        if (an) { const k = `${lvl}`; const nNow = (autoNum.get(k) || num(get((pp) => kid(pp, "buAutoNum")?.attrs.startAt), 1) - 1) + 1; autoNum.set(k, nNow); para.bullet = { num: autoLabel(an, nNow) }; }
        else if (ch) para.bullet = { char: ch, font: buFont || null };
        if (para.bullet) { if (buClr) para.bullet.color = css(buClr); if (buSz) para.bullet.scale = +(num(buSz) / 100000).toFixed(2); }
      } else autoNum = new Map();
      // trechos
      const defRPrNode = (() => { const own = kid(pPr, "defRPr"); return own; })();
      const runDefaults = (rPr) => {
        const pickR = (k) => { if (rPr?.attrs[k] != null) return rPr.attrs[k]; if (defRPrNode?.attrs[k] != null) return defRPrNode.attrs[k]; return defR(k); };
        const fillNode = (rPr && kid(rPr, "solidFill")) || (defRPrNode && kid(defRPrNode, "solidFill")) || get((pp) => (kid(pp, "defRPr") && kid(kid(pp, "defRPr"), "solidFill")) || null);
        const latin = (rPr && kid(rPr, "latin")?.attrs.typeface) || (defRPrNode && kid(defRPrNode, "latin")?.attrs.typeface) || get((pp) => kid(kid(pp, "defRPr"), "latin")?.attrs.typeface) || (kind === "title" ? "+mj-lt" : "+mn-lt");
        return { sz: num(pickR("sz"), 1800) / 100, b: pickR("b"), i: pickR("i"), u: pickR("u"), strike: pickR("strike"), baseline: pickR("baseline"), cap: pickR("cap"), color: fillNode ? colorOf(fillNode, env) : fontColor || colorOf({ name: "schemeClr", attrs: { val: "tx1" }, children: [] }, env), font: latin.startsWith("+mj") ? (env.fonts || fonts).major : latin.startsWith("+mn") ? (env.fonts || fonts).minor : latin };
      };
      for (const r of kids(p)) {
        const rn = r.name.split(":").pop();
        if (rn === "r" || rn === "fld") {
          const t = textOf(kid(r, "t"));
          if (!t) continue;
          const d = runDefaults(kid(r, "rPr"));
          const run = { t: d.cap === "all" ? t.toUpperCase() : t, size: r1(d.sz * PT * fontScale) };
          if (d.b === "1" || d.b === "true") run.b = true;
          if (d.i === "1" || d.i === "true") run.i = true;
          if (d.u && d.u !== "none") run.u = true;
          if (d.strike && d.strike !== "noStrike") run.s = true;
          if (d.baseline && num(d.baseline) !== 0) run[num(d.baseline) > 0 ? "sup" : "sub"] = true;
          if (d.color) run.color = css(d.color);
          if (d.font) run.font = d.font;
          // fonte de s\u00EDmbolo: vale s\u00F3 para os caracteres da faixa de s\u00EDmbolos (F0xx); se a pr\u00F3pria fonte do trecho \u00E9 de
          // s\u00EDmbolo, vale para todos
          const symFont = /^(wingdings|symbol|webdings)/i.test(d.font || "") ? d.font : null;
          const sym = symFont || kid(kid(r, "rPr"), "sym")?.attrs.typeface;
          if (sym && (symFont || /[\uF000-\uF0FF]/.test(run.t))) { run.sym = sym; if (!symFont) run.symPua = true; }
          if (rn === "fld" && /slidenum/i.test(r.attrs.type || "")) run.field = "slidenum";
          const link = kid(kid(r, "rPr"), "hlinkClick");
          if (link) { const rel = part?.rels.get(link.attrs["r:id"]); if (rel?.external) run.link = rel.target; }
          para.runs.push(run);
        } else if (rn === "br") para.runs.push({ br: true });
        else if (rn === "AlternateContent" || rn === "m" || rn === "oMathPara" || rn === "oMath") {
          const maths = all(r, "oMath");
          for (const m of maths) para.runs.push({ latex: ommlToLatex(m), size: r1(runDefaults(null).sz * PT * fontScale) });
        }
      }
      if (!para.runs.length) { para.empty = true; para.size = r1(num(defR("sz"), 1800) / 100 * PT * fontScale); delete para.bullet; }
      paragraphs.push(para);
    }
    while (paragraphs.length && paragraphs.at(-1).empty) paragraphs.pop();
    const ins = (k, d) => r1(num(bp(k, d)) * S);
    const tb = { paragraphs, pad: [ins("lIns", 91440), ins("tIns", 45720), ins("rIns", 91440), ins("bIns", 45720)] };
    const anchor = bp("anchor", "t");
    if (anchor !== "t") tb.anchor = anchor === "ctr" ? "middle" : anchor === "b" ? "bottom" : "top";
    if (bp("wrap", "square") === "none") tb.nowrap = true;
    const vert = bp("vert", "horz");
    if (vert && vert !== "horz") tb.vertical = vert === "vert270" ? "up" : "down";
    if (num(bp("numCol", 1)) > 1) tb.columns = num(bp("numCol", 1));
    return tb;
  }
  function autoLabel(type, n) {
    const alpha = (k) => { let s = ""; while (k > 0) { s = String.fromCharCode(97 + ((k - 1) % 26)) + s; k = Math.floor((k - 1) / 26); } return s; };
    const roman = (k) => [[1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]].reduce((s, [v, r]) => { while (k >= v) { s += r; k -= v; } return s; }, "");
    const base = /alphaLc/.test(type) ? alpha(n) : /alphaUc/.test(type) ? alpha(n).toUpperCase() : /romanLc/.test(type) ? roman(n) : /romanUc/.test(type) ? roman(n).toUpperCase() : String(n);
    return /ParenBoth/.test(type) ? `(${base})` : /ParenR/.test(type) ? `${base})` : /Period/.test(type) ? `${base}.` : base;
  }

  // ---------------------------------------------------------------------------------------------- tabela
  function tableEl(tbl, box, env) {
    const grid = kids(kid(tbl, "tblGrid"), "gridCol").map((g) => num(g.attrs.w) * S);
    const pr = kid(tbl, "tblPr"), styleId = textOf(kid(pr, "tableStyleId"));
    const ts = tableStyles.get(styleId) || builtinTableStyle(styleId);
    const flags = { firstRow: pr?.attrs.firstRow === "1", bandRow: pr?.attrs.bandRow === "1", firstCol: pr?.attrs.firstCol === "1", lastRow: pr?.attrs.lastRow === "1" };
    const part = (name) => kid(ts, name);
    const partFill = (name) => { const p = part(name); const f = path(p, "tcStyle", "fill"); return f ? fillOf(f, env, null) : null; };
    const partText = (name) => { const p = part(name); const t = kid(p, "tcTxStyle"); return t ? { b: t.attrs.b === "on", color: colorOf(t, env) } : null; };
    const rows = kids(tbl, "tr");
    const data = [];
    const cells = rows.map((tr, ri) => {
      const rowCells = kids(tr, "tc");
      data.push(rowCells.map((tc) => kids(kid(tc, "txBody"), "p").map((p) => all(p, "t").map(textOf).join("")).join("\n")));
      return rowCells.map((tc, ci) => {
        if (tc.attrs.hMerge === "1" || tc.attrs.vMerge === "1") return null;
        const tcPr = kid(tc, "tcPr");
        const isHead = flags.firstRow && ri === 0, isLast = flags.lastRow && ri === rows.length - 1;
        const band = flags.bandRow && !isHead ? ((ri - (flags.firstRow ? 1 : 0)) % 2 === 0 ? "band1H" : "band2H") : null;
        let fill = fillOf(tcPr, env, null);
        if (fill == null) fill = (isHead && partFill("firstRow")) || (isLast && partFill("lastRow")) || (band && partFill(band)) || partFill("wholeTbl");
        const txt = (isHead && partText("firstRow")) || partText("wholeTbl");
        const tb = textBody(kid(tc, "txBody"), tc, null, env, [], null, txt?.color || null);
        if (txt?.b && isHead) tb.paragraphs.forEach((p) => p.runs.forEach((r) => (r.b = true)));
        const mar = (k, d) => r1(num(tcPr?.attrs[k], d) * S);
        const borders = {};
        for (const [k, side] of [["lnL", "left"], ["lnR", "right"], ["lnT", "top"], ["lnB", "bottom"]]) { const ln = kid(tcPr, k); if (ln && !kid(ln, "noFill")) { const c = colorOf(kid(ln, "solidFill"), env); if (c) borders[side] = `${Math.max(0.6, num(ln.attrs.w, 12700) * S).toFixed(1)}px solid ${css(c)}`; } }
        return { tb, fill: fill && !fill.none ? css(fill) : null, span: num(tc.attrs.gridSpan, 1), rowSpan: num(tc.attrs.rowSpan, 1), pad: [mar("marL", 91440), mar("marT", 45720), mar("marR", 91440), mar("marB", 45720)], anchor: tcPr?.attrs.anchor, borders };
      });
    });
    const heights = rows.map((tr) => r1(num(tr.attrs.h) * S));
    return { table: { cols: grid.map(r1), heights, cells, border: ts ? "1px solid rgba(255,255,255,.9)" : "1px solid #999" }, tableData: data };
  }

  // estilos de tabela prontos do PowerPoint mais usados, no mesmo formato do tableStyles.xml
  function builtinTableStyle(id) {
    const X = (xml) => parseXML(`<a:tblStyle xmlns:a="a">${xml}</a:tblStyle>`);
    const solid = (clr, mods = "") => `<a:fill><a:solidFill><a:schemeClr val="${clr}">${mods}</a:schemeClr></a:solidFill></a:fill>`;
    const tx = (clr, b) => `<a:tcTxStyle${b ? ' b="on"' : ""}><a:schemeClr val="${clr}"/></a:tcTxStyle>`;
    const light1 = (acc) => X(`<a:wholeTbl>${tx("tx1")}<a:tcStyle>${solid("bg1", '<a:alpha val="0"/>')}</a:tcStyle></a:wholeTbl><a:band1H><a:tcStyle>${solid(acc, '<a:alpha val="20000"/>')}</a:tcStyle></a:band1H><a:firstRow>${tx("tx1", true)}<a:tcStyle>${solid("bg1", '<a:alpha val="0"/>')}</a:tcStyle></a:firstRow>`);
    const medium2 = (acc) => X(`<a:wholeTbl>${tx("dk1")}<a:tcStyle>${solid(acc, '<a:tint val="20000"/>')}</a:tcStyle></a:wholeTbl><a:band1H><a:tcStyle>${solid(acc, '<a:tint val="40000"/>')}</a:tcStyle></a:band1H><a:firstRow>${tx("lt1", true)}<a:tcStyle>${solid(acc)}</a:tcStyle></a:firstRow>`);
    const map = {
      "{9D7B26C5-4107-4FEC-AEDC-1716B250A1EF}": () => light1("tx1"), "{3B4B98B0-60AC-42C2-AFA5-B58CD77FA1E5}": () => light1("accent1"),
      "{073A0DAA-6AF3-43AB-8588-CEC1D06C72B9}": () => medium2("dk1"), "{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}": () => medium2("accent1"),
      "{21E4AEA4-8DFA-4A89-87EB-49C32662AFE8}": () => medium2("accent2"), "{F5AB1C69-6EDB-4FF4-983F-18BD219EF322}": () => medium2("accent3"),
    };
    return map[id]?.() || null;
  }

  // ---------------------------------------------------------------------------------------------- gráfico
  async function chartEl(file) {
    const x = await P.xml(file);
    if (!x) return null;
    const plot = path(x, "chart", "plotArea");
    const kindNode = kids(plot).find((k) => /Chart$/.test(k.name));
    if (!kindNode) return null;
    const type = kindNode.name.split(":").pop().replace("Chart", "").replace(/3D$/, "");
    const dir = kid(kindNode, "barDir")?.attrs.val;
    const chart = { bar: dir === "bar" ? "hbar" : "bar", line: "line", pie: "pie", doughnut: "donut", area: "area", scatter: "scatter" }[type] || "bar";
    const series = kids(kindNode, "ser").map((s) => ({ name: all(kid(s, "tx"), "v").map(textOf)[0] || "", values: all(kid(s, "val") || kid(s, "yVal"), "v").map((v) => num(textOf(v))) }));
    const labels = (() => { const c = kid(kids(kindNode, "ser")[0], "cat") || kid(kids(kindNode, "ser")[0], "xVal"); return c ? all(c, "v").map(textOf) : []; })();
    const title = all(kid(path(x, "chart"), "title"), "t").map(textOf).join("");
    return { chart: { chart, labels, series, ...(title ? { title } : {}) }, kind: "chart" };
  }

  return { W, H, cx: P.cx, cy: P.cy, fonts, scheme, slides, media: [...media.values()], master: masterOut, warnings };
}

// ------------------------------------------------------------------------------------------------ formas em SVG
const DASH = { dash: "4 3", sysDash: "3 1", dot: "1 2", sysDot: "1 1", lgDash: "8 3", dashDot: "4 3 1 3", lgDashDot: "8 3 1 3", sysDashDot: "3 1 1 1" };
function shapeSVG(geom, box, fill, line, custGeom, prstGeom) {
  const w = Math.max(box.w, 1), h = Math.max(box.h, 1);
  const sw = line ? Math.max(0.6, line.width) : 0;
  const adj = (name, d) => { const gd = kids(kid(prstGeom, "avLst"), "gd").find((g) => g.attrs.name === name); const m = gd?.attrs.fmla?.match(/val\s+(-?\d+)/); return m ? +m[1] : d; };
  let d = "";
  const isLine = ["leftBrace", "rightBrace", "leftBracket", "rightBracket", "line", "straightConnector1", "bentConnector2", "bentConnector3", "curvedConnector3", "curvedConnector2", "bentConnector4"].includes(geom);
  const [x0, y0, x1, y1] = [box.flipH ? w : 0, box.flipV ? h : 0, box.flipH ? 0 : w, box.flipV ? 0 : h];
  const P = (pts) => "M" + pts.map((p) => p.map((v) => r1(v)).join(" ")).join("L") + "Z";
  const ss = Math.min(w, h);
  switch (geom) {
    case "rect": case "flowChartProcess": case "flowChartAlternateProcess": case "snip1Rect": case "wedgeRectCallout": case "textBox": d = `M0 0H${w}V${h}H0Z`; break;
    case "roundRect": case "round2SameRect": { const r = ss * adj("adj", 16667) / 100000; d = `M${r} 0H${w - r}A${r} ${r} 0 0 1 ${w} ${r}V${h - r}A${r} ${r} 0 0 1 ${w - r} ${h}H${r}A${r} ${r} 0 0 1 0 ${h - r}V${r}A${r} ${r} 0 0 1 ${r} 0Z`; break; }
    case "flowChartTerminator": { const r = h / 2; d = `M${r} 0H${w - r}A${r} ${r} 0 0 1 ${w - r} ${h}H${r}A${r} ${r} 0 0 1 ${r} 0Z`; break; }
    case "ellipse": case "flowChartConnector": case "donut": case "cloud": case "cloudCallout": case "wedgeEllipseCallout": d = `M0 ${h / 2}A${w / 2} ${h / 2} 0 1 0 ${w} ${h / 2}A${w / 2} ${h / 2} 0 1 0 0 ${h / 2}Z`; break;
    case "triangle": d = P([[w * adj("adj", 50000) / 100000, 0], [w, h], [0, h]]); break;
    case "rtTriangle": d = P([[0, 0], [w, h], [0, h]]); break;
    case "diamond": case "flowChartDecision": d = P([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]); break;
    case "parallelogram": case "flowChartInputOutput": { const a = ss * adj("adj", 25000) / 100000; d = P([[a, 0], [w, 0], [w - a, h], [0, h]]); break; }
    case "trapezoid": { const a = ss * adj("adj", 25000) / 100000; d = P([[a, 0], [w - a, 0], [w, h], [0, h]]); break; }
    case "pentagon": case "homePlate": { const a = ss * adj("adj", 50000) / 100000; d = P([[0, 0], [w - a, 0], [w, h / 2], [w - a, h], [0, h]]); break; }
    case "chevron": { const a = ss * adj("adj", 50000) / 100000; d = P([[0, 0], [w - a, 0], [w, h / 2], [w - a, h], [0, h], [a, h / 2]]); break; }
    case "hexagon": { const a = ss * adj("adj", 25000) / 100000; d = P([[a, 0], [w - a, 0], [w, h / 2], [w - a, h], [a, h], [0, h / 2]]); break; }
    case "octagon": { const a = ss * adj("adj", 29289) / 100000; d = P([[a, 0], [w - a, 0], [w, a], [w, h - a], [w - a, h], [a, h], [0, h - a], [0, a]]); break; }
    case "plus": { const a = ss * adj("adj", 25000) / 100000; d = P([[a, 0], [w - a, 0], [w - a, a], [w, a], [w, h - a], [w - a, h - a], [w - a, h], [a, h], [a, h - a], [0, h - a], [0, a], [a, a]]); break; }
    case "rightArrow": { const t = h * adj("adj1", 50000) / 100000, hl = ss * adj("adj2", 50000) / 100000; d = P([[0, (h - t) / 2], [w - hl, (h - t) / 2], [w - hl, 0], [w, h / 2], [w - hl, h], [w - hl, (h + t) / 2], [0, (h + t) / 2]]); break; }
    case "leftArrow": { const t = h * adj("adj1", 50000) / 100000, hl = ss * adj("adj2", 50000) / 100000; d = P([[w, (h - t) / 2], [hl, (h - t) / 2], [hl, 0], [0, h / 2], [hl, h], [hl, (h + t) / 2], [w, (h + t) / 2]]); break; }
    case "upArrow": { const t = w * adj("adj1", 50000) / 100000, hl = ss * adj("adj2", 50000) / 100000; d = P([[(w - t) / 2, h], [(w - t) / 2, hl], [0, hl], [w / 2, 0], [w, hl], [(w + t) / 2, hl], [(w + t) / 2, h]]); break; }
    case "downArrow": { const t = w * adj("adj1", 50000) / 100000, hl = ss * adj("adj2", 50000) / 100000; d = P([[(w - t) / 2, 0], [(w - t) / 2, h - hl], [0, h - hl], [w / 2, h], [w, h - hl], [(w + t) / 2, h - hl], [(w + t) / 2, 0]]); break; }
    case "leftRightArrow": { const t = h * adj("adj1", 50000) / 100000, hl = ss * adj("adj2", 50000) / 100000; d = P([[0, h / 2], [hl, 0], [hl, (h - t) / 2], [w - hl, (h - t) / 2], [w - hl, 0], [w, h / 2], [w - hl, h], [w - hl, (h + t) / 2], [hl, (h + t) / 2], [hl, h]]); break; }
    case "star5": { const pts = []; for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? 0.38 : 0.5; pts.push([w / 2 + Math.cos(a) * w * rr, h / 2 + Math.sin(a) * h * rr]); } d = P(pts); break; }
    case "can": case "flowChartMagneticDisk": { const ry = Math.min(h * 0.12, w * 0.25); d = `M0 ${ry}A${w / 2} ${ry} 0 0 1 ${w} ${ry}V${h - ry}A${w / 2} ${ry} 0 0 1 0 ${h - ry}Z M0 ${ry}A${w / 2} ${ry} 0 0 0 ${w} ${ry}`; break; }
    case "line": case "straightConnector1": d = `M${x0} ${y0}L${x1} ${y1}`; break;
    case "bentConnector2": d = `M${x0} ${y0}H${x1}V${y1}`; break;
    case "bentConnector3": case "bentConnector4": { const mx = x0 + (x1 - x0) * (adj("adj1", 50000) / 100000); d = `M${x0} ${y0}H${mx}V${y1}H${x1}`; break; }
    case "curvedConnector2": case "curvedConnector3": d = `M${x0} ${y0}C${(x0 + x1) / 2} ${y0} ${(x0 + x1) / 2} ${y1} ${x1} ${y1}`; break;
    case "arc": { const a1 = (adj("adj1", 16200000) / 60000) * Math.PI / 180, a2 = (adj("adj2", 0) / 60000) * Math.PI / 180; const pt = (a) => [w / 2 + (w / 2) * Math.cos(a), h / 2 + (h / 2) * Math.sin(a)]; const [sx, sy] = pt(a1), [ex, ey] = pt(a2); let sweep = a2 - a1; if (sweep < 0) sweep += 2 * Math.PI; d = `M${r1(sx)} ${r1(sy)}A${w / 2} ${h / 2} 0 ${sweep > Math.PI ? 1 : 0} 1 ${r1(ex)} ${r1(ey)}`; fill = null; break; }
    case "borderCallout1": case "callout1": case "accentCallout1": case "accentBorderCallout1": case "borderCallout2": case "callout2": {
      // balão com a linha que aponta (adj em 1/100000 da altura e da largura; pode sair da caixa)
      const ay1 = h * adj("adj1", 18750) / 100000, ax1 = w * adj("adj2", -8333) / 100000, ay2 = h * adj("adj3", 112500) / 100000, ax2 = w * adj("adj4", -38333) / 100000;
      const two = /2$/.test(geom), ay3 = h * adj("adj5", 112500) / 100000, ax3 = w * adj("adj6", -46667) / 100000;
      d = `M0 0H${w}V${h}H0Z M${r1(ax1)} ${r1(ay1)}L${r1(ax2)} ${r1(ay2)}${two ? `L${r1(ax3)} ${r1(ay3)}` : ""}`;
      break;
    }
    case "leftBrace": { const r = Math.min(w, h / 4); d = `M${w} 0Q${w / 2} 0 ${w / 2} ${r}V${h / 2 - r}Q${w / 2} ${h / 2} 0 ${h / 2}Q${w / 2} ${h / 2} ${w / 2} ${h / 2 + r}V${h - r}Q${w / 2} ${h} ${w} ${h}`; fill = null; break; }
    case "rightBrace": { const r = Math.min(w, h / 4); d = `M0 0Q${w / 2} 0 ${w / 2} ${r}V${h / 2 - r}Q${w / 2} ${h / 2} ${w} ${h / 2}Q${w / 2} ${h / 2} ${w / 2} ${h / 2 + r}V${h - r}Q${w / 2} ${h} 0 ${h}`; fill = null; break; }
    case "leftBracket": d = `M${w} 0H0V${h}H${w}`; fill = null; break;
    case "rightBracket": d = `M0 0H${w}V${h}H0`; fill = null; break;
    case "cust": d = custPath(custGeom, w, h); break;
    default: d = `M0 0H${w}V${h}H0Z`;
  }
  if (!d) return null;
  const open = isLine || geom === "arc" || (geom === "cust" && !/Z\s*$/i.test(d) && !fill);
  let defs = "", fillAttr = "none";
  if (fill && !open) {
    if (fill.image) {
      // textura: a imagem repetida (tile) ou esticada na forma; o endereço "media:" vira a imagem na hora de montar
      const id = `t${Math.random().toString(36).slice(2, 9)}`;
      const tw = fill.tileW || w, th = fill.tileH || h;
      defs = `<defs><pattern id="${id}" patternUnits="userSpaceOnUse" width="${tw}" height="${th}"><image href="media:${fill.image}" width="${tw}" height="${th}" preserveAspectRatio="none"/></pattern></defs>`;
      fillAttr = `url(#${id})`;
    } else if (fill.pattern) {
      const id = `p${Math.random().toString(36).slice(2, 9)}`, k = fill.pattern.prst, fg = fill.pattern.fg;
      const lines = /Cross|Grid|cross/.test(k) ? (/[dD]iag/.test(k) ? "M0 0L8 8M8 0L0 8" : "M4 0V8M0 4H8") : /dnDiag|DnDiag/.test(k) ? "M0 0L8 8M-2 6L2 10M6 -2L10 2" : /upDiag|UpDiag/.test(k) ? "M0 8L8 0M-2 2L2 -2M6 10L10 6" : /horz|Horz/.test(k) ? "M0 4H8" : /vert|Vert/.test(k) ? "M4 0V8" : "";
      const dots = !lines ? `<circle cx="2" cy="2" r="${/pct(5|10|20)$/.test(k) ? 0.7 : 1.3}" fill="${fg}"/><circle cx="6" cy="6" r="${/pct(5|10|20)$/.test(k) ? 0.7 : 1.3}" fill="${fg}"/>` : "";
      defs = `<defs><pattern id="${id}" patternUnits="userSpaceOnUse" width="8" height="8"><rect width="8" height="8" fill="${fill.pattern.bg}"/>${lines ? `<path d="${lines}" stroke="${fg}" stroke-width="${/^(dk|wd)/.test(k) ? 1.6 : 0.9}"/>` : dots}</pattern></defs>`;
      fillAttr = `url(#${id})`;
    } else if (fill.gradient) {
      const id = `g${Math.random().toString(36).slice(2, 9)}`;
      const a = (fill.gradient.angle * Math.PI) / 180;
      defs = `<defs><linearGradient id="${id}" x1="${r1(50 - 50 * Math.cos(a))}%" y1="${r1(50 - 50 * Math.sin(a))}%" x2="${r1(50 + 50 * Math.cos(a))}%" y2="${r1(50 + 50 * Math.sin(a))}%">${fill.gradient.stops.map((s) => `<stop offset="${r1(s.pos)}%" stop-color="${s.color}"/>`).join("")}</linearGradient></defs>`;
      fillAttr = `url(#${id})`;
    } else fillAttr = fill.alpha < 1 ? `rgba(${hexToRgb(fill.hex).join(",")},${+fill.alpha.toFixed(3)})` : `#${fill.hex}`;
  }
  const markers = [];
  let mdefs = "";
  if (line && (line.head || line.tail)) {
    for (const [end, type, len] of [["start", line.head, line.headLen], ["end", line.tail, line.tailLen]]) {
      if (!type || type === "none") continue;
      const id = `m${Math.random().toString(36).slice(2, 9)}`;
      const shape = type === "oval" ? `<circle cx="5" cy="5" r="4" fill="${line.color}"/>` : type === "diamond" ? `<path d="M0 5L5 0L10 5L5 10Z" fill="${line.color}"/>` : type === "arrow" ? `<path d="M0 0L10 5L0 10" fill="none" stroke="${line.color}" stroke-width="1.6"/>` : `<path d="M0 0L10 5L0 10Z" fill="${line.color}"/>`;
      mdefs += `<marker id="${id}" viewBox="0 0 10 10" refX="${type === "oval" ? 5 : 9}" refY="5" markerWidth="${{ sm: 3, med: 4.5, lg: 6 }[len] || 4.5}" markerHeight="${{ sm: 3, med: 4.5, lg: 6 }[len] || 4.5}" orient="auto-start-reverse" markerUnits="strokeWidth">${shape}</marker>`;
      markers.push(` marker-${end}="url(#${id})"`);
    }
  }
  const stroke = line ? ` stroke="${line.color}" stroke-width="${r1(sw)}"${line.dash && DASH[line.dash] ? ` stroke-dasharray="${DASH[line.dash].split(" ").map((v) => r1(+v * sw)).join(" ")}"` : ""} stroke-linejoin="round" stroke-linecap="${isLine ? "round" : "butt"}"` : "";
  const pad = Math.ceil(sw * 3 + 2);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${r1(w + 2 * pad)} ${r1(h + 2 * pad)}" style="position:absolute;left:${-pad}px;top:${-pad}px;width:${r1(w + 2 * pad)}px;height:${r1(h + 2 * pad)}px;overflow:visible"${box.flipH && !isLine ? ' transform="scale(-1,1)"' : ""}>${defs}${mdefs ? `<defs>${mdefs}</defs>` : ""}<path d="${d}" fill="${open ? "none" : fillAttr}"${stroke}${markers.join("")}/></svg>`;
}

// desenho livre (custGeom): moveTo/lnTo/cubicBezTo/quadBezTo/arcTo/close em coordenadas do path, escaladas à caixa
function custPath(cg, w, h) {
  if (!cg) return "";
  let out = "";
  for (const p of kids(kid(cg, "pathLst"), "path")) {
    const pw = num(p.attrs.w) || w, ph = num(p.attrs.h) || h;
    const sx = w / pw, sy = h / ph;
    let cur = [0, 0];
    const pt = (n) => [num(n.attrs.x) * sx, num(n.attrs.y) * sy];
    for (const c of kids(p)) {
      const n = c.name.split(":").pop();
      if (n === "moveTo") { cur = pt(kid(c, "pt")); out += `M${r1(cur[0])} ${r1(cur[1])}`; }
      else if (n === "lnTo") { cur = pt(kid(c, "pt")); out += `L${r1(cur[0])} ${r1(cur[1])}`; }
      else if (n === "cubicBezTo") { const ps = kids(c, "pt").map(pt); if (ps.length === 3) { out += `C${ps.map((q) => `${r1(q[0])} ${r1(q[1])}`).join(" ")}`; cur = ps[2]; } }
      else if (n === "quadBezTo") { const ps = kids(c, "pt").map(pt); if (ps.length === 2) { out += `Q${ps.map((q) => `${r1(q[0])} ${r1(q[1])}`).join(" ")}`; cur = ps[1]; } }
      else if (n === "arcTo") {
        const wR = num(c.attrs.wR) * sx, hR = num(c.attrs.hR) * sy, st = (num(c.attrs.stAng) / 60000) * Math.PI / 180, sw = (num(c.attrs.swAng) / 60000) * Math.PI / 180;
        const cx = cur[0] - wR * Math.cos(st), cy = cur[1] - hR * Math.sin(st);
        const ex = cx + wR * Math.cos(st + sw), ey = cy + hR * Math.sin(st + sw);
        out += `A${r1(wR)} ${r1(hR)} 0 ${Math.abs(sw) > Math.PI ? 1 : 0} ${sw > 0 ? 1 : 0} ${r1(ex)} ${r1(ey)}`;
        cur = [ex, ey];
      } else if (n === "close") out += "Z";
    }
  }
  return out;
}

export const plainOf = (e) => (e.textbox ? e.textbox.paragraphs.map((p) => p.runs.map((r) => (r.br ? "\n" : r.t ?? (r.latex ? `$${r.latex}$` : ""))).join("")).join("\n") : "");
