// Executa os pedidos do slide "api" a partir do Studio (Node), nunca do navegador: sem CORS, com o
// certificado da empresa e com o token fora da página. Os ambientes (dev/hom/prod) ficam num arquivo
// da máquina — ~/.sagadeck/ambientes.yaml ou SAGADECK_AMBIENTES —, nunca no deck:
//
//   current: hom
//   environments:
//     hom:
//       vars: { base: "https://api.exemplo.com/v1" }     # {{base}} nos slides
//       token:                                          # opcional: token que expira (client credentials)
//         url: "https://identidade.exemplo.com/token"
//         client_id: "..."
//         client_secret_env: MINHA_SECRET                 # ou client_secret: "..."
//         field: access_token                             # onde está o token na resposta ($.data.token)
//         ttl_minutes: 30
//       ca: "C:/certs/empresa.pem"                        # certificado da empresa (proxy/inspeção TLS)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import https from "node:https";
import YAML from "yaml";
import "./runtime/api-core.js";

const C = globalThis.SagadeckApiCore;

export function defaultEnvFile(env = process.env) {
  return env.SAGADECK_AMBIENTES || path.join(os.homedir(), ".sagadeck", "ambientes.yaml");
}

const MIME = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", tif: "image/tiff", tiff: "image/tiff",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xls: "application/vnd.ms-excel", csv: "text/csv",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", txt: "text/plain", json: "application/json",
  mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", ogg: "audio/ogg", webm: "audio/webm", mp4: "video/mp4" };
export const mimeOf = (name) => MIME[String(name || "").toLowerCase().split(".").pop()] || "application/octet-stream";

// ---------- gravações: a última resposta boa de cada slide, ao lado do deck ----------

export const recordingsFile = (deckFile) => (deckFile ? deckFile.replace(/\.ya?ml$/i, "") + ".respostas.json" : null);

export function readRecordings(deckFile) {
  const f = recordingsFile(deckFile);
  try { return f && fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : {}; } catch { return {}; }
}

export function writeRecording(deckFile, key, record) {
  const f = recordingsFile(deckFile);
  if (!f) return null;
  const all = readRecordings(deckFile);
  all[key] = { ...record, at: record.at || new Date().toISOString() };
  fs.writeFileSync(f, JSON.stringify(all, null, 2));
  return f;
}

// ---------- HTTP ----------

export class ApiError extends Error {
  constructor(message, kind, extra = {}) { super(message); this.kind = kind; Object.assign(this, extra); }
}

const OFFLINE = new Set(["ENOTFOUND", "ECONNREFUSED", "ETIMEDOUT", "EAI_AGAIN", "ECONNRESET", "EHOSTUNREACH", "ENETUNREACH", "TIMEOUT"]);

function explain(e, url) {
  const host = (() => { try { return new URL(url).host; } catch { return url; } })();
  if (OFFLINE.has(e.code)) return new ApiError(`Não consegui falar com ${host} (${e.code}). Está conectado à VPN?`, "offline", { code: e.code });
  if (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY|UNABLE_TO_GET_ISSUER/i.test(e.code || e.message)) {
    return new ApiError(`${host} usa um certificado que o Node não reconhece (${e.code}). Aponte o certificado da empresa em "ca:" no ambiente, ou em NODE_EXTRA_CA_CERTS.`, "tls", { code: e.code });
  }
  return new ApiError(`Falha ao chamar ${host}: ${e.message}`, "network", { code: e.code });
}

function open({ method, url, headers, body, ca, insecure, timeout }) {
  return new Promise((resolve, reject) => {
    let u;
    try { u = new URL(url); } catch { reject(new ApiError(`Endereço inválido: ${url}`, "config")); return; }
    if (!/^https?:$/.test(u.protocol)) { reject(new ApiError(`Só http e https: ${url}`, "config")); return; }
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(u, { method, headers, ca, rejectUnauthorized: !insecure, timeout }, resolve);
    req.on("timeout", () => req.destroy(Object.assign(new Error(`sem resposta em ${Math.round(timeout / 1000)}s`), { code: "TIMEOUT" })));
    req.on("error", (e) => reject(explain(e, url)));
    if (body != null) req.write(body);
    req.end();
  });
}

