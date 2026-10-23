// Desempenho com apresentações grandes (10, 80 e 200 slides de tipos variados): montar o HTML, abrir o Studio
// (miniaturas e o slide na tela) e trocar de slide. Os limites são folgados (máquina lenta de CI); o que se quer
// pegar é a regressão grosseira (algo que passou a redesenhar tudo a cada clique, por exemplo).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import YAML from "yaml";
import { buildHTML } from "../src/build.js";
import { LAYOUT_SAMPLES } from "../src/studio/layout-samples.js";
import { browserOrSkip, newPage, startStudio, tempDeck } from "./helpers.js";

const kinds = Object.entries(LAYOUT_SAMPLES).filter(([k]) => !["api", "video", "image"].includes(k)).map(([layout, v]) => ({ layout, ...v }));
const deckOf = (n) => ({ title: `Deck de ${n}`, theme: "sinal", slides: Array.from({ length: n }, (_, i) => structuredClone(kinds[i % kinds.length])) });

test("montar o HTML: 10, 80 e 200 slides de tipos variados", () => {
  for (const [n, ms] of [[10, 3000], [80, 6000], [200, 12000]]) {
    const t0 = performance.now();
    const r = buildHTML(deckOf(n));
    const took = performance.now() - t0;
    assert.equal((r.html.match(/<section class="slide/g) || []).length, n);
    assert.ok(took < ms, `${n} slides em ${Math.round(took)} ms (limite ${ms})`);
  }
});

test("Studio com 200 slides: abre, mostra as miniaturas e troca de slide sem travar", { timeout: 180000 }, async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const deck = tempDeck();
  fs.writeFileSync(deck.file, YAML.stringify(deckOf(200)));
  const studio = await startStudio(deck.file);
  try {
    const t0 = Date.now();
    const { page: p, errors } = await newPage(browser, studio.url);
    // trocar de slide não consulta a Conferência: a consulta a cada troca deixava a primeira troca ~2 s mais lenta
    let conferencias = 0;
    p.on("request", (r) => { if (r.url().includes("/api/conferencia")) conferencias++; });
    await p.waitForFunction(() => document.querySelectorAll(".thumb-card").length === 200, null, { timeout: 60000 });
    await p.waitForSelector("#rendered-slide-container .slide");
    const open = Date.now() - t0;
    assert.ok(open < 45000, `abriu em ${open} ms`);
    // trocar de slide: o do meio, o último, e voltar (cada troca redesenha só o slide atual)
    await p.waitForTimeout(900); // a consulta da abertura (debounce de 700 ms) já passou
    conferencias = 0;
    const times = [];
    for (const i of [120, 199, 3, 60]) {
      const s = Date.now();
      await p.click(`.thumb-card[data-idx="${i}"]`);
      await p.waitForFunction((i) => document.getElementById("current-slide-label")?.textContent.startsWith(`Slide ${i + 1} `), i, { timeout: 15000 });
      await p.waitForSelector("#rendered-slide-container .slide");
      times.push(Date.now() - s);
    }
    await p.waitForTimeout(900);
    assert.equal(conferencias, 0, "navegar entre slides não consulta a Conferência");
    // o slide da tela passa na frente das miniaturas: enquanto o pedido dele espera, nenhuma miniatura nova começa
    // (logo depois de abrir, a fila delas, cada uma levando o deck inteiro, atrasava a troca em segundos)
    let mainAt = null, mainDone = null;
    const starts = [];
    p.on("request", (r) => { if (r.url().includes("/api/render-slide")) starts.push({ at: Date.now(), index: r.postDataJSON()?.index }); });
    const hold = async (route) => {
      if (route.request().postDataJSON()?.index === 150 && mainAt == null) { mainAt = Date.now(); await new Promise((r) => setTimeout(r, 700)); mainDone = Date.now(); }
      await route.continue().catch(() => {});
    };
    await p.route("**/api/render-slide", hold);
    await p.click('.thumb-card[data-idx="150"]');
    await p.waitForFunction(() => document.getElementById("current-slide-label")?.textContent.startsWith("Slide 151 "));
    await p.waitForTimeout(1200);
    await p.unroute("**/api/render-slide", hold);
    assert.ok(mainAt && mainDone, "o slide 151 foi pedido");
    const during = starts.filter((s) => s.index !== 150 && s.at > mainAt + 30 && s.at < mainDone);
    assert.deepEqual(during, [], "nenhuma miniatura começou enquanto o slide da tela esperava");
    assert.ok(starts.some((s) => s.index !== 150 && s.at >= mainDone), "a fila das miniaturas volta depois");
    assert.ok(Math.max(...times) < 4000, `trocas de slide: ${times.join(", ")} ms`);
    t.diagnostic(`abrir: ${open} ms; trocas: ${times.join(", ")} ms`);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await studio.close(); deck.cleanup(); }
});
