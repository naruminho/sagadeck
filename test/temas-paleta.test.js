// Tema com fundo desenhado (gradiente da pele) + paleta por cima: a versão escalafobética da aula da Maria saiu com
// o tema relevo e a paleta safira (clara) e a letra escura da paleta caiu no fundo escuro da pele (ilegível); o
// fiscal não viu porque mede contra a cor de fundo declarada. Aqui se mede o PIXEL do fundo, como a pessoa vê.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildHTML } from "../src/build.js";
import { browserOrSkip } from "./helpers.js";

const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

test("no navegador: temas com fundo desenhado (relevo, arcade, aluminio) acompanham a paleta — a letra contrasta com o fundo que aparece", { timeout: 180000 }, async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sgd-tp-"));
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    const bad = [];
    for (const theme of ["relevo", "arcade", "aluminio"]) for (const palette of [undefined, "safira", "neon"]) {
      const file = path.join(dir, `${theme}-${palette || "sem"}.html`);
      fs.writeFileSync(file, buildHTML({ title: "x", theme, ...(palette ? { palette } : {}), slides: [{ layout: "list", title: "Título de teste", items: ["um", "dois"] }] }).html);
      await page.goto(`file://${file.replace(/\\/g, "/")}`); await page.waitForFunction(() => window.sagadeck); await page.waitForTimeout(400);
      const fg = await page.evaluate(() => getComputedStyle(document.querySelector(".slide .li-t")).color.match(/\d+/g).slice(0, 3).map(Number));
      // o fundo de verdade: uma área vazia do slide, fotografada e lida num canvas (a média, por causa das linhas da tela)
      const shot = (await page.screenshot({ clip: { x: 1500, y: 560, width: 60, height: 60 } })).toString("base64");
      const bg = await page.evaluate(async (b64) => {
        const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
        const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const x = c.getContext("2d"); x.drawImage(img, 0, 0);
        const d = x.getImageData(0, 0, c.width, c.height).data; const s = [0, 0, 0];
        for (let i = 0; i < d.length; i += 4) { s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2]; }
        return s.map((v) => v / (d.length / 4));
      }, shot);
      const r = ratio(fg, bg);
      if (r < 4) bad.push(`${theme} + ${palette || "sem paleta"}: ${r.toFixed(2)} (letra ${fg}, fundo ${bg.map(Math.round)})`);
    }
    assert.deepEqual(bad, [], bad.join("\n"));
    assert.deepEqual(errors, []);
    await page.close();
  } finally { await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
