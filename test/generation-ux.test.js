import "./isolate.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { extractDocText } from "../src/ai/context.js";
import { styleFor, generateDeck } from "../src/ai/deck-ai.js";
import { startMockLLM } from "./mock-llm.js";
import YAML from "yaml";

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(new URL("../src/studio/public/generation-guide.js", import.meta.url), "utf8"), sandbox);
const guide = sandbox.window.SagaGenerationGuide;

test("briefing livre continua livre; intenção técnica exige escolha explícita", () => {
  const original = "uma palestra de curl, seguida de programação, mantendo meus exemplos";
  assert.equal(guide.buildBriefing({ briefing: original }), original);
  assert.equal(guide.buildBriefing({ briefing: original, intent: "desconhecida" }), original);
  assert.equal(guide.buildBriefing({ audience: "devs", goal: "aprender" }), "", "público sozinho não informa o assunto");
});

test("público, objetivo e roteiro escolhido chegam ao pedido, com material técnico intacto", () => {
  const source = "curl https://api.exemplo.test/v1 \\\n  -H 'X-Exemplo: valor'\n\n\n{\"resultado\": \"linha  \"}\n";
  const result = guide.buildBriefing({ briefing: "Meu briefing original", intent: "apis", audience: "Time de backend", goal: "Diagnosticar erros", route: "demo", source });
  assert.ok(result.startsWith("Meu briefing original\n\n"));
  assert.match(result, /Direção escolhida pela pessoa: APIs com cURL/);
  assert.match(result, /Público informado: Time de backend/);
  assert.match(result, /Objetivo informado: Diagnosticar erros/);
  assert.match(result, /Roteiro preferido: apresente o problema/);
  assert.ok(result.endsWith(source), "não remove indentação, linhas vazias nem espaços do exemplo");
  assert.match(guide.buildBriefing({ source, intent: "programacao" }), /Transforme o material técnico/);
  assert.match(guide.buildBriefing({ hasMaterials: true }), /material anexado/);
});

test("os dois estilos técnicos resolvem tema e direção de geração", () => {
  for (const theme of ["terminal-pro", "aurora-dev"]) {
    assert.equal(styleFor(theme).theme, theme);
    assert.match(styleFor(theme).direction, /código/);
  }
});

test("geração transmite o briefing guiado e o estilo ao LLM e preserva o exemplo devolvido", async () => {
  const source = "async function dobro(n) {\n  return n * 2;\n}\n";
  const llm = await startMockLLM(() => "```yaml\n" + YAML.stringify({ title: "Workshop de código", theme: "terminal-pro", slides: [{ layout: "cover", title: "Workshop de código" }, { layout: "code", title: "Exemplo original", language: "javascript", code: source }, { layout: "end", title: "Pratique" }] }) + "```");
  process.env.SAGADECK_LLM_URL = llm.url;
  try {
    const briefing = guide.buildBriefing({ briefing: "Explique meu código", intent: "programacao", audience: "Iniciantes", route: "workshop", source });
    const generated = await generateDeck(briefing, { style: "terminal-pro", images: false, research: false });
    assert.equal(generated.spec.theme, "terminal-pro");
    assert.equal(generated.spec.slides[1].code, source);
    assert.ok(llm.requests.some((request) => request.lastUser.includes(briefing)));
    assert.ok(llm.requests.some((request) => request.lastUser.includes('Use o tema "terminal-pro"')));
  } finally { await llm.close(); }
});

test("anexos de programação preservam indentação, espaços e linhas em branco", async () => {
  const original = "\nasync function exemplo() {\n  const template = `linha  \n\n\n  seguinte`;\n  return template;\n}\n";
  for (const ext of ["js", "mjs", "cjs", "ts", "tsx", "jsx", "py", "sh", "bash", "ps1", "http", "sql", "go", "rs", "java", "c", "cpp", "h", "cs", "rb", "php", "html", "css"]) {
    const result = await extractDocText(`exemplo.${ext}`, Buffer.from(original));
    assert.equal(result.text, original, `.${ext}: o material técnico não pode ser reformatado`);
    assert.equal(result.detail, `código (.${ext})`);
  }
  for (const ext of ["json", "jsonc", "yaml", "yml"]) assert.equal((await extractDocText(`config.${ext}`, Buffer.from(original))).text, original, `.${ext}: não deve reformatar configuração`);
});
