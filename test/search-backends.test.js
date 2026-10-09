// Buscadores da fase 3 (wikipedia sem chave, brave com chave, cadeia configurável).
// Sem rede de verdade: fetch global e env são falsos e restaurados.
import "./isolate.js"; // nunca as configurações de quem roda (test/isolate.js)
import { test } from "node:test";
import assert from "node:assert/strict";
import { searchWikipedia } from "../src/research/wikipedia.js";
import { searchBrave } from "../src/research/brave.js";
import { searchChain, defaultWeb } from "../src/research/research.js";

const realFetch = globalThis.fetch;
const realBackends = process.env.SAGADECK_SEARCH_BACKENDS;
const realBrave = process.env.BRAVE_SEARCH_KEY;
const restore = () => {
  globalThis.fetch = realFetch;
  if (realBackends === undefined) delete process.env.SAGADECK_SEARCH_BACKENDS; else process.env.SAGADECK_SEARCH_BACKENDS = realBackends;
  if (realBrave === undefined) delete process.env.BRAVE_SEARCH_KEY; else process.env.BRAVE_SEARCH_KEY = realBrave;
};

test("wikipedia entende o opensearch e tenta inglês quando o português vem vazio", async () => {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    const empty = /pt\.wikipedia/.test(url);
    return { ok: true, json: async () => empty ? ["x", [], [], []] : ["x", ["Marvel Cinematic Universe"], ["Shared media franchise"], ["https://en.wikipedia.org/wiki/X"]] };
  };
  try {
    const r = await searchWikipedia("marvel filmes");
    assert.equal(r.length, 1);
    assert.equal(r[0].url, "https://en.wikipedia.org/wiki/X");
    assert.ok(calls.some((u) => /pt\.wikipedia/.test(u)) && calls.some((u) => /en\.wikipedia/.test(u)));
  } finally { restore(); }
});

test("brave sem chave é pulado sem nem chamar a rede", async () => {
  let called = false;
  globalThis.fetch = async () => { called = true; throw new Error("não devia chamar"); };
  delete process.env.BRAVE_SEARCH_KEY;
  try {
    assert.deepEqual(await searchBrave("x"), []);
    assert.equal(called, false);
  } finally { restore(); }
});

test("cadeia padrão e por env (desconhecido é ignorado)", async () => {
  delete process.env.SAGADECK_SEARCH_BACKENDS;
  assert.deepEqual(searchChain(), ["llm", "duckduckgo", "wikipedia"]);
  process.env.SAGADECK_SEARCH_BACKENDS = "brave, nada, wikipedia";
  assert.deepEqual(searchChain(), ["brave", "wikipedia"]);
  restore();
});

test("busca esgotada diz qual backend falhou", async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => ["x", [], [], []] });
  process.env.SAGADECK_SEARCH_BACKENDS = "wikipedia";
  try {
    await assert.rejects(defaultWeb.search("tema impossível"), /wikipedia: nenhum resultado/);
  } finally { restore(); }
});
