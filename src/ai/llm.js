import { mediaPrompt } from './art-direction.js';
// sagadeck · Cliente de LLM (qualquer endpoint compatível com OpenAI: /v1/chat/completions)
//
// Fala direto com o provedor configurado nesta máquina (~/.sagadeck/ia.json, tela Configurar IA do Studio:
// src/ai/ia-config.js). As variáveis abaixo valem por cima da configuração:
//
//   SAGADECK_LLM_URL      base da API            (ex.: https://openrouter.ai/api/v1)
//   SAGADECK_LLM_KEY      bearer token           (ex.: a chave do OpenRouter)
//   SAGADECK_TEXT_MODEL   modelo de texto        (padrão: o "text" da configuração)
//   SAGADECK_IMAGE_MODEL  modelo de imagem       (padrão: o "image" da configuração)
//   SAGADECK_VISION_MODEL modelo que vê imagens  (padrão: o "vision" da configuração; quando o de texto não enxerga,
//                         a chamada com imagem vai para ele em vez de perder a imagem)
//   SAGADECK_SEARCH_MODEL modelo que busca na web (padrão: o "search" da configuração)
//   SAGADECK_LLM_TIMEOUT  segundos por chamada; em streaming, segundos sem chegar nada (padrão: 180)
//   SAGADECK_LLM_FIRST_TIMEOUT  em streaming, segundos até a 1ª palavra (o modelo pensa antes) (padrão: 600)

import { currentUsage, recordUsage } from './usage.js';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { iaFile, loadIA, keyOf, migrateModelrelay } from './ia-config.js';
import {setTimeout as delay} from 'node:timers/promises';

export class LLMError extends Error {
  constructor(message, { status, cause, aborted, code } = {}) {
    super(message);
    this.name = "LLMError";
    this.status = status;
    if (aborted) this.aborted = true;
    if (cause) this.cause = cause;
    if(code)this.code=code;
  }
}

// De onde vem a IA: variáveis de ambiente (SAGADECK_LLM_URL…, valem por cima; é como os testes apontam para o LLM
// falso) ou a configuração desta máquina (~/.sagadeck/ia.json, src/ai/ia-config.js). Os papéis text, vision, image e
// search viram os modelos configurados; sem configuração nenhuma, a IA fica desligada (o Studio usa as regras locais).
let migrated = false;
export function llmConfig(env = process.env) {
  const fromEnv = !!env.SAGADECK_LLM_URL;
  if (!fromEnv && !migrated) { migrated = true; try { migrateModelrelay({ env, file: iaFile(env) }); } catch { /* segue sem */ } }
  const ia = fromEnv ? null : loadIA(iaFile(env));
  const m = ia?.models || {};
  return {
    url: (env.SAGADECK_LLM_URL || ia?.url || "").replace(/\/+$/, ""),
    key: env.SAGADECK_LLM_KEY || (ia ? keyOf(ia, env) : ""),
    textModel: env.SAGADECK_TEXT_MODEL || m.text || "text",
    imageModel: env.SAGADECK_IMAGE_MODEL || m.image || "image",
    visionModel: env.SAGADECK_VISION_MODEL || m.vision || m.text || "vision",
    // busca na web pelo modelo (no OpenRouter, um modelo ":online"); sem ele, a pesquisa usa os buscadores diretos
    searchModel: env.SAGADECK_SEARCH_MODEL || m.search || (fromEnv ? "search" : ""),
    headers: ia?.headers || {},
    adaptador: ia?.adaptador || "",
    source: fromEnv ? "variável" : ia ? "arquivo" : "nenhuma",
    timeoutMs: Number(env.SAGADECK_LLM_TIMEOUT || 180) * 1000,
    firstTimeoutMs: Number(env.SAGADECK_LLM_FIRST_TIMEOUT || 600) * 1000,
  };
}
export const llmConfigured = (cfg = llmConfig()) => !!(cfg.url || cfg.adaptador);

// o papel (text, vision, image, search) vira o modelo configurado; outro nome passa como veio
export function resolveModel(cfg, name) {
  const roles = { text: cfg.textModel, vision: cfg.visionModel, image: cfg.imageModel, search: cfg.searchModel };
  return roles[name] || name;
}

