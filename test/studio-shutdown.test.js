// O Studio sai em segundos quando o sistema pede para parar (SIGTERM do systemd ao reiniciar). Antes, depois de abrir
// o Chrome uma vez (miniaturas, exportação), o tratador de SIGTERM do Playwright só fechava o navegador e o processo
// ficava de pé: no servidor, cada reinício ficava 90 s fora do ar até o SIGKILL, matando o que estivesse rodando.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { installShutdown } from "../src/studio/shutdown.js";
import { ROOT, browserOrSkip } from "./helpers.js";

const freePort = () => new Promise((resolve) => { const s = net.createServer().listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => resolve(port)); }); });
const get = (url) => new Promise((resolve, reject) => http.get(url, (res) => { res.resume(); res.on("end", () => resolve(res.statusCode)); }).on("error", reject));

test("parada: conexão em uso tem um prazo para terminar; depois do prazo, corta e sai", async () => {
  const server = http.createServer((req, res) => { res.writeHead(200); res.write("começo"); if (req.url === "/rapido") setTimeout(() => res.end("fim"), 200); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  const exits = [], logs = [];
  let closed = 0;
  const { stop, uninstall } = installShutdown(server, { grace: 600, exit: (c) => exits.push(c), log: (m) => logs.push(m), closeBrowsers: async () => { closed++; } });
  try {
    // uma resposta que termina dentro do prazo chega inteira
    const body = new Promise((resolve) => http.get(`http://127.0.0.1:${port}/rapido`, (res) => { let s = ""; res.on("data", (d) => (s += d)); res.on("end", () => resolve(s)); }));
    await new Promise((r) => setTimeout(r, 50));
    const t0 = Date.now();
    const parado = stop("SIGTERM");
    assert.equal(await body, "começofim");
    await parado;
    assert.ok(Date.now() - t0 < 500, "não espera o prazo inteiro quando nada mais está em uso");
    assert.deepEqual(exits, [0]);
    assert.equal(closed, 1, "fecha o Chrome das miniaturas");
    assert.match(logs[0], /SIGTERM: parando o Studio/);
  } finally { uninstall(); server.closeAllConnections(); server.close(); }

  // uma resposta que nunca termina (a IA ao vivo, pendurada) é cortada no fim do prazo
  const s2 = http.createServer((req, res) => { res.writeHead(200); res.write("sem fim"); });
  await new Promise((r) => s2.listen(0, "127.0.0.1", r));
  const ex2 = [];
  const h2 = installShutdown(s2, { grace: 400, exit: (c) => ex2.push(c), log: () => {}, closeBrowsers: async () => {} });
  try {
    const ended = new Promise((resolve) => http.get(`http://127.0.0.1:${s2.address().port}/`, (res) => { res.on("data", () => {}); res.on("close", resolve); res.on("error", resolve); }).on("error", resolve));
    await new Promise((r) => setTimeout(r, 50));
    const t0 = Date.now();
    await h2.stop("SIGTERM");
    await ended;
    const dt = Date.now() - t0;
    assert.ok(dt >= 350 && dt < 2000, `cortou no fim do prazo (${dt} ms)`);
    assert.deepEqual(ex2, [0]);
  } finally { h2.uninstall(); s2.close(); }
});

// No Windows, um SIGTERM mandado por outro processo mata na hora (não há como tratar): o caso é o do servidor Linux.
test("parada: o Studio de verdade sai em segundos com SIGTERM, mesmo depois de abrir o Chrome", { timeout: 120000, skip: process.platform === "win32" && "no Windows o SIGTERM mata na hora" }, async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  await browser.close();
  const port = await freePort();
  const lib = fs.mkdtempSync(path.join(os.tmpdir(), "sgd-parada-"));
  const child = spawn(process.execPath, [path.join(ROOT, "bin", "sagadeck.js"), "studio", "--no-open", `--port=${port}`, `--library=${lib}`], { env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  child.stdout.on("data", (d) => (out += d)); child.stderr.on("data", (d) => (out += d));
  const exited = new Promise((resolve) => child.on("exit", (code, signal) => resolve({ code, signal })));
  try {
    for (const t0 = Date.now(); !out.includes(`127.0.0.1:${port}`) && Date.now() - t0 < 30000;) await new Promise((r) => setTimeout(r, 100));
    assert.match(out, new RegExp(`127\\.0\\.0\\.1:${port}`), out);
    // a capa de um modelo da vitrine: abre o Chrome das miniaturas (e com ele o tratador de SIGTERM do Playwright)
    assert.equal(await get(`http://127.0.0.1:${port}/api/library/gallery-cover?key=model-executivo`), 200);
    const t0 = Date.now();
    child.kill("SIGTERM");
    const r = await Promise.race([exited, new Promise((resolve) => setTimeout(() => resolve(null), 15000))]);
    assert.ok(r, `não saiu em 15 s depois do SIGTERM:\n${out}`);
    assert.deepEqual(r, { code: 0, signal: null }, out);
    assert.ok(Date.now() - t0 < 10000);
    assert.match(out, /SIGTERM: parando o Studio/);
  } finally { if (child.exitCode === null) child.kill("SIGKILL"); fs.rmSync(lib, { recursive: true, force: true }); }
});
