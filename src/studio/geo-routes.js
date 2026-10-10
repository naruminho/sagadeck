// Rotas do mapa no Studio: a tela Configurar mapa (serviços desta máquina; a chave nunca volta inteira), o estado de
// cada serviço (vai para a tela e para a IA), "Tentar de novo" e "Achar coordenadas pelo endereço" numa planilha do
// projeto. Mandar endereços da pessoa para um serviço de fora pede consentimento explícito (`confirmo`), que fica
// registrado por planilha; o resultado de cada endereço fica em cache no projeto (o Nominatim exige).
import fs from "node:fs";
import path from "node:path";
import * as Project from "./project.js";
import { renameRetry } from "../fs-retry.js";
import { loadMapConfig, mapaFile, saveMapConfig, maskedMapConfig } from "../map-config.js";
import { serviceState, resetService, geocodeOne, geocodeInterval, ServiceBlocked, SERVICES } from "../map-services.js";
import { route, reverseGeocode, isochrone } from "../map-routing.js";

const json = (res, status, data) => { res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(data)); };
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const ADDRESS = ["endereco", "address", "logradouro", "rua", "enderecocompleto"], CITY = ["cidade", "municipio", "city", "localidade"], UF = ["uf", "estado", "state"], CEP = ["cep", "postalcode", "codigopostal"];
const LAT = ["lat", "latitude"], LON = ["lon", "lng", "long", "longitude"];
const find = (head, names) => head.findIndex((h) => names.includes(norm(h)));

const metaFile = (P, name) => path.join(path.dirname(Project.ensureMeta(P)), name); // ensureMeta devolve o arquivo da conversa, dentro de .sagadeck/
const readJSONFile = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")) || {}; } catch { return {}; } };
const writeJSONFile = (f, v) => { const tmp = `${f}.tmp-${process.pid}`; fs.writeFileSync(tmp, JSON.stringify(v, null, 1)); renameRetry(tmp, f); };

// o que procurar para uma linha: o endereço com cidade, UF e CEP quando a planilha tem essas colunas
export function addressPlan(rows, column) {
  const head = (rows[0] || []).map((h) => String(h).trim());
  const iAddr = column ? head.findIndex((h) => norm(h) === norm(column)) : find(head, ADDRESS);
  if (iAddr < 0) return { error: `A planilha não tem coluna de endereço (procurei ${ADDRESS.join(", ")}); diga qual é.` };
  const extra = [find(head, CITY), find(head, UF), find(head, CEP)].filter((i) => i >= 0 && i !== iAddr);
  const iLat = find(head, LAT), iLon = find(head, LON);
  const items = [];
  rows.slice(1).forEach((r, n) => {
    if (!r.some((c) => String(c).trim())) return;
    const has = iLat >= 0 && iLon >= 0 && String(r[iLat] ?? "").trim() && String(r[iLon] ?? "").trim();
    const q = [r[iAddr], ...extra.map((i) => r[i])].map((x) => String(x ?? "").trim()).filter(Boolean).join(", ");
    if (!has && q) items.push({ row: n + 1, q });
  });
  return { head, iAddr, iLat, iLon, items, column: head[iAddr] };
}