function headers(cfg) {
  const h = { "Content-Type": "application/json", ...(cfg.headers || {}) };
  if (cfg.key) h.Authorization = `Bearer ${cfg.key}`;
  return h;
}

// Adaptador (opcional, da pessoa): um .mjs cujo default é (url, init) => Response. Serve para o que não é compatível
// com a API da OpenAI (outro jeito de autenticar, outro endereço) sem mexer no sagadeck. Sem ele, o fetch normal.
const adapters = new Map();
async function send(cfg, url, init) {
  if (!cfg.adaptador) return fetch(url, init);
  if (!adapters.has(cfg.adaptador)) adapters.set(cfg.adaptador, import(pathToFileURL(path.resolve(cfg.adaptador)).href).then((mod) => mod.default));
  const fn = await adapters.get(cfg.adaptador);
  if (typeof fn !== "function") throw new LLMError(`O adaptador ${cfg.adaptador} não exporta uma função padrão (url, init) => Response.`);
  return fn(url, init);
}
const notConfigured = () => new LLMError("A IA não está configurada: no Studio, abra Configurar IA (ou crie ~/.sagadeck/ia.json).", { code: "AI_NOT_CONFIGURED" });
const howToFix = "Confira o provedor e a chave em Configurar IA, no Studio.";

// Disponibilidade com cache curto, para o Studio decidir entre LLM e as regras determinísticas.
let availability = { at: 0, ok: false, url: "" };

export async function llmAvailable({ force = false } = {}) {
  const cfg = llmConfig();
  if (!llmConfigured(cfg)) return false;
  if (!force && availability.url === cfg.url && Date.now() - availability.at < 30_000) return availability.ok;
  let ok = false;
  try {
    const res = await send(cfg, `${cfg.url}/models`, { headers: headers(cfg), signal: AbortSignal.timeout(2500) });
    ok = res.ok;
  } catch {
    ok = false;
  }
  availability = { at: Date.now(), ok, url: cfg.url };
  return ok;
}

// Modelos que já recusaram imagem nesta execução (ex.: DeepSeek V4 Flash): não mandamos mais imagem para eles.
const noVision = new Set();
const hasImageParts = (messages) => messages.some((m) => Array.isArray(m.content) && m.content.some((p) => p.type === "image_url"));
const refusesImages = (e) => /support image input|image input is not supported|does not support images?|no endpoints found that support image/i.test(e?.message || "");
function withoutImages(messages) {
  return messages.map((m) => (!Array.isArray(m.content) ? m : {
    ...m,
    content: m.content.map((p) => (p.type === "image_url" ? { type: "text", text: "[imagem omitida: o modelo atual não aceita imagens]" } : p)),
  }));
}

// cancelar (signal de quem chamou) ou esgotar o tempo: o que vier primeiro corta a chamada
const withTimeout = (signal, ms) => (signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms));

// Uma chamada de chat. Devolve { text, images: [{ mime, data: Buffer, url }], usage, model }.
// Com `onDelta(pedaço, textoAtéAgora)`, pede streaming e avisa a cada pedaço de texto que chega.
// Se o modelo não aceita imagem, refaz sem as imagens e marca `imagesDropped` (quem chamou avisa o usuário).
export async function chat(messages, opts = {}) {
  const metrics = currentUsage();
  const configured=Number(opts.retries??process.env.SAGADECK_LLM_RETRIES??2);
  const retries=Number.isInteger(configured)&&configured>=0&&configured<=3?configured:2;
  for(let attempt=0;attempt<=retries;attempt++) {
    opts.signal?.throwIfAborted();
    if(metrics)metrics.calls++;
    try {
      const result=await chatUnmetered(messages,opts);
      if(metrics)recordUsage(metrics,result);
      if(result.finishReason==='length'&&!opts.allowTruncated)throw new LLMError('A IA atingiu o limite de tokens da resposta.',{code:'AI_TOKEN_LIMIT'});
      return result;
    } catch(error) {
      if(metrics){metrics.failedCalls++;metrics.missingUsage++;metrics.missingCost++;}
      const temporary=[408,429,500,502,503,504].includes(error.status)||error.code==='AI_PROVIDER_INTERRUPTED'||['ECONNRESET','EAI_AGAIN'].includes(error.cause?.code);
      if(!temporary||attempt>=retries||opts.signal?.aborted||error.aborted)throw error;
      opts.onRetry?.({attempt:attempt+2,maxAttempts:retries+1,status:error.status,code:error.code});
      await delay(Math.min(10000,Math.max(0,opts.retryDelayMs??1000)*2**attempt),undefined,{signal:opts.signal});
    }
  }
}