const readAll = (res) => new Promise((resolve, reject) => {
  const chunks = [];
  res.on("data", (c) => chunks.push(c));
  res.on("end", () => resolve(Buffer.concat(chunks)));
  res.on("error", reject);
});

function parseBody(buf, type) {
  const text = buf.toString("utf8");
  if (/json/i.test(type || "") || /^\s*[[{]/.test(text)) { try { return JSON.parse(text); } catch {} }
  return text;
}

// JWT: cabeçalho e conteúdo decodificados (são base64, não segredo); a assinatura não sai daqui.
export function decodeJwt(token) {
  const parts = String(token).split(".");
  const part = (s) => { try { return JSON.parse(Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")); } catch { return null; } };
  const header = parts.length === 3 ? part(parts[0]) : null;
  const payload = parts.length === 3 ? part(parts[1]) : null;
  return { isJwt: !!(header && payload), header, payload, last4: String(token).slice(-4), exp: payload && Number(payload.exp) ? Number(payload.exp) : null };
}

// ---------- ambientes e token ----------

export class ApiEnvironments {
  constructor(file = defaultEnvFile()) {
    this.file = file;
    this.tokens = new Map(); // ambiente -> { value, expiresAt }
    this.selected = null;    // escolha feita na apresentação (vale até fechar o Studio)
  }

  load() {
    if (!fs.existsSync(this.file)) return { current: null, environments: {} };
    let data;
    try { data = YAML.parse(fs.readFileSync(this.file, "utf8")) || {}; }
    catch (e) { throw new ApiError(`${this.file}: YAML inválido: ${e.message}`, "config"); }
    const envs = data.environments && typeof data.environments === "object" ? data.environments : {};
    return { current: data.current || null, environments: envs };
  }

  currentName(data = this.load()) {
    const names = Object.keys(data.environments);
    if (this.selected && names.includes(this.selected)) return this.selected;
    if (data.current && names.includes(data.current)) return data.current;
    return names[0] || null;
  }

  state() {
    let data, error = null;
    try { data = this.load(); } catch (e) { data = { environments: {} }; error = e.message; }
    return {
      file: this.file, exists: fs.existsSync(this.file), error,
      current: this.currentName(data),
      envs: Object.entries(data.environments).map(([name, e]) => ({
        name, kind: C.envKind(name), vars: (e && e.vars) || {}, token: !!(e && e.token && e.token.url),
      })),
    };
  }

  use(name) {
    const data = this.load();
    if (!data.environments[name]) throw new ApiError(`Ambiente "${name}" não existe em ${this.file}`, "config");
    this.selected = name;
    // guarda a escolha no arquivo, sem perder os comentários de quem escreveu
    try {
      const doc = YAML.parseDocument(fs.readFileSync(this.file, "utf8"));
      doc.set("current", name);
      fs.writeFileSync(this.file, String(doc));
    } catch {}
    return this.state();
  }

  env(name) {
    const data = this.load();
    const n = name || this.currentName(data);
    const e = n && data.environments[n];
    if (!e) throw new ApiError(Object.keys(data.environments).length ? `Ambiente "${n}" não existe` : `Nenhum ambiente configurado. Crie ${this.file} (veja docs/REFERENCIA.md, slide "api").`, "config");
    return { name: n, ...e };
  }

  // tudo o que não pode aparecer na tela (token, segredos, cabeçalhos do ambiente)
  // segredos do ambiente (secrets: { nome: "valor" } ou { nome: { env: VARIAVEL } }): {{secret.nome}} nos slides
  secretVars(env) {
    const out = {};
    for (const [k, v] of Object.entries(env.secrets || {})) {
      const val = v && typeof v === "object" ? process.env[v.env] : v;
      if (val != null) out["secret." + k] = String(val);
    }
    return out;
  }

  secrets(env) {
    const t = env.token || {};
    const out = [this.tokens.get(env.name)?.value, t.client_secret, t.client_secret_env && process.env[t.client_secret_env], ...Object.values(env.headers || {}), ...Object.values(this.secretVars(env))];
    return out.filter((s) => typeof s === "string" && s.length >= 6);
  }

  maskText(env, text) {
    let s = String(text);
    for (const secret of this.secrets(env)) s = s.split(secret).join(C.mask(secret));
    return s;
  }

  async token(env, { renew = false } = {}) {
    const t = env.token;
    if (!t || !t.url) return null;
    const cached = this.tokens.get(env.name);
    if (!renew && cached && Date.now() < cached.renewAt) return cached.value;
    const id = t.client_id ?? (t.client_id_env && process.env[t.client_id_env]);
    const secret = t.client_secret ?? (t.client_secret_env && process.env[t.client_secret_env]);
    if (!id || !secret) throw new ApiError(`Ambiente "${env.name}": falta client_id/client_secret do token (ou a variável ${t.client_secret_env || t.client_id_env || "…"})`, "config");
    const fields = { [t.id_field || "client_id"]: id, [t.secret_field || "client_secret"]: secret, ...(t.extra || {}) };
    const form = t.format === "form";
    const body = form ? new URLSearchParams(fields).toString() : JSON.stringify(fields);
    const res = await open({
      method: "POST", url: t.url, body, ca: this.ca(env), insecure: !!env.insecure, timeout: 30000,
      headers: { "Content-Type": form ? "application/x-www-form-urlencoded" : "application/json", Accept: "application/json", ...(t.headers || {}) },
    });
    const data = parseBody(await readAll(res), res.headers["content-type"]);
    if (res.statusCode >= 400) throw new ApiError(`O serviço de token respondeu HTTP ${res.statusCode}: ${this.maskText(env, typeof data === "string" ? data : JSON.stringify(data)).slice(0, 300)}`, "token", { status: res.statusCode });
    const value = C.get(data, t.field || "access_token");
    if (!value || typeof value !== "string") {
      const fieldsSeen = data && typeof data === "object" ? Object.keys(data).join(", ") : typeof data;
      throw new ApiError(`A resposta do token não tem "${t.field || "access_token"}" (campos: ${fieldsSeen})`, "token");
    }
    const ttl = (Number(data.expires_in) > 0 ? Number(data.expires_in) : (Number(t.ttl_minutes) || 30) * 60) * 1000;
    const margin = Math.min(120000, ttl / 2);
    this.tokens.set(env.name, { value, expiresAt: Date.now() + ttl, renewAt: Date.now() + ttl - margin });
    return value;
  }

  tokenInfo(name) {
    const t = this.tokens.get(name);
    return t ? { expiresIn: Math.max(0, Math.round((t.expiresAt - Date.now()) / 1000)), last4: t.value.slice(-4), fromSlide: !!t.fromSlide } : null;
  }

  ca(env) {
    if (!env.ca) return undefined;
    try { return fs.readFileSync(path.resolve(path.dirname(this.file), env.ca)); }
    catch { throw new ApiError(`Ambiente "${env.name}": não achei o certificado ${env.ca}`, "config"); }
  }

  async prepare(req) {
    const env = this.env();
    // {{secret.nome}}: trocado aqui, no último momento; o navegador só vê o marcador
    const sv = this.secretVars(env);
    const missingSecret = C.missing({ u: req.url, h: req.headers, b: req.body }, sv).filter((m) => m.startsWith("secret."));
    if (missingSecret.length) throw new ApiError(`Ambiente "${env.name}" não tem ${missingSecret.map((m) => m.slice(7)).join(", ")} em secrets:`, "config");
    req = { ...req, url: C.render(req.url, sv), headers: C.render(req.headers || {}, sv), body: C.render(req.body, sv) };
    const headers = { Accept: "application/json, text/event-stream, */*", ...(env.headers || {}), ...(req.headers || {}) };
    let body = req.body;
    const file = req.file || null; // { name, type, data: Buffer } — o arquivo do slide (upload ou base64)
    const needsFile = (req.form && Object.values(req.form).includes("@file")) || /\{\{\s*file\./.test(JSON.stringify(body ?? ""));
    if (needsFile && !file) throw new ApiError("Este slide precisa de um arquivo: arraste um para o slide ou defina file: no YAML.", "config");
    if (file && body != null) body = C.render(body, { "file.base64": file.data.toString("base64"), "file.name": file.name, "file.type": file.type || "application/octet-stream" });
    if (req.form) {
      // multipart/form-data, montado à mão (sem dependências)
      const boundary = "----sagadeck" + Math.random().toString(16).slice(2);
      const parts = [];
      for (const [k, v] of Object.entries(req.form)) {
        if (v === "@file") {
          parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"; filename="${String(file.name).replace(/"/g, "")}"\r\nContent-Type: ${file.type || "application/octet-stream"}\r\n\r\n`), file.data, Buffer.from("\r\n"));
        } else {
          parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
        }
      }
      parts.push(Buffer.from(`--${boundary}--\r\n`));
      body = Buffer.concat(parts);
      headers["Content-Type"] = `multipart/form-data; boundary=${boundary}`;
    } else if (body != null && typeof body === "object") {
      body = JSON.stringify(body);
      if (!Object.keys(headers).some((h) => h.toLowerCase() === "content-type")) headers["Content-Type"] = "application/json";
    }
    const method = String(req.method || (body != null || req.form ? "POST" : "GET")).toUpperCase();
    const t = env.token || {};
    const authHeader = t.header || "Authorization";
    const withToken = async (renew) => {
      if (req.auth === false) return headers;
      const tok = await this.token(env, { renew });
      return tok ? { ...headers, [authHeader]: (t.prefix ?? "Bearer ") + tok } : headers;
    };
    const sent = (h) => ({ method, url: this.maskText(env, req.url), headers: JSON.parse(this.maskText(env, JSON.stringify(h))), ...(file ? { file: { name: file.name, type: file.type, size: file.data.length } } : {}) });
    return { env, method, body, withToken, sent, timeout: (Number(env.timeout) || 60) * 1000 };
  }

  // Pedido completo: a resposta volta inteira (JSON ou texto), com os segredos mascarados.
  async send(req) {
    const p = await this.prepare(req);
    const run = async (renew) => {
      const headers = await p.withToken(renew);
      const t0 = Date.now();
      const res = await open({ method: p.method, url: req.url, headers, body: p.body, ca: this.ca(p.env), insecure: !!p.env.insecure, timeout: p.timeout });
      const buf = await readAll(res);
      return { res, buf, headers, ms: Date.now() - t0 };
    };
    let r = await run(false);
    if ((r.res.statusCode === 401 || r.res.statusCode === 403) && req.auth !== false && p.env.token) r = await run(true); // token vencido: renova uma vez
    const type = r.res.headers["content-type"] || "";
    // Slide do Identity (token: "$.access_token"): o token desta resposta passa a ser o do ambiente,
    // e os próximos slides usam ele. Para a tela vai só o conteúdo decodificado, nunca o token.
    let jwt = null;
    if (req.captureToken && r.res.statusCode < 400) {
      const raw = parseBody(r.buf, type);
      const value = C.get(raw, req.captureToken);
      if (typeof value !== "string" || !value) throw new ApiError(`A resposta não tem o token em ${req.captureToken}`, "token");
      const ttl = (Number(raw && raw.expires_in) > 0 ? Number(raw.expires_in) : (Number(p.env.token && p.env.token.ttl_minutes) || 30) * 60) * 1000;
      this.tokens.set(p.env.name, { value, expiresAt: Date.now() + ttl, renewAt: Date.now() + ttl - Math.min(120000, ttl / 2), fromSlide: true });
      jwt = decodeJwt(value);
    }
    // áudio (TTS): vai inteiro, em base64, para o slide tocar
    const body = /^audio\//i.test(type) ? { _audio: true, type: type.split(";")[0], base64: r.buf.toString("base64") }
      : parseBody(Buffer.from(this.maskText(p.env, r.buf.toString("utf8"))), type);
    return {
      ok: r.res.statusCode < 400, status: r.res.statusCode, statusText: r.res.statusMessage || "", ms: r.ms, size: r.buf.length,
      type, body, sent: p.sent(r.headers), env: p.env.name, token: this.tokenInfo(p.env.name), ...(jwt ? { jwt } : {}),
    };
  }

  // Streaming: devolve a resposta do serviço aberta, para o Studio repassar pedaço a pedaço.
  async open(req) {
    const p = await this.prepare(req);
    const headers = await p.withToken(false);
    const res = await open({ method: p.method, url: req.url, headers, body: p.body, ca: this.ca(p.env), insecure: !!p.env.insecure, timeout: p.timeout });
    return { res, env: p.env, sent: p.sent(headers), mask: (s) => this.maskText(p.env, s) };
  }
}
