// A IA busca dados geográficos para o mapa (entrega 4), no mesmo molde do "ver o material": a IA que edita o deck,
// quando precisa de dados de fora, responde um bloco `mapa:` com as ações (lugares do OpenStreetMap, linhas, contornos,
// uma tabela da web, coordenadas de uma planilha da pessoa). O código executa, grava planilha ou GeoJSON no projeto
// com a FONTE de cada linha e chama a IA de novo com o que gravou; ela monta o slide. Regras:
//  - a decisão é do modelo (prompt), com o estado de cada serviço à vista; o código recusa, sem pedido de rede, o
//    serviço bloqueado nesta execução (uma tentativa e para);
//  - dados da pessoa (endereços de uma planilha dela) só saem com o sim dela: sem confirmação na conversa, o código
//    não envia e a resposta pergunta (quantos, para qual serviço, quanto tempo);
//  - geometria nunca inventada: vem do OpenStreetMap, da web com fonte, ou dos arquivos.
import fs from "node:fs";
import path from "node:path";
import { loadMapConfig, mapaFile } from "../map-config.js";
import { callService, serviceState, geocodeOne, geocodeInterval, ServiceBlocked, SERVICES } from "../map-services.js";
import * as Project from "../studio/project.js";
import { addressPlan } from "../studio/geo-routes.js";
import { chat } from "./llm.js";
import { jsonOf, runResearch, defaultWeb } from "../research/research.js";
import { runAnalysis } from "./map-analysis-run.js";

// tabela da web: a pesquisa que já existe (busca, lê, anota com a URL) e uma extração que só usa o que leu
export async function webResearchDefault(pergunta, { saveDir = null } = {}) {
  const r = await runResearch({ pesquisar: true, motivo: pergunta, buscas: [pergunta], academico: false }, { briefing: pergunta, web: defaultWeb, saveDir, maxSources: 5 });
  return r.materials;
}
export async function extractTableDefault(pergunta, cols, docs) {
  if (!docs.length) return [];
  const fontes = docs.map((d) => `${d.name}\n${d.detail || ""}\n${clip(d.text, 6000)}`).join("\n\n---\n\n");
  const r = await chat([{ role: "user", content: `Monte a tabela pedida SÓ com o que está nas fontes abaixo. Pedido: ${pergunta}
Colunas: ${cols.join(", ")}. Cada linha leva também "fonte": a URL da fonte de onde ela saiu (está no detalhe de cada fonte).
Não invente linhas, nomes nem endereços; o que a fonte não diz fica vazio. Responda só JSON: {"linhas": [{${cols.map((c) => `"${c}": "…"`).join(", ")}, "fonte": "https://…"}]}

Fontes:
${fontes}` }], { maxTokens: 6000, think: false, allowTruncated: true, retries: 0 });
  const j = jsonOf(r.text) || {};
  return (Array.isArray(j.linhas) ? j.linhas : []).filter((x) => x && typeof x === "object");
}

const clip = (s, n) => (String(s ?? "").length > n ? `${String(s).slice(0, n)}…` : String(s ?? ""));
const slug = (s) => String(s || "dados").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "dados";
const okFile = (f, ext) => typeof f === "string" && /^contexto\/[\w\-. /]+$/.test(f) && f.toLowerCase().endsWith(ext) && !f.includes("..");

const stateLine = (st) => Object.entries(st).map(([k, v]) => `- ${SERVICES[k]}: ${v.status === "bloqueado" ? `BLOQUEADO nesta rede (${v.motivo}); não peça` : v.status === "ok" ? "funcionando" : "ainda não usado (deve funcionar)"}`).join("\n");

