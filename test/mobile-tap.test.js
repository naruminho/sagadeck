// Mobile: tocar avança, arrastar troca de slide, controle não avança.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildHTML } from "../src/build.js";
import { browserOrSkip, tempDeck } from "./helpers.js";

async function touchSwipe(page, x0, x1, y = 400) {
  await page.evaluate(([a, b, c]) => {
    const el = document.querySelector(".slide.current");
    const mk = (x) => new Touch({ identifier: 1, target: el, clientX: x, clientY: c });
    document.dispatchEvent(new TouchEvent("touchstart", { touches: [mk(a)], bubbles: true, cancelable: true }));
    document.dispatchEvent(new TouchEvent("touchend", { touches: [], changedTouches: [mk(b)], bubbles: true, cancelable: true }));
  }, [x0, x1, y]);
}

test("mobile: toque avança o slide, arrastar volta/avança", async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  const deck = tempDeck();
  try {
    const file = path.join(deck.dir, "mobile.html");
    fs.writeFileSync(file, buildHTML({ title: "M", slides: [
      { layout: "statement", title: "Um" },
      { layout: "statement", title: "Dois" },
      { layout: "statement", title: "Três" },
    ] }).html);
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(pathToFileURL(file).href);
    await page.waitForFunction(() => window.sagadeck && window.sagadeck.cur === 0, null, { timeout: 15000 });
    const cur = () => page.evaluate(() => window.sagadeck.cur);
    await page.touchscreen.tap(195, 400);
    await page.waitForFunction(() => window.sagadeck.cur === 1, null, { timeout: 8000 });
    assert.equal(await cur(), 1, "toque avança");
    await touchSwipe(page, 300, 80);
    await page.waitForFunction(() => window.sagadeck.cur === 2, null, { timeout: 8000 });
    assert.equal(await cur(), 2, "arrastar para a esquerda avança");
    await touchSwipe(page, 80, 300);
    await page.waitForFunction(() => window.sagadeck.cur === 1, null, { timeout: 8000 });
    assert.equal(await cur(), 1, "arrastar para a direita volta");
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { await browser.close(); deck.cleanup(); }
});
