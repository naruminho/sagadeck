// Uma instância local do Studio: porta padrão única, identificação por /api/instance e nada de abrir um segundo
// servidor sobre a mesma biblioteca (o CLI aponta para o que já está aberto).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { DEFAULT_PORT, VERSION, probeInstance, instanceDecision } from "../src/studio/instance.js";
import { startStudio, tempDeck, ROOT } from "./helpers.js";

const run = promisify(execFile);

test("porta padrão única: CLI, npm run dev e pacote Python", () => {
  assert.equal(DEFAULT_PORT, 3517);
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  assert.equal(pkg.scripts.dev, "node bin/sagadeck.js studio", "npm run dev usa o padrão do CLI");
  assert.match(fs.readFileSync(path.join(ROOT, "bin", "sagadeck.js"), "utf8"), /flags\.port \|\| process\.env\.PORT \|\| DEFAULT_PORT/);
  assert.match(fs.readFileSync(path.join(ROOT, "python", "sagadeck", "api.py"), "utf8"), /def studio\([^)]*port: int = 3517/);
});

test("instância: /api/instance se identifica; mesma biblioteca e versão reusa; outra biblioteca ou versão avisa", async () => {
  const deck = tempDeck();
  const studio = await startStudio(deck.file);
  try {
    const port = Number(new URL(studio.url).port);
    const found = await probeInstance(port);
    assert.equal(found.app, "sagadeck-studio");
    assert.equal(found.version, VERSION);
    assert.equal(found.pid, process.pid);
    assert.equal(path.resolve(found.library), path.resolve(studio.library));
    assert.equal(instanceDecision(found, { library: studio.library }).action, "reuse");
    assert.equal(instanceDecision(found, { library: path.join(studio.library, "outra") }).action, "conflict");
    assert.match(instanceDecision({ ...found, version: "0.0.1" }, { library: studio.library }).why, /outra versão/);
    assert.equal(instanceDecision(null, { library: studio.library }).action, "start");
    assert.equal(await probeInstance(9), null, "porta sem Studio");
    // o CLI na mesma porta e biblioteca: aponta para o aberto e sai, sem subir outro servidor
    const env = { ...process.env, SAGADECK_NO_RELAY: "1" };
    const { stdout } = await run(process.execPath, [path.join(ROOT, "bin", "sagadeck.js"), "studio", `--port=${port}`, `--library=${studio.library}`], { env, timeout: 20000 });
    assert.match(stdout, new RegExp(`já está aberto \\(processo ${process.pid}\\): http://127\\.0\\.0\\.1:${port}/`));
    // outra biblioteca: não abre por cima
    const r = await run(process.execPath, [path.join(ROOT, "bin", "sagadeck.js"), "studio", `--port=${port}`, `--library=${path.join(studio.library, "outra")}`], { env, timeout: 20000 }).catch((e) => e);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /outra biblioteca/);
  } finally { await studio.close(); deck.cleanup(); }
});
