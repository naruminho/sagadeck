// WebSocket mínimo: handshake, texto, binário, mensagens grandes, cabeçalhos e recusa.
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { connectWs, acceptWs } from "../src/ws.js";

async function echoServer(check = () => true) {
  const seen = { headers: null }, sockets = new Set();
  const server = http.createServer((q, r) => { r.writeHead(404); r.end(); });
  server.on("upgrade", (req, socket) => {
    seen.headers = req.headers;
    sockets.add(socket);
    if (!check(req)) { socket.end("HTTP/1.1 401 Unauthorized\r\nContent-Length: 13\r\n\r\ntoken inválido"); return; }
    const ws = acceptWs(req, socket);
    ws.on("message", (m, isText) => ws.send(isText ? `eco: ${m}` : Buffer.concat([Buffer.from("B:"), m])));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { url: `ws://127.0.0.1:${server.address().port}/rt?x=1`, seen, close: () => new Promise((r) => { sockets.forEach((x) => x.destroy()); server.close(r); }) };
}

test("conecta com cabeçalhos, troca texto e binário, inclusive mensagem grande", async () => {
  const srv = await echoServer();
  try {
    const ws = await connectWs(srv.url, { headers: { Authorization: "Bearer abc" } });
    assert.equal(srv.seen.headers.authorization, "Bearer abc");
    const got = [];
    ws.on("message", (m, isText) => got.push(isText ? m : `bin:${m.length}`));
    ws.send("oi");
    ws.send(Buffer.from([1, 2, 3]));
    ws.send("x".repeat(200000)); // > 65535: comprimento de 64 bits
    await new Promise((r) => { const iv = setInterval(() => { if (got.length === 3) { clearInterval(iv); r(); } }, 10); });
    assert.equal(got[0], "eco: oi");
    assert.equal(got[1], "bin:5");
    assert.equal(got[2].length, 200005);
    ws.close();
  } finally { await srv.close(); }
});

test("recusa do serviço vira erro com o status e o motivo", async () => {
  const srv = await echoServer(() => false);
  try {
    await assert.rejects(connectWs(srv.url), /recusou a conexão \(HTTP 401\).*token inválido/);
    await assert.rejects(connectWs("https://x/y"), /precisa de ws:\/\/ ou wss:\/\//);
  } finally { await srv.close(); }
});

test("o outro lado derruba a conexão: vira 'close' (não derruba o processo)", async () => {
  const srv = await echoServer();
  try {
    const ws = await connectWs(srv.url);
    const closed = new Promise((r) => ws.on("close", (code) => r(code)));
    await srv.close(); // destrói o socket do servidor no meio da conversa
    assert.equal(await closed, 1006);
  } finally { await srv.close().catch(() => {}); }
});
