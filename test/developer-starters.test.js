import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { developerStarter } from "../src/studio/developer-starters.js";
import { buildHTML } from "../src/build.js";
import { startStudio, tempDeck, browserOrSkip, newPage } from "./helpers.js";
import { removeRetry } from "../src/fs-retry.js";
import { writeDeckFile } from "../src/deck-file.js";

test("bases técnicas são curtas, independentes e usam exemplos consistentes", () => {
  for (const kind of ["programacao", "apis"]) {
    const spec = developerStarter(kind, { title: "Meu laboratório" });
    assert.equal(spec.title, "Meu laboratório");
    assert.equal(spec.slides.length, 5);
    assert.deepEqual(buildHTML(spec).warnings, []);
    assert.equal(spec.slides[1].layout, "codewalk");
    assert.equal(spec.slides[1].steps.length, 3);
    spec.slides[1].code = "mudou";
    assert.notEqual(developerStarter(kind).slides[1].code, "mudou");
  }
  assert.throws(() => developerStarter("inexistente"), /Escolha uma base/);
  const api = developerStarter("apis");
  assert.equal(api.env, "ensaio");
  assert.equal(api.slides[2].request.body.mensagem, "Olá, API");
  assert.equal(api.slides[2].request.auth, false);
});

test("base cURL executa o exemplo pelo Studio local e mostra a resposta recebida", { timeout: 60000 }, async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const fixture = tempDeck();
  writeDeckFile(fixture.file, developerStarter("apis"));
  const studio = await startStudio(fixture.file);
  try {
    const { page, errors } = await newPage(browser, `${studio.url}/preview`, { width: 1920, height: 1080 });
    await page.waitForFunction(() => window.sagadeckApi?.state.live);
    await page.evaluate(() => window.sagadeck.goto(2));
    await page.waitForFunction(() => window.sagadeckApi.state.current === "ensaio");
    await page.click('.slide.current [data-api-run]');
    await page.waitForFunction(() => document.querySelector('.slide.current .api-status')?.textContent.includes("200"));
    assert.match(await page.locator('.slide.current .api-answer').innerText(), /Olá, API/);
    assert.equal(YAML.parse(fs.readFileSync(fixture.file, "utf8")).slides[2].request.body.mensagem, "Olá, API");
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await studio.close();
    fixture.cleanup();
    removeRetry(studio.library);
  }
});

test("biblioteca cria bases sem IA e salva tema, código, passos e chamada; erro não cria arquivo", async () => {
  const fixture = tempDeck();
  const studio = await startStudio(fixture.file);
  const create = (body) => fetch(`${studio.url}/api/library/decks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  try {
    for (const kind of ["programacao", "apis"]) {
      const response = await create({ starter: kind, title: `Minha ${kind}`, topic: "Curso" });
      assert.equal(response.status, 200);
      const { id } = await response.json();
      const file = path.join(studio.library, ...id.split("/"));
      const saved = YAML.parse(fs.readFileSync(file, "utf8"));
      const expected = developerStarter(kind, { title: `Minha ${kind}` });
      assert.equal(saved.theme, expected.theme);
      assert.equal(saved.slides[1].code, expected.slides[1].code);
      assert.deepEqual(saved.slides[1].steps, expected.slides[1].steps);
      if (kind === "apis") assert.deepEqual(saved.slides[2].request, expected.slides[2].request);
    }
    const before = await fetch(`${studio.url}/api/library`).then(r => r.json());
    const invalid = await create({ starter: "inexistente", title: "Não criar" });
    assert.equal(invalid.status, 400);
    const after = await fetch(`${studio.url}/api/library`).then(r => r.json());
    assert.equal(after.decks.length, before.decks.length);
  } finally {
    await studio.close();
    fixture.cleanup();
    removeRetry(studio.library);
  }
});
