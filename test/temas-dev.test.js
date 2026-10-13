// Os temas de desenvolvimento têm sintaxe legível, geometria própria e rede ambiente que não disputa a leitura.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { buildHTML, loadSpec } from "../src/build.js";
import { col, resolveTheme, pptxFontMap } from "../src/themes.js";
import { writeDeckFile } from "../src/deck-file.js";
import { LAYOUT_SAMPLES } from "../src/studio/layout-samples.js";
import { browserOrSkip, newPage, startStudio, tempDeck } from "./helpers.js";

const NAMES = ["terminal-pro", "aurora-dev"];
const COVER = { layout: "cover", kicker: "Workshop de desenvolvimento", title: "Da ideia ao ==código==", subtitle: "Explicar uma API deve ser tão simples quanto usá-la." };
const CODE = { layout: "code", title: "Uma função pequena", language: "javascript", code: "// Recebe uma pessoa e devolve a saudação\nfunction greet(name) {\n  return `Olá, ${name}!`;\n}\nconst result = greet('Ana');", caption: "Uma entrada, uma saída" };
const WALK = { layout: "codewalk", title: "Passo a passo", language: "javascript", filename: "greet.js", code: "function greet(name) {\n  return `Olá, ${name}!`;\n}", steps: [{ title: "Receber", text: "A função recebe um nome.", highlight: [1] }, { title: "Devolver", text: "O retorno contém a saudação.", highlight: [2], output: "Olá, Ana!" }] };
const DECK = { title: "Desenvolvimento", slides: [COVER, CODE, WALK] };
const lum = (hex) => [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + .05) / (y + .05); };

test("temas dev: fontes embutidas, contraste de leitura em todos os tons e layouts de código/API sem avisos", () => {
  for (const name of NAMES) {
    const theme = resolveTheme(name);
    for (const [tone, values] of Object.entries(theme.tones)) {
      for (const [fg, bg] of [["fg", "bg"], ["muted", "bg"], ["fg", "surface"], ["muted", "surface"], ["onHi", "hi"]]) {
        const c = contrast(col(theme, values[fg]), col(theme, values[bg]));
        assert.ok(c >= 4.5, `${name}/${tone}: ${fg}/${bg} precisa de 4,5 (${c.toFixed(2)})`);
      }
    }
    const slides = [COVER, { layout: "section", number: "01", title: "Experimentar" }, CODE, WALK, ...["api", "codelab", "terminals", "turns", "diagram"].map((key) => structuredClone(LAYOUT_SAMPLES[key]))];
    const { html, warnings } = buildHTML({ theme: name, slides });
    assert.deepEqual(warnings, [], name);
    for (const family of ["Space Grotesk", "IBM Plex Mono"]) assert.match(html, new RegExp(`@font-face\\{font-family:'${family}';[^}]*base64,`), `${name}: ${family} embutida`);
    assert.doesNotMatch(html, /fonts\.(googleapis|gstatic)\.com/);
    assert.match(html, /font-variant-ligatures: none/, "os sinais do código mantêm seu desenho literal");
    assert.match(html, new RegExp(`<section[^>]*th-${name}[^>]*data-ambient="rede"`));
    assert.doesNotMatch(buildHTML({ theme: name, slides: [{ ...COVER, ambient: false }] }).html, /<section[^>]*data-ambient=/, "a pessoa pode tirar a rede");
    assert.equal(pptxFontMap(theme).mono.regular.face, "Cascadia Mono", "PPTX com fonte de código instalada");
  }
});

