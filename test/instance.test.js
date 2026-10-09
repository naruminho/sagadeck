// Uma instância local do Studio: porta padrão única, identificação por /api/instance e nada de abrir um segundo
// servidor sobre a mesma biblioteca (o CLI aponta para o que já está aberto).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { DEFAULT_PORT, VERSION, probeInstance, instanceDecision, buildInfo } from "../src/studio/instance.js";
import { startStudio, tempDeck, ROOT } from "./helpers.js";

const run = promisify(execFile);

test("porta padrão única: CLI e npm run dev", () => {
  assert.equal(DEFAULT_PORT, 3517);
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  assert.equal(pkg.scripts.dev, "node bin/sagadeck.js studio", "npm run dev usa o padrão do CLI");
  assert.match(fs.readFileSync(path.join(ROOT, "bin", "sagadeck.js"), "utf8"), /flags\.port \|\| process\.env\.PORT \|\| DEFAULT_PORT/);
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
    assert.match(found.commit, /^([0-9a-f]{4,40}|empacotado)$/, "carimbo do código rodando");
    const info = buildInfo();
    assert.equal(info.version, VERSION);
    assert.match(info.commit, /^([0-9a-f]{4,40}|empacotado)$/);
    assert.ok(!Number.isNaN(Date.parse(info.started)));
    assert.equal(info.pid, process.pid);
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

// A primeira linha do `sagadeck studio` é o endereço do Studio (a página que a pessoa abre). Antes vinha primeiro o
// endereço de um serviço de IA à parte e um agente abriu a página errada (e depois criou uma interface do zero).
test("sagadeck studio: a primeira linha é o endereço do Studio; a IA não configurada diz onde configurar", async () => {
  const { spawn } = await import("node:child_process");
  const os = await import("node:os");
  const lib = fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-banner-"));
  const net = await import("node:net");
  const port = await new Promise((r) => { const s = net.createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => r(p)); }); });
  const env = { ...process.env };
  delete env.SAGADECK_LLM_URL;
  const child = spawn(process.execPath, [path.join(ROOT, "bin", "sagadeck.js"), "studio", `--port=${port}`, `--library=${lib}`], { env });
  try {
    let out = "";
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`sem saída: ${out}`)), 20000);
      child.stdout.on("data", (d) => { out += d; if (/processo \d+/.test(out)) { clearTimeout(timer); resolve(); } });
      child.on("exit", (c) => reject(new Error(`saiu (${c}): ${out}`)));
    });
    const lines = out.trim().split(/\r?\n/);
    assert.match(lines[0], new RegExp(`SagaDeck Studio .* pronto\. Abra no navegador: http://127\.0\.0\.1:${port}/`));
    assert.match(out, /IA: não configurada\. No Studio, clique em IA desligada \(ou Configurar IA na biblioteca\)/);
    assert.doesNotMatch(out, /8765|modelrelay/);
  } finally { child.kill(); fs.rmSync(lib, { recursive: true, force: true }); }
});

test("SKILL.md (o que os agentes leem): porta certa, instalação pelo npm e a regra de nunca criar interface própria", () => {
  const skill = fs.readFileSync(path.join(ROOT, "SKILL.md"), "utf8");
  assert.match(skill, new RegExp(`http://127\.0\.0\.1:${DEFAULT_PORT}`));
  assert.match(skill, new RegExp(`--port=${DEFAULT_PORT}`));
  assert.doesNotMatch(skill, /--port=(?!3517)\d+/, "nenhuma outra porta");
  assert.match(skill, /npm install -g sagadeck/);
  assert.doesNotMatch(skill, /pip install|import sagadeck|modelrelay|8765/);
  assert.match(skill, /Nunca crie uma página, um servidor ou uma interface própria/);
  assert.match(skill, /Configurar IA/);
});

// Primeiro uso: `sagadeck studio` abre o navegador sozinho (quem instalou não precisa achar o endereço), mas não num
// serviço, num teste, na CI, no servidor sem tela ou com --sem-navegador.
test("abrir o navegador: só para quem está no terminal; nunca em serviço, teste, CI, multiusuário ou servidor sem tela", async () => {
  const { shouldOpenBrowser, openBrowser } = await import("../src/studio/open-browser.js");
  const base = { env: {}, isTTY: true, platform: "win32" };
  assert.equal(shouldOpenBrowser(base), true);
  assert.equal(shouldOpenBrowser({ ...base, isTTY: false }), false, "serviço/teste: sem terminal");
  assert.equal(shouldOpenBrowser({ ...base, env: { CI: "true" } }), false);
  assert.equal(shouldOpenBrowser({ ...base, multiuser: true }), false);
  assert.equal(shouldOpenBrowser({ ...base, flags: { "sem-navegador": true } }), false);
  assert.equal(shouldOpenBrowser({ ...base, env: { SAGADECK_NO_BROWSER: "1" } }), false);
  assert.equal(shouldOpenBrowser({ ...base, platform: "linux" }), false, "Linux sem tela (servidor)");
  assert.equal(shouldOpenBrowser({ ...base, platform: "linux", env: { DISPLAY: ":0" } }), true);
  const calls = [];
  const spawnFn = (cmd, args) => { calls.push([cmd, ...args]); return { on() {}, unref() {} }; };
  openBrowser("http://127.0.0.1:3517/", { platform: "win32", spawnFn });
  openBrowser("http://127.0.0.1:3517/", { platform: "darwin", spawnFn });
  openBrowser("http://127.0.0.1:3517/", { platform: "linux", spawnFn });
  assert.deepEqual(calls, [["cmd", "/c", "start", "", "http://127.0.0.1:3517/"], ["open", "http://127.0.0.1:3517/"], ["xdg-open", "http://127.0.0.1:3517/"]]);
});

test("`sagadeck` sozinho começa dizendo por onde começar (sagadeck studio), antes da lista de comandos", async () => {
  const { stdout } = await run(process.execPath, [path.join(ROOT, "bin", "sagadeck.js")], { timeout: 20000 });
  const lines = stdout.split(/\r?\n/).filter((l) => l.trim());
  assert.match(lines[1], /Para começar:\s+sagadeck studio/);
  assert.match(stdout, /http:\/\/127\.0\.0\.1:3517/);
  assert.ok(stdout.indexOf("Para começar") < stdout.indexOf("Todos os comandos"));
});
