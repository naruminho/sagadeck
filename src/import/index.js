// Importar uma apresentação para uma pasta de deck: lê (src/import/pptx.js), grava as mídias em imagens/original/
// (WMF/EMF viram PNG), guarda uma cópia do original e a foto de cada slide em original/ (PowerPoint ou LibreOffice,
// se houver) e devolve o deck. Cada slide lembra de onde veio (original: { slide, image }).
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import JSZip from "jszip";
import { importPptx, plainOf } from "./pptx.js";
import { metafilesToPng, powerPointSnapshots, libreOfficeToPdf } from "./office.js";

const gcd = (a, b) => (b ? gcd(b, a % b) : a);
export function aspectOf(cx, cy) {
  const r = cx / cy;
  if (Math.abs(r - 16 / 9) < 0.005) return undefined;
  if (Math.abs(r - 4 / 3) < 0.005) return "4:3";
  if (Math.abs(r - 16 / 10) < 0.005) return "16:10";
  const g = gcd(Math.round(cx / 1000), Math.round(cy / 1000)) || 1;
  return `${Math.round(cx / 1000) / g}:${Math.round(cy / 1000) / g}`;
}

export async function importToDir(buf, dir, { fileName = "original.pptx", snapshots = true, log = () => {} } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const res = await importPptx(buf);
  const zip = await JSZip.loadAsync(buf);
  // mídias
  const rename = new Map(), convert = [];
  for (const m of res.media) {
    const f = zip.file(m.zipPath);
    if (!f) continue;
    const abs = path.join(dir, ...m.name.split("/"));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, await f.async("nodebuffer"));
    if (["wmf", "emf", "tif", "tiff"].includes(m.ext)) convert.push({ src: abs, dst: abs.replace(/\.[a-z]+$/i, ".png"), from: m.name });
  }
  // mídia repetida (o mesmo logo gravado uma vez por slide): fica um arquivo só
  const seen = new Map();
  for (const m of res.media) {
    const abs = path.join(dir, ...m.name.split("/"));
    if (!fs.existsSync(abs)) continue;
    const h = crypto.createHash("sha1").update(fs.readFileSync(abs)).digest("hex");
    if (seen.has(h)) { rename.set(m.name, seen.get(h)); fs.rmSync(abs, { force: true }); const i = convert.findIndex((c) => c.from === m.name); if (i >= 0) convert.splice(i, 1); }
    else seen.set(h, m.name);
  }
  if (convert.length) {
    log(`convertendo ${convert.length} figura(s) WMF/EMF`);
    const done = new Set(metafilesToPng(convert.map(({ src, dst }) => ({ src, dst }))));
    for (const c of convert) if (done.has(c.dst)) { rename.set(c.from, c.from.replace(/\.[a-z]+$/i, ".png")); fs.rmSync(c.src, { force: true }); }
  }
  // repetida → a primeira; WMF/EMF → o PNG convertido (em cadeia)
  const resolve = (n) => { let v = n; for (let k = 0; k < 4 && rename.has(v); k++) v = rename.get(v); return v; };
  const fix = (e) => {
    if (e?.image) e.image = resolve(e.image);
    if (e?.drawing) e.drawing = String(e.drawing).replace(/href="media:([^"]+)"/g, (m, r) => `href="media:${resolve(r)}"`);
    return e;
  };
  // original e fotos
  const origDir = path.join(dir, "original");
  fs.mkdirSync(origDir, { recursive: true });
  const origFile = path.join(origDir, path.basename(fileName));
  fs.writeFileSync(origFile, buf);
  let snaps = [], snapBy = null;
  if (snapshots) {
    log("fotografando os slides do original");
    snaps = powerPointSnapshots(origFile, origDir);
    if (snaps.length) snapBy = "PowerPoint";
    else {
      const lo = libreOfficeToPdf(origFile);
      if (lo) {
        try { const { renderPdfPages } = await import("./pdf-render.js"); snaps = await renderPdfPages(fs.readFileSync(lo.pdf), origDir); snapBy = "LibreOffice"; }
        catch (e) { log(`sem foto do original (${e.message})`); }
        finally { lo.cleanup(); }
      }
    }
  }
  // o que não sai igual (equação OLE em WMF/EMF, SmartArt): recorte da foto fiel do slide, na mesma posição
  const isMeta = (n) => /\.(wmf|emf)$/i.test(n || "");
  const jobs = [];
  for (const s of res.slides) {
    const snap = path.join(origDir, `slide-${String(s.n).padStart(2, "0")}.png`);
    const has = snaps.length && fs.existsSync(snap);
    s.elements.forEach((e, k) => {
      if (!(e.fromSnapshot || (e.ole && isMeta(e.image)))) return;
      if (!has) return;
      const rel = `imagens/original/recorte-${String(s.n).padStart(2, "0")}-${k + 1}.png`;
      jobs.push({ src: snap, dst: path.join(dir, ...rel.split("/")), x: e.x, y: e.y, w: e.w, h: e.h, e, rel });
    });
    if (!has) s.elements = s.elements.filter((e) => !e.fromSnapshot);
  }
  if (jobs.length) {
    log(`recortando ${jobs.length} objeto(s) da foto do original`);
    try {
      const { cropRegions } = await import("./crop.js");
      const ok = new Set(await cropRegions(jobs));
      for (const j of jobs) if (ok.has(j.dst)) { j.e.image = j.rel; j.e.fit = "fill"; delete j.e.crop; delete j.e.fromSnapshot; j.e.fromOriginal = true; }
    } catch (e) { log(`sem recorte (${e.message})`); }
    for (const s of res.slides) s.elements = s.elements.filter((e) => !e.fromSnapshot);
  }
  const snapOf = (n) => { const f = `original/slide-${String(n).padStart(2, "0")}.png`; return fs.existsSync(path.join(dir, f)) ? f : null; };
  // deck
  const slides = res.slides.map((s) => {
    const bgColor = s.background?.color && s.background.color.toUpperCase() !== "FFFFFF" ? s.background.color : undefined;
    const out = { layout: "canvas", title: s.title || `Slide ${s.n}` };
    if (bgColor) out.bg = bgColor;
    if (s.background?.image) out.background = { image: resolve(s.background.image), fit: "fill" };
    out.elements = s.elements.map((e) => { const c = fix({ ...e }); delete c.kind; return c; });
    if (s.notes) out.notes = s.notes;
    out.original = { slide: s.n, ...(snapOf(s.n) ? { image: snapOf(s.n) } : {}), ...(s.layoutName ? { layout: s.layoutName } : {}) };
    if (s.hidden) out.hidden = true;
    return out;
  });
  const title = res.slides.map((s) => s.title).find((t) => t && t.length > 3) || path.basename(fileName).replace(/\.[a-z]+$/i, "");
  const spec = {
    title,
    ...(aspectOf(res.cx, res.cy) ? { aspect: aspectOf(res.cx, res.cy) } : {}),
    theme: "manual",
    footer: false,
    import: { from: path.basename(fileName), slides: slides.length, fonts: res.fonts, colors: res.scheme, ...(snapBy ? { snapshots: snapBy } : {}), ...(res.warnings.length ? { warnings: res.warnings.slice(0, 40) } : {}) },
    slides,
  };
  return { spec, media: res.media.length, converted: rename.size, snapshots: snaps.length, snapBy, warnings: res.warnings };
}

// texto de cada slide importado, compacto, para a IA ler o original (títulos, textos por posição, tabelas, notas)
export function outlineOf(spec) {
  return (spec.slides || []).map((s, i) => {
    const els = (s.elements || []).filter((e) => !e.deco);
    const texts = els.filter((e) => e.textbox).map((e) => plainOf(e).trim()).filter((t) => t && !/^\d{1,3}$/.test(t));
    const tables = els.filter((e) => e.tableData).map((e) => e.tableData.map((r) => r.join(" | ")).join("\n"));
    const imgs = els.filter((e) => e.image).length;
    return [`## ${i + 1}. ${s.title || ""}`, ...texts, ...tables.map((t) => `[tabela]\n${t}`), imgs ? `[${imgs} imagem(ns)]` : "", s.notes ? `[notas] ${s.notes}` : ""].filter(Boolean).join("\n");
  }).join("\n\n");
}
