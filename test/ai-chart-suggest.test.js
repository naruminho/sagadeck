// Tabela colada no chat pedindo gráfico: a IA sugere tipos com prévia (variants),
// em vez de montar um chart direto. Regra no prompt + encanamento das variants.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { startMockLLM } from "./mock-llm.js";
import { ROOT } from "./helpers.js";

const base = () => ({ title: "Deck", theme: "bauhaus", slides: [{ layout: "cover", title: "Capa" }] });
const VARIANTS = ["Sugiro três jeitos de mostrar.", "```yaml", "variants:", "  after: 1",
  "  options:",
  "    - label: Barras",
  "      slide: { layout: chart, title: Vendas, chart: { type: bar, data: [{label: A, value: 10}, {label: B, value: 20}] } }",
  "    - label: Linhas",
  "      slide: { layout: chart, title: Vendas, chart: { type: line, labels: [A, B], series: [{name: Total, values: [10, 20]}] } }",
  "    - label: Pizza",
  "      slide: { layout: chart, title: Vendas, chart: { type: donut, parts: [{label: A, value: 10}, {label: B, value: 20}] } }",
  "```"].join("\n");

test("tabela colada: a regra de sugerir tipos com prévia está no prompt e na referência", async () => {
  const llm = await startMockLLM(() => VARIANTS);
  process.env.SAGADECK_LLM_URL = llm.url;
  try {
    const { editDeck } = await import("../src/ai/deck-ai.js");
    await editDeck({ spec: base(), instruction: "A\t10\nB\t20\nfaz um gráfico disso" });
    const sys = llm.requests[0].system;
    assert.match(sys, /Tabela colada.*variants/s);
    const ref = fs.readFileSync(path.join(ROOT, "docs", "REFERENCIA.md"), "utf8");
    assert.match(ref, /sugere com prévia/);
  } finally { await llm.close(); }
});

test("tabela colada: variants com 3 tipos de gráfico nos mesmos dados", async () => {
  const llm = await startMockLLM(() => VARIANTS);
  process.env.SAGADECK_LLM_URL = llm.url;
  try {
    const { editDeck } = await import("../src/ai/deck-ai.js");
    const r = await editDeck({ spec: base(), instruction: "A\t10\nB\t20\nfaz um gráfico disso" });
    assert.equal(r.variants.options.length, 3);
    assert.deepEqual(r.variants.options.map((o) => o.label), ["Barras", "Linhas", "Pizza"]);
    assert.ok(r.variants.options.every((o) => o.slide.layout === "chart"), "todas são gráfico");
    assert.deepEqual(r.spec.slides.length, 1, "nada muda até escolher");
  } finally { await llm.close(); }
});
