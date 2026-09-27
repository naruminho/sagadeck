// Design: tema e paleta são duas escolhas, como no PowerPoint. Clique = a apresentação toda (e desfaz o que era só
// de um slide); botão direito = "Só neste slide". Tudo confere no deck salvo e no slide desenhado.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import YAML from "yaml";
import { browserOrSkip, newPage, startStudio, tempDeck } from "./helpers.js";

test("Design: paletas e temas, na apresentação toda ou só num slide", { timeout: 90000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  const deckFile = tempDeck();
  const studio = await startStudio(deckFile.file);
  try {
    const { page: p, errors } = await newPage(browser, `${studio.url}/editor`);
    const saved = () => YAML.parse(fs.readFileSync(deckFile.file, "utf8"));
    const settle = () => p.waitForTimeout(900);
    const slideClass = () => p.getAttribute("#rendered-slide-container .slide", "class");
    await p.waitForSelector('.thumb-card[data-idx="1"]');
    await p.click('.ribbon-tab[data-tab="design"]');

    await t.test("galeria de paletas: Do tema + as paletas; clicar aplica na apresentação toda", async () => {
      await p.waitForSelector("#palette-gallery .palette-card");
      const names = await p.$$eval("#palette-gallery .palette-card", (els) => els.map((e) => e.dataset.palette));
      assert.ok(names.includes("tema") && names.includes("floresta") && names.length >= 11, names.join(","));
      await p.click('#palette-gallery .palette-card[data-palette="floresta"]');
      await settle();
      assert.equal(saved().palette, "floresta");
      assert.match(await slideClass(), /--floresta/);
    });

    await t.test("botão direito no tema: Só neste slide muda só o slide atual", async () => {
      await p.click('.thumb-card[data-idx="1"]');
      await p.click('#theme-gallery .theme-card[data-theme="jornal"]', { button: "right" });
      await p.click('#look-menu [data-scope="slide"]');
      await settle();
      const s = saved();
      assert.equal(s.slides[1].theme, "jornal");
      assert.equal(s.slides[0].theme, undefined);
      assert.notEqual(s.theme, "jornal");
      assert.match(await slideClass(), /th-jornal/);
    });

    await t.test("botão direito na paleta: Só neste slide", async () => {
      await p.click('#palette-gallery .palette-card[data-palette="cereja"]', { button: "right" });
      await p.click('#look-menu [data-scope="slide"]');
      await settle();
      assert.equal(saved().slides[1].palette, "cereja");
      assert.match(await slideClass(), /th-jornal lk-jornal--cereja/);
    });

    await t.test("clicar num tema aplica em todos e desfaz os temas de slide", async () => {
      await p.click('#theme-gallery .theme-card[data-theme="editorial"]');
      await settle();
      const s = saved();
      assert.equal(s.theme, "editorial");
      assert.ok(s.slides.every((sl) => sl.theme === undefined));
      assert.equal(s.slides[1].palette, "cereja", "a paleta do slide continua (é outra escolha)");
      assert.match(await slideClass(), /th-editorial/);
    });

    // bug: o fiscal media no meio da animação de entrada (tudo 34px abaixo) e acusava "fora da margem" numa capa
    // ancorada embaixo (bauhaus), e a auto-correção encolhia o título sem motivo
    await t.test("o fiscal mede o slide parado: capa ancorada embaixo não é 'fora da margem'", async () => {
      await p.click('#theme-gallery .theme-card[data-theme="bauhaus"]');
      await p.click('.thumb-card[data-idx="0"]');
      // capa sem autor nem figura: o subtítulo é o último, colado na margem de baixo
      await p.evaluate(async () => {
        const r = await fetch("api/deck").then((x) => x.json());
        const spec = r.spec; spec.slides[0] = { layout: "cover", kicker: "Chapéu", title: "Capa revisada visualmente", subtitle: "Um subtítulo que fica embaixo" };
        await fetch("api/deck", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spec }) });
      });
      await p.reload();
      await p.waitForSelector('.thumb-card[data-idx="0"]');
      await p.waitForTimeout(1800);
      assert.equal(await p.textContent("#fiscal-badge"), "0", await p.getAttribute("#fiscal-badge", "title"));
    });

    await t.test("sem erros de JavaScript", () => assert.deepEqual(errors, []));
  } finally {
    await browser.close();
    await studio.close();
    deckFile.cleanup();
  }
});
