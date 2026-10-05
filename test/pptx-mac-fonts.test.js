// PPTX legível no Mac: --mac-fonts troca as fontes só-Windows por equivalentes
// que existem no Windows e no macOS (mesmo sem Office).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { THEMES, resolveTheme, pptxFontMap, PPTX_MAC_SAFE } from "../src/themes.js";
import { buildHTML } from "../src/build.js";
import { tempDeck, browserOrSkip } from "./helpers.js";

test("pptxFontMap com fallback mac: todo tema sai só com fontes dos dois sistemas", () => {
  for (const name of Object.keys(THEMES)) {
    const theme = resolveTheme(name);
    const fmap = pptxFontMap(theme, { fallback: "mac" });
    for (const [role, m] of Object.entries(fmap)) {
      for (const v of [m.regular, m.bold]) {
        assert.ok(
          PPTX_MAC_SAFE.has(v.face),
          `${name}/${role}: "${v.face}" não abre igual no Mac sem Office`
        );
      }
    }
  }
});

test("PowerPoint: --mac-fonts tira Bahnschrift/Segoe do XML e põe Arial Narrow/Arial", { timeout: 180000 }, async (t) => {
  const browser = await browserOrSkip(t);
  if (!browser) return;
  await browser.close();
  const deck = tempDeck();
  try {
    const spec = { title: "Mac", theme: "sinal", slides: [{ layout: "statement", text: "Olá Mac" }] };
    const r = buildHTML(spec);
    const htmlFile = path.join(deck.dir, "mac.html");
    fs.writeFileSync(htmlFile, r.html);
    const { exportPptx } = await import("../src/export/pptx.js");

    const winOut = path.join(deck.dir, "win.pptx");
    await exportPptx(htmlFile, winOut, { theme: r.theme, meta: { ...r.meta, slides: r.slidesMeta } });
    const winXml = await (await JSZip.loadAsync(fs.readFileSync(winOut))).file("ppt/slides/slide1.xml").async("string");
    assert.match(winXml, /Bahnschrift/, "padrão continua Windows/Office");

    const macOut = path.join(deck.dir, "mac.pptx");
    await exportPptx(htmlFile, macOut, { theme: r.theme, meta: { ...r.meta, slides: r.slidesMeta }, fontFallback: "mac" });
    const macXml = await (await JSZip.loadAsync(fs.readFileSync(macOut))).file("ppt/slides/slide1.xml").async("string");
    assert.doesNotMatch(macXml, /Bahnschrift/, "nada de fonte só-Windows no modo Mac");
    assert.doesNotMatch(macXml, /Segoe UI/, "nada de Segoe no modo Mac");
    assert.match(macXml, /Arial Narrow/, "DIN condensada vira Arial Narrow nos dois sistemas");
  } finally {
    deck.cleanup();
  }
});
