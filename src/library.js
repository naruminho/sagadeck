// Biblioteca de apresentações: uma PASTA, sem banco de dados. Funciona igual no Windows do banco (só você)
// e no servidor (uma biblioteca por usuário). Dá para mexer pelo Explorer também: a biblioteca reflete.
//
//   <biblioteca>/
//     Palestras/                      tópico = pasta (cor em .topico.json)
//       E se o humano for o bug/      apresentação = pasta (igual a um .sagadeck extraído)
//         E se o humano for o bug.yaml
//         imagens/ …
//       rascunho.yaml                 um .yaml solto no tópico também é uma apresentação
//     rascunho.yaml                   .yaml solto na raiz = apresentação sem tópico
// Na raiz, pasta é SEMPRE tópico. "Nova sem tópico" vai para "Sem tópico"; importar sem tópico, para "Importados".
//     .lixeira/                       excluídas (30 dias), com .origem.json
//     .cache/                         capas geradas
//
// O id de uma apresentação é o caminho do .yaml dela, relativo à biblioteca, com "/" (ex.: "Palestras/X/X.yaml").
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import YAML from "yaml";
import { unpackDeck } from "./package.js";

export const TRASH_DAYS = 30;
const TRASH = ".lixeira";
const TOPIC_META = ".topico.json";
const COLORS = ["#d33a2c", "#0f6cbd", "#e5a50a", "#8b5cf6", "#0e9f6e", "#e8590c", "#d6336c", "#495057"];

export function defaultLibraryRoot(env = process.env) {
  return path.resolve(env.SAGADECK_HOME || path.join(os.homedir(), "sagadeck"));
}

const posix = (p) => p.split(path.sep).join("/");
const hidden = (name) => name.startsWith(".") || name.startsWith("~$");
const isYaml = (name) => /\.ya?ml$/i.test(name) && !hidden(name);

// nome de pasta/arquivo válido no Windows (e no Linux): sem <>:"/\|?*, sem ponto/espaço no fim
export function safeName(s, fallback = "Sem título") {
  const clean = String(s || "").normalize("NFC").replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim()
    .replace(/[. ]+$/, "").slice(0, 80).trim();
  return /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(clean) || !clean ? fallback : clean;
}

function uniquePath(dir, name, ext = "") {
  let p = path.join(dir, name + ext);
  for (let n = 2; fs.existsSync(p); n++) p = path.join(dir, `${name} (${n})${ext}`);
  return p;
}

