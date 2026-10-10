// Os serviços do mapa desta máquina (~/.sagadeck/mapa.json, ou SAGADECK_MAPA): tiles do fundo, satélite, endereço↔
// coordenada, busca de lugares e rotas. Fora do código e fora da biblioteca, como a configuração da IA. Sem arquivo,
// valem os serviços públicos gratuitos (OpenStreetMap e companhia), com as regras de uso deles respeitadas pelo
// sagadeck (identificação, atribuição visível, um pedido por segundo no Nominatim, nada de baixar tiles fora da tela).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { renameRetry } from "./fs-retry.js";

export function mapaFile(env = process.env, home = os.homedir()) {
  return env.SAGADECK_MAPA || path.join(home, ".sagadeck", "mapa.json");
}

const OSM = "© colaboradores do OpenStreetMap";
export const MAP_DEFAULTS = {
  // fundo de ruas; "claro" e "escuro" são o mesmo fundo com filtro de cor (sem outro provedor)
  tiles: { url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", attribution: OSM, maxZoom: 19 },
  // satélite só com provedor configurado (costuma pedir chave); sem ele, o slide usa as ruas e avisa
  satelite: null,
  geocoder: { provedor: "nominatim", url: "https://nominatim.openstreetmap.org", porSegundo: 1 },
  busca: { provedor: "overpass", url: "https://overpass-api.de/api/interpreter" },
  rotas: { provedor: "osrm", url: "https://router.project-osrm.org" },
};

const str = (v, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const service = (raw, base) => {
  if (raw === null) return null;
  if (!raw || typeof raw !== "object") return base;
  const out = { ...(base || {}) };
  for (const [k, v] of Object.entries(raw)) if (typeof v === "string") out[k] = str(v, 1000); else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  return out.url ? out : base;
};

// a configuração que vale: o arquivo por cima do padrão, campo a campo (arquivo editado à mão não quebra nada)
export function loadMapConfig(file = mapaFile()) {
  let raw = {};
  try { raw = JSON.parse(fs.readFileSync(file, "utf8")) || {}; } catch { raw = {}; }
  return Object.fromEntries(Object.entries(MAP_DEFAULTS).map(([k, base]) => [k, service(raw[k], base)]));
}

// grava o que veio da tela Configurar mapa por cima do arquivo (campo a campo; chave em branco mantém a gravada),
// de forma atômica e só para quem é dono da conta (as chaves moram aqui)
export function saveMapConfig(patch, file = mapaFile()) {
  let cur = {};
  try { cur = JSON.parse(fs.readFileSync(file, "utf8")) || {}; } catch { cur = {}; }
  for (const [k, v] of Object.entries(patch || {})) {
    if (!(k in MAP_DEFAULTS)) continue;
    if (v === null) { cur[k] = null; continue; }
    if (!v || typeof v !== "object") continue;
    const next = { ...(cur[k] && typeof cur[k] === "object" ? cur[k] : {}) };
    for (const [f, x] of Object.entries(v)) {
      if (f === "key" && !String(x ?? "").trim()) continue; // em branco: mantém a chave gravada
      if (typeof x === "string") next[f] = str(x, 1000); else if (typeof x === "number" && Number.isFinite(x)) next[f] = x;
    }
    cur[k] = next;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(cur, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
  renameRetry(tmp, file);
  return loadMapConfig(file);
}

// para a tela: a chave nunca sai inteira
export function maskedMapConfig(cfg) {
  return Object.fromEntries(Object.entries(cfg).map(([k, v]) => {
    if (!v) return [k, v];
    const { key, ...rest } = v;
    return [k, { ...rest, keySet: !!key, keyHint: key ? `••••${String(key).slice(-4)}` : "" }];
  }));
}

// o que pode ir para dentro do HTML da apresentação: só o fundo (o navegador busca os tiles). Chave de rotas e de
// geocodificação nunca vai para o deck.
export function tilesForDeck(cfg = loadMapConfig()) {
  const pick = (t) => (t ? { url: t.url, attribution: t.attribution || OSM, maxZoom: t.maxZoom || 19 } : null);
  return { tiles: pick(cfg.tiles), satelite: pick(cfg.satelite) };
}
