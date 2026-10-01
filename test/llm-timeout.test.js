// Limites de tempo da chamada em streaming (src/ai/llm.js): o modelo pode pensar muito antes da 1ª palavra (o relay só
// manda os cabeçalhos aí) e uma resposta longa leva minutos chegando. Nenhum dos dois é falha: o que é falha é parar
// de chegar. Antes, SAGADECK_LLM_TIMEOUT era o tempo TOTAL da chamada e cortava o plano de uma aula grande no meio.
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { chat } from "../src/ai/llm.js";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// servidor SSE: espera `before` ms para mandar os cabeçalhos, depois um pedaço a cada `every` ms; `stallAt` trava ali
async function sse({ before = 0, every = 100, pieces = ["a", "b", "c"], stallAt = -1, stall = 0 } = {}) {
  const server = http.createServer(async (req, res) => {
    if (req.url.endsWith("/models")) { res.writeHead(200, { "Content-Type": "application/json" }); res.end('{"data":[{"id":"text"}]}'); return; }
    for await (const _ of req);
    await wait(before);
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    for (let i = 0; i < pieces.length; i++) {
      if (i === stallAt) await wait(stall);
      if (res.destroyed) return;
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: pieces[i] } }] })}\n\n`);
      await wait(every);
    }
    res.end("data: [DONE]\n\n");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${server.address().port}/v1`, close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }) };
}

test("streaming: demorar para começar e levar mais que o limite chegando não corta; parar de chegar corta, avisando", async () => {
  const saved = { ...process.env };
  process.env.SAGADECK_LLM_TIMEOUT = "1"; // 1 s sem chegar nada
  process.env.SAGADECK_LLM_FIRST_TIMEOUT = "4"; // 4 s até a 1ª palavra
  const slowStart = await sse({ before: 1600, every: 300, pieces: ["Pla", "no ", "com", "ple", "to", "!"] }); // ~3,4 s no total
  const stalls = await sse({ every: 100, pieces: ["co", "me", "ço"], stallAt: 2, stall: 2500 });
  try {
    process.env.SAGADECK_LLM_URL = slowStart.url;
    const got = [];
    const r = await chat([{ role: "user", content: "plano" }], { onDelta: (p) => got.push(p) });
    assert.equal(r.text, "Plano completo!", "pensou 1,6 s antes de começar e levou mais de 1 s chegando: veio inteiro");
    assert.equal(got.length, 6);
    process.env.SAGADECK_LLM_URL = stalls.url;
    await assert.rejects(chat([{ role: "user", content: "x" }], { onDelta: () => {} }), /interrompida \(nada chegou em 1 s\)/);
    process.env.SAGADECK_LLM_FIRST_TIMEOUT = "1";
    process.env.SAGADECK_LLM_URL = slowStart.url;
    await assert.rejects(chat([{ role: "user", content: "x" }], { onDelta: () => {} }), /não começou a responder em 1 s/);
  } finally {
    await slowStart.close(); await stalls.close();
    for (const k of ["SAGADECK_LLM_TIMEOUT", "SAGADECK_LLM_FIRST_TIMEOUT", "SAGADECK_LLM_URL"]) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; }
  }
});
