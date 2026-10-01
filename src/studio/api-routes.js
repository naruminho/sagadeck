// Rotas do slide API (/api/http/*): ambientes e variáveis (com segredos protegidos), envio do pedido, tempo real
// (WebSocket), streaming e gravação da última resposta. Saiu de server.js; o servidor passa o estado (ctx).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import YAML from "yaml";
import { writeRecording, readRecordings, mimeOf } from "../api-client.js";

export async function apiRoutes({ req, res, pathname, url, W, apiEnv, rtSessions, apiBlocked, ensureEnsaio, readJSON, isBundledTemplate }) {
  const reply = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(obj)); };
  const blocked = apiBlocked(req);
  if (!blocked) await ensureEnsaio();
  if (pathname === "/api/http/state" && req.method === "GET") {
    let st;
    try { st = apiEnv.state(); } catch (e) { st = { error: e.message, envs: [] }; }
    const tokens = Object.fromEntries((st.envs || []).map((e) => [e.name, apiEnv.tokenInfo(e.name)]));
    return reply(200, { live: !blocked, reason: blocked?.message || null, ...(blocked ? { envs: [], current: null } : st), tokens, recordings: { ...readRecordings(W.file), ...(W.apiRecordings || {}) } });
  }
  if (blocked) return reply(blocked.code, { error: blocked.message, live: false });
  // conversa em tempo real: os eventos do serviço chegam ao navegador por aqui (SSE)
  if (pathname === "/api/http/rt/events" && req.method === "GET") {
    const s = rtSessions.get(url.searchParams.get("sid") || "");
    if (!s) return reply(404, { error: "conversa não existe (já terminou?)" });
    res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" });
    s.res = res;
    for (const ev of s.buffer.splice(0)) res.write(`data: ${JSON.stringify(ev)}\n\n`);
    req.on("close", () => { if (s.res === res) { s.conn.close(); rtSessions.delete(s.sid); } });
    return;
  }
  // tela Ambientes: o arquivo como texto (ou um modelo comentado, se ainda não existe)
  if (pathname === "/api/http/ambientes" && req.method === "GET") {
    const exists = fs.existsSync(apiEnv.file);
    return reply(200, { file: apiEnv.file, exists, text: exists ? fs.readFileSync(apiEnv.file, "utf8") : AMBIENTES_MODELO, builtin: Object.keys(apiEnv.builtin) });
  }
  if (req.method !== "POST") return reply(405, { error: "use POST" });
  if (!/^application\/json/i.test(req.headers["content-type"] || "")) return reply(415, { error: "envie JSON" });
  let body;
  try { body = await readJSON(req); } catch (e) { return reply(400, { error: e.message }); }
  if (pathname === "/api/http/ambientes" || pathname === "/api/http/ambientes/validar") {
    const text = String(body.text ?? "");
    let data;
    try { data = YAML.parse(text) || {}; } catch (e) { return reply(400, { error: `YAML inválido: ${e.message}` }); }
    if (typeof data !== "object" || Array.isArray(data)) return reply(400, { error: "O arquivo precisa ter current: e environments:" });
    const envs = data.environments;
    if (envs != null && (typeof envs !== "object" || Array.isArray(envs))) return reply(400, { error: "environments precisa ser uma lista de nomes (dev:, hom:…), não uma lista com traços" });
    for (const [name, e] of Object.entries(envs || {})) {
      if (!e || typeof e !== "object") return reply(400, { error: `O ambiente "${name}" está vazio: ponha pelo menos vars: { base: "…" }` });
      if (e.vars != null && (typeof e.vars !== "object" || Array.isArray(e.vars))) return reply(400, { error: `vars do ambiente "${name}" precisa ser nome: valor` });
      if (e.secrets != null && (typeof e.secrets !== "object" || Array.isArray(e.secrets))) return reply(400, { error: `secrets do ambiente "${name}" precisa ser um mapa de nomes para configurações de segredos` });
    }
    if (data.current != null && (typeof data.current !== "string" || (!Object.hasOwn(envs || {}, data.current) && !Object.hasOwn(apiEnv.builtin, data.current)))) {
      return reply(400, { error: `O ambiente current "${String(data.current)}" não está definido em environments nem é um ambiente embutido.` });
    }
    if (pathname.endsWith("/validar")) return reply(200, { valid: true });
    const backupCreated = fs.existsSync(apiEnv.file);
    if (backupCreated) {
      fs.copyFileSync(apiEnv.file, `${apiEnv.file}.bak`);
      fs.chmodSync(`${apiEnv.file}.bak`, 0o600);
    }
    fs.mkdirSync(path.dirname(apiEnv.file), { recursive: true });
    fs.writeFileSync(apiEnv.file, text.endsWith("\n") ? text : text + "\n", "utf8");
    apiEnv.tokens.clear(); // credencial pode ter mudado: o próximo pedido pega um token novo
    return reply(200, { ...apiEnv.state(), backupCreated });
  }
  // o arquivo do slide: o que foi arrastado na hora, ou o padrão (file:), só de dentro da pasta do deck
  const fileOf = (b) => {
    if (b.file && b.file.base64) return { name: String(b.file.name || "arquivo"), type: String(b.file.type || mimeOf(b.file.name)), data: Buffer.from(b.file.base64, "base64") };
    if (!b.fileRef) return null;
    const dir = W.file ? path.dirname(W.file) : null;
    if (!dir) throw Object.assign(new Error("Salve o deck numa pasta para usar um arquivo padrão (file:)."), { kind: "config" });
    const abs = path.resolve(dir, String(b.fileRef));
    if (!abs.startsWith(dir + path.sep)) throw Object.assign(new Error("O arquivo precisa estar dentro da pasta do deck."), { kind: "config" });
    if (!fs.existsSync(abs)) throw Object.assign(new Error(`Não achei ${b.fileRef} na pasta do deck (${dir}).`), { kind: "config" });
    return { name: path.basename(abs), type: mimeOf(abs), data: fs.readFileSync(abs) };
  };
  try {
    if (pathname === "/api/http/env") return reply(200, apiEnv.use(String(body.name || "")));
    // painel Variáveis: criar/editar (normal ou protegida), revelar pelo olhinho, apagar, abrir a pasta do arquivo
    if (pathname === "/api/http/vars/set") return reply(200, apiEnv.setVar(String(body.name || ""), body.value ?? "", { protected: !!body.protected }));
    if (pathname === "/api/http/vars/reveal") return reply(200, { value: apiEnv.reveal(String(body.name || "")) });
    if (pathname === "/api/http/vars/delete") return reply(200, apiEnv.deleteVar(String(body.name || "")));
    if (pathname === "/api/http/vars/folder") {
      const dir = path.dirname(apiEnv.file);
      fs.mkdirSync(dir, { recursive: true });
      if (process.platform === "win32") spawn("explorer.exe", [dir], { detached: true, stdio: "ignore" }).unref();
      return reply(200, { dir });
    }
    if (pathname === "/api/http/send") return reply(200, await apiEnv.send({ ...(body.request || {}), file: fileOf(body) }));
    if (pathname === "/api/http/rt/open") {
      const r = await apiEnv.openRealtime(body.realtime || {});
      const sid = crypto.randomUUID();
      const s = { sid, conn: r.conn, buffer: [], res: null };
      const push = (ev) => { if (s.res) s.res.write(`data: ${JSON.stringify(ev)}\n\n`); else s.buffer.push(ev); };
      r.conn.on("message", (m, isText) => push(isText ? { dir: "in", text: r.mask(m) } : { dir: "in", bin: m.toString("base64") }));
      r.conn.on("close", (code, why) => { push({ type: "close", code, why: String(why || "") }); if (s.res) s.res.end(); rtSessions.delete(sid); });
      rtSessions.set(sid, s);
      for (const m of [].concat(body.open || [])) r.conn.send(typeof m === "string" ? m : JSON.stringify(m));
      return reply(200, { sid, url: r.url, env: r.env });
    }
    if (pathname === "/api/http/rt/send") {
      const s = rtSessions.get(String(body.sid || ""));
      if (!s) return reply(404, { error: "conversa não existe (já terminou?)" });
      for (const m of [].concat(body.messages || [])) s.conn.send(typeof m === "string" ? m : JSON.stringify(m));
      return reply(200, { ok: true });
    }
    if (pathname === "/api/http/rt/close") {
      const s = rtSessions.get(String(body.sid || ""));
      if (s) { s.conn.close(); rtSessions.delete(s.sid); }
      return reply(200, { ok: true });
    }
    if (pathname === "/api/http/record") {
      if (!body.key || !body.record) return reply(400, { error: "faltou key/record" });
      const f = W.file && !isBundledTemplate(W.file) ? writeRecording(W.file, String(body.key), body.record) : null;
      if (!f) (W.apiRecordings = W.apiRecordings || {})[body.key] = { ...body.record, at: new Date().toISOString() };
      return reply(200, { ok: true, file: f });
    }
    if (pathname === "/api/http/stream") {
      const up = await apiEnv.open({ ...(body.request || {}), file: fileOf(body) });
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache", "X-Api-Status": String(up.res.statusCode), "X-Api-Type": up.res.headers["content-type"] || "" });
      up.res.on("data", (c) => res.write(up.mask(c.toString("utf8"))));
      up.res.on("end", () => res.end());
      up.res.on("error", () => res.end());
      req.on("close", () => up.res.destroy());
      return;
    }
  } catch (e) {
    return reply(e.kind === "config" ? 400 : 502, { error: e.message, kind: e.kind || "error" });
  }
  return reply(404, { error: "não existe" });
}
