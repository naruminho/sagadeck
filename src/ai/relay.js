// Studio em Node: sobe o `modelrelay serve` junto, como o sagadeck do pip já faz (python/sagadeck/llm.py).
// Só quando faz sentido: ninguém escutando na porta padrão, sem SAGADECK_LLM_URL e sem SAGADECK_NO_RELAY=1.
// A configuração (provedor, modelos, chave) continua sendo do modelrelay (~/.modelrelay/config.toml).
import net from "node:net";
import { spawn } from "node:child_process";

export const RELAY_PORT = 8765;

export function portOpen(port, host = "127.0.0.1", timeoutMs = 300) {
  return new Promise((resolve) => {
    const s = net.connect({ port, host });
    const done = (ok) => { s.destroy(); resolve(ok); };
    s.setTimeout(timeoutMs, () => done(false));
    s.once("connect", () => done(true));
    s.once("error", () => done(false));
  });
}

// o comando `modelrelay` (script do pip) e, se ele não estiver no PATH, o módulo pelo Python
const candidates = (port) => [
  ["modelrelay", ["serve", "--port", String(port)]],
  ["python", ["-m", "modelrelay.cli", "serve", "--port", String(port)]],
  ["python3", ["-m", "modelrelay.cli", "serve", "--port", String(port)]],
];

export async function startRelay({ env = process.env, port = RELAY_PORT, spawnFn = spawn, timeoutMs = 8000 } = {}) {
  if (env.SAGADECK_LLM_URL || env.SAGADECK_NO_RELAY === "1") return null;
  if (await portOpen(port)) return null; // já tem um rodando: o motor acha sozinho
  for (const [cmd, args] of candidates(port)) {
    let child;
    try { child = spawnFn(cmd, args, { stdio: "ignore", windowsHide: true, env }); } catch { continue; }
    const failed = await new Promise((resolve) => {
      let over = false;
      const finish = (v) => { if (!over) { over = true; clearInterval(poll); clearTimeout(limit); resolve(v); } };
      child.once?.("error", () => finish(true)); // comando não existe
      child.once?.("exit", () => finish(true)); // existe, mas sem o modelrelay ou com config inválida
      const poll = setInterval(async () => { if (await portOpen(port)) finish(false); }, 150);
      const limit = setTimeout(() => finish(true), timeoutMs);
    });
    if (failed) { try { child.kill?.(); } catch {} continue; }
    const stop = () => { try { child.kill?.(); } catch {} };
    return { url: `http://127.0.0.1:${port}/v1`, cmd, stop };
  }
  return null;
}
