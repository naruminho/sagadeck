// sagadeck · Cliente de LLM (qualquer endpoint compatível com OpenAI: /v1/chat/completions)
//
// Por padrão fala com o `modelrelay serve` local (http://127.0.0.1:8765/v1), que decide pela
// configuração dele para onde a chamada vai (OpenRouter, OpenAI, gateway corporativo...).
// Também funciona apontando direto para um provedor.
//
//   SAGADECK_LLM_URL      base da API            (padrão: http://127.0.0.1:8765/v1)
//   SAGADECK_LLM_KEY      bearer token opcional  (ex.: chave do OpenRouter se apontar direto)
//   SAGADECK_TEXT_MODEL   modelo de texto        (padrão: "text"  — apelido no [models] do modelrelay)
//   SAGADECK_IMAGE_MODEL  modelo de imagem       (padrão: "image" — idem)
//   SAGADECK_LLM_TIMEOUT  segundos por chamada   (padrão: 180)

export class LLMError extends Error {
  constructor(message, { status, cause } = {}) {
    super(message);
    this.name = "LLMError";
    this.status = status;
    if (cause) this.cause = cause;
  }
}

export function llmConfig(env = process.env) {
  return {
    url: (env.SAGADECK_LLM_URL || "http://127.0.0.1:8765/v1").replace(/\/+$/, ""),
    key: env.SAGADECK_LLM_KEY || "",
    textModel: env.SAGADECK_TEXT_MODEL || "text",
    imageModel: env.SAGADECK_IMAGE_MODEL || "image",
    timeoutMs: Number(env.SAGADECK_LLM_TIMEOUT || 180) * 1000,
  };
}

function headers(cfg) {
  const h = { "Content-Type": "application/json" };
  if (cfg.key) h.Authorization = `Bearer ${cfg.key}`;
  return h;
}

// Disponibilidade com cache curto, para o Studio decidir entre LLM e as regras determinísticas.
let availability = { at: 0, ok: false, url: "" };

export async function llmAvailable({ force = false } = {}) {
  const cfg = llmConfig();
  if (!force && availability.url === cfg.url && Date.now() - availability.at < 30_000) return availability.ok;
  let ok = false;
  try {
    const res = await fetch(`${cfg.url}/models`, { headers: headers(cfg), signal: AbortSignal.timeout(2500) });
    ok = res.ok;
  } catch {
    ok = false;
  }
  availability = { at: Date.now(), ok, url: cfg.url };
  return ok;
}

// Uma chamada de chat. Devolve { text, images: [{ mime, data: Buffer, url }], usage, model }.
// Com `onDelta(pedaço, textoAtéAgora)`, pede streaming e avisa a cada pedaço de texto que chega.
export async function chat(messages, { model, temperature, maxTokens, onDelta, cfg = llmConfig() } = {}) {
  const body = { model: model || cfg.textModel, messages };
  if (temperature !== undefined) body.temperature = temperature;
  if (maxTokens) body.max_tokens = maxTokens;
  if (onDelta) return chatStream(body, onDelta, cfg);

  let res;
  try {
    res = await fetch(`${cfg.url}/chat/completions`, {
      method: "POST",
      headers: headers(cfg),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(cfg.timeoutMs),
    });
  } catch (e) {
    const why = e.name === "TimeoutError" ? `sem resposta em ${cfg.timeoutMs / 1000}s` : e.message;
    throw new LLMError(`Não consegui falar com o LLM em ${cfg.url} (${why}). ` +
      "Rode `modelrelay serve` ou ajuste SAGADECK_LLM_URL.", { cause: e });
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
  };
}

async function chatStream(body, onDelta, cfg) {
  let res;
  try {
    res = await fetch(`${cfg.url}/chat/completions`, {
      method: "POST",
      headers: headers(cfg),
      body: JSON.stringify({ ...body, stream: true }),
      signal: AbortSignal.timeout(cfg.timeoutMs),
    });
  } catch (e) {
    const why = e.name === "TimeoutError" ? `sem resposta em ${cfg.timeoutMs / 1000}s` : e.message;
    throw new LLMError(`Não consegui falar com o LLM em ${cfg.url} (${why}). ` +
      "Rode `modelrelay serve` ou ajuste SAGADECK_LLM_URL.", { cause: e });
  }
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
    return { text, images: [], usage: data.usage, model: data.model };
  }

  let text = "";
  let usage;
  let model;
  let buffer = "";
  const decoder = new TextDecoder();
  try {
    for await (const chunk of res.body) {
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
        if (ev.error) throw new LLMError(`LLM falhou no meio da resposta: ${ev.error.message || JSON.stringify(ev.error)}`);
        const piece = ev.choices?.[0]?.delta?.content;
        if (piece) {
          text += piece;
          onDelta(piece, text);
        }
        if (ev.usage) usage = ev.usage;
        if (ev.model) model = ev.model;
      }
    }
  } catch (e) {
    if (e instanceof LLMError) throw e;
    const why = e.name === "TimeoutError" ? `sem terminar em ${cfg.timeoutMs / 1000}s` : e.message;
    throw new LLMError(`A resposta do LLM foi interrompida (${why}).`, { cause: e });
  }
  return { text, images: [], usage, model };
}

function decodeImage(url) {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(url);
  if (m) return { mime: m[1], data: Buffer.from(m[3], m[2] ? "base64" : "utf8"), url: null };
  return url ? { mime: "", data: null, url } : null;
}

// Gera uma imagem com o modelo de imagem. Devolve { mime, data: Buffer }.
export async function generateImage(prompt, { model, cfg = llmConfig() } = {}) {
  const res = await chat([{ role: "user", content: `Generate an image: ${prompt}` }], { model: model || cfg.imageModel, cfg });
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
