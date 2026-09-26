// Loop da IA com slides api: a IA cria o slide e pede test; o Studio executa contra a API; a IA vê
// "NÃO EXISTE" na resposta real, corrige e testa de novo; quando passa, só confirma.
// LLM falso roteirizado (test/mock-llm.js) + API de mentira (test/mock-api.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { startStudio } from "./helpers.js";
import { startMockLLM } from "./mock-llm.js";
import { startMockApi, envFileFor } from "./mock-api.js";

const ocrSlide = (answer) => ({ layout: "api", title: "OCR do contrato", file: "contrato.txt",
  request: { url: "{{base}}/ocr", body: { content: "{{file.base64}}" } }, answer });

test("IA gera o slide api, testa, vê o caminho errado na resposta real, corrige e testa de novo", { timeout: 60000 }, async () => {
  const api = await startMockApi();
  fs.writeFileSync(process.env.SAGADECK_AMBIENTES, envFileFor(api).replace("  hom:\n", "  hom:\n    secrets: { client_secret: \"valor-super-secreto-42\" }\n"));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-aiapi-"));
  const deck = path.join(dir, "aula.yaml");
  fs.writeFileSync(deck, YAML.stringify({ title: "Aula", slides: [{ layout: "cover", title: "Aula de APIs" }] }));
  fs.writeFileSync(path.join(dir, "contrato.txt"), "cláusula 12");
  let round = 0;
  const llm = await startMockLLM(({ lastUser }) => {
    round++;
    if (round === 1) return "Criei o slide do OCR e vou testar.\n```yaml\n" + YAML.stringify({ insert: [{ after: 1, slide: ocrSlide("$.output") }], test: [2] }) + "```";
    if (round === 2) {
      assert.match(lastUser, /NÃO EXISTE \$\.output/);
      assert.match(lastUser, /"text": ?"lido: cláusula 12"|lido: cláusula 12/);
      return "O texto vem em $.text; corrigi e testo de novo.\n```yaml\n" + YAML.stringify({ slides: { 2: ocrSlide("$.text") }, test: [2] }) + "```";
    }
    return "Funcionou: o OCR devolveu o texto do contrato.";
  });
  const studio = await startStudio(deck, { llmUrl: llm.url });
  try {
    const r = await fetch(`${studio.url}/api/ai/chat`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Aqui está a doc do OCR: POST /ocr com content em base64. Monta o slide e testa.", targetSlide: 0 }) });
    const data = await r.json();
    assert.equal(round, 3, "criar → corrigir → confirmar");
    assert.equal(data.spec.slides[1].answer, "$.text", "ficou a versão corrigida");
    assert.match(data.reply, /Funcionou/);
    const tests = data.actions.filter((a) => /Teste do slide/.test(a));
    assert.equal(tests.length, 2);
    assert.match(tests[0], /^✓ Teste do slide 2/, "a chamada em si funcionou (200)…");
    assert.match(tests[1], /^✓/);
    // o que a IA recebe: regras e ambiente, com nomes de segredos mas nunca o valor
    const first = llm.requests[0];
    assert.match(first.system, /Slides "api"/);
    assert.match(first.system, /test: \[2, 3\]/);
    assert.match(first.lastUser, /\{\{base\}\} = http:\/\/127\.0\.0\.1:\d+\/v1/);
    assert.match(first.lastUser, /\{\{secret\.client_secret\}\}/);
    assert.doesNotMatch(JSON.stringify(llm.requests), /valor-super-secreto-42/);
    // salvo no deck e gravado para a apresentação
    const saved = YAML.parse(fs.readFileSync(deck, "utf8"));
    assert.equal(saved.slides[1].answer, "$.text");
    const rec = JSON.parse(fs.readFileSync(path.join(dir, "aula.respostas.json"), "utf8"));
    assert.equal(Object.values(rec)[0].result.body.text, "lido: cláusula 12");
  } finally {
    await studio.close();
    await llm.close();
    await api.close();
  }
});

test("test: em slide que não é api é recusado e a IA refaz (sem executar nada)", { timeout: 30000 }, async () => {
  const api = await startMockApi();
  fs.writeFileSync(process.env.SAGADECK_AMBIENTES, envFileFor(api));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-aiapi-"));
  const deck = path.join(dir, "aula.yaml");
  fs.writeFileSync(deck, YAML.stringify({ title: "Aula", slides: [{ layout: "cover", title: "Aula" }] }));
  let n = 0;
  const llm = await startMockLLM(({ lastUser }) => {
    n++;
    if (n === 1) return "Testando.\n```yaml\ntest: [1]\n```";
    assert.match(lastUser, /não é um slide api/);
    return "Esse slide não é de API, não tem o que testar.";
  });
  const studio = await startStudio(deck, { llmUrl: llm.url });
  try {
    const data = await (await fetch(`${studio.url}/api/ai/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: "testa o slide 1" }) })).json();
    assert.equal(n, 2);
    assert.match(data.reply, /não é de API/);
    assert.equal(api.state.requests.length, 0, "nada foi executado");
  } finally {
    await studio.close();
    await llm.close();
    await api.close();
  }
});

test("ambientes.yaml quebrado não derruba o chat: o teste do slide falha com a explicação", async () => {
  const { ApiEnvironments } = await import("../src/api-client.js");
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-amb-")), "a.yaml");
  fs.writeFileSync(file, "environments:\n  dev:\n    vars: {}\n    vars: {}\n");
  const api = new ApiEnvironments(file);
  assert.equal(api.currentName(), null);
  const r = await api.runSlide({ request: { url: "http://x/y" } });
  assert.equal(r.report.ok, false);
  assert.match(r.report.erro, /YAML inválido/);
});