export async function geoRoutes({ req, res, pathname, opts, readJSON, W, isBundledTemplate }) {
  if (pathname === "/api/mapa" && req.method === "GET") {
    if (opts.multiuser) { json(res, 200, { editable: false, services: serviceState(), labels: SERVICES }); return true; }
    json(res, 200, { editable: true, file: mapaFile(), config: maskedMapConfig(loadMapConfig()), services: serviceState(), labels: SERVICES });
    return true;
  }
  if (pathname === "/api/mapa" && req.method === "POST") {
    if (opts.multiuser) { json(res, 403, { error: "No servidor, os serviços do mapa são configurados por quem administra." }); return true; }
    const saved = saveMapConfig(await readJSON(req));
    resetService(); // configuração nova: os serviços podem tentar de novo
    json(res, 200, { ok: true, config: maskedMapConfig(saved), services: serviceState() });
    return true;
  }
  if (pathname === "/api/mapa/tentar" && req.method === "POST") {
    const b = await readJSON(req);
    resetService(b.service || null);
    json(res, 200, { ok: true, services: serviceState() });
    return true;
  }
  // rota pelas ruas (editor: "Seguir as ruas"), endereço de um ponto (ponto novo) e área alcançável
  if (["/api/mapa/rota", "/api/mapa/endereco", "/api/mapa/alcance"].includes(pathname) && req.method === "POST") {
    const b = await readJSON(req);
    try {
      if (pathname === "/api/mapa/rota") json(res, 200, await route(b.pontos, { modo: b.modo }));
      else if (pathname === "/api/mapa/endereco") json(res, 200, { endereco: await reverseGeocode(b.lat, b.lon) });
      else json(res, 200, { geometry: await isochrone([b.lat, b.lon], b.minutos, { modo: b.modo }) });
    } catch (e) { json(res, e instanceof ServiceBlocked ? 503 : 400, { error: e.message, bloqueado: e instanceof ServiceBlocked }); }
    return true;
  }
  // Testar (Configurar mapa): uma rota curta com o que está salvo, para ver se a chave e o serviço respondem
  if (pathname === "/api/mapa/testar" && req.method === "POST") {
    if (opts.multiuser) { json(res, 403, { error: "No servidor, quem testa é quem administra." }); return true; }
    resetService("rotas");
    const t0 = Date.now();
    try {
      const r = await route([[-23.5489, -46.6388], [-23.5505, -46.6333]], { modo: "pe" });
      json(res, 200, { ok: true, distancia: Math.round(r.distancia), minutos: Math.round(r.duracao / 60), ms: Date.now() - t0 });
    } catch (e) { json(res, 200, { ok: false, error: e.message, ms: Date.now() - t0 }); }
    return true;
  }
  if (pathname === "/api/mapa/geocode" && req.method === "POST") {
    const b = await readJSON(req);
    const P = W.file && !isBundledTemplate(W.file) ? Project.projectOf(W.file) : null;
    if (!P) { json(res, 400, { error: "Abra uma apresentação da biblioteca para usar as planilhas do projeto." }); return true; }
    let abs, sheet;
    try { abs = Project.resolveIn(P, b.path); sheet = (await Project.readSheet(abs)).sheets[0]; } catch (e) { json(res, 400, { error: e.message }); return true; }
    const plan = addressPlan(sheet.rows, b.column);
    if (plan.error) { json(res, 400, { error: plan.error }); return true; }
    const cfg = loadMapConfig();
    const cacheFile = metaFile(P, "geocodificacao.json"), consentFile = metaFile(P, "mapa-consentimento.json");
    const cache = readJSONFile(cacheFile), consent = readJSONFile(consentFile);
    const todo = plan.items.filter((it) => !(it.q in cache));
    const host = (() => { try { return new URL(cfg.geocoder.url).host; } catch { return cfg.geocoder.url; } })();
    const summary = { total: plan.items.length, enviar: todo.length, cache: plan.items.length - todo.length, servico: host, segundos: Math.ceil((todo.length * geocodeInterval(cfg)) / 1000), coluna: plan.column };
    // dados da pessoa saem para fora só com consentimento explícito (uma vez por planilha e serviço)
    const key = `${b.path}@${host}`;
    // a tela pergunta o plano antes (200); quem tentar enviar sem confirmar recebe 409 e nada sai
    if (b.planejar) { json(res, 200, { precisaConfirmar: !!(todo.length && !consent[key]), ...summary }); return true; }
    if (todo.length && !b.confirmo && !consent[key]) { json(res, 409, { precisaConfirmar: true, ...summary }); return true; }
    if (todo.length && b.confirmo && !consent[key]) { consent[key] = new Date().toISOString(); writeJSONFile(consentFile, consent); }
    // daqui em diante, o progresso vai linha a linha (ndjson)
    res.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" });
    const send = (o) => res.write(JSON.stringify(o) + "\n");
    let aborted = false;
    req.on("close", () => { aborted = true; });
    send({ type: "plano", ...summary });
    const rows = sheet.rows.map((r) => [...r]);
    let { iLat, iLon } = plan;
    if (iLat < 0 || iLon < 0) { rows[0].push("latitude", "longitude"); iLat = rows[0].length - 2; iLon = rows[0].length - 1; }
    const falhas = [];
    let ok = 0, feitos = 0, bloqueado = null, last = 0;
    const wait = geocodeInterval(cfg);
    for (const it of plan.items) {
      if (aborted) break;
      let hit = cache[it.q];
      if (!(it.q in cache)) {
        const pause = last + wait - Date.now(); if (pause > 0) await new Promise((r) => setTimeout(r, pause));
        last = Date.now();
        try { hit = await geocodeOne(it.q, { cfg }); cache[it.q] = hit; }
        catch (e) { if (e instanceof ServiceBlocked) { bloqueado = e.motivo; break; } hit = null; }
      }
      feitos++;
      if (hit) { ok++; const r = rows[it.row]; while (r.length < rows[0].length) r.push(""); r[iLat] = String(hit.lat); r[iLon] = String(hit.lon); }
      else falhas.push({ linha: it.row + 1, endereco: it.q });
      if (feitos % 5 === 0 || feitos === plan.items.length) send({ type: "progresso", feitos, total: plan.items.length, ok });
    }
    writeJSONFile(cacheFile, cache);
    // grava o que achou (CSV no mesmo arquivo; xlsx ganha um CSV ao lado, que é o que o mapa lê)
    let out = b.path;
    if (ok) {
      if (/\.(csv|tsv)$/i.test(b.path)) Project.writeSheet(P, b.path, rows);
      else { out = b.path.replace(/\.[^.]+$/, "") + ".csv"; Project.writeSheet(P, out, rows); }
    }
    send({ type: "fim", ok, falhas, bloqueado, cancelado: aborted, path: out });
    res.end();
    return true;
  }
  return false;
}