// ---- 1. o que a IA principal sabe (vai no prompt de src/ai/deck-ai.js quando há projeto) --------------------------
// Quem decide é a IA que edita o deck: quando precisa de dados geográficos, ela responde um bloco `mapa:` com as
// ações (como o `ver:` do material); o Studio executa (runMapData) e chama de novo com o resultado. Sem pedido de
// mapa, nenhuma chamada a mais.
export function mapDataPrompt() {
  return `DADOS PARA O MAPA (slide layout: map): quando a pessoa pedir para mostrar no mapa algo que ela NÃO deu (lugares de um
tipo, linhas como ciclovias ou rios, o contorno de um lugar com nome, uma lista que só existe na web, ou as coordenadas
dos endereços de uma planilha dela), NÃO invente coordenadas nem geometria: responda uma frase e um bloco yaml só com
\`\`\`yaml
mapa:
  - { tipo: lugares, oque: cinemas, filtro_osm: '["amenity"="cinema"]', perto_de: "Centro, Campinas, SP, Brasil", raio_km: 5, arquivo: contexto/cinemas.csv }
  - { tipo: linhas, oque: ciclovias, filtro_osm: '["highway"="cycleway"]', perto_de: "…", raio_km: 3, arquivo: contexto/ciclovias.geojson }
  - { tipo: contorno, nome: "Centro, Campinas, SP, Brasil", arquivo: contexto/centro.geojson }
  - { tipo: web, pergunta: "unidades do INSS em Pernambuco com endereço", colunas: [nome, endereco, cidade], arquivo: contexto/inss-pe.csv }
  - { tipo: coordenadas, planilha: contexto/unidades.csv, confirmado: false }
\`\`\`
O Studio busca (OpenStreetMap, web), grava os arquivos com a fonte de cada linha e te devolve o que gravou; aí você monta o
slide com points:/geojson: e a fonte. filtro_osm são as tags do OpenStreetMap do tipo de lugar. Até 4 ações. Dados que já
estão nas planilhas do projeto com latitude e longitude não precisam de busca.
ANÁLISES (contas que o Studio faz sobre os arquivos do projeto; você só narra os números que ele devolver, nunca calcule
distância, contagem ou tempo de cabeça), no mesmo bloco mapa:
  - { tipo: mais_proximo, de: contexto/pedidos.csv, ate: contexto/lojas.csv }          # cada ponto de "de" com o mais próximo de "ate" e a distância
  - { tipo: contar, pontos: contexto/sensores.csv, area: contexto/bairros.geojson }    # quantos em cada área (ou centro: [lat, lon] ou "endereço", metros: 500)
  - { tipo: faixa, linha: contexto/rede.geojson, metros: 50, pontos: contexto/imoveis.csv }  # faixa em volta da linha e quantos pontos dentro
  - { tipo: sugerir, existentes: contexto/sensores.csv, area: contexto/area.geojson, quantos: 3 }  # onde instalar: os lugares mais longe dos existentes
  - { tipo: rota, de: "Rua A, 10, Recife", para: [-8.06, -34.9], modo: pe }           # rota pelas ruas com distância e tempo (pe, carro, bicicleta)
  - { tipo: alcance, de: contexto/unidades.csv, minutos: 10, modo: pe }               # área alcançável em X minutos (precisa do OpenRouteService)
  - { tipo: encaixar, trilha: contexto/percurso.gpx, modo: carro }                    # rastro de GPS tremido encaixado nas ruas
Depois, ponha o resultado no slide (a camada gravada e uma frase com o número) e diga a fonte e o limite da conta.
Mandar endereços de uma planilha DA PESSOA para um serviço de fora (tipo coordenadas) só com o sim explícito dela nesta
conversa, dado depois de você dizer quantos endereços, para qual serviço e quanto tempo leva; sem esse sim,
confirmado: false (o Studio pergunta por você). Dados públicos (lugares, contornos, web) não precisam perguntar.
Serviços do mapa nesta máquina:
${stateLine(serviceState())}
Nunca peça um serviço BLOQUEADO: diga à pessoa o que não está disponível e ofereça a alternativa (planilha com
coordenadas, os contornos embutidos de estados e países, a planilha do projeto).`;
}


// ---- 2. executar -------------------------------------------------------------------------------------------------
// serviços que cada ação usa (as análises sem rede não usam nenhum; rota com endereço em texto usa o geocoder também)
const NEEDS = { lugares: ["geocoder", "busca"], linhas: ["geocoder", "busca"], contorno: ["geocoder"], web: ["geocoder"], coordenadas: ["geocoder"],
  mais_proximo: [], contar: [], faixa: [], sugerir: [], rota: ["rotas"], alcance: ["rotas"], encaixar: ["rotas"] };
