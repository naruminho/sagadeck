// O cURL importado percorre a apresentação, as variáveis do navegador e o servidor, sem perder o corpo original.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import YAML from "yaml";
import { writeDeckFile } from "../src/deck-file.js";
import { recordingsFile } from "../src/api-client.js";
import "../src/studio/public/developer-authoring.js";
import { browserOrSkip, newPage, startStudio, tempDeck } from "./helpers.js";
import { removeRetry } from "../src/fs-retry.js";

const { parseCurl } = globalThis.SagaDeveloperAuthoring;

test("cURL no preview: corpo JSON original, variáveis escapadas e segredos protegidos também na gravação", { timeout: 120000 }, async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  const fixture = tempDeck(), received = [];
  const secret = 'review"quoted\\secretç';
  const note = 'Uma "nota", uma barra \\ e ação &.';
  const label = "consulta & seção";
  const body = '{\n  "id": 9007199254740993,\n  "note": "{{note}}"\n}';
  const protectedBody = '{ "password": "literal-placeholder", "id": 9007199254740993, "note": "{{note}}" }';
  const server = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks).toString("utf8");
    received.push({ url: req.url, body: rawBody });
    res.writeHead(200, { "Content-Type": "application/json" });
    // Uma API de eco ou diagnóstico pode devolver o JSON enviado como string, também dentro de um log JSON.
    res.end(JSON.stringify({ receivedBody: rawBody, wrapped: JSON.stringify({ body: rawBody, repeated: JSON.parse(rawBody).password }) }));
  });
  let studio;
  const previousEnvFile = process.env.SAGADECK_AMBIENTES;
  try {
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    process.env.SAGADECK_AMBIENTES = path.join(fixture.dir, "ambientes.yaml");
    fs.writeFileSync(process.env.SAGADECK_AMBIENTES, YAML.stringify({ current: "review", environments: { review: { vars: { base, note, label }, secrets: { corpo_password: secret } } } }));
    const imported = (content) => parseCurl(`curl '{{base}}/echo?label={{label}}' --json '${content}'`).request;
    writeDeckFile(fixture.file, { title: "Revisão de cURL", slides: [
      { layout: "api", id: "original", title: "Corpo original", request: imported(body) },
      { layout: "api", id: "protected", title: "Segredo no corpo", request: imported(protectedBody) },
    ] });
    studio = await startStudio(fixture.file);
    const { page, errors } = await newPage(browser, `${studio.url}/preview`, { width: 1920, height: 1080 });
    await page.waitForFunction(() => window.sagadeckApi?.state.live && window.sagadeckApi.state.current === "review");
    const run = async (index) => {
      await page.evaluate((n) => window.sagadeck.goto(n, 0), index);
      const recorded = page.waitForResponse(response => response.url().endsWith("/api/http/record") && response.request().method() === "POST");
      await page.click(`.slide[data-idx="${index}"] [data-api-run]`);
      assert.equal((await recorded).status(), 200);
      await page.waitForFunction(() => !document.querySelector(".slide.current .L-api").classList.contains("running"));
      return JSON.parse(fs.readFileSync(recordingsFile(fixture.file), "utf8"));
    };

    await t.test("sem segredos: preserva inteiro grande e texto; variáveis do ambiente são escapadas antes do envio", async () => {
      await run(0);
      assert.equal(received[0].body, body.replace('"{{note}}"', JSON.stringify(note)), "nem o navegador deve fazer parse/stringify do JSON original");
      assert.equal(new URL(received[0].url, base).searchParams.get("label"), label, "o & continua dentro de um único valor de query");
      assert.match(received[0].body, /9007199254740993/);
    });

    await t.test("segredo: servidor recebe o valor correto, mas resposta, página e gravação não permitem recuperá-lo", async () => {
      const recordings = await run(1);
      assert.equal(JSON.parse(received[1].body).password, secret, "só o servidor de destino recebe o segredo original");
      const recorded = recordings.protected.result.body;
      assert.notEqual(JSON.parse(recorded.receivedBody).password, secret, "o JSON dentro de uma string da resposta deve estar mascarado");
      assert.notEqual(JSON.parse(JSON.parse(recorded.wrapped).body).password, secret, "mais uma camada de JSON também preserva a máscara");
      assert.notEqual(JSON.parse(recorded.wrapped).repeated, secret, "o mesmo log pode conter o segredo em representações diferentes");
      const shown = await page.evaluate(() => window.sagadeckApi.state.recordings.protected.result.body);
      assert.notEqual(JSON.parse(shown.receivedBody).password, secret, "a resposta entregue ao navegador também é segura");
      assert.notEqual(JSON.parse(JSON.parse(shown.wrapped).body).password, secret);
      assert.match(received[1].body, /9007199254740993/);
      assert.doesNotMatch(await page.content(), /literal-placeholder/, "o literal sensível importado não entra no HTML");
    });
    assert.deepEqual(errors, []);
  } finally {
    if (previousEnvFile == null) delete process.env.SAGADECK_AMBIENTES; else process.env.SAGADECK_AMBIENTES = previousEnvFile;
    await browser.close();
    if (studio) { await studio.close(); removeRetry(studio.library); }
    server.closeAllConnections();
    if (server.listening) await new Promise(resolve => server.close(resolve));
    fixture.cleanup();
  }
});
