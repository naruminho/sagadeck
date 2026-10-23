// A abertura do deck no Chrome (src/export/browser.js: openDeck, usada por check, fotos, PDF e PPTX) não relê pelo
// Node o HTML que acabou de ser gravado: no Windows, o antivírus segura por 15 a 20 s a primeira leitura pelo Node de
// um HTML grande recém-gravado (o Chrome abre na hora). Cada exportação no Studio esperava isso, e a CI no Windows
// perdia minutos. Quem grava pelo writeDeckHTML deixa o texto na memória; sem ele, quem lê é o Chrome.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildHTML } from "../src/build.js";
import { LAYOUT_SAMPLES } from "../src/studio/layout-samples.js";
import { browserOrSkip } from "./helpers.js";

// conta as leituras do arquivo pelo Node (readFileSync, createReadStream, openSync) enquanto fn roda
async function nodeReads(file, fn) {
  const target = path.resolve(file), names = ["readFileSync", "createReadStream", "openSync", "readFile"];
  const orig = Object.fromEntries(names.map((n) => [n, fs[n]]));
  let reads = 0;
  for (const n of names) fs[n] = function (p, ...rest) { if (typeof p === "string" && path.resolve(p) === target) reads++; return orig[n].call(this, p, ...rest); };
  try { await fn(); } finally { Object.assign(fs, orig); }
  return reads;
}

test("abrir o deck no Chrome não relê pelo Node o HTML recém-gravado (com mapa, sem mapa e sem o texto na memória)", { timeout: 180000 }, async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  await browser.close();
  const { openDeck, writeDeckHTML } = await import("../src/export/browser.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sgd-open-"));
  try {
    const plain = buildHTML({ title: "x", theme: "sinal", slides: [{ layout: "statement", title: "Sem mapa" }] }).html;
    const withMap = buildHTML({ title: "x", theme: "sinal", slides: [{ layout: "map", ...structuredClone(LAYOUT_SAMPLES.map) }] }).html;
    const open = async (file, expectHttp) => {
      const { browser, page, errors } = await openDeck(file);
      try {
        assert.equal(await page.evaluate(() => window.sagadeck.n), 1);
        assert.equal(new URL(page.url()).protocol, expectHttp ? "http:" : "file:", "mapa abre por endereço local; o resto, como arquivo");
        return errors;
      } finally { await browser.close(); }
    };
    for (const [name, html, map] of [["sem-mapa", plain, false], ["mapa", withMap, true]]) {
      const file = path.join(dir, `${name}.html`);
      writeDeckHTML(file, html);
      assert.equal(fs.readFileSync(file, "utf8"), html, "grava o arquivo de verdade");
      assert.equal(await nodeReads(file, () => open(file, map)), 0, `${name}: gravado pelo writeDeckHTML, o Node não relê`);
    }
    // gravado por outro caminho (sem o texto na memória) e sem mapa: quem lê é o Chrome
    const other = path.join(dir, "outro.html");
    fs.writeFileSync(other, plain);
    assert.equal(await nodeReads(other, () => open(other, false)), 0, "sem mapa, o Node não lê o arquivo");
    // o arquivo mudou depois de gravado (outro processo, outra gravação): vale o que está no disco, não a memória
    const changed = path.join(dir, "mudou.html");
    writeDeckHTML(changed, plain);
    fs.writeFileSync(changed, withMap);
    await open(changed, true);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