const ANALYSES = new Set(["mais_proximo", "contar", "faixa", "sugerir", "rota", "alcance", "encaixar"]); // src/ai/map-analysis-run.js

async function centerOf(where, cfg) {
  const hit = await geocodeOne(where, { cfg });
  if (!hit) throw new Error(`não achei "${where}" no mapa`);
  return hit;
}

async function overpass(query, cfg) {
  const res = await callService("busca", cfg.busca.url, { method: "POST", cfg, headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `data=${encodeURIComponent(query)}`, timeoutMs: 40000 });
  return (await res.json()).elements || [];
}

const tagAddress = (t) => [t["addr:street"] && `${t["addr:street"]}${t["addr:housenumber"] ? `, ${t["addr:housenumber"]}` : ""}`, t["addr:suburb"], t["addr:city"]].filter(Boolean).join(" - ");

export async function runMapData(acoes, { P, cfg = loadMapConfig(mapaFile()), onProgress = () => {}, webResearch = (q) => webResearchDefault(q, { saveDir: P?.dir }), extractTable = extractTableDefault } = {}) {
  const feitos = [], perguntas = [], falhas = [];
  Project.ensureMeta(P); // contexto/ existe antes de gravar (writeSheet não cria a pasta)
  for (const a of acoes) {
    if (!NEEDS[a.tipo]) { falhas.push(`${a.tipo}: ação desconhecida`); continue; }
    const blocked = NEEDS[a.tipo].map((s) => serviceState()[s]).find((s) => s.status === "bloqueado");
    if (blocked) { falhas.push(`${a.tipo}${a.oque || a.nome ? ` (${a.oque || a.nome})` : ""}: serviço bloqueado nesta rede (${blocked.motivo}); não tentei`); continue; }
    try {
      if (a.tipo === "lugares" || a.tipo === "linhas") {
        const arquivo = okFile(a.arquivo, a.tipo === "lugares" ? ".csv" : ".geojson") ? a.arquivo : `contexto/${slug(a.oque)}.${a.tipo === "lugares" ? "csv" : "geojson"}`;
        const filtro = String(a.filtro_osm || "").replace(/[;(){}]/g, "");
        if (!/^(\[[^\]]+\])+$/.test(filtro)) throw new Error(`filtro do OpenStreetMap inválido: ${filtro}`);
        onProgress(`procurando ${a.oque || a.tipo} perto de ${a.perto_de}…`);
        const c = await centerOf(a.perto_de, cfg);
        const r = Math.round(Math.min(Math.max(Number(a.raio_km) || 3, 0.2), 30) * 1000);
        if (a.tipo === "lugares") {
          const els = await overpass(`[out:json][timeout:30];(node${filtro}(around:${r},${c.lat},${c.lon});way${filtro}(around:${r},${c.lat},${c.lon}););out center tags 300;`, cfg);
          const rows = [["nome", "endereco", "latitude", "longitude", "fonte"]];
          for (const e of els) {
            const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
            if (lat == null || lon == null) continue;
            rows.push([e.tags?.name || "(sem nome)", tagAddress(e.tags || {}), String(lat), String(lon), `https://www.openstreetmap.org/${e.type}/${e.id}`]);
          }
          Project.writeSheet(P, arquivo, rows);
          feitos.push({ tipo: a.tipo, arquivo, linhas: rows.length - 1, oque: a.oque, perto_de: a.perto_de, fonte: "OpenStreetMap (© colaboradores do OpenStreetMap)" });
        } else {
          const els = await overpass(`[out:json][timeout:30];way${filtro}(around:${r},${c.lat},${c.lon});out geom tags 300;`, cfg);
          const features = els.filter((e) => Array.isArray(e.geometry) && e.geometry.length > 1).map((e) => ({ type: "Feature", properties: { nome: e.tags?.name || "(sem nome)", fonte: `https://www.openstreetmap.org/way/${e.id}` }, geometry: { type: "LineString", coordinates: e.geometry.map((g) => [g.lon, g.lat]) } }));
          Project.writeText(P, arquivo, JSON.stringify({ type: "FeatureCollection", features }));
          feitos.push({ tipo: a.tipo, arquivo, linhas: features.length, oque: a.oque, perto_de: a.perto_de, fonte: "OpenStreetMap (© colaboradores do OpenStreetMap)" });
        }
      } else if (a.tipo === "contorno") {
        const arquivo = okFile(a.arquivo, ".geojson") ? a.arquivo : `contexto/${slug(a.nome)}.geojson`;
        onProgress(`procurando o contorno de ${a.nome}…`);
        const g = cfg.geocoder;
        const res = await callService("geocoder", `${g.url.replace(/\/+$/, "")}/search?format=jsonv2&limit=1&polygon_geojson=1&polygon_threshold=0.0005&q=${encodeURIComponent(a.nome)}`, { cfg });
        const hit = (await res.json())?.[0];
        if (!hit?.geojson || !/Polygon/.test(hit.geojson.type)) throw new Error(`não achei o contorno de "${a.nome}"`);
        Project.writeText(P, arquivo, JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", properties: { nome: a.nome, fonte: `https://www.openstreetmap.org/${hit.osm_type}/${hit.osm_id}` }, geometry: hit.geojson }] }));
        feitos.push({ tipo: a.tipo, arquivo, linhas: 1, oque: a.nome, fonte: "OpenStreetMap (© colaboradores do OpenStreetMap)" });
      } else if (a.tipo === "web") {
        if (!webResearch || !extractTable) throw new Error("pesquisa na web indisponível");
        const arquivo = okFile(a.arquivo, ".csv") ? a.arquivo : `contexto/${slug(a.pergunta)}.csv`;
        onProgress(`pesquisando na web: ${a.pergunta}…`);
        const docs = await webResearch(a.pergunta);
        const cols = (Array.isArray(a.colunas) && a.colunas.length ? a.colunas : ["nome", "endereco"]).map(String).slice(0, 8);
        const table = await extractTable(a.pergunta, cols, docs); // [{…colunas, fonte}]
        const rows = [[...cols, "latitude", "longitude", "fonte"]];
        const wait = geocodeInterval(cfg);
        let last = 0;
        for (const t of table.slice(0, 200)) {
          const q = [t.endereco, t.cidade, t.uf].filter(Boolean).join(", ") || t.nome;
          let hit = null;
          if (q) { const pause = last + wait - Date.now(); if (pause > 0) await new Promise((r) => setTimeout(r, pause)); last = Date.now(); hit = await geocodeOne(q, { cfg }).catch((e) => { if (e instanceof ServiceBlocked) throw e; return null; }); }
          rows.push([...cols.map((c) => String(t[c] ?? "")), hit ? String(hit.lat) : "", hit ? String(hit.lon) : "", String(t.fonte || "")]);
        }
        Project.writeSheet(P, arquivo, rows);
        feitos.push({ tipo: a.tipo, arquivo, linhas: rows.length - 1, oque: a.pergunta, fonte: "web (a coluna fonte de cada linha diz de onde veio; revise antes de apresentar)" });
      } else if (ANALYSES.has(a.tipo)) {
        feitos.push(await runAnalysis(a, { P, cfg, onProgress }));
      } else if (a.tipo === "coordenadas") {
        const abs = Project.resolveIn(P, a.planilha);
        const sheet = (await Project.readSheet(abs)).sheets[0];
        const pl = addressPlan(sheet.rows, a.coluna);
        if (pl.error) throw new Error(pl.error);
        if (!pl.items.length) { feitos.push({ tipo: a.tipo, arquivo: a.planilha, linhas: 0, oque: "todas já tinham coordenadas" }); continue; }
        if (a.confirmado !== true) {
          const host = (() => { try { return new URL(cfg.geocoder.url).host; } catch { return cfg.geocoder.url; } })();
          perguntas.push(`Para pôr no mapa, preciso achar as coordenadas de ${pl.items.length} endereço${pl.items.length === 1 ? "" : "s"} da planilha ${a.planilha} (coluna ${pl.column}). Isso envia esses endereços ao serviço ${host} e leva cerca de ${Math.max(1, Math.ceil((pl.items.length * geocodeInterval(cfg)) / 60000))} min. Posso enviar? (Também dá para fazer pela planilha, no botão Achar coordenadas.)`);
          continue;
        }
        onProgress(`achando as coordenadas de ${pl.items.length} endereços…`);
        const rows = sheet.rows.map((r) => [...r]);
        let { iLat, iLon } = pl;
        if (iLat < 0 || iLon < 0) { rows[0].push("latitude", "longitude"); iLat = rows[0].length - 2; iLon = rows[0].length - 1; }
        const wait = geocodeInterval(cfg);
        let ok = 0, last = 0;
        for (const it of pl.items) {
          const pause = last + wait - Date.now(); if (pause > 0) await new Promise((r) => setTimeout(r, pause)); last = Date.now();
          const hit = await geocodeOne(it.q, { cfg });
          if (hit) { ok++; const r = rows[it.row]; while (r.length < rows[0].length) r.push(""); r[iLat] = String(hit.lat); r[iLon] = String(hit.lon); }
        }
        const out = /\.(csv|tsv)$/i.test(a.planilha) ? a.planilha : a.planilha.replace(/\.[^.]+$/, "") + ".csv";
        Project.writeSheet(P, out, rows);
        feitos.push({ tipo: a.tipo, arquivo: out, linhas: ok, oque: `coordenadas de ${ok} de ${pl.items.length} endereços` });
      }
    } catch (e) {
      falhas.push(`${a.tipo}${a.oque || a.nome ? ` (${a.oque || a.nome})` : ""}: ${e.message}`);
      if (e instanceof ServiceBlocked) continue;
    }
  }
  return { feitos, perguntas, falhas };
}

