// Infográfico pista (pedido: o resumão da história dos videogames "como se fosse um mapa de Mario Kart olhando de
// cima"): o circuito visto de cima, os itens como marcos da volta, cada placa em cima ou embaixo, sem encavalar.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildHTML, renderSlide } from "../src/build.js";
import { browserOrSkip } from "./helpers.js";

const anos = ["1958 · Tennis for Two", "1972 · Pong", "1977 · Atari 2600", "1985 · NES", "1989 · Game Boy", "1996 · N64", "2006 · Wii", "2017 · Switch"];
const slide = (n) => ({ layout: "infographic", title: "A pista da história", shape: "pista", center: { title: "A volta dos videogames", text: "Da largada em 1958 à chegada de hoje" }, items: anos.slice(0, n).map((t) => ({ title: t, text: "um marco da história" })) });

test("pista: o circuito (asfalto, zebra, largada quadriculada) e um marco numerado por item", () => {
  const h = renderSlide(slide(8), 0, { title: "x", theme: "pop", slides: [] }).html;
  assert.match(h, /ig-pista/);
  assert.match(h, /stroke-dasharray="26 26"/, "zebra vermelha e branca");
  assert.match(h, /patternUnits="userSpaceOnUse"/, "largada quadriculada");
  for (const t of anos) assert.ok(h.includes(t), t);
});

test("no navegador: as placas da pista não encavalam, ficam no palco e o slide não encolhe (2, 5 e 8 marcos)", { timeout: 120000 }, async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sgd-pista-"));
  try {
    const file = path.join(dir, "d.html");
    fs.writeFileSync(file, buildHTML({ title: "x", theme: "pop", slides: [slide(2), slide(5), slide(8)] }).html);
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`file://${file.replace(/\\/g, "/")}`); await page.waitForFunction(() => window.sagadeck);
    for (const k of [0, 1, 2]) {
      await page.evaluate((i) => window.sagadeck.goto(i), k); await page.waitForTimeout(500);
      const r = await page.evaluate((i) => {
        const s = document.querySelectorAll(".slide")[i], st = s.querySelector(".ig-stage").getBoundingClientRect();
        const cards = [...s.querySelectorAll(".ig-layer .ig-box")].filter((b) => b.querySelector(".ig-x")).map((b) => b.getBoundingClientRect());
        const hit = cards.some((a, x) => cards.some((b, y) => y > x && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1));
        const out = cards.some((c) => c.left < st.left - 1 || c.right > st.right + 1 || c.top < st.top - 1 || c.bottom > st.bottom + 1);
        return { n: cards.length, hit, out, shrink: s.dataset.shrink || "" };
      }, k);
      assert.equal(r.n, [2, 5, 8][k]);
      assert.ok(!r.hit && !r.out && !r.shrink, `${[2, 5, 8][k]} marcos: ${JSON.stringify(r)}`);
    }
    assert.deepEqual(errors, []);
    await page.close();
  } finally { await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
