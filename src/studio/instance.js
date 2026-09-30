// Uma instância local do Studio: porta padrão única (CLI, npm run dev e o pacote Python) e identificação por
// /api/instance. Abrir o Studio de novo acha o que já está aberto (mesma biblioteca) e aponta para ele, em vez de
// subir um segundo servidor que disputa os mesmos arquivos.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_PORT = 3517;
export const VERSION = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json"), "utf8")).version;

// quem está na porta: { app: "sagadeck-studio", version, pid, library, ... } | null (ninguém ou outra coisa)
export async function probeInstance(port, host = "127.0.0.1") {
  const h = host === "0.0.0.0" ? "127.0.0.1" : host;
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
