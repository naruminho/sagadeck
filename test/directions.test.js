import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadDirections, saveDirection, directionPrompt } from "../src/ai/directions.js";

const envFor = (dir) => ({ ...process.env, SAGADECK_DIRECOES: path.join(dir, "direcoes.json") });

test("direções aprovadas: salva, lista e entra no prompt; arquivo ruim não quebra", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "saga-dir-"));
  const env = envFor(dir);
  try {
    assert.equal(directionPrompt(env), "", "sem arquivo, sem trecho");
    assert.deepEqual(loadDirections(env).directions, {});
    assert.equal(saveDirection("Stark dourado", { theme: "noite", palette: "luzquente", tone: "dark", ambient: "pontos", notes: "x".repeat(600) }, env), "Stark dourado");
    const d = loadDirections(env).directions["Stark dourado"];
    assert.equal(d.theme, "noite");
    assert.equal(d.notes.length, 500, "nota aparada");
    const p = directionPrompt(env);
    assert.match(p, /Stark dourado/);
    assert.match(p, /theme noite/);
    assert.match(p, /palette luzquente/);
    assert.throws(() => saveDirection("", {}, env), /nome/i);
    assert.throws(() => saveDirection("a/b", {}, env), /inválido/);
    fs.writeFileSync(env.SAGADECK_DIRECOES, "[[[quebrado");
    assert.deepEqual(loadDirections(env).directions, {});
    assert.match(loadDirections(env).error || "", /erro/);
    assert.equal(directionPrompt(env), "", "com erro, some do prompt em vez de vazar");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
