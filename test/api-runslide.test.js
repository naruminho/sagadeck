// runSlide: o Studio executa um slide inteiro e devolve um relatório que a IA usa para corrigir o slide.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ApiEnvironments } from "../src/api-client.js";
import { startMockApi, envFileFor } from "./mock-api.js";

async function setup() {
  const mock = await startMockApi({ statuses: ["STARTED", "RUNNING", "FINISHED"] });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-run-"));
  const file = path.join(dir, "ambientes.yaml");
  fs.writeFileSync(file, envFileFor(mock));
  fs.writeFileSync(path.join(dir, "contrato.txt"), "cláusula 9");
  return { mock, dir, api: new ApiEnvironments(file) };
}

test("slide certo: ok, campo em destaque encontrado, valores de save:, gravação no formato da apresentação", async () => {
  const { mock, api } = await setup();
  try {
    const r = await api.runSlide({ request: { url: "{{base}}/sync", body: { messages: [{ role: "user", content: "oi" }] } }, answer: "$.choices[0].message.content", save: { rid: "$.id" } });
    assert.equal(r.report.ok, true);
    assert.equal(r.report.status, 200);
    assert.equal(r.report.answer, 'eco: oi');
    assert.deepEqual(r.saved, { rid: "r1" });
    assert.equal(r.record.mode, "sync");
    assert.equal(r.record.result.body.choices[0].message.content, "eco: oi");
  } finally { await mock.close(); }
});

test("caminho errado: o relatório diz NÃO EXISTE e mostra a resposta real (é disso que a IA precisa)", async () => {
  const { mock, api } = await setup();
  try {
    const r = await api.runSlide({ request: { url: "{{base}}/sync", body: { q: "x" } }, answer: "$.output.text", save: { rid: "$.response_id" } });
    assert.equal(r.report.answer, "NÃO EXISTE $.output.text");
    assert.equal(r.report["save.rid"], "NÃO EXISTE $.response_id");
    assert.match(r.report.resposta, /"choices":\[\{"message"/);
  } finally { await mock.close(); }
});

test("polling: segue até FINISHED e lista os status; status no caminho errado é explicado", async () => {
  const { mock, api } = await setup();
  try {
    const slide = { mode: "polling", request: { url: "{{base}}/start", body: { workflow: "resumo" } },
      polling: { id: "$.executionId", check: { url: "{{base}}/status/{{id}}" }, status: "$.status", done: ["FINISHED"], interval: 0.05 }, steps: "$.responses" };
    const ok = await api.runSlide(slide);
    assert.equal(ok.report.ok, true);
    assert.deepEqual(ok.report.statuses, ["STARTED", "RUNNING", "FINISHED"]);
    assert.equal(ok.report.steps, "2 etapas");
    assert.equal(ok.record.polls.length, 3);
    const bad = await api.runSlide({ ...slide, polling: { ...slide.polling, status: "$.data.state" } });
    assert.equal(bad.report.ok, false);
    assert.match(bad.report.erro, /NÃO EXISTE \$\.data\.state/);
    const noId = await api.runSlide({ ...slide, polling: { ...slide.polling, id: "$.id_execucao" } });
    assert.match(noId.report.erro, /NÃO EXISTE \$\.id_execucao/);
    assert.match(noId.report.resposta, /executionId/);
  } finally { await mock.close(); }
});

test("upload com o arquivo padrão da pasta do deck; variável que falta; embeddings", async () => {
  const { mock, dir, api } = await setup();
  try {
    const up = await api.runSlide({ file: "contrato.txt", request: { url: "{{base}}/upload", form: { file: "@file" } }, save: { path_id: "$.path_id" } }, { deckDir: dir });
    assert.equal(up.report.ok, true);
    assert.deepEqual(up.saved, { path_id: "store/contrato.txt" });
    const ocr = await api.runSlide({ request: { url: "{{base}}/ocr", body: { path_id: "{{path_id}}" } }, answer: "$.text" }, { vars: up.saved });
    assert.equal(ocr.report.answer, 'lido: cláusula 9');
    const miss = await api.runSlide({ request: { url: "{{base}}/ocr", body: { path_id: "{{path_id}}" } } });
    assert.match(miss.report.erro, /faltam variáveis: \{\{path_id\}\}/);
    const outside = await api.runSlide({ file: "../fora.txt", request: { url: "{{base}}/upload", form: { file: "@file" } } }, { deckDir: dir });
    assert.match(outside.report.erro, /não achei o arquivo/);
    const emb = await api.runSlide({ request: { url: "{{base}}/embeddings", body: { input: "{{text}}" } }, similarity: { reference: "abrir conta", texts: ["abrir uma conta", "chuva"] } });
    assert.equal(emb.report.ok, true);
    assert.equal(emb.report.dims, 64);
    assert.match(emb.report.similaridades[0], /abrir uma conta/);
  } finally { await mock.close(); }
});