// o que a IA recebe junto do pedido: o que foi gravado (para usar no slide) e o que falhou (para dizer à pessoa)
export function mapDataInstruction({ feitos, falhas }) {
  if (!feitos.length && !falhas.length) return "";
  const lines = feitos.map((f) => `- ${f.arquivo}: ${f.linhas} ${f.tipo === "contorno" ? "contorno" : f.tipo === "linhas" ? "linhas" : "linhas"} (${f.oque}${f.perto_de ? `, perto de ${f.perto_de}` : ""}); fonte: ${f.fonte || "planilha da pessoa"}`);
  const vazios = feitos.filter((f) => (f.tipo === "lugares" || f.tipo === "linhas") && !f.linhas);
  return `[Dados geográficos buscados pelo sagadeck agora]\n${lines.join("\n")}${vazios.length ? `\nA busca não achou nada em ${vazios.map((f) => f.oque).join(", ")} nesse raio: diga isso e ofereça buscar num raio maior (ou outro lugar), sem montar mapa vazio.` : ""}${falhas.length ? `\nNão deu: ${falhas.join("; ")}. Diga isso à pessoa sem inventar o que faltou.` : ""}
Use esses arquivos no slide de mapa (points: para .csv, geojson: para .geojson), com a fonte numa nota ou em source: ("Fonte: OpenStreetMap"). Dado da web: avise que vale revisar.`;
}

// planilhas do projeto, para a decisão saber o que já existe
export async function projectSheets(P) {
  const out = [];
  const dir = path.join(P.dir, "contexto");
  const walk = (d) => { for (const e of fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }) : []) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (/\.(csv|tsv|xlsx)$/i.test(e.name)) out.push(f); } };
  walk(dir);
  const sheets = [];
  for (const f of out.slice(0, 12)) {
    try {
      const rows = (await Project.readSheet(f)).sheets[0].rows;
      const rel = path.relative(P.dir, f).split(path.sep).join("/");
      const pl = addressPlan(rows);
      sheets.push({ path: rel, columns: (rows[0] || []).map(String).slice(0, 12), rows: Math.max(0, rows.length - 1), semPosicao: pl.error ? 0 : pl.items.length });
    } catch { /* planilha que não abre: fica de fora */ }
  }
  return sheets;
}
