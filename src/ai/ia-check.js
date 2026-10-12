// Diagnóstico da IA configurada, sem tela: cada recurso (texto, visão, imagem, pesquisa, vídeo) com uma chamada de
// verdade ao provedor, todos ao mesmo tempo, cada resultado avisado assim que chega. Para quem configura e para agentes
// (Copilot, Claude) saberem em segundos o que funciona, sem abrir o Studio. `sagadeck ia-check`, a ferramenta
// sagadeck_ia_check do MCP e POST /api/ia/check usam esta mesma função.
//
// Vídeo: por padrão só confere a chave e o modelo no catálogo, sem custo; com videoReal: true gera um clipe curto de
// verdade, baixa e confere que é um MP4 (é o único jeito de provar; nem todo provedor tem catálogo).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { chat, generateImage, llmConfig, llmConfigured } from "./llm.js";
import { videoOperation, videoCatalog, videoSetup } from "./video-generation.js";

export const CHECKS = { texto: "Texto", visao: "Visão", imagem: "Geração de imagem", pesquisa: "Pesquisa na web", video: "Geração de vídeo" };
// prazo de cada um (s): um modelo travado não segura os outros
const PRAZO = { texto: 30, visao: 45, imagem: 120, pesquisa: 60 };

// ---- a imagem do teste de visão: duas faixas de cor, desenhada aqui mesmo (PNG mínimo, sem navegador)
const CORES = { vermelho: [229, 57, 53], azul: [30, 99, 233], verde: [46, 158, 68], amarelo: [245, 197, 24] };
const SINONIMOS = { vermelho: /vermelh|\bred\b/, azul: /\bazul|\bblue\b/, verde: /\bverde|\bgreen\b/, amarelo: /amarel|\byellow\b/ };
export function twoColorPNG(left, right, w = 96, h = 48) {
  const row = Buffer.alloc(1 + w * 3);
  for (let x = 0; x < w; x++) row.set(CORES[x < w / 2 ? left : right], 1 + x * 3);
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(Buffer.concat(Array.from({ length: h }, () => row)))), chunk("IEND", Buffer.alloc(0))]);
}
// as duas cores: sorteadas (um palpite certo por acaso é improvável) ou fixas pelo seed (testes)
export function colorsFor(seed) {
  const nomes = Object.keys(CORES), i = seed == null ? Math.floor(Math.random() * 12) : Number(seed) % 12;
  const a = Math.floor(i / 3), b = (a + 1 + (i % 3)) % 4;
  return [nomes[a], nomes[b]];
}
const IMG_MAGIC = [["image/png", "89504e47"], ["image/jpeg", "ffd8ff"], ["image/webp", "52494646"], ["image/gif", "47494638"]];
const today = (offsetH = -3) => new Date(Date.now() + offsetH * 3600_000).toISOString().slice(0, 10);
const quick = (cfg, s) => ({ ...cfg, timeoutMs: s * 1000, firstTimeoutMs: s * 1000 });
const ask = (cfg, model, content, s) => chat([{ role: "user", content }], { cfg: quick(cfg, s), model, think: false, temperature: 0, maxTokens: 80, allowTruncated: true, retries: 0 });
const said = (t) => `respondeu "${String(t || "").trim().replace(/\s+/g, " ").slice(0, 80)}"`;

