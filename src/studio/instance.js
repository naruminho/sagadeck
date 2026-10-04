// Uma instância local do Studio: porta padrão única (CLI, npm run dev e o pacote Python) e identificação por
// /api/instance. Abrir o Studio de novo acha o que já está aberto (mesma biblioteca) e aponta para ele, em vez de
// subir um segundo servidor que disputa os mesmos arquivos.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

export const DEFAULT_PORT = 3517;
// a versão: o package.json mais perto (no repositório, dois níveis acima; no motor empacotado do pip, ao lado)
export const VERSION = (() => {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let k = 0; k < 4; k++, dir = path.dirname(dir)) {
    try { const v = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).version; if (v) return v; } catch {}
  }
  return "0.0.0";
})();

// carimbo do código rodando (para o "é antigão?" nunca mais): versão + commit curto + início.
// fora de um clone git (pacote instalado), commit vira "empacotado".
export function buildInfo({ exec = null } = {}) {
  let commit = "empacotado";
  try {
    commit = String(execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: path.dirname(fileURLToPath(import.meta.url)), stdio: ["ignore", "pipe", "ignore"], timeout: 5000 }).toString().trim() || "empacotado");
  } catch { /* sem git por perto */ }
  if (exec) commit = String(exec);
  if (!/^[0-9a-f]{4,40}$/.test(commit)) commit = "empacotado";
  return { version: VERSION, commit, started: new Date().toISOString(), pid: process.pid };
}

// quem está na porta: { app: "sagadeck-studio", version, pid, library, ... } | null (ninguém ou outra coisa)
export async function probeInstance(port, host = "127.0.0.1") {  const h = host === "0.0.0.0" ? "127.0.0.1" : host;
  try {
    const r = await fetch(`http://${h.includes(":") ? `[${h}]` : h}:${port}/api/instance`, { signal: AbortSignal.timeout(1500) });
    if (!r.ok) return null;
    const j = await r.json();
    return j?.app === "sagadeck-studio" ? j : null;
  } catch { return null; }
}

// o que fazer com a instância achada: reusar (mesma biblioteca e versão) ou avisar
export function instanceDecision(found, { library, version = VERSION }) {
  if (!found) return { action: "start" };
  const same = (a, b) => path.resolve(a || "").toLowerCase() === path.resolve(b || "").toLowerCase();
  if (!same(found.library, library)) return { action: "conflict", why: `outra biblioteca (${found.library})` };
  if (found.version !== version) return { action: "conflict", why: `outra versão (${found.version}; esta é ${version}): feche a aberta (processo ${found.pid}) e abra de novo` };
  return { action: "reuse" };
}
