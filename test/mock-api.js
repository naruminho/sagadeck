// Uma API de mentira para testar o slide "api" sem nenhum serviço de verdade:
//   POST /token            client_id + client_secret -> { access_token, expires_in }
//   POST /v1/sync          responde na hora: { choices: [{ message: { content: "eco: <pergunta>" } }] }
//   POST /v1/start         inicia um workflow: { executionId }
//   GET  /v1/status/:id    STARTED -> RUNNING -> ... -> FINISHED (ou ERROR se workflow = "falha"),
//                          no fim com { responses: [ { step, output } ] }
//   POST /v1/stream        SSE: data: {"choices":[{"delta":{"content":"..."}}]} ... data: [DONE]
//   GET  /v1/headers       devolve os cabeçalhos recebidos (para conferir o token)
//   GET  /v1/vaza          devolve o token no corpo (para conferir a máscara)
// Tudo menos /token exige "Authorization: Bearer <token válido>".
import http from "node:http";

export async function startMockApi({ clientId = "id-teste", clientSecret = "segredo-teste-123", statuses = ["STARTED", "RUNNING", "RUNNING", "FINISHED"], ttlSeconds = 1800, format = "json" } = {}) {
  const state = { tokens: new Set(), tokensIssued: 0, polls: {}, lastHeaders: null, requests: [] };
  const words = ["Olá", ", ", "isto ", "chegou ", "aos ", "poucos."];
  const json = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
  const readBody = (req) => new Promise((r) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => r(b)); });

  const server = http.createServer(async (req, res) => {
    const raw = await readBody(req);
    const url = new URL(req.url, "http://x");
    state.requests.push({ method: req.method, path: url.pathname, headers: req.headers, body: raw });
    if (url.pathname === "/token" && req.method === "POST") {
      const b = format === "form" || /urlencoded/.test(req.headers["content-type"] || "") ? Object.fromEntries(new URLSearchParams(raw)) : JSON.parse(raw || "{}");
      if (b.client_id !== clientId || b.client_secret !== clientSecret) return json(res, 401, { error: "credenciais inválidas" });
      const t = `tok-${++state.tokensIssued}-${Math.random().toString(36).slice(2, 10)}`;
      state.tokens.add(t);
      return json(res, 200, { access_token: t, expires_in: ttlSeconds, token_type: "Bearer" });
    }
    // "Identity": gera um JWT de verdade (cabeçalho.conteúdo.assinatura), válido nesta API
    if (url.pathname === "/identity" && req.method === "POST") {
      const b = JSON.parse(raw || "{}");
      if (b.client_id !== clientId || b.client_secret !== clientSecret) return json(res, 401, { error: "credenciais inválidas" });
      const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
      const t = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: clientId, scope: "llm ocr", exp: Math.floor(Date.now() / 1000) + 1800 })}.assinatura${++state.tokensIssued}XyZw`;
      state.tokens.add(t);
      return json(res, 200, { data: { token: t }, expires_in: 1800 });
    }
    const auth = (req.headers.authorization || "").replace(/^Bearer /, "");
    if (!state.tokens.has(auth)) return json(res, 401, { error: "token inválido ou vencido" });
    state.lastHeaders = req.headers;

    if (url.pathname === "/v1/sync") {
      const b = JSON.parse(raw || "{}");
      const q = b.messages?.at?.(-1)?.content ?? b.q ?? "";
      return json(res, 200, { id: "r1", choices: [{ message: { role: "assistant", content: `eco: ${q}` } }], usage: { total_tokens: 7 } });
    }
    if (url.pathname === "/v1/start" && req.method === "POST") {
      const b = JSON.parse(raw || "{}");
      const id = `exe-${Object.keys(state.polls).length + 1}`;
      state.polls[id] = { n: 0, fail: b.workflow === "falha" };
      return json(res, 202, { executionId: id, message: "aceito" });
    }
    const m = url.pathname.match(/^\/v1\/status\/(.+)$/);
    if (m) {
      const p = state.polls[m[1]];
      if (!p) return json(res, 404, { error: "execução não existe" });
      const seq = p.fail ? statuses.slice(0, -1).concat("ERROR") : statuses;
      const status = seq[Math.min(p.n++, seq.length - 1)];
      const done = status === seq.at(-1);
      return json(res, 200, { status, ...(done && !p.fail ? { responses: [{ step: "ocr", output: "texto extraído do PDF" }, { step: "llm", output: "resumo em 3 linhas" }] } : {}), ...(done && p.fail ? { error: "o OCR não leu o arquivo" } : {}) });
    }
    if (url.pathname === "/v1/stream") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
      for (const w of words) {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: w } }] })}\n\n`);
        await new Promise((r) => setTimeout(r, 40));
      }
      res.end("data: [DONE]\n\n");
      return;
    }
    // "FileManager": recebe multipart e devolve o path_id; "OCR": por path_id ou por base64
    if (url.pathname === "/v1/upload" && req.method === "POST") {
      const m2 = raw.match(/filename="([^"]+)"\r\nContent-Type: ([^\r]+)\r\n\r\n([\s\S]*?)\r\n--/);
      if (!/^multipart\/form-data; boundary=/.test(req.headers["content-type"] || "") || !m2) return json(res, 400, { error: "esperava multipart com um arquivo" });
      const id = `store/${m2[1]}`;
      state.files = { ...(state.files || {}), [id]: m2[3] };
      return json(res, 200, { path_id: id, name: m2[1], type: m2[2], size: Buffer.byteLength(m2[3]) });
    }
    if (url.pathname === "/v1/ocr" && req.method === "POST") {
      const b = JSON.parse(raw || "{}");
      const content = b.path_id ? state.files?.[b.path_id] : b.content ? Buffer.from(b.content, "base64").toString("utf8") : null;
      if (content == null) return json(res, 400, { error: "mande path_id ou content (base64)" });
      return json(res, 200, { text: `lido: ${content}`, via: b.path_id ? "path_id" : "base64" });
    }
    // "Embeddings": vetor de 64 números a partir das palavras (frases com palavras em comum ficam parecidas)
    if (url.pathname === "/v1/embeddings" && req.method === "POST") {
      const b = JSON.parse(raw || "{}");
      const v = new Array(64).fill(0);
      for (const w of String(b.input || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").match(/[a-z]+/g) || []) {
        let h = 7; for (const ch of w) h = (h * 31 + ch.charCodeAt(0)) % 9973;
        v[h % 64] += 1; v[(h * 7) % 64] -= 0.3;
      }
      return json(res, 200, { object: "list", data: [{ embedding: v, index: 0 }], model: b.model || "emb-teste" });
    }
    // "TTS": devolve um WAV de verdade (um tom de 0,4 s); "STT": recebe o áudio (multipart) e "transcreve"
    if (url.pathname === "/v1/tts" && req.method === "POST") {
      const rate = 8000, n = Math.floor(rate * 0.4), data = Buffer.alloc(n * 2);
      for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 8000), i * 2);
      const h = Buffer.alloc(44);
      h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8); h.write("fmt ", 12); h.writeUInt32LE(16, 16);
      h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
      h.write("data", 36); h.writeUInt32LE(data.length, 40);
      res.writeHead(200, { "Content-Type": "audio/wav" });
      return res.end(Buffer.concat([h, data]));
    }
    if (url.pathname === "/v1/stt" && req.method === "POST") {
      const m3 = raw.match(/filename="([^"]+)"\r\nContent-Type: ([^\r]+)/);
      if (!m3) return json(res, 400, { error: "esperava o áudio num multipart" });
      return json(res, 200, { text: `transcrição de ${m3[1]} (${m3[2]})` });
    }
    if (url.pathname === "/v1/headers") return json(res, 200, { recebidos: req.headers });
    if (url.pathname === "/v1/vaza") return json(res, 200, { debug: `seu token é ${auth}` });
    json(res, 404, { error: "não existe" });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}`;
  return {
    url, state, clientId, clientSecret,
    // expira todos os tokens (simula os 30 minutos passando)
    expireTokens: () => state.tokens.clear(),
    close: () => new Promise((r) => server.close(r)),
  };
}

// ambientes.yaml apontando para a API de mentira
export function envFileFor(mock, extra = "") {
  return `current: hom
environments:
  dev:
    vars: { base: "${mock.url}/v1" }
    token: { url: "${mock.url}/token", client_id: "${mock.clientId}", client_secret: "${mock.clientSecret}", ttl_minutes: 30 }
  hom:
    vars: { base: "${mock.url}/v1", wf: "resumo" }
    token: { url: "${mock.url}/token", client_id: "${mock.clientId}", client_secret: "${mock.clientSecret}" }
${extra}`;
}
