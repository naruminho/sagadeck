// Rotas da biblioteca (/api/library/*): tópicos, decks, capas, download, importação e geração com IA.
// Saiu de server.js (P1 monolitos); o servidor passa o estado (ctx). Sempre atende o prefixo: devolve true.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import YAML from "yaml";
import { buildHTML, loadSpec } from "../build.js";
import { writeDeckFile } from "../deck-file.js";
import { createExperienceDeck } from "../experiences.js";
import { demoDeck } from "./demo-decks.js";
import { DEMO_FILES } from "../api-demo.js";
import { developerStarter } from "./developer-starters.js";
import { openLibrary, safeName } from "../library.js";

// Bibliotecas das outras pessoas do servidor (<raiz>/usuarios/<usuário>), para quem administra escolher o destino de
// "Enviar cópia para…". O nome vem do .perfil.json que a biblioteca de cada um grava ao abrir (o id do portal não diz
// nada); sem ele, o id, quantas apresentações tem e a mais recente ajudam a reconhecer.
const PROFILE = ".perfil.json";
function peerLibraries(usersRoot, self) {
  let dirs = [];
  try { dirs = fs.readdirSync(usersRoot, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith(".") && d.name !== self).map((d) => d.name); } catch {}
  return dirs.map((id) => {
    const dir = path.join(usersRoot, id);
    let profile = {};
    try { profile = JSON.parse(fs.readFileSync(path.join(dir, PROFILE), "utf8")); } catch {}
    let decks = [];
    try { decks = openLibrary(dir).list().decks; } catch {}
    const recent = decks.sort((a, b) => b.edited - a.edited)[0];
    return { id, name: profile.name || "", email: profile.email || "", decks: decks.length, recent: recent?.title || "" };
  }).sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, "pt-BR"));
}
function peerLibrary(usersRoot, id, self) {
  const name = String(id || "");
  const dir = path.join(usersRoot, name);
  if (!name || name !== safeName(name, "") || name.startsWith(".") || path.dirname(dir) !== path.resolve(usersRoot) || !fs.existsSync(dir)) throw new Error("usuário não encontrado");
  if (name === self) throw new Error("esta é a sua biblioteca: use Duplicar");
  return openLibrary(dir);
}

