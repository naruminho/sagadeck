import "./isolate.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ApiEnvironments } from "../src/api-client.js";
import "../src/studio/public/developer-authoring.js";

const { parseCurl } = globalThis.SagaDeveloperAuthoring;
const C = globalThis.SagadeckApiCore;

test("cURL importado: segredos chegam com encoding correto ao servidor HTTP", async t => {
  const received = [];
  const server = http.createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const request = { url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString("utf8") };
    received.push(request); res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify(request));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-curl-send-"));
  const env = new ApiEnvironments(path.join(dir, "ambientes.yaml"));
  env.builtin.dev = { vars: {}, secrets: {} };
  try {
    await t.test("formulario: & no segredo continua dentro do valor, sem criar outro campo", async () => {
      env.builtin.dev.secrets = { corpo_password: "a&b" };
      const { request } = parseCurl(`curl '${base}/form' --data-urlencode 'password=a&b'`);
      const result = await env.send(request), sent = received.at(-1);
      assert.equal(sent.body, "password=a%26b");
      assert.equal(new URLSearchParams(sent.body).get("password"), "a&b");
      assert.doesNotMatch(JSON.stringify(result), /a&b|a%26b/);
    });
    await t.test("JSON: aspas, barras e Unicode no segredo preservam JSON e inteiro grande", async () => {
      const secret = 'a"b\\ç'; env.builtin.dev.secrets = { corpo_password: secret };
      const original = '{ "password": "placeholder", "id": 9007199254740993, "note": "{{nota}}" }';
      const { request } = parseCurl(`curl '${base}/json' --json '${original}'`);
      const rendered = C.render(C.normalize({ request }).request, { nota: 'Uma "nota" com ç e &.' });
      const prepared = await env.prepare(rendered);
      const expected = original.replace('"placeholder"', JSON.stringify(secret)).replace('"{{nota}}"', JSON.stringify('Uma "nota" com ç e &.'));
      assert.equal(prepared.body, expected);
      const result = await env.send(rendered), sent = received.at(-1);
      assert.equal(sent.body, expected);
      assert.equal(JSON.parse(sent.body).password, secret);
      assert.match(sent.body, /9007199254740993/);
      assert.doesNotMatch(JSON.stringify(result), /a\\?"b|placeholder/);
    });
    await t.test("URL: query recebe valor inteiro e cabecalho continua literal, sem expor segredos", async () => {
      env.builtin.dev.secrets = { url_api_key: 'chave&"ç', cabecalho_x_api_key: 'header&"key' };
      const { request } = parseCurl(`curl -G '${base}/query' --data-urlencode 'api_key={{secret.url_api_key}}' --data-urlencode 'q={{query}}' -H 'X-Api-Key: placeholder'`);
      const rendered = C.render(C.normalize({ request }).request, { query: "a & b / ação" });
      const result = await env.send(rendered), sent = received.at(-1), url = new URL(sent.url, base);
      assert.equal(url.searchParams.get("api_key"), 'chave&"ç');
      assert.equal(url.searchParams.get("q"), "a & b / ação");
      assert.equal(sent.headers["x-api-key"], 'header&"key');
      assert.doesNotMatch(JSON.stringify(result), /chave&|chave%26|header&/);
    });
    await t.test("URL de pedido anterior tambem envia o segredo resolvido e mascara o relatorio", async () => {
      env.builtin.dev.secrets = { legacy_url: "legacy-token-012345" };
      const result = await env.send({ method: "GET", url: `${base}/legacy?key={{secret.legacy_url}}`, auth: false });
      assert.equal(new URL(received.at(-1).url, base).searchParams.get("key"), "legacy-token-012345");
      assert.doesNotMatch(JSON.stringify(result), /legacy-token-012345/);
      assert.match(result.sent.url, /345$/);
    });
    await t.test("mascara da resposta aberta cobre segredo curto e sua representacao codificada", async () => {
      env.builtin.dev.secrets = { corpo_password: "a&b" };
      const { request } = parseCurl(`curl '${base}/open' --data-urlencode 'password=a&b'`);
      const response = await env.open(request), chunks = [];
      for await (const chunk of response.res) chunks.push(chunk);
      const safe = response.mask(Buffer.concat(chunks).toString("utf8"));
      assert.doesNotMatch(safe, /a&b|a%26b/);
      assert.equal(received.at(-1).body, "password=a%26b");
    });
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("encoding contextual e opt-in: pedidos anteriores preservam a interpolacao existente", () => {
  const request = { url: "https://example.test/?q={{q}}", body: '{"q":"{{q}}"}', headers: { "X-Q": "{{q}}" } };
  const rendered = C.render(request, { q: 'a&"b' });
  assert.equal(rendered.url, 'https://example.test/?q=a&"b');
  assert.equal(rendered.body, '{"q":"a&"b"}');
  assert.equal(rendered.headers["X-Q"], 'a&"b');
});
