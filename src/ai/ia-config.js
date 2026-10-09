// A IA desta máquina: provedor, chave e modelos, num arquivo fora do código e fora da biblioteca
// (~/.sagadeck/ia.json, ou SAGADECK_IA). Qualquer API compatível com a da OpenAI (OpenRouter, OpenAI, proxy da empresa);
// a pessoa configura pela tela do Studio (IA › Configurar) ou à mão, sem mexer no código.
//
// Antes isso morava num programa à parte (o modelrelay, em Python, rodando na porta 8765). Na primeira vez, a
// configuração dele (~/.modelrelay/config.toml) é trazida para cá, para ninguém perder a chave.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { renameRetry } from "../fs-retry.js";

export const PROVIDERS = {
  openrouter: { label: "OpenRouter", url: "https://openrouter.ai/api/v1", keyEnv: "OPENROUTER_API_KEY" },
  openai: { label: "OpenAI", url: "https://api.openai.com/v1", keyEnv: "OPENAI_API_KEY" },
};
// Recomendação para começar, mostrada na tela Configurar IA. Serve também de teste da instalação: se nem com ela a IA
// responde, o problema é o ambiente (rede, chave), não o modelo escolhido. Depois, cada um põe o modelo que quiser.
export const RECOMMENDED = {
  provider: "openrouter",
  models: { text: "deepseek/deepseek-v4.1-flash", vision: "deepseek/deepseek-v4.1-flash", image: "google/gemini-3.1-flash-image", search: "deepseek/deepseek-v4.1-flash:online" },
};
// os papéis que o sagadeck usa; cada um aponta para um modelo do provedor
export const ROLES = ["text", "vision", "image", "search"];

export function iaFile(env = process.env, home = os.homedir()) {
  return env.SAGADECK_IA || path.join(home, ".sagadeck", "ia.json");
}

const str = (v, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// só os campos conhecidos, cada um no tipo certo (arquivo editado à mão não quebra o Studio)
export function cleanIA(raw) {
  if (!raw || typeof raw !== "object") return null;
  const models = Object.fromEntries(ROLES.map((r) => [r, str(raw.models?.[r], 200)]).filter(([, v]) => v));
  const headers = raw.headers && typeof raw.headers === "object"
    ? Object.fromEntries(Object.entries(raw.headers).filter(([k, v]) => /^[\w-]+$/.test(k) && typeof v === "string").map(([k, v]) => [k, v.slice(0, 500)])) : {};
  const out = { provider: str(raw.provider, 40), url: str(raw.url).replace(/\/+$/, ""), key: str(raw.key, 1000), keyEnv: str(raw.keyEnv, 100), models };
  if (Object.keys(headers).length) out.headers = headers;
  if (str(raw.adaptador)) out.adaptador = str(raw.adaptador);
  return out.url || out.adaptador ? out : null;
}

export function loadIA(file = iaFile()) {
  try { return cleanIA(JSON.parse(fs.readFileSync(file, "utf8"))); } catch { return null; }
}

// grava de forma atômica, só para quem é dono da conta (a chave mora aqui)
export function saveIA(cfg, file = iaFile()) {
  const clean = cleanIA(cfg);
  if (!clean) throw new Error("Falta o endereço do provedor.");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(clean, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
  renameRetry(tmp, file);
  return clean;
}

// a chave que vale: a do arquivo ou a da variável de ambiente indicada
export function keyOf(cfg, env = process.env) {
  return cfg?.key || (cfg?.keyEnv ? env[cfg.keyEnv] || "" : "");
}

// para mostrar na tela: a chave nunca sai inteira
export function maskedIA(cfg, env = process.env) {
  if (!cfg) return null;
  const key = keyOf(cfg, env);
  const { key: _k, ...rest } = cfg;
  return { ...rest, keySet: !!key, keyHint: key ? `••••${key.slice(-4)}` : "", keyFrom: cfg.key ? "arquivo" : cfg.keyEnv && key ? "variável" : "" };
}

// ---- migração do modelrelay -------------------------------------------------------------------------------------
// Só o pedaço de TOML que a tela do modelrelay escrevia: [seções], chave = "texto" e comentários.
export function parseSimpleToml(text) {
  const out = { "": {} };
  let section = "";
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.replace(/^\s+|\s+$/g, "");
    if (!line || line.startsWith("#")) continue;
    const sec = /^\[([^\]]+)\]$/.exec(line);
    if (sec) { section = sec[1].trim(); out[section] ||= {}; continue; }
    const kv = /^("?)([^"=]+?)\1\s*=\s*"((?:[^"\\]|\\.)*)"\s*(#.*)?$/.exec(line);
    if (kv) out[section][kv[2].trim()] = kv[3].replace(/\\(["\\])/g, "$1");
  }
  return out;
}

// configuração do modelrelay → a desta máquina (provedor padrão, chave, modelos do sagadeck por cima dos gerais)
export function fromModelrelay(toml) {
  const t = parseSimpleToml(toml);
  const name = t[""].provider || Object.keys(t).find((k) => k.startsWith("providers."))?.slice(10);
  const p = (name && t[`providers.${name}`]) || {};
  if (!p.base_url) return null;
  const all = { ...(t.models || {}), ...(t["apps.sagadeck.models"] || {}) };
  const models = Object.fromEntries(ROLES.filter((r) => all[r]).map((r) => [r, all[r]]));
  return cleanIA({ provider: PROVIDERS[name] ? name : "outro", url: p.base_url, key: p.api_key || "", keyEnv: p.api_key_env || "", models });
}

// na primeira vez: sem ia.json e com o config.toml do modelrelay, traz a configuração (não sobrescreve nada)
export function migrateModelrelay({ file = iaFile(), home = os.homedir(), env = process.env } = {}) {
  if (fs.existsSync(file)) return null;
  const toml = env.MODELRELAY_CONFIG || path.join(home, ".modelrelay", "config.toml");
  let cfg;
  try { cfg = fromModelrelay(fs.readFileSync(toml, "utf8")); } catch { return null; }
  if (!cfg) return null;
  saveIA(cfg, file);
  return { from: toml, to: file };
}
