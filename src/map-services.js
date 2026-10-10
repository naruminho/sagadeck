// Chamadas aos serviços do mapa (endereço↔coordenada, busca de lugares, rotas), feitas pelo servidor do Studio com a
// identificação do sagadeck (as políticas de uso pedem). Regras:
//  - uma tentativa e para: erro de autorização ou bloqueio (401, 403, 407, 429, recusa, certificado, tempo esgotado)
//    marca o serviço indisponível nesta execução, e nenhum pedido sai até alguém pedir "Tentar de novo";
//  - sem teste proativo: o estado começa "não usado" e só muda com uso de verdade;
//  - o estado de cada serviço vai para a IA (ela decide o que chamar) e para a tela Configurar mapa.
import { loadMapConfig, mapaFile } from "./map-config.js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const VERSION = (() => { try { return require("../package.json").version; } catch { return "?"; } })();
export const USER_AGENT = `sagadeck/${VERSION} (+https://github.com/naruminho/sagadeck)`;
export const SERVICES = { geocoder: "Endereço e coordenada", busca: "Busca de lugares", rotas: "Rotas" };

const state = new Map(); // serviço -> { status: "ok" | "bloqueado", motivo, quando }
export const serviceState = () => Object.fromEntries(Object.keys(SERVICES).map((k) => [k, state.get(k) || { status: "não usado" }]));
export const resetService = (k) => (k ? state.delete(k) : state.clear());

export class ServiceBlocked extends Error {
  constructor(service, motivo) { super(`${SERVICES[service] || service}: ${motivo}`); this.service = service; this.motivo = motivo; this.code = "MAP_SERVICE_BLOCKED"; }
}

const hhmm = () => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const BLOCK = { 401: "recusou a autorização (401)", 403: "recusou o acesso (403)", 407: "o proxy da rede pediu autenticação (407)", 429: "pediu para diminuir o ritmo (429)" };

// um pedido a um serviço; se ele estiver bloqueado, nem tenta
export async function callService(service, url, { method = "GET", headers = {}, body, timeoutMs = 15000, cfg = loadMapConfig(mapaFile()) } = {}) {
  const st = state.get(service);
  if (st?.status === "bloqueado") throw new ServiceBlocked(service, `${st.motivo}; não tentei de novo`);
  let res;
  try {
    res = await fetch(url, { method, body, headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...headers }, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    const motivo = e.name === "TimeoutError" ? "não respondeu a tempo" : /certificate|self[- ]signed|CERT/i.test(String(e.cause?.message || e.message)) ? "o certificado foi barrado pela rede" : "não foi possível conectar (a rede pode estar bloqueando)";
    state.set(service, { status: "bloqueado", motivo: `${motivo} às ${hhmm()}`, quando: Date.now() });
    throw new ServiceBlocked(service, motivo);
  }
  if (BLOCK[res.status]) {
    state.set(service, { status: "bloqueado", motivo: `${BLOCK[res.status]} às ${hhmm()}`, quando: Date.now() });
    throw new ServiceBlocked(service, BLOCK[res.status]);
  }
  if (!res.ok) throw new Error(`${SERVICES[service] || service}: HTTP ${res.status}`);
  state.set(service, { status: "ok", quando: Date.now() });
  return res;
}

// ---------------------------------------------------------------------------------------------- endereço -> ponto
// Nominatim (padrão) ou outro compatível com /search?format=jsonv2. Um pedido por vez, no ritmo do serviço
// (porSegundo; o Nominatim público aceita 1). O cache é de quem chama (o projeto guarda o seu).
export async function geocodeOne(q, { cfg = loadMapConfig(mapaFile()), signal } = {}) {
  const g = cfg.geocoder;
  const url = `${g.url.replace(/\/+$/, "")}/search?format=jsonv2&limit=1&addressdetails=0&q=${encodeURIComponent(q)}${g.key ? `&key=${encodeURIComponent(g.key)}` : ""}`;
  if (signal?.aborted) throw new Error("cancelado");
  const res = await callService("geocoder", url, { cfg });
  const list = await res.json();
  const hit = Array.isArray(list) ? list[0] : null;
  return hit ? { lat: Number(hit.lat), lon: Number(hit.lon), nome: hit.display_name || "" } : null;
}

export const geocodeInterval = (cfg = loadMapConfig(mapaFile())) => Math.max(1, Math.ceil(1000 / Math.max(0.1, Number(cfg.geocoder?.porSegundo) || 1)));
