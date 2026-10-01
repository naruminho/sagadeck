// Palco × estudo: o mesmo deck em duas visões. A apresentação não mostra o texto de consulta; o material de estudo
// traz cada slide inteiro com ele logo depois, sem as notas do apresentador.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import YAML from "yaml";
import { buildHTML } from "../src/build.js";
import { estudoHTML } from "../src/export/estudo.js";
import { browserOrSkip, newPage, startStudio, tempDeck } from "./helpers.js";

const spec = { title: "Hidrologia", theme: "sinal", slides: [
  { layout: "statement", text: "Tempo de concentração", notes: "Lembrar da piada do rio", consulta: "Kirpich: **tc = 57 (L³/H)^0,385**, com L em km e H em m." },
  { layout: "statement", text: "Chuva de projeto" },
] };

test("consulta: fora da apresentação, no material de estudo (sem as notas)", () => {
  const r = buildHTML(spec);
  assert.doesNotMatch(r.html, /Kirpich/, "o palco não mostra o texto de consulta");
  assert.match(r.slidesMeta[0].consulta, /<b>tc = 57/);
  assert.equal(r.slidesMeta[1].consulta, "");
  const html = estudoHTML({ title: "Hidrologia", slidesMeta: r.slidesMeta, shotFiles: [] });
  assert.match(html, /Kirpich/);
  assert.doesNotMatch(html, /piada do rio/, "as notas do apresentador não vão para o aluno");
  assert.match(html, /2 slides · 1 com texto de consulta/);
});

test("Studio: o texto de consulta se escreve ao lado das anotações e o aluno recebe o material (HTML e PDF)", async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const deck = tempDeck();
  const studio = await startStudio(deck.file);
  try {
    const { page: p, errors } = await newPage(browser, studio.url);
    await p.click('.thumb-card[data-idx="0"]');
    await p.fill("#slide-consulta-input", "Para estudar: a vazão de pico vem do método racional.");
    await p.locator("#slide-consulta-input").blur(); await p.waitForTimeout(800);
    const saved = YAML.parse(fs.readFileSync(deck.file, "utf8"));
    assert.match(saved.slides[0].consulta, /método racional/);
    const ver = await fetch(`${studio.url}/api/export/estudo-html?ver=1`);
    assert.equal(ver.headers.get("content-disposition"), "inline", "a prévia abre na aba");
    const html = await ver.text();
    assert.match(html, /método racional/);
    assert.ok((html.match(/<img src="data:image\/jpeg/g) || []).length >= saved.slides.length, "cada slide inteiro, em foto");
    const pdf = await fetch(`${studio.url}/api/export/estudo`);
    assert.equal(pdf.headers.get("content-type"), "application/pdf");
    assert.match(pdf.headers.get("content-disposition"), /material%20de%20estudo\.pdf/);
    assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString(), "%PDF");
    assert.deepEqual(errors, []);
  } finally { await browser.close(); await studio.close(); deck.cleanup(); }
});
