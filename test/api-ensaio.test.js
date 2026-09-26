// `sagadeck ensaio-api`: sobe a API de mentira, os ambientes do ensaio e o deck de exemplo no Studio;
// todos os slides do deck funcionam de verdade (é o modelo para montar a aula com o serviço real).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn } from "node:child_process";
import YAML from "yaml";
import { ROOT } from "./helpers.js";
import { ApiEnvironments } from "../src/api-client.js";
import { startMockApi, demoEnvFile } from "../src/api-demo.js";

const freePort = () => new Promise((r) => { const s = net.createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); });

test("todos os slides do deck de ensaio funcionam contra a API de mentira, na ordem", { timeout: 60000 }, async () => {
  const mock = await startMockApi({ statuses: ["STARTED", "RUNNING", "FINISHED"] });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-ensaio-t-"));
  const envFile = path.join(dir, "ambientes.yaml");
  fs.writeFileSync(envFile, demoEnvFile(mock));
  fs.writeFileSync(path.join(dir, "contrato.txt"), "linha 1\nlinha 2\n");
  const api = new ApiEnvironments(envFile);
  let vars = {};
  try {
    const deck = YAML.parse(fs.readFileSync(path.join(ROOT, "templates", "ensaio-api.yaml"), "utf8"));
    for (const s of deck.slides.filter((x) => x.layout === "api")) {
      const r = await api.runSlide(s, { vars, deckDir: dir });
      if (s.mic) { assert.match(r.report.skipped, /microfone/); continue; }
      assert.equal(r.report.ok, true, `${s.id}: ${JSON.stringify(r.report).slice(0, 400)}`);
      vars = { ...vars, ...(r.saved || {}) };
    }
    assert.equal(vars.path_id, "store/contrato.txt");
    // a combinação errada do indexador falha, como o deck conta nas notas
    const idx = deck.slides.find((x) => x.id === "indexador");
    const bad = await api.runSlide({ ...idx, request: { ...idx.request, body: { ...idx.request.body, chunk_size: 800 } } }, { vars, deckDir: dir });
    assert.equal(bad.report.ok, false);
    assert.match(bad.report.resposta, /chunk_size não se aplica/);
  } finally { await mock.close(); }
});

test("o comando ensaio-api abre o Studio já com o deck e os ambientes do ensaio", { timeout: 30000 }, async () => {
  const port = await freePort();
  const proc = spawn(process.execPath, [path.join(ROOT, "bin", "sagadeck.js"), "ensaio-api", `--port=${port}`], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env } });
  try {
    let out = "";
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("não subiu: " + out)), 20000);
      proc.stdout.on("data", (c) => { out += c; if (/Ensaio no Studio/.test(out)) { clearTimeout(t); resolve(); } });
      proc.on("exit", (c) => reject(new Error(`saiu com ${c}: ${out}`)));
    });
    const st = await (await fetch(`http://127.0.0.1:${port}/api/http/state`)).json();
    assert.equal(st.live, true);
    assert.deepEqual(st.envs.map((e) => e.name), ["dev", "hom"]);
    assert.doesNotMatch(st.file, /\.sagadeck[\\/]ambientes\.yaml$/, "não usa o ambientes.yaml da pessoa");
    const deck = await (await fetch(`http://127.0.0.1:${port}/api/deck`)).json();
    assert.equal(deck.spec.title, "Ensaio: APIs de IA ao vivo");
    const r = await (await fetch(`http://127.0.0.1:${port}/api/http/send`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ request: { method: "POST", url: st.envs[1].vars.base + "/sync", body: { messages: [{ role: "user", content: "oi" }] } } }) })).json();
    assert.equal(r.body.choices[0].message.content, "eco: oi");
  } finally {
    proc.kill();
  }
});
