// Exportação: PowerPoint editável a partir do deck de teste (Chrome invisível + pptxgenjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { buildHTML, loadSpec } from "../src/build.js";
import { tempDeck, browserOrSkip, readPptx } from "./helpers.js";

test("PowerPoint: um slide por slide, textos editáveis, notas e animações dos cliques", { timeout: 180000 }, async (t) => {
  const browser = await browserOrSkip(t); // só para pular sem Chrome; a exportação abre o próprio
  if (!browser) return;
  await browser.close();
  const deck = tempDeck();
  const spec = loadSpec(deck.file);
  const r = buildHTML(spec);
  const htmlFile = path.join(deck.dir, "deck.html"), out = path.join(deck.dir, "deck.pptx");
  fs.writeFileSync(htmlFile, r.html);
  const { exportPptx } = await import("../src/export/pptx.js");
  const { errors } = await exportPptx(htmlFile, out, { theme: r.theme, meta: { ...r.meta, slides: r.slidesMeta } });
  assert.deepEqual(errors, []);
  const p = await readPptx(fs.readFileSync(out));
  assert.equal(p.slides.length, spec.slides.length);
  assert.ok(p.slides.some((s) => s.includes("Três pilares")), "título como texto editável (não imagem)");
  assert.match(p.notes, /Roteiro do slide dos pilares/, "notas do apresentador");
  assert.ok(p.animations > 0, "cliques viram animações");
  deck.cleanup();
});

const pdfPages = (buf) => (buf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;

test("PDF: uma página por slide", { timeout: 180000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  await browser.close();
  const deck = tempDeck();
  const spec = loadSpec(deck.file);
  const htmlFile = path.join(deck.dir, "deck.html"), out = path.join(deck.dir, "deck.pdf");
  fs.writeFileSync(htmlFile, buildHTML(spec).html);
  const { pdf } = await import("../src/export/shots.js");
  await pdf(htmlFile, out);
  const buf = fs.readFileSync(out);
  assert.equal(buf.subarray(0, 4).toString(), "%PDF");
  assert.equal(pdfPages(buf), spec.slides.length);
  deck.cleanup();
});

test("roteiro: PDF com miniaturas e notas", { timeout: 180000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  await browser.close();
  const deck = tempDeck();
  const spec = loadSpec(deck.file);
  const r = buildHTML(spec);
  const htmlFile = path.join(deck.dir, "deck.html"), out = path.join(deck.dir, "roteiro.pdf");
  fs.writeFileSync(htmlFile, r.html);
  const { shots } = await import("../src/export/shots.js");
  const { roteiroPDF } = await import("../src/export/roteiro.js");
  const { files } = await shots(htmlFile, path.join(deck.dir, "mini"), { scale: 0.5, jpeg: true });
  assert.equal(files.length, spec.slides.length, "uma miniatura por slide");
  await roteiroPDF({ slidesMeta: r.slidesMeta, shotFiles: files, outFile: out, title: r.meta.title, author: r.meta.author, duration: spec.duration });
  const buf = fs.readFileSync(out);
  assert.equal(buf.subarray(0, 4).toString(), "%PDF");
  assert.ok(pdfPages(buf) >= 1);
  assert.ok((buf.toString("latin1").match(/\/Subtype\s*\/Image/g) || []).length >= spec.slides.length, "as miniaturas estão no PDF");
  deck.cleanup();
});

// formas de um slide do .pptx: [{ cx, cy, fill }] em px da tela de 1920 (1 px = 6350 EMU)
async function shapesOf(file, n) {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const xml = await zip.file(`ppt/slides/slide${n}.xml`).async("string");
  return [...xml.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)].map((m) => {
    const ext = m[0].match(/<a:ext cx="(\d+)" cy="(\d+)"/);
    const fill = (m[0].match(/<p:spPr>[\s\S]*?<a:solidFill><a:srgbClr val="([0-9A-F]{6})"/) || [])[1];
    return ext ? { w: +ext[1] / 6350, h: +ext[2] / 6350, fill } : null;
  }).filter(Boolean);
}

test("PowerPoint: linhas desenhadas por CSS (pseudo-elementos e bordas de um lado só) aparecem", { timeout: 180000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  await browser.close();
  const deck = tempDeck();
  const spec = {
    title: "Linhas", theme: "bauhaus",
    // a linha do tempo NÃO é o 1º slide (fora da tela ao exportar) e tem cliques: era assim que a linha sumia
    slides: [
      { layout: "blocks", title: "Divisor", content: [{ body: "Texto com linha embaixo", style: "border-bottom:6px solid #cc0000;padding-bottom:12px" }] },
      { layout: "timeline", title: "Linha do tempo", build: true, events: [{ when: "2019", title: "A" }, { when: "2022", title: "B" }, { when: "2026", title: "C" }] },
    ],
  };
  const r = buildHTML(spec);
  const htmlFile = path.join(deck.dir, "l.html"), out = path.join(deck.dir, "l.pptx");
  fs.writeFileSync(htmlFile, r.html);
  const { exportPptx } = await import("../src/export/pptx.js");
  await exportPptx(htmlFile, out, { theme: r.theme, meta: { ...r.meta, slides: r.slidesMeta } });
  const tl = await shapesOf(out, 2);
  assert.ok(tl.filter((s) => s.h <= 10 && s.w >= 60).length >= 2, `linha do tempo sem o traço entre os eventos: ${JSON.stringify(tl)}`);
  const dv = await shapesOf(out, 1);
  assert.ok(dv.some((s) => s.fill === "CC0000" && s.h <= 10 && s.w >= 100), `divisor (borda embaixo) sumiu: ${JSON.stringify(dv)}`);
  deck.cleanup();
});