async function chatUnmetered(messages, opts = {}) {
  const cfg = opts.cfg || llmConfig();
  const key = `${cfg.url}|${opts.model || cfg.textModel}`;
  // o modelo de texto não enxerga: a chamada com imagem vai para o modelo de visão (se o relay tiver um)
  const viaVision = async () => {
    const vision = cfg.visionModel;
    if (!vision || vision === (opts.model || cfg.textModel) || noVision.has(`${cfg.url}|${vision}`)) return null;
    try { return { ...(await chatOnce(messages, { ...opts, model: vision, cfg })), visionRouted: vision }; }
    catch (e) { if (refusesImages(e) || e.status === 400 || e.status === 404) { noVision.add(`${cfg.url}|${vision}`); return null; } throw e; }
  };
  if (hasImageParts(messages) && noVision.has(key)) {
    return (await viaVision()) || { ...(await chatOnce(withoutImages(messages), { ...opts, cfg })), imagesDropped: true };
  }
  try {
    return await chatOnce(messages, { ...opts, cfg });
  } catch (e) {
    if (!hasImageParts(messages) || !refusesImages(e)) throw e;
    noVision.add(key);
    return (await viaVision()) || { ...(await chatOnce(withoutImages(messages), { ...opts, cfg })), imagesDropped: true };
  }
}

// think: false = sem raciocínio (tarefa de olhar: conferir um slide, achar um destaque na figura). Com ele, o modelo
// de visão pensava até estourar o limite e não escrevia nada. Provedor que não conhece o campo recusa com 400: vai de
// novo sem ele, e as próximas chamadas para o mesmo relay já vão sem.
const noThinkField = new Set();
async function chatOnce(messages, opts = {}) {
  const cfg = opts.cfg || llmConfig();
  // modelo que entrou em laço pensando (o limite da 1ª palavra estourou sem texto nenhum): uma tentativa a mais, sem
  // raciocínio; a mesma tarefa sem pensar sai em segundos. Sem isso a conferência de cobertura e a correção visual
  // se perdiam depois de 10 min de espera.
  if (opts.think !== false && !opts.noLoopRetry) {
    try { return await chatOnce(messages, { ...opts, noLoopRetry: true }); }
    catch (e) { if (e.code !== "AI_THINKING_LOOP" || opts.signal?.aborted) throw e; opts.onRetry?.({ attempt: 2, maxAttempts: 2, code: e.code }); return chatOnce(messages, { ...opts, think: false, noLoopRetry: true }); }
  }
  if (opts.think === false && !noThinkField.has(cfg.url)) {
    try { return await chatOnceRaw(messages, { ...opts, cfg, reasoningOff: true }); }
    catch (e) { if (e.status !== 400 || !/reasoning/i.test(e.message)) throw e; noThinkField.add(cfg.url); }
  }
  return chatOnceRaw(messages, { ...opts, cfg });
}

