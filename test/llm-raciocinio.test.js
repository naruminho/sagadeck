// Tarefa de olhar (conferir um slide, achar um destaque na figura) vai sem raciocínio: com ele, o modelo de visão
// pensava até estourar o limite (16 mil tokens) e não escrevia nada; sem ele, a mesma conferência sai em 2 s.
// Provedor que não conhece o campo recusa com 400: a chamada vai de novo sem ele, e o sagadeck lembra.
import "./isolate.js"; // nunca as configurações de quem roda (test/isolate.js)
import { test } from "node:test";
import assert from "node:assert/strict";
import { startMockLLM } from "./mock-llm.js";
import { chat } from "../src/ai/llm.js";

test("think: false pede a resposta sem raciocínio; sem a opção, o pedido vai como sempre", async () => {
  const llm = await startMockLLM(() => "ok");
  process.env.SAGADECK_LLM_URL = llm.url;
  try {
    await chat([{ role: "user", content: "oi" }], { think: false });
    await chat([{ role: "user", content: "oi" }], { think: false, onDelta: () => {} });
    await chat([{ role: "user", content: "oi" }]);
    assert.deepEqual(llm.requests.map((q) => q.body.reasoning), [{ enabled: false }, { enabled: false }, undefined]);
  } finally { await llm.close(); delete process.env.SAGADECK_LLM_URL; }
});

test("provedor que recusa o campo de raciocínio: vai de novo sem ele e as próximas chamadas já vão sem", async () => {
  const llm = await startMockLLM((req) => (req.body.reasoning ? { status: 400, error: "Unrecognized request argument supplied: reasoning" } : "resposta"));
  process.env.SAGADECK_LLM_URL = llm.url;
  try {
    assert.equal((await chat([{ role: "user", content: "oi" }], { think: false })).text, "resposta");
    assert.equal((await chat([{ role: "user", content: "oi" }], { think: false })).text, "resposta");
    assert.deepEqual(llm.requests.map((q) => !!q.body.reasoning), [true, false, false]);
  } finally { await llm.close(); delete process.env.SAGADECK_LLM_URL; }
});
