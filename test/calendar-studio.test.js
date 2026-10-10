// Calendário no Studio (pedido de Narumi: muitos eventos no mesmo mês não cabem; "seria legal ter opções de pôr um
// slide por mês"). O formulário escolhe a visão e o botão "Um slide por mês" separa o calendário, conferido no deck salvo.
import "./isolate.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { browserOrSkip, newPage, startStudio, tempDeck } from "./helpers.js";

test("Studio: visão do calendário pelo formulário e Um slide por mês (cada slide com os eventos do seu mês)", { timeout: 120000 }, async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const src = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-cal-src-")), "deck.yaml");
  const ev = (m, n) => Array.from({ length: n }, (_, i) => ({ date: `${m}-${String(3 + i * 4).padStart(2, "0")}`, title: `${m} ${i + 1}` }));
  fs.writeFileSync(src, YAML.stringify({ title: "Agenda", slides: [
    { layout: "cover", title: "Agenda" },
    { layout: "calendar", title: "Programação", events: [...ev("2026-11", 6), ...ev("2026-12", 5), { date: "18/01/2027", title: "Janeiro" }, { date: "algum dia", title: "Sem data ainda" }], undated: [{ title: "A confirmar" }] },
    { layout: "statement", text: "Fim" }] }));
  const deck = tempDeck(src);
  const studio = await startStudio(deck.file);
  try {
    const { page: p, errors } = await newPage(browser, studio.url);
    const saved = () => YAML.parse(fs.readFileSync(deck.file, "utf8"));
    const until = async (fn, what) => { for (let k = 0; k < 80; k++) { if (fn()) return; await p.waitForTimeout(100); } assert.fail(`não aconteceu: ${what}`); };
    await p.waitForSelector("#thumbnails-list > *");
    await p.evaluate(() => document.querySelectorAll("#thumbnails-list > *")[1].click());
    await p.waitForSelector("#rendered-slide-container .L-calendar");
    // a visão pelo formulário: escolher "Lista" grava no deck e o slide muda
    const visao = p.locator("#slide-fields-form .sf-field").filter({ hasText: "Visão" }).locator("select");
    await visao.selectOption("lista");
    await until(() => saved().slides[1].view === "lista", "a visão no deck");
    await p.waitForSelector('#rendered-slide-container .L-calendar[data-view="lista"]');
    // um slide por mês: três meses viram três slides, cada um no mês grande, com os eventos dele
    await p.locator("#slide-fields-form button", { hasText: "Um slide por mês" }).click();
    await until(() => saved().slides.length === 5, "três slides no lugar de um");
    const s = saved().slides;
    assert.deepEqual(s.map((x) => x.layout), ["cover", "calendar", "calendar", "calendar", "statement"]);
    assert.deepEqual(s.slice(1, 4).map((x) => [x.view, x.month, x.events.length]), [["mes", "2026-11", 6], ["mes", "2026-12", 5], ["mes", "2027-01", 1]]);
    assert.ok(s.slice(1, 4).every((x) => x.title === "Programação"));
    assert.deepEqual(s[1].undated.map((u) => u.title), ["A confirmar", "Sem data ainda"], "o que não tem data fica no primeiro");
    assert.equal(s[2].undated, undefined);
    await p.waitForSelector('#rendered-slide-container .L-calendar[data-view="mes"]');
    assert.match(await p.textContent("#rendered-slide-container .ca-mo"), /novembro/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await studio.close(); deck.cleanup(); }
});
