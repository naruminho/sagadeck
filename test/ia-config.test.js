// Configuração da IA desta máquina (src/ai/ia-config.js): fora do código, com a chave protegida, e a migração do
// modelrelay antigo (~/.modelrelay/config.toml) para ninguém perder a chave ao atualizar.
import "./isolate.js"; // nunca as configurações de quem roda (test/isolate.js)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cleanIA, loadIA, saveIA, maskedIA, keyOf, fromModelrelay, migrateModelrelay, parseSimpleToml } from "../src/ai/ia-config.js";
import { llmConfig, resolveModel, llmConfigured } from "../src/ai/llm.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-ia-"));

// o config.toml como a tela do modelrelay gravava (o desta máquina, com a chave numa variável de ambiente)
const TOML = `# modelrelay: salvo pela tela de configuração em 2026-10-03 01:46 (o anterior fica em .bak).
provider = "openrouter"

[providers.openrouter]
base_url = "https://openrouter.ai/api/v1"
api_key_env = "OPENROUTER_API_KEY"

[models]
text = "deepseek/deepseek-v4.1-flash"
image = "google/gemini-3.1-flash-image"
"gemini-2.5-flash" = "google/gemini-2.5-flash"

[apps.wotan.models]
text = "outro/modelo"

[apps.sagadeck.models]
text = "deepseek/deepseek-v4.1-flash"
vision = "deepseek/deepseek-v4.1-flash"
search = "deepseek/deepseek-v4.1-flash:online"
`;

test("modelrelay → configuração do sagadeck: provedor, chave pela variável e os modelos do sagadeck por cima dos gerais", () => {
  assert.equal(parseSimpleToml(TOML)["providers.openrouter"].base_url, "https://openrouter.ai/api/v1");
  const cfg = fromModelrelay(TOML);
  assert.deepEqual(cfg, { provider: "openrouter", url: "https://openrouter.ai/api/v1", key: "", keyEnv: "OPENROUTER_API_KEY",
    models: { text: "deepseek/deepseek-v4.1-flash", vision: "deepseek/deepseek-v4.1-flash", image: "google/gemini-3.1-flash-image", search: "deepseek/deepseek-v4.1-flash:online" } });
  assert.equal(fromModelrelay('provider = "x"\n'), null, "sem endereço, nada a trazer");
});

test("migração: uma vez, sem sobrescrever; a chave da variável de ambiente vale e nunca volta inteira para a tela", () => {
  const dir = tmp(), file = path.join(dir, "ia.json"), toml = path.join(dir, "config.toml");
  fs.writeFileSync(toml, TOML);
  const env = { MODELRELAY_CONFIG: toml, OPENROUTER_API_KEY: "sk-or-segredo-1234" };
  assert.deepEqual(migrateModelrelay({ file, env }), { from: toml, to: file });
  assert.equal(migrateModelrelay({ file, env }), null, "já existe: não mexe");
  const cfg = loadIA(file);
  assert.equal(keyOf(cfg, env), "sk-or-segredo-1234");
  const shown = maskedIA(cfg, env);
  assert.equal(shown.keyHint, "••••1234");
  assert.equal(shown.keyFrom, "variável");
  assert.ok(!JSON.stringify(shown).includes("segredo"), "a chave não sai inteira");
  // a do arquivo vence a da variável; arquivo é só de quem é dono (onde o sistema deixa)
  saveIA({ ...cfg, key: "sk-arquivo-9999" }, file);
  assert.equal(keyOf(loadIA(file), env), "sk-arquivo-9999");
  if (process.platform !== "win32") assert.equal(fs.statSync(file).mode & 0o077, 0, "sem leitura para outros");
  assert.equal(cleanIA({ url: "" }), null, "sem endereço não é configuração");
});

test("llmConfig: a configuração da máquina vira endereço, chave e modelos; variáveis de ambiente valem por cima", () => {
  const dir = tmp(), file = path.join(dir, "ia.json");
  saveIA({ provider: "openrouter", url: "https://openrouter.ai/api/v1/", key: "sk-1", models: { text: "a/texto", image: "a/imagem", search: "a/texto:online" } }, file);
  const cfg = llmConfig({ SAGADECK_IA: file, MODELRELAY_CONFIG: path.join(dir, "nada.toml") });
  assert.equal(cfg.url, "https://openrouter.ai/api/v1");
  assert.equal(cfg.key, "sk-1");
  assert.equal(cfg.source, "arquivo");
  assert.equal(resolveModel(cfg, "text"), "a/texto");
  assert.equal(resolveModel(cfg, "vision"), "a/texto", "sem modelo de visão: o de texto");
  assert.equal(resolveModel(cfg, "search"), "a/texto:online");
  assert.equal(resolveModel(cfg, "outro/modelo"), "outro/modelo");
  const env = llmConfig({ SAGADECK_IA: file, SAGADECK_LLM_URL: "http://127.0.0.1:1/v1" });
  assert.equal(env.url, "http://127.0.0.1:1/v1");
  assert.equal(env.source, "variável");
  assert.equal(resolveModel(env, "text"), "text", "por variável, os nomes passam como vieram");
  assert.equal(llmConfigured(llmConfig({ SAGADECK_IA: path.join(dir, "nao-existe.json"), MODELRELAY_CONFIG: path.join(dir, "nada.toml") })), false, "sem nada: IA desligada");
});
