// O fiscal de layout (src/export/shots.js: check) olha o que está de fato embaixo do texto: texto branco sobre a pílula
// desenhada em SVG do infográfico não é "baixo contraste"; texto pálido no fundo branco é. O enchimento do marca-texto
// num título não é "estouro". A transformação e o Studio usam esse fiscal: falso alarme vira correção à toa.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildHTML } from "../src/build.js";
import { LAYOUT_SAMPLES } from "../src/studio/layout-samples.js";
import { browserOrSkip } from "./helpers.js";

test("fiscal: contraste pelo que está embaixo do texto (desenho SVG conta) e marca-texto no título não é estouro", { timeout: 120000 }, async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  await browser.close();
  const { check } = await import("../src/export/shots.js");
  const slides = [
    { layout: "infographic", ...structuredClone(LAYOUT_SAMPLES.infographic) },
    { layout: "blocks", title: "Pálido", content: [{ text: "texto quase branco", color: "#F2F2F2" }] },
    { layout: "split", title: "Vazões máximas ==anuais==", body: "x" },
    // fundo em color-mix (o navegador devolve color(srgb 0.95 …), de 0 a 1) e rótulos do exercício
    { layout: "solution", title: "Ex", problem: "Dada a série", givens: ["N = 8"], find: "Probabilidade empírica e TR para 10 anos", steps: ["x = 1"] },
  ];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sgd-check-"));
  try {
    const file = path.join(dir, "d.html");
    fs.writeFileSync(file, buildHTML({ title: "x", theme: "sinal", slides }).html);
    const { report } = await check(file);
    const kinds = (n) => (report.find((r) => r.slide === n)?.issues || []).map((i) => `${i.kind}: ${i.text}`);
    assert.deepEqual(kinds(1).filter((k) => k.startsWith("baixo-contraste")), [], "o texto do infográfico está sobre a pílula colorida");
    assert.ok(kinds(2).some((k) => k === "baixo-contraste: texto quase branco"), "o pálido no branco continua acusado");
    assert.deepEqual(kinds(3).filter((k) => k.startsWith("estouro-horizontal")), []);
    assert.deepEqual(kinds(4).filter((k) => /^(baixo-contraste|fonte-pequena)/.test(k)), [], "texto escuro no cinza-claro do exercício; rótulos Dados/Pede-se legíveis");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
