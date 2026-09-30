// A faixa de opções cabe na tela em notebook, janela estreita e zoom do navegador: nenhuma aba corta controles
// (1093 px = notebook de 1366 com zoom de 125%; 900 px = janela estreita / tablet em pé).
import { test } from "node:test";
import assert from "node:assert/strict";
import { browserOrSkip, newPage, startStudio, tempDeck } from "./helpers.js";

test("faixa de opções: todas as abas cabem de 1920 a 900 px, sem controle cortado", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const deck = tempDeck();
  const studio = await startStudio(deck.file);
  try {
    for (const [width, height] of [[1920, 1080], [1366, 768], [1280, 720], [1093, 614], [1024, 700], [900, 700]]) {
      const { page: p, errors } = await newPage(browser, `${studio.url}`, { width, height });
      const tabs = await p.evaluate(() => [...document.querySelectorAll(".ribbon-panel")].map((x) => x.dataset.panel));
      for (const tab of tabs) {
        const r = await p.evaluate((tab) => {
          const btn = document.querySelector(`[data-tab="${tab}"]`);
          if (!btn || btn.offsetParent === null) return null;
          btn.click();
          const panel = document.querySelector(`.ribbon-panel[data-panel="${tab}"]`);
          const edge = panel.getBoundingClientRect().right + 1;
          const cut = [...panel.querySelectorAll("button, select, input")].filter((e) => !e.closest(".theme-gallery")).filter((e) => { const b = e.getBoundingClientRect(); return b.width && b.right > edge; }).map((e) => e.id || e.title || e.textContent.trim()).slice(0, 5);
          const tall = [...panel.querySelectorAll(":scope > .rgroup")].filter((g) => g.scrollHeight > g.getBoundingClientRect().height + 2).map((g) => g.querySelector(".rgroup-label")?.textContent);
          return { over: panel.scrollWidth - panel.clientWidth, cut, tall };
        }, tab);
        if (!r) continue;
        assert.ok(r.over <= 1 && !r.cut.length, `${width}px, aba ${tab}: passa ${r.over}px (${r.cut.join(", ")})`);
        assert.deepEqual(r.tall, [], `${width}px, aba ${tab}: grupo mais alto que a faixa`);
      }
      assert.deepEqual(errors, []);
      await p.close();
    }
  } finally { await browser.close(); await studio.close(); deck.cleanup(); }
});