async function chatOnceRaw(messages, { model, temperature, maxTokens, onDelta, signal, reasoningOff, cfg = llmConfig() } = {}) {
  if (!llmConfigured(cfg)) throw notConfigured();
  const body = { model: resolveModel(cfg, model || cfg.textModel), messages };
  if (reasoningOff) body.reasoning = { enabled: false };
  if (temperature !== undefined) body.temperature = temperature;
  if (maxTokens) body.max_tokens = maxTokens;
  if (onDelta) return chatStream(body, onDelta, cfg, signal);

  let res;
  try {
    res = await send(cfg, `${cfg.url}/chat/completions`, {
      method: "POST",
      headers: headers(cfg),
      body: JSON.stringify(body),
      signal: withTimeout(signal, cfg.timeoutMs),
    });
  } catch (e) {
    if (signal?.aborted) throw new LLMError("Parado a pedido.", { cause: e, aborted: true });
    // o fetch do Node desiste se os cabeçalhos não chegam em 300 s (modelo que pensa muito antes de responder):
    // em streaming eles chegam logo, e o limite passa a ser o SAGADECK_LLM_TIMEOUT
    if (e.cause?.code === "UND_ERR_HEADERS_TIMEOUT") return chatStream(body, () => {}, cfg, signal);
    const why = e.name === "TimeoutError" ? `sem resposta em ${cfg.timeoutMs / 1000}s` : e.message;
    throw new LLMError(`Não consegui falar com o LLM em ${cfg.url} (${why}). ` +
      howToFix, { cause: e });
  }

  const raw = await res.text();
  let data;
  try { data = JSON.parse(raw); } catch { data = null; }
  if (!res.ok) {
    const msg = data?.error?.message || raw.slice(0, 500) || res.statusText;
    throw new LLMError(`LLM respondeu HTTP ${res.status}: ${msg}`, { status: res.status });
  }
  const message = data?.choices?.[0]?.message;
  if (!message) throw new LLMError(`Resposta inesperada do LLM: ${raw.slice(0, 300)}`);

  return {
    text: typeof message.content === "string" ? message.content
      : Array.isArray(message.content) ? message.content.map((p) => p.text || "").join("") : "",
    images: (message.images || []).map((p) => decodeImage(p?.image_url?.url || p?.url || "")).filter(Boolean),
    usage: data.usage,
    model: data.model,
    finishReason: data.choices?.[0]?.finish_reason,
  };
}

async function chatStream(body, onDelta, cfg, signal) {
  // Dois limites, nenhum deles o tempo total: até a 1ª palavra (o modelo pensa antes de escrever e o relay só manda os
  // cabeçalhos aí; firstTimeoutMs) e, depois, sem chegar nada (timeoutMs). Uma resposta longa que está chegando (o plano
  // de uma aula de 80 slides) não é cortada no meio.
  const idle = new AbortController();
  let timer;
  const arm = (ms) => { clearTimeout(timer); timer = setTimeout(() => idle.abort(Object.assign(new Error("tempo esgotado"), { name: "TimeoutError" })), ms); };
  arm(cfg.firstTimeoutMs ?? cfg.timeoutMs);
  // Até a 1ª palavra de TEXTO o limite é o firstTimeoutMs, mesmo com o relay mandando "estou vivo" (e o raciocínio)
  // a cada poucos segundos: o modelo que entra em laço pensando zerava o relógio para sempre e a tarefa ficava
  // parada horas em "Pensando…". Quem chamou trata o erro (a correção visual preserva o deck que já existe).
  const firstMs = cfg.firstTimeoutMs ?? cfg.timeoutMs;
  let firstTimer = setTimeout(() => idle.abort(Object.assign(new Error("sem texto"), { name: "TimeoutError", noText: true })), firstMs);
  const wrote = () => { clearTimeout(firstTimer); firstTimer = null; };
  const sig = signal ? AbortSignal.any([signal, idle.signal]) : idle.signal;
  try { return await readStream(body, onDelta, cfg, signal, sig, () => arm(cfg.timeoutMs), wrote, () => idle.signal.reason?.noText ? firstMs : 0); }
  finally { clearTimeout(timer); if (firstTimer) clearTimeout(firstTimer); }
}