export async function libraryRoutes({ req, res, pathname, url, W, opts, admin, usersRoot, readJSON, readBody, slideSnapshots, sendExport, galleryKey, galleryEntry, materializePreview, copyModelAssets, generateIntoLibrary, llmAvailable, llmConfig, respond, templateFile, TEMPLATE_DIRS }) {
  const L = W.library;
  const ok = (obj = {}) => { res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ ok: true, ...obj })); };
  const fail = (e, code = 400) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: e.message || String(e) })); };
  try {
    if (pathname === "/api/library" && req.method === "GET") {
      const openId = W.file && W.file.startsWith(L.root + path.sep) ? L.idOf(W.file) : null;
      return ok({ ...L.list(), user: W.user, multiuser: !!opts.multiuser, admin, open: openId });
    }
    // quem administra escolhe para quem enviar a cópia (só no multiusuário)
    if (pathname === "/api/library/users" && req.method === "GET") {
      if (!admin) return fail(new Error("Só quem administra o servidor envia cópias para outras pessoas."), 403);
      return ok({ users: peerLibraries(usersRoot, path.basename(L.root)) });
    }
    if (pathname === "/api/library/gallery-cover" && req.method === "GET") {
      const key = galleryKey(url.searchParams.get("key")), entry = galleryEntry(key);
      const spec = entry.dir ? { ...entry.spec, _dir: entry.dir } : entry.spec;
      const cacheDir = path.join(L.cacheDir, "vitrine");
      const cached = path.join(cacheDir, `${crypto.createHash("sha1").update(`${key}|${JSON.stringify(entry.spec)}`).digest("hex")}.jpg`);
      if (!fs.existsSync(cached)) {
        const [shot] = await slideSnapshots(spec, 0, { mode: "final", width: 480 });
        fs.mkdirSync(cacheDir, { recursive: true });
        fs.writeFileSync(cached, Buffer.from(shot.dataUrl.split(",")[1], "base64"));
      }
      res.writeHead(200, { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" });
      res.end(fs.readFileSync(cached));
      return;
    }
    if (pathname === "/api/library/cover" && req.method === "GET") {
      const file = L.resolveId(url.searchParams.get("id"));
      const st = fs.statSync(file);
      const cacheDir = path.join(L.cacheDir, "capas");
      const cached = path.join(cacheDir, `${crypto.createHash("sha1").update(`${L.idOf(file)}|${st.mtimeMs}`).digest("hex")}.jpg`);
      if (!fs.existsSync(cached)) {
        const spec = loadSpec(file);
        const [shot] = await slideSnapshots(spec, 0, { mode: "final", width: 480 });
        fs.mkdirSync(cacheDir, { recursive: true });
        fs.writeFileSync(cached, Buffer.from(shot.dataUrl.split(",")[1], "base64"));
      }
      res.writeHead(200, { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=31536000" });
      res.end(fs.readFileSync(cached));
      return;
    }
    if (pathname === "/api/library/download" && req.method === "GET") {
      const file = L.resolveId(url.searchParams.get("id"));
      const kind = url.searchParams.get("kind") || "sagadeck";
      if (!["sagadeck", "pptx", "pdf", "roteiro", "tudo", "estudo", "estudo-html"].includes(kind)) throw new Error("formato inválido");
      await sendExport(res, kind, loadSpec(file), path.basename(file).replace(/\.ya?ml$/i, ""), { audience:url.searchParams.get('audience')||undefined, notes: url.searchParams.get("notas") !== "0" });
      return;
    }
    if (pathname === "/api/library/import" && req.method === "POST") {
      const name = url.searchParams.get("name") || "Importada";
      // PowerPoint: importação fiel (src/import); .sagadeck/.zip: pacote do sagadeck
      if (/\.pptx$/i.test(name)) { const r = await L.importOffice(await readBody(req), url.searchParams.get("topic") || "", name); return ok({ id: r.id, slides: r.slides, snapshots: r.snapshots, snapBy: r.snapBy }); }
      const id = await L.importPackage(await readBody(req), url.searchParams.get("topic") || "", name);
      return ok({ id });
    }
    if (req.method !== "POST") return fail(new Error("método não suportado"), 405);
    const b = await readJSON(req);
    switch (pathname) {
      case "/api/library/experience": {
        const spec = createExperienceDeck(b.experience, { title: b.title });
        buildHTML(spec); // Valida antes de criar o arquivo na biblioteca.
        return ok({ id: L.createDeck(b.topic || "", spec) });
      }
      // o nome do portal (username/e-mail do /whoami), para quem administra reconhecer a biblioteca de cada um
      case "/api/library/me": {
        if (!opts.multiuser) return ok();
        const clip = (v) => String(v || "").trim().slice(0, 120);
        const profile = { name: clip(b.name), email: clip(b.email) };
        const file = path.join(L.root, PROFILE);
        let old = null;
        try { old = fs.readFileSync(file, "utf8"); } catch {}
        if (old !== JSON.stringify(profile)) fs.writeFileSync(file, JSON.stringify(profile));
        return ok();
      }
      // Enviar cópia para…: apresentação nova na biblioteca da outra pessoa, nunca por cima da dela (src/library.js)
      case "/api/library/decks/send": {
        if (!admin) return fail(new Error("Só quem administra o servidor envia cópias para outras pessoas."), 403);
        const sent = L.sendDeckTo(b.id, peerLibrary(usersRoot, b.user, path.basename(L.root)));
        console.log(`[Studio] ${W.user} enviou "${sent.title}" para a biblioteca de ${b.user} (${sent.id})`);
        return ok(sent);
      }
      case "/api/library/topics": return ok({ id: L.createTopic(b.name, b.color) });
      case "/api/library/topics/update": return ok({ id: L.updateTopic(b.id, b) });
      case "/api/library/topics/delete": L.deleteTopic(b.id); return ok();
      case "/api/library/decks": {
        if (b.starter) {
          const spec = developerStarter(b.starter, { title: b.title });
          if (b.theme) spec.theme = b.theme;
          buildHTML(spec);
          return ok({ id: L.createDeck(b.topic || "", spec) });
        }
        // nova: em branco (uma capa) — "com IA" usa /api/library/decks/ai
        const title = String(b.title || "Nova apresentação").trim();
        const id = L.createDeck(b.topic || "", { title, theme: b.theme || "bauhaus", duration: 10,
          slides: [{ layout: "cover", title, subtitle: "Subtítulo", author: "" }] });
        // estilo padrão da biblioteca (Brand Kit): sem tema escolhido, a nova já nasce nele
        if (!b.theme && L.defaultStyle()) { const f = L.resolveId(id); writeDeckFile(f, L.withDefaultStyle(YAML.parse(fs.readFileSync(f, "utf8")), path.dirname(f))); }
        return ok({ id });
      }
      case "/api/library/decks/model": {
        // modelos de fábrica (src/studio/demo-decks.js): viram uma apresentação nova na biblioteca
        const id = L.createDeck(b.topic || "Modelos", demoDeck(b.kind));
        copyModelAssets(L, id, b.kind);
        return ok({ id });
      }
      case "/api/library/decks/model-preview": {
        // abre o item da vitrine sem criar arquivo; a cópia só nasce na primeira mudança
        const key = galleryKey(b.key || b.kind), entry = galleryEntry(key);
        W.spec = entry.dir ? { ...entry.spec, _dir: entry.dir } : entry.spec;
        W.file = null;
        W.preview = { key, topic: String(b.topic ?? "Modelos") }; // "" = sem tópico
        W.chatHistory = [];
        return ok({ spec: W.spec, preview: { key, title: W.spec.title, topic: W.preview.topic } });
      }
      case "/api/library/decks/model-use": {
        // "Usar como base": cria a cópia agora, mesmo sem mudança
        const made = materializePreview(W);
        if (!made) throw new Error("Não há um modelo em prévia aberto.");
        return ok(made);
      }
      case "/api/library/decks/example": {
        // exemplo de slides api (aula de APIs de IA): roda no ambiente embutido "ensaio", sem configurar nada
        const tpl = templateFile("ensaio-api.yaml");
        if (!tpl) throw new Error("o exemplo não veio no pacote (templates/ensaio-api.yaml)");
        const id = L.createDeck(b.topic || "", YAML.parse(fs.readFileSync(tpl, "utf8")));
        const dir = path.dirname(L.resolveId(id));
        for (const [name, text] of Object.entries(DEMO_FILES)) fs.writeFileSync(path.join(dir, name), text);
        return ok({ id });
      }
      case "/api/library/decks/move": return ok({ id: L.moveDeck(b.id, b.topic || "") });
      case "/api/library/decks/rename": {
        const id = L.renameDeck(b.id, String(b.title || "").trim() || "Sem título");
        if (W.file === L.resolveId(b.id)) { W.file = L.resolveId(id); W.spec = loadSpec(W.file); }
        return ok({ id });
      }
      case "/api/library/decks/duplicate": return ok({ id: L.duplicateDeck(b.id) });
      case "/api/library/decks/trash": return ok({ slot: L.trashDeck(b.id) });
      case "/api/library/decks/restore": return ok({ id: L.restoreDeck(b.slot) });
      case "/api/library/decks/purge": L.purgeDeck(b.slot); return ok();
      case "/api/library/trash/empty": return ok({ purged: L.emptyTrash() });
      case "/api/library/open": {
        W.preview = null;
        const file = L.resolveId(b.id);
        W.spec = loadSpec(file);
        W.file = file;
        return ok({ spec: W.spec, file: W.file, id: b.id });
      }
      case "/api/library/decks/ai": {
        // gera com IA direto numa pasta nova da biblioteca (as imagens ficam dentro dela)
        if (!(await llmAvailable({ force: true }))) return fail(new Error(`Nenhum LLM respondendo em ${llmConfig().url}.`), 503);
        await respond(res, b.stream, async (emit) => {
          const r = await generateIntoLibrary(W, b.topic || "", b, emit);
          if (r.question) return { ok: true, question: r.question }; // o Studio mostra a pergunta e gera de novo com a resposta
          return { ok: true, id: r.id, images: r.images, research: r.research, quality: r.quality, variety: r.variety };
        });
        return;
      }
    }
    return fail(new Error("rota da biblioteca desconhecida"), 404);
  } catch (e) {
    return fail(e);
  }
  return true;
}
