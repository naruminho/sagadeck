// Pesquisa web no chat de um deck aberto, fase 2 (src/research/chat-research.js):
// conceito estável não pesquisa; dado recente pesquisa, cita e guarda;
// sem buscador ou com a web desligada avisa e nunca trava o chat.
// LLM e web falsos aqui; a decisão de verdade está no teste ao vivo.
import "./isolate.js"; // nunca as configurações de quem roda (test/isolate.js)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startMockLLM } from "./mock-llm.js";
import { maybeResearch } from "../src/research/chat-research.js";

function fakeWeb() {
  const calls = { search: [], fetch: [] };
  return {
    calls,
    search: async (q) => { calls.search.push(q); return [{ title: "Calendário oficial Marvel 2026", url: "https://marvel.example/calendario", snippet: "datas", date: "2026-09-01" }]; },
    fetch: async () => { calls.fetch.push("x"); return { text: "Em 2026 saem Vingadores 5 em maio e X-Men em novembro. ".repeat(10), detail: "página" }; },
  };
}

test("chat: conceito estável não pesquisa nem toca nos materiais", async () => {
  const llm = await startMockLLM(() => '{"pesquisar": false, "motivo": "conceito clássico", "buscas": []}');
  process.env.SAGADECK_LLM_URL = llm.url;
  try {
    const web = fakeWeb();
    const before = [{ name: "anexo.pdf", text: "conteúdo da pessoa" }];
    const r = await maybeResearch({ prompt: "explique hash table", materials: before, web });
    assert.equal(r.report.pesquisou, false);
    assert.equal(r.instruction, "");
    assert.deepEqual(r.materials, before);
    assert.deepEqual(web.calls.search, [], "nem abre a web");
  } finally { await llm.close(); }
});

test("chat: dado recente pesquisa, cita a fonte e guarda em contexto/pesquisa", async () => {
  const llm = await startMockLLM((req) => {
    const u = req.lastUser;
    if (/Decida se o que você JÁ SABE basta/.test(u)) return '{"pesquisar": true, "motivo": "calendário futuro", "academico": false, "buscas": ["marvel próximos filmes 2026"]}';
    if (/Escolha até \d+ fontes CONFIÁVEIS/.test(u)) return '{"fontes": [{"i": 1, "tipo": "oficial", "porque": "site oficial"}]}';
    if (/Tire desta fonte o que serve/.test(u)) return '{"resumo": "Calendário 2026.", "data": "2026-09", "fatos": [{"fato": "Vingadores 5 em maio", "trecho": "Vingadores 5 em maio"}]}';
    throw new Error("prompt inesperado");
  });
  process.env.SAGADECK_LLM_URL = llm.url;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sgd-chat-pesq-"));
  try {
    const steps = [];
    const r = await maybeResearch({ prompt: "calendário dos próximos filmes da Marvel", web: fakeWeb(), saveDir: dir, onProgress: (s) => steps.push(s) });
    assert.equal(r.materials.length, 1);
    assert.match(r.materials[0].name, /\[F1\]/);
    assert.match(r.instruction, /PESQUISA: as fontes/);
    assert.match(r.instruction, /references/);
    const notas = fs.readFileSync(path.join(dir, "contexto", "pesquisa", "notas.md"), "utf8");
    assert.match(notas, /\[F1\]/);
    assert.match(notas, /Vingadores 5/);
    assert.ok(steps.some((s) => /vou pesquisar/.test(s)) && steps.some((s) => /fonte\(s\) lida/.test(s)));
  } finally { await llm.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("chat: sem buscador não trava e avisa no prompt", async () => {
  const llm = await startMockLLM(() => '{"pesquisar": true, "motivo": "calendário futuro", "buscas": ["x"]}');
  process.env.SAGADECK_LLM_URL = llm.url;
  try {
    const web = { search: async () => { throw new Error("fetch failed"); }, fetch: async () => { throw new Error("fetch failed"); } };
    const r = await maybeResearch({ prompt: "calendário dos próximos filmes", web });
    assert.equal(r.report.offline, true);
    assert.match(r.instruction, /não foi possível/);
    assert.deepEqual(r.materials, []);
  } finally { await llm.close(); }
});

test("chat: SAGADECK_WEB=0 nem tenta a web", async () => {
  const llm = await startMockLLM(() => '{"pesquisar": true, "motivo": "calendário futuro", "buscas": ["x"]}');
  process.env.SAGADECK_LLM_URL = llm.url;
  const prev = process.env.SAGADECK_WEB;
  process.env.SAGADECK_WEB = "0";
  try {
    const web = fakeWeb();
    const r = await maybeResearch({ prompt: "calendário dos próximos filmes", web });
    assert.equal(r.report.offline, true);
    assert.deepEqual(web.calls.search, [], "web desligada: nenhuma busca");
    assert.match(r.instruction, /sem acesso à internet/);
  } finally { await llm.close(); if (prev === undefined) delete process.env.SAGADECK_WEB; else process.env.SAGADECK_WEB = prev; }
});