async function readStream(body, onDelta, cfg, signal, sig, alive, wrote = () => {}, noTextFor = () => 0) {
  let res;
  try {
    res = await send(cfg, `${cfg.url}/chat/completions`, {
      method: "POST",
      headers: headers(cfg),
      body: JSON.stringify({ ...body, stream: true, stream_options: { include_usage: true } }),
      signal: sig,
    });
  } catch (e) {
    if (signal?.aborted) throw new LLMError("Parado a pedido.", { cause: e, aborted: true });
    const why = e.name === "TimeoutError" ? `não começou a responder em ${(cfg.firstTimeoutMs ?? cfg.timeoutMs) / 1000} s` : e.message;
    throw new LLMError(`Não consegui falar com o LLM em ${cfg.url} (${why}). ` +
      howToFix, { cause: e });
  }
  alive(); // começou: daqui em diante, o limite é ficar sem chegar nada
  if (!res.ok) {
    const raw = await res.text();
    let msg = raw.slice(0, 500) || res.statusText;
    try { msg = JSON.parse(raw).error?.message || msg; } catch {}
    throw new LLMError(`LLM respondeu HTTP ${res.status}: ${msg}`, { status: res.status });
  }
  // Provedor sem streaming devolve JSON normal mesmo pedindo stream: trata igual.
  if (!(res.headers.get("content-type") || "").includes("event-stream")) {
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || "";
    if (text) onDelta(text, text);
    return { text, images: [], usage: data.usage, model: data.model, finishReason:data.choices?.[0]?.finish_reason };
  }

  let text = "";
  let usage;
  let model;
  let finishReason;
  let buffer = "";
  const decoder = new TextDecoder();
  try {
    for await (const chunk of res.body) {
      alive();
      buffer += decoder.decode(chunk, { stream: true });
      let nl;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") continue;
        let ev;
        try { ev = JSON.parse(payload); } catch { continue; }
        if (ev.error) throw new LLMError(`LLM falhou no meio da resposta: ${ev.error.message || JSON.stringify(ev.error)}`,{status:Number(ev.error.status||ev.error.code)||undefined,code:/upstream.*terminated.*stream|provider_unavailable/i.test(ev.error.message||'')?'AI_PROVIDER_INTERRUPTED':undefined});
        const piece = ev.choices?.[0]?.delta?.content;
        if (piece) {
          wrote();
          text += piece;
          onDelta(piece, text);
        }
        if (ev.usage) usage = ev.usage;
        if (ev.model) model = ev.model;
        if (ev.choices?.[0]?.finish_reason) finishReason=ev.choices[0].finish_reason;
      }
    }
  } catch (e) {
    if (e instanceof LLMError) throw e;
    if (signal?.aborted) throw new LLMError("Parado a pedido.", { cause: e, aborted: true });
    const why = noTextFor() ? `${noTextFor() / 1000} s pensando sem escrever nada` : e.name === "TimeoutError" ? `nada chegou em ${cfg.timeoutMs / 1000} s` : e.message;
    throw new LLMError(`A resposta do LLM foi interrompida (${why}).`, { cause: e, ...(noTextFor() ? { code: "AI_THINKING_LOOP" } : {}) });
  }
  return { text, images: [], usage, model, finishReason };
}

function decodeImage(url) {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(url);
  if (m) return { mime: m[1], data: Buffer.from(m[3], m[2] ? "base64" : "utf8"), url: null };
  return url ? { mime: "", data: null, url } : null;
}

// Gera uma imagem com o modelo de imagem. Devolve { mime, data: Buffer }.
// ref: imagens (data URL) que o modelo usa como base, para redesenhar uma figura (xerox, escaneada) em vez de inventar
export async function generateImage(prompt, { model, cfg = llmConfig(), ref = [] } = {}) {
  const text = `Generate an image: ${mediaPrompt(prompt)}`;
  const content = ref.length ? [{ type: "text", text }, ...ref.map((url) => ({ type: "image_url", image_url: { url } }))] : text;
  const res = await chat([{ role: "user", content }], { model: model || cfg.imageModel, cfg });
  let img = res.images[0];
  if (img && !img.data && img.url) {
    const r = await fetch(img.url, { signal: AbortSignal.timeout(60_000) });
    if (!r.ok) throw new LLMError(`Não consegui baixar a imagem gerada (${r.status}): ${img.url}`);
    img = { mime: r.headers.get("content-type") || "image/png", data: Buffer.from(await r.arrayBuffer()) };
  }
  if (!img?.data) {
    throw new LLMError(`O modelo "${model || cfg.imageModel}" não devolveu imagem` +
      (res.text ? ` (disse: "${res.text.slice(0, 160)}")` : "") + ". Confira se é um modelo que gera imagens.");
  }
  return img;
}
