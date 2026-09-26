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