test("temas dev no navegador: sintaxe contrasta, o código guiado responde ao teclado e a rede para fora da capa", { timeout: 120000 }, async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const deck = tempDeck();
  try {
    const { page, errors } = await newPage(browser);
    for (const theme of NAMES) {
      const file = path.join(deck.dir, `${theme}.html`);
      fs.writeFileSync(file, buildHTML({ ...DECK, theme }).html);
      await page.goto(pathToFileURL(file).href);
      await page.waitForFunction(() => window.sagadeck?.cur === 0);
      const network = () => page.locator(".slide").first().locator(".ambient canvas").evaluate((c) => c.toDataURL());
      const a = await network();
      await page.waitForFunction((first) => document.querySelector(".ambient canvas").toDataURL() !== first, a);
      await page.evaluate(() => window.sagadeck.goto(1));
      const stopped = await network();
      await page.waitForTimeout(180);
      assert.equal(await network(), stopped, `${theme}: a rede para fora da capa`);
      const colors = await page.locator(".slide.current .code").evaluate((code) => {
        const hex = (value) => value.match(/\d+/g).slice(0, 3).map((v) => Number(v).toString(16).padStart(2, "0")).join("");
        return { bg: hex(getComputedStyle(code).backgroundColor), tokens: [...code.querySelectorAll(".tok,.cn")].map((node) => ({ name: node.className, fg: hex(getComputedStyle(node).color) })) };
      });
      assert.ok(colors.tokens.length >= 7, "código realmente tokenizado");
      for (const token of colors.tokens) assert.ok(contrast(token.fg, colors.bg) >= 4.5, `${theme}/${token.name}: sintaxe e números de linha legíveis`);
      await page.evaluate(() => window.sagadeck.goto(2));
      const next = page.locator('.slide.current [data-lesson-next]');
      await next.focus();
      await page.keyboard.press("Enter");
      await page.locator(".slide.current .lesson-panel.active").filter({ hasText: "Devolver" }).waitFor();
      assert.match(await page.locator(".slide.current .code .cl.hl").innerText(), /return/);
      assert.equal(await page.evaluate(() => window.sagadeck.cur), 2, "o passo não avança o slide");
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); deck.cleanup(); }
});

test("temas dev: movimento reduzido, motion none e exportação deixam a rede estática e o código completo", { timeout: 120000 }, async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const deck = tempDeck();
  try {
    for (const theme of NAMES) for (const mode of ["reduce", "none", "export"]) {
      const { page, errors } = await newPage(browser, undefined, undefined, { reducedMotion: mode === "reduce" ? "reduce" : "no-preference" });
      const file = path.join(deck.dir, `${theme}-${mode}.html`);
      fs.writeFileSync(file, buildHTML({ ...DECK, theme, ...(mode === "none" ? { motion: "none" } : {}) }).html);
      await page.goto(pathToFileURL(file).href + (mode === "export" ? "#export" : ""));
      await page.waitForFunction(() => window.sagadeck);
      const frame = () => page.locator(".ambient canvas").evaluate((c) => c.toDataURL());
      const initial = await frame();
      await page.waitForTimeout(160);
      assert.equal(await frame(), initial, `${theme}/${mode}: rede estática`);
      await page.evaluate(() => window.sagadeck.goto(2));
      assert.match(await page.locator(".slide.current .code").innerText(), /return.*Olá/);
      if (mode === "export") {
        assert.equal(await page.locator(".slide.current .lesson-summary").isVisible(), true, "a exportação mostra todos os passos");
        assert.equal(await page.locator(".slide.current .lesson-controls").isVisible(), false);
        assert.deepEqual(await page.locator(".slide.current .code .cl").evaluateAll((lines) => lines.map((line) => getComputedStyle(line).opacity)), ["1", "1", "1"]);
      }
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally { await browser.close(); deck.cleanup(); }
});

test("Studio: Terminal Pro e Aurora Dev aparecem em Design e a escolha por teclado fica salva", { timeout: 120000 }, async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const deck = tempDeck();
  writeDeckFile(deck.file, { ...DECK, theme: "sinal" });
  const studio = await startStudio(deck.file);
  try {
    const { page, errors } = await newPage(browser, studio.url);
    await page.click('.ribbon-tab[data-tab="design"]');
    const strip = page.locator(".look-strip").filter({ has: page.locator("#theme-gallery") });
    for (const theme of NAMES) {
      if (!(await strip.getAttribute("class")).includes("open")) await strip.locator(".look-all").click();
      const card = page.locator(`#theme-gallery .theme-card[data-theme="${theme}"]`);
      await card.focus();
      await page.keyboard.press("Enter");
      await page.waitForFunction(async (name) => (await (await fetch("api/deck")).json()).spec.theme === name, theme);
      const saved = loadSpec(deck.file);
      assert.equal(saved.theme, theme, "a escolha é escrita no deck");
      assert.equal(saved.slides[1].code, CODE.code, "a troca de tema preserva o código");
      assert.equal(saved.slides[2].steps[1].title, "Devolver", "e a cadência da aula");
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await studio.close(); deck.cleanup(); }
});
