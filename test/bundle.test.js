// O motor EMPACOTADO (o que vai no pip, e para o banco): empacota numa pasta temporária e usa como um
// usuário usaria — Studio abrindo a interface e a CLI construindo um deck. Caminhos que só funcionam no
// repositório quebram aqui.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { ROOT, FIXTURE } from "./helpers.js";

test("motor empacotado (pip)", { timeout: 240000 }, async (t) => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-bundle-"));
  execFileSync(process.execPath, [path.join(ROOT, "scripts", "bundle.mjs")], { env: { ...process.env, SAGADECK_BUNDLE_OUT: out }, stdio: "pipe" });
  const engine = path.join(out, "sagadeck.mjs");
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-bundle-deck-"));
  fs.copyFileSync(FIXTURE, path.join(work, "deck.yaml"));

  await t.test("CLI: build gera o HTML com o ajuste para caber embutido", () => {
    execFileSync(process.execPath, [engine, "build", path.join(work, "deck.yaml")], { cwd: work, stdio: "pipe" });
    const html = fs.readFileSync(path.join(work, "deck.html"), "utf8");
    assert.match(html, /SagadeckFit/);
    assert.match(html, /<section/);
  });

  await t.test("CLI: pack e unpack (.sagadeck)", () => {
    execFileSync(process.execPath, [engine, "pack", path.join(work, "deck.yaml")], { cwd: work, stdio: "pipe" });
    assert.ok(fs.existsSync(path.join(work, "deck.sagadeck")));
    execFileSync(process.execPath, [engine, "unpack", path.join(work, "deck.sagadeck"), path.join(work, "extraido")], { cwd: work, stdio: "pipe" });
    assert.ok(fs.existsSync(path.join(work, "extraido", "deck.yaml")));
    assert.ok(fs.existsSync(path.join(work, "extraido", "sagadeck.json")));
  });

  await t.test("Studio: interface, estilos, scripts e API respondem", async () => {
    const port = 3600 + Math.floor(Math.random() * 300);
    const proc = spawn(process.execPath, [engine, "studio", path.join(work, "deck.yaml"), `--port=${port}`, "--host=127.0.0.1"],
      { cwd: work, env: { ...process.env, SAGADECK_LLM_URL: "http://127.0.0.1:9/v1" }, stdio: "pipe" });
    let log = "";
    proc.stdout.on("data", (d) => (log += d));
    proc.stderr.on("data", (d) => (log += d));
    try {
      const url = `http://127.0.0.1:${port}`;
      for (let k = 0; k < 50; k++) {
        try { await fetch(`${url}/api/deck`); break; } catch { await new Promise((r) => setTimeout(r, 200)); }
      }
      for (const p of ["/", "/app.js", "/style.css", "/slide-form.js", "/ui-icons.js", "/fit.js", "/api/deck", "/preview", "/api/layout-previews"]) {
        const r = await fetch(url + p);
        assert.equal(r.status, 200, `${p} -> ${r.status}\n${log.slice(-600)}`);
      }
    } finally {
      proc.kill();
    }
  });

  await t.test("Studio sem deck abre o exemplo do pacote", async () => {
    const port = 3900 + Math.floor(Math.random() * 90);
    const proc = spawn(process.execPath, [engine, "studio", `--port=${port}`, "--host=127.0.0.1"], { cwd: work, stdio: "ignore" });
    try {
      let data;
      for (let k = 0; k < 50 && !data; k++) {
        try { data = await (await fetch(`http://127.0.0.1:${port}/api/deck`)).json(); } catch { await new Promise((r) => setTimeout(r, 200)); }
      }
      assert.ok(data?.spec?.slides?.length > 3, "carregou o deck de exemplo");
      assert.match(String(data.file), /exemplo\.yaml$/);
    } finally {
      proc.kill();
    }
  });

  fs.rmSync(out, { recursive: true, force: true });
  fs.rmSync(work, { recursive: true, force: true });
});
