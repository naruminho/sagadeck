// Pôster (pedido do Naruminho: "um one page que seria um infográfico bem bonitinho, tipo na Nature, de como fazer um
// brigadeiro"): o onepage é de projeto (jornada, problema, solução) e a receita saía como "problema × solução".
// O pôster é a figura de revista: ilustração principal, painéis com letra, desenho, texto curto, números e setas.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildHTML, renderSlide } from "../src/build.js";
import { LAYOUT_SAMPLES } from "../src/studio/layout-samples.js";
import { browserOrSkip } from "./helpers.js";

const R = (s) => renderSlide(s, 0, { title: "x", theme: "editorial", slides: [] }).html;
const receita = {
  layout: "poster", kicker: "Receita", title: "Brigadeiro gourmet", subtitle: "Do fogo baixo ao ponto de enrolar", flow: true,
  hero: { icon: "cookie" },
  panels: [
    { title: "Ingredientes", icon: "shopping-basket", text: "Leite condensado, cacau 50% e manteiga sem sal", facts: [{ value: "395 g", label: "leite condensado" }, { value: "2 col.", label: "cacau" }] },
    { title: "Fogo baixo", icon: "flame", text: "Mexa sem parar, raspando o fundo", facts: [{ value: "10–12 min", label: "no fogo" }] },
    { title: "O ponto", icon: "thermometer", text: "A massa desgruda do fundo da panela", facts: [{ value: "≈ 112 °C", label: "ponto de bala mole" }] },
    { title: "Descanso", icon: "snowflake", text: "Esfria no prato untado até firmar", facts: [{ value: "2 h", label: "na geladeira" }] },
    { title: "Enrolar", icon: "hand", text: "Mãos untadas, bolinhas de 15 g", facts: [{ value: "15 g", label: "cada" }] },
    { title: "Cobertura", icon: "sparkles", text: "Granulado belga ou cacau peneirado", facts: [{ value: "25", label: "unidades" }] },
  ],
  key: "Rende 25 unidades. Temperatura do ponto medida com termômetro culinário.",
};

test("pôster: painéis com letra a, b, c…, ícone ou figura, números; setas só entre vizinhos da mesma linha; ilustração principal", () => {
  const h = R(receita);
  assert.match(h, /class="L-poster has-hero ps-flow"/);
  assert.deepEqual([...h.matchAll(/ps-letter"[^>]*>([^<]*)</g)].map((m) => m[1]), ["a", "b", "c", "d", "e", "f"]);
  assert.equal((h.match(/class="ps-arrow"/g) || []).length, 4, "6 painéis em 3 colunas: setas a→b, b→c, d→e, e→f");
  assert.match(h, /ps-val[^>]*>395 g</);
  assert.match(h, /ps-hero/);
  assert.match(h, /ps-key/);
  assert.doesNotMatch(R({ ...receita, hero: undefined, flow: false }), /has-hero|ps-arrow/);
  assert.match(R(LAYOUT_SAMPLES.poster), /L-poster/);
  // com a ilustração principal, as 4 colunas que a IA pediu espremiam os painéis: no máximo 3 (2 com até 4 painéis)
  assert.match(R({ ...receita, cols: 4 }), /--cols:3;/);
  assert.match(R({ ...receita, cols: 4, panels: receita.panels.slice(0, 4) }), /--cols:2;/);
  assert.match(R({ ...receita, hero: undefined, cols: 4 }), /--cols:4;/, "sem ilustração principal, vale o que pediu");
});

test("no navegador: o pôster cabe no slide sem encolher tudo, com os painéis do mesmo tamanho", { timeout: 120000 }, async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sgd-poster-"));
  try {
    const file = path.join(dir, "d.html");
    fs.writeFileSync(file, buildHTML({ title: "x", theme: "editorial", slides: [receita, LAYOUT_SAMPLES.poster] }).html);
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`file://${file.replace(/\\/g, "/")}`); await page.waitForFunction(() => window.sagadeck);
    for (const k of [0, 1]) {
      await page.evaluate((i) => window.sagadeck.goto(i), k); await page.waitForTimeout(500);
      const r = await page.evaluate((i) => {
        const s = document.querySelectorAll(".slide")[i], safe = s.querySelector(".safe").getBoundingClientRect();
        const out = [...s.querySelectorAll(".safe .t")].filter((t) => t.getBoundingClientRect().bottom > safe.bottom + 6).map((t) => t.textContent.slice(0, 30));
        const ws = [...s.querySelectorAll(".ps-panel")].map((p) => Math.round(p.getBoundingClientRect().width));
        return { out, shrink: s.dataset.shrink || "", ws };
      }, k);
      assert.deepEqual(r.out, [], `slide ${k + 1}: texto passando da área útil`);
      assert.ok(!r.shrink || +r.shrink > 0.8, `slide ${k + 1} encolheu demais: ${r.shrink}`);
      assert.equal(new Set(r.ws).size, 1, `painéis com larguras ${r.ws.join(", ")}`);
    }
    assert.deepEqual(errors, []);
    await page.close();
  } finally { await browser.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
