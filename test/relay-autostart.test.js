// O Studio em Node sobe o `modelrelay serve` junto, como o sagadeck do pip (python/sagadeck/llm.py): sem isso,
// "Revisar com IA" dizia "sem IA configurada" mesmo com o modelrelay instalado e configurado.
import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { EventEmitter } from "node:events";
import { startRelay } from "../src/ai/relay.js";

const freePort = () => new Promise((resolve) => { const s = net.createServer().listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => resolve(port)); }); });
// processo falso: "sobe" abrindo a porta pedida, ou falha como um comando que não existe
function fakeSpawn(plan, calls) {
  return (cmd, args) => {
    calls.push([cmd, ...args]);
    const child = new EventEmitter();
    child.kill = () => { child.killed = true; child.server?.close(); };
    const port = Number(args[args.indexOf("--port") + 1]);
    setTimeout(() => {
      const what = plan.shift();
      if (what === "enoent") child.emit("error", Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }));
      else if (what === "exit") child.emit("exit", 1);
      else child.server = net.createServer().listen(port, "127.0.0.1");
    }, 20);
    return child;
  };
}

test("modelrelay: sobe o serve quando está instalado e a porta está livre; tenta o python se o comando não existir", async () => {
  const port = await freePort(), calls = [];
  const r = await startRelay({ env: {}, port, spawnFn: fakeSpawn(["enoent", "ok"], calls), timeoutMs: 3000 });
  assert.ok(r, "subiu");
  assert.deepEqual(calls[0], ["modelrelay", "serve", "--port", String(port)]);
  assert.match(calls[1].join(" "), /-m modelrelay\.cli serve --port/);
  assert.equal(r.url, `http://127.0.0.1:${port}/v1`);
  r.stop();
});

test("modelrelay: não sobe nada se já tem um rodando, se SAGADECK_LLM_URL aponta outro lugar ou com SAGADECK_NO_RELAY", async () => {
  const port = await freePort();
  const running = net.createServer().listen(port, "127.0.0.1");
  await new Promise((r) => running.once("listening", r));
  const calls = [];
  assert.equal(await startRelay({ env: {}, port, spawnFn: fakeSpawn(["ok"], calls) }), null);
  running.close();
  assert.equal(await startRelay({ env: { SAGADECK_LLM_URL: "http://x/v1" }, port, spawnFn: fakeSpawn(["ok"], calls) }), null);
  assert.equal(await startRelay({ env: { SAGADECK_NO_RELAY: "1" }, port, spawnFn: fakeSpawn(["ok"], calls) }), null);
  assert.deepEqual(calls, [], "nenhum processo");
});

test("modelrelay: sem modelrelay em lugar nenhum, segue sem IA (sem erro)", async () => {
  const port = await freePort(), calls = [];
  assert.equal(await startRelay({ env: {}, port, spawnFn: fakeSpawn(["enoent", "exit", "exit"], calls), timeoutMs: 1500 }), null);
  assert.equal(calls.length, 3, "modelrelay, python e python3");
});