export function openLibrary(root) {
  root = path.resolve(root);
  fs.mkdirSync(root, { recursive: true });

  // caminho absoluto de um id, sem sair da biblioteca
  function resolveId(id) {
    const abs = path.resolve(root, ...String(id || "").split("/"));
    const rel = path.relative(root, abs);
    if (!id || rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("apresentação fora da biblioteca");
    return abs;
  }
  const idOf = (abs) => posix(path.relative(root, abs));

  // a apresentação principal de uma pasta: manifesto do .sagadeck, ou o .yaml com o nome da pasta, ou o 1º
  function mainYaml(dir) {
    const files = fs.readdirSync(dir).filter(isYaml);
    if (!files.length) return null;
    try {
      const m = JSON.parse(fs.readFileSync(path.join(dir, "sagadeck.json"), "utf8"));
      if (m.main && files.includes(m.main)) return path.join(dir, m.main);
    } catch {}
    const same = files.find((f) => f.replace(/\.ya?ml$/i, "") === path.basename(dir));
    return path.join(dir, same || files.sort()[0]);
  }

  function deckInfo(file, topic) {
    const st = fs.statSync(file);
    let spec = {};
    try { spec = YAML.parse(fs.readFileSync(file, "utf8")) || {}; } catch {}
    const own = idOf(file).split("/").length === 3;
    return {
      id: idOf(file), topic: topic || "", title: String(spec.title || path.basename(file).replace(/\.ya?ml$/i, "")),
      slides: Array.isArray(spec.slides) ? spec.slides.length : 0, theme: spec.theme || "", edited: st.mtimeMs,
      folder: own, // true = pasta própria (com imagens etc.); false = .yaml solto
    };
  }

  function topicMeta(dir) {
    try { return JSON.parse(fs.readFileSync(path.join(dir, TOPIC_META), "utf8")); } catch { return {}; }
  }

  function list() {
    purgeOld();
    const topics = [], decks = [];
    for (const e of fs.readdirSync(root, { withFileTypes: true })) {
      if (hidden(e.name)) continue;
      const abs = path.join(root, e.name);
      if (e.isFile() && isYaml(e.name)) { decks.push(deckInfo(abs, "")); continue; }
      if (!e.isDirectory()) continue;
      const meta = topicMeta(abs);
      const mine = [];
      for (const d of fs.readdirSync(abs, { withFileTypes: true })) {
        if (hidden(d.name)) continue;
        const p = path.join(abs, d.name);
        if (d.isFile() && isYaml(d.name)) mine.push(deckInfo(p, e.name));
        else if (d.isDirectory()) { const m = mainYaml(p); if (m) mine.push(deckInfo(m, e.name)); }
      }
      decks.push(...mine);
      topics.push({ id: e.name, name: e.name, color: meta.color || COLORS[topics.length % COLORS.length], count: mine.length, created: meta.created || 0 });
    }
    topics.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    return { root, topics, decks, trash: listTrash() };
  }

  // ---- tópicos ----
  function topicDir(id) {
    const dir = resolveId(id);
    if (path.dirname(dir) !== root) throw new Error("tópico inválido");
    return dir;
  }
  function createTopic(name, color) {
    const n = safeName(name, "Novo tópico");
    const dir = uniquePath(root, n);
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, TOPIC_META), JSON.stringify({ color: color || COLORS[list().topics.length % COLORS.length], created: Date.now() }));
    return path.basename(dir);
  }
  function updateTopic(id, { name, color } = {}) {
    let dir = topicDir(id);
    if (color) fs.writeFileSync(path.join(dir, TOPIC_META), JSON.stringify({ ...topicMeta(dir), color }));
    if (name && safeName(name) !== path.basename(dir)) {
      const to = uniquePath(root, safeName(name));
      fs.renameSync(dir, to);
      dir = to;
    }
    return path.basename(dir);
  }
  function deleteTopic(id) {
    const dir = topicDir(id);
    const left = fs.readdirSync(dir).filter((n) => !hidden(n));
    if (left.length) throw new Error("o tópico não está vazio: mova ou exclua as apresentações antes");
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // ---- apresentações ----
  const ensureTopic = (name) => (fs.existsSync(path.join(root, name)) ? name : createTopic(name));

  function createDeck(topic, spec) {
    const title = spec?.title || "Nova apresentação";
    const base = topicDir(topic || ensureTopic("Sem tópico"));
    const dir = uniquePath(base, safeName(title));
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, path.basename(dir) + ".yaml");
    fs.writeFileSync(file, YAML.stringify(spec, { indent: 2, lineWidth: 0 }));
    return idOf(file);
  }

  // pasta que "é" a apresentação (para mover/duplicar/excluir): a pasta própria, ou só o .yaml solto
  // o id diz onde está: "x.yaml" (raiz), "Tópico/x.yaml" (solto no tópico), "Tópico/Pasta/x.yaml" (pasta própria)
  function unitOf(id) {
    const file = resolveId(id);
    if (!fs.existsSync(file) || !isYaml(path.basename(file))) throw new Error("apresentação não encontrada");
    const parts = idOf(file).split("/");
    if (parts.length > 3) throw new Error("apresentação fora da estrutura da biblioteca");
    const info = deckInfo(file, parts.length > 1 ? parts[0] : "");
    return { file, unit: parts.length === 3 ? path.dirname(file) : file, info };
  }

  function moveDeck(id, topic) {
    const { file, unit } = unitOf(id);
    const dest = topic ? topicDir(topic) : root;
    if (path.dirname(unit) === dest) return id;
    const ext = unit === file ? path.extname(file) : "";
    const to = uniquePath(dest, path.basename(unit, ext), ext);
    fs.renameSync(unit, to);
    return idOf(unit === file ? to : path.join(to, path.basename(file)));
  }

  function renameDeck(id, title) {
    const { file, unit } = unitOf(id);
    const spec = YAML.parse(fs.readFileSync(file, "utf8")) || {};
    spec.title = title;
    fs.writeFileSync(file, YAML.stringify(spec, { indent: 2, lineWidth: 0 }));
    if (unit === file) return id; // .yaml solto: só o título
    const to = uniquePath(path.dirname(unit), safeName(title));
    if (path.basename(to) === path.basename(unit)) return id;
    fs.renameSync(unit, to);
    // o .yaml com o nome da pasta acompanha a pasta
    let yaml = path.join(to, path.basename(file));
    if (path.basename(file).replace(/\.ya?ml$/i, "") === path.basename(unit)) {
      const renamed = path.join(to, path.basename(to) + path.extname(file));
      fs.renameSync(yaml, renamed);
      yaml = renamed;
    }
    return idOf(yaml);
  }

  function duplicateDeck(id) {
    const { file, unit, info } = unitOf(id);
    const title = `${info.title} (cópia)`;
    const ext = unit === file ? path.extname(file) : "";
    const to = uniquePath(path.dirname(unit), safeName(title), ext);
    fs.cpSync(unit, to, { recursive: true });
    let yaml = unit === file ? to : path.join(to, path.basename(file));
    if (unit !== file && path.basename(file).replace(/\.ya?ml$/i, "") === path.basename(unit)) {
      const renamed = path.join(to, path.basename(to) + path.extname(file));
      fs.renameSync(yaml, renamed);
      yaml = renamed;
    }
    const spec = YAML.parse(fs.readFileSync(yaml, "utf8")) || {};
    spec.title = title;
    fs.writeFileSync(yaml, YAML.stringify(spec, { indent: 2, lineWidth: 0 }));
    return idOf(yaml);
  }

  // ---- lixeira ----
  function trashDeck(id) {
    const { file, unit, info } = unitOf(id);
    const tdir = path.join(root, TRASH);
    fs.mkdirSync(tdir, { recursive: true });
    const slot = path.join(tdir, `${Date.now()}-${path.basename(unit)}`);
    fs.mkdirSync(slot);
    fs.renameSync(unit, path.join(slot, path.basename(unit)));
    fs.writeFileSync(path.join(slot, ".origem.json"), JSON.stringify({
      topic: info.topic, title: info.title, deleted: Date.now(), yaml: path.relative(unit === file ? path.dirname(file) : unit, file),
      unit: path.basename(unit), slides: info.slides,
    }));
    return path.basename(slot);
  }
  function listTrash() {
    const tdir = path.join(root, TRASH);
    if (!fs.existsSync(tdir)) return [];
    return fs.readdirSync(tdir).map((slot) => {
      try { return { id: slot, ...JSON.parse(fs.readFileSync(path.join(tdir, slot, ".origem.json"), "utf8")) }; } catch { return null; }
    }).filter(Boolean).sort((a, b) => b.deleted - a.deleted);
  }
  function restoreDeck(slotId) {
    const slot = path.join(root, TRASH, path.basename(slotId));
    const o = JSON.parse(fs.readFileSync(path.join(slot, ".origem.json"), "utf8"));
    const dest = o.topic && fs.existsSync(path.join(root, o.topic)) ? path.join(root, o.topic) : o.topic ? path.join(root, createTopic(o.topic)) : root;
    const isFile = /\.ya?ml$/i.test(o.unit);
    const ext = isFile ? path.extname(o.unit) : "";
    const to = uniquePath(dest, path.basename(o.unit, ext), ext);
    fs.renameSync(path.join(slot, o.unit), to);
    fs.rmSync(slot, { recursive: true, force: true });
    return idOf(isFile ? to : path.join(to, o.yaml));
  }
  function purgeDeck(slotId) {
    fs.rmSync(path.join(root, TRASH, path.basename(slotId)), { recursive: true, force: true });
  }
  function purgeOld(now = Date.now()) {
    for (const t of listTrash()) if (now - t.deleted > TRASH_DAYS * 864e5) purgeDeck(t.id);
  }

  // ---- importar .sagadeck / .zip ----
  async function importPackage(buffer, topic, name = "Importada") {
    const base = topicDir(topic || ensureTopic("Importados"));
    const dir = uniquePath(base, safeName(name.replace(/\.(sagadeck|zip)$/i, "")));
    const { file } = await unpackDeck(buffer, dir);
    return idOf(file);
  }

  return {
    root, list, resolveId, idOf,
    createTopic, updateTopic, deleteTopic,
    createDeck, moveDeck, renameDeck, duplicateDeck,
    trashDeck, restoreDeck, purgeDeck, purgeOld, listTrash,
    importPackage,
  };
}