const RUN = {
  async texto({ cfg }) {
    const r = await ask(cfg, cfg.textModel, "Responda só com a palavra: pronto", PRAZO.texto);
    return /pronto/i.test(r.text) ? { status: "ok", modelo: cfg.textModel, detalhe: said(r.text) } : { status: "falhou", modelo: cfg.textModel, detalhe: `${said(r.text)} (esperado: pronto)` };
  },
  async visao({ cfg, seed }) {
    const [esq, dir] = colorsFor(seed);
    const url = `data:image/png;base64,${twoColorPNG(esq, dir).toString("base64")}`;
    const r = await ask(cfg, cfg.visionModel, [{ type: "text", text: "A imagem tem duas faixas verticais de cor. Quais são as cores, da esquerda para a direita? Responda só as duas cores, em português, separadas por vírgula." }, { type: "image_url", image_url: { url } }], PRAZO.visao);
    const modelo = r.visionRouted || cfg.visionModel;
    if (r.imagesDropped) return { status: "falhou", modelo, detalhe: "o modelo não aceitou a imagem: respondeu sem vê-la. Escolha em Configurar IA um modelo de visão que aceite imagem." };
    const t = String(r.text || "").toLowerCase(), m = (c) => t.search(SINONIMOS[c]);
    const ok = m(esq) >= 0 && m(dir) >= 0 && m(esq) < m(dir);
    return { status: ok ? "ok" : "falhou", modelo, detalhe: `${said(r.text)}${ok ? "" : ` (a imagem era ${esq}, ${dir})`}` };
  },
  async imagem({ cfg, outDir }) {
    const img = await Promise.race([generateImage("a single red circle centered on a plain white background, flat, minimal", { cfg: quick(cfg, PRAZO.imagem) }),
      new Promise((_, no) => setTimeout(() => no(new Error(`passou de ${PRAZO.imagem} s sem devolver a imagem`)), PRAZO.imagem * 1000).unref())]);
    const hex = img.data.subarray(0, 4).toString("hex"), tipo = IMG_MAGIC.find(([, m]) => hex.startsWith(m))?.[0];
    if (!tipo || img.data.length < 60) return { status: "falhou", modelo: cfg.imageModel, detalhe: `o que voltou não é uma imagem (${img.data.length} bytes)` };
    const arquivo = path.join(outDir(), `imagem${tipo === "image/jpeg" ? ".jpg" : "." + tipo.split("/")[1]}`);
    fs.writeFileSync(arquivo, img.data);
    return { status: "ok", modelo: cfg.imageModel, detalhe: `${tipo}, ${Math.round(img.data.length / 1024)} KB`, arquivo };
  },
  async pesquisa({ cfg }) {
    if (!cfg.searchModel) return { status: "nao_configurado", detalhe: "sem modelo de pesquisa (opcional: sem ele, a pesquisa usa os buscadores diretos)" };
    const r = await ask(cfg, cfg.searchModel, "Pesquise na web: qual é a data de hoje no horário de Brasília? Responda só no formato AAAA-MM-DD.", PRAZO.pesquisa);
    const d = String(r.text || "").match(/(\d{4})-(\d{2})-(\d{2})/)?.[0];
    const dias = d ? Math.abs(Date.parse(d) - Date.parse(today())) / 86400_000 : Infinity;
    return dias <= 1 ? { status: "ok", modelo: cfg.searchModel, detalhe: said(r.text) }
      : { status: "falhou", modelo: cfg.searchModel, detalhe: `${said(r.text)}; hoje é ${today()} (não parece ter pesquisado)` };
  },
  // o mesmo caminho do produto (videoSetup): o modelo de vídeo do Configurar IA, com a chave e o adaptador de lá, ou as
  // variáveis SAGADECK_VIDEO_KEY / OPENROUTER_API_KEY para quem já usava assim
  async video({ cfg, env, fetcher, videoReal, videoTimeoutS, videoPollMs, outDir }) {
    const setup = videoSetup({ env, cfg }), modelo = setup.model, de = ` (via ${setup.origem})`;
    if (!setup.key && !setup.adaptador) return { status: "nao_configurado", modelo, detalhe: "ponha um modelo de vídeo em Configurar IA (usa a chave de lá) ou defina SAGADECK_VIDEO_KEY / OPENROUTER_API_KEY" };
    const net = { setup, ...(fetcher !== fetch ? { fetcher } : {}) };
    if (!videoReal) {
      const cat = await videoCatalog(net);
      if (!cat.ok) return { status: "sem_prova", modelo, detalhe: `${cat.motivo}; só o teste real prova: --video-real${de}` };
      const meta = cat.models.find((m) => m.id === modelo || m.canonical_slug === modelo);
      return meta ? { status: "sem_prova", modelo, detalhe: `o modelo está no catálogo, mas a chave e a geração só se provam gerando: --video-real (é cobrado)${de}` }
        : { status: "falhou", modelo, detalhe: `o modelo não está no catálogo do provedor (${cat.models.length} modelos)` };
    }
    const cwd = outDir();
    const sub = await videoOperation({ action: "submit", model: modelo, prompt: "a small red ball rolling slowly across a plain white table", duration: "min", resolution: "min", out: "video.mp4" }, { cwd, ...net });
    const limite = Date.now() + videoTimeoutS * 1000;
    let st = { status: sub.status };
    while (!["completed", "failed", "error", "cancelled"].includes(st.status)) {
      if (Date.now() > limite) return { status: "falhou", modelo, detalhe: `o clipe não ficou pronto em ${videoTimeoutS} s (job ${sub.id}, último estado: ${st.status || "?"})` };
      await new Promise((r) => setTimeout(r, videoPollMs));
      st = await videoOperation({ action: "status", id: sub.id }, { cwd, ...net });
    }
    if (st.status !== "completed") return { status: "falhou", modelo, detalhe: `o provedor encerrou com ${st.status}${st.error ? `: ${typeof st.error === "string" ? st.error : JSON.stringify(st.error)}` : ""}` };
    const dl = await videoOperation({ action: "download", id: sub.id }, { cwd, ...net });
    return { status: "ok", modelo, detalhe: `MP4 de ${Math.round(dl.bytes / 1024)} KB${dl.cost != null ? `, custou $${Number(dl.cost).toFixed(2)}` : ""}${de}`, arquivo: path.join(cwd, dl.video) };
  },
};

const NEEDS_LLM = new Set(["texto", "visao", "imagem", "pesquisa"]);
// only: lista de ids (padrão: todos); rapido: sem imagem e vídeo (os lentos e cobrados); videoReal: gera um clipe
export async function iaCheck({ only, rapido = false, videoReal = false, videoTimeoutS = 600, videoPollMs = 5000, cfg = llmConfig(), env = process.env, fetcher = fetch, seed, outDir, onResult = () => {} } = {}) {
  const ids = (only?.length ? only : Object.keys(CHECKS)).filter((id) => CHECKS[id] && !(rapido && (id === "imagem" || id === "video")));
  let dir = outDir;
  const out = () => (dir ||= fs.mkdtempSync(path.join(os.tmpdir(), "sagadeck-ia-check-")));
  const t0 = Date.now();
  const resultados = await Promise.all(ids.map(async (id) => {
    const start = Date.now();
    let r;
    if (NEEDS_LLM.has(id) && !llmConfigured(cfg)) r = { status: "nao_configurado", detalhe: cfg.problem || "a IA não está configurada (Configurar IA, no Studio, ou ~/.sagadeck/ia.json)" };
    else {
      try { r = await RUN[id]({ cfg, env, fetcher, seed, videoReal, videoTimeoutS, videoPollMs, outDir: out }); }
      catch (e) { r = { status: "falhou", detalhe: e?.message || String(e) }; }
    }
    const res = { id, nome: CHECKS[id], ms: Date.now() - start, ...r };
    onResult(res);
    return res;
  }));
  return { ok: resultados.every((r) => r.status !== "falhou"), ms: Date.now() - t0, provedor: cfg.url || cfg.adaptador || "", resultados };
}
