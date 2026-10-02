// Infográfico camadas (pedido: "o ciclo em camadas, faria mais sentido inverter pois a chuva fica em cima e a água
// infiltra pra baixo"): o perfil físico de cima para baixo como na realidade, os fluxos como setas verticais com nome.
// No fluxograma do Mermaid a ordem seguia as setas e a atmosfera ia parar embaixo.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildHTML, renderSlide } from "../src/build.js";
import { browserOrSkip } from "./helpers.js";

const camadas = ["Atmosfera", "Superfície", "Zona de aeração", "Zona de saturação", "Rocha"];
const slide = {
  layout: "infographic", title: "O ciclo em cinco camadas", shape: "camadas",
  items: camadas.map((t, i) => ({ title: t, icon: i ? "" : "cloud-rain", items: i === 4 ? ["Embasamento"] : ["Chuva", "Escoamento", "Infiltração"].map((c) => `${c} ${i + 1}`) })),
  flows: [{ from: 1, to: 2, title: "Precipitação" }, { from: 2, to: 1, title: "Evaporação" }, { from: 2, to: 3, title: "Infiltração" }, { from: 3, to: 4, title: "Percolação" }, { from: 4, to: 3, title: "Fluxo ascendente" }],
};

test("camadas: uma faixa por camada na ordem dada (a de cima primeiro) e uma seta com nome por fluxo", () => {
  const h = renderSlide(slide, 0, { title: "x", theme: "relevo", slides: [] }).html;
  assert.match(h, /ig-camadas/);
  const pos = camadas.map((t) => h.indexOf(t));
  assert.ok(pos.every((p, i) => p > 0 && (!i || p > pos[i - 1])), `ordem: ${pos}`);
  assert.equal((h.match(/marker-end=/g) || []).length, 5);
  for (const f of slide.flows) assert.ok(h.includes(f.title), f.title);
});

test("no navegador: a atmosfera em cima, a rocha embaixo, as setas visíveis no rumo certo e o slide não encolhe", { timeout: 120000 }, async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sgd-camadas-"));
  try {
    const file = path.join(dir, "d.html");
    fs.writeFileSync(file, buildHTML({ title: "x", theme: "relevo", slides: [slide] }).html);
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`file://${file.replace(/\\/g, "/")}`); await page.waitForFunction(() => window.sagadeck);
    await page.waitForTimeout(600);
    const r = await page.evaluate((names) => {
      const s = document.querySelector(".slide"), st = s.querySelector(".ig-stage").getBoundingClientRect();
      const ys = names.map((n) => [...s.querySelectorAll(".ig-box")].find((b) => b.textContent.includes(n) && !b.classList.contains("ig-chips"))?.getBoundingClientRect().top ?? -1);
      const arrows = [...s.querySelectorAll("path[marker-end]")].map((p) => { const b = p.getBoundingClientRect(), d = p.getAttribute("d").match(/[\d.]+/g).map(Number); return { h: b.height, down: d[3] > d[1] }; });
      const labels = [...s.querySelectorAll(".f-label")].map((e) => e.getBoundingClientRect());
      const out = labels.some((c) => c.left < st.left - 1 || c.right > st.right + 1);
      return { ys, arrows, out, shrink: s.dataset.shrink || "" };
    }, camadas);
    assert.ok(r.ys.every((y, i) => y >= 0 && (!i || y > r.ys[i - 1])), `de cima para baixo: ${r.ys}`);
    assert.deepEqual(r.arrows.map((a) => a.down), [true, false, true, true, false]);
    assert.ok(r.arrows.every((a) => a.h > 60), `setas visíveis: ${JSON.stringify(r.arrows)}`);
    assert.ok(!r.out && !r.shrink, JSON.stringify(r));
    assert.deepEqual(errors, []);
    await page.close();
  } finally { await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
