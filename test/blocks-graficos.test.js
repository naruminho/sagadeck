// Dois gráficos lado a lado, cada um numa coluna com o rótulo em cima (o "antes e depois" dos blocos alternados): as
// colunas ficavam do tamanho do conteúdo, a do rótulo curto com 300 px e a outra com 619, e o primeiro gráfico saía
// minúsculo num canto do slide.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildHTML } from "../src/build.js";
import { browserOrSkip } from "./helpers.js";

const bars = (vals) => ({ chart: "bar", decimals: 1, suffix: " mm", data: vals.map((v, i) => ({ label: String((i + 1) * 20), value: v })) });
const slide = { layout: "blocks", title: "Blocos alternados — antes e depois", content: [{ row: [
  { col: [{ label: "Ordem original", align: "center" }, bars([34.1, 10.8, 6.1, 4.2, 3.1, 2.5])] },
  { col: [{ label: "Reorganizado (blocos alternados)", align: "center" }, bars([3.1, 6.1, 34.1, 10.8, 4.2, 2.5])] },
] }] };

test("no navegador: gráficos em colunas lado a lado dividem a linha por igual e ocupam a altura", { timeout: 120000 }, async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sgd-blocos-"));
  try {
    const file = path.join(dir, "d.html");
    fs.writeFileSync(file, buildHTML({ title: "x", theme: "relevo", slides: [slide] }).html);
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`file://${file.replace(/\\/g, "/")}`); await page.waitForFunction(() => window.sagadeck);
    await page.waitForTimeout(600);
    const r = await page.evaluate(() => {
      const s = document.querySelector(".slide"), row = s.querySelector(".row").getBoundingClientRect();
      const charts = [...s.querySelectorAll("svg.chart")].map((e) => e.getBoundingClientRect());
      return { row: row.width, w: charts.map((c) => Math.round(c.width)), h: charts.map((c) => Math.round(c.height)), shrink: s.dataset.shrink || "" };
    });
    assert.ok(Math.abs(r.w[0] - r.w[1]) <= 4, `mesma largura: ${JSON.stringify(r)}`);
    assert.ok(r.w[0] + r.w[1] > r.row * 0.85, `ocupam a linha: ${JSON.stringify(r)}`);
    assert.ok(Math.min(...r.h) > 400, `ocupam a altura: ${JSON.stringify(r)}`);
    assert.ok(!r.shrink, JSON.stringify(r));
    assert.deepEqual(errors, []);
    await page.close();
  } finally { await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
