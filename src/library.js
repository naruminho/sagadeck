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
import * as MASTER from "./master.js";
import { unpackDeck } from "./package.js";
import { writeDeckFile } from "./deck-file.js";

export const TRASH_DAYS = 30;
const TRASH = ".lixeira";
const TOPIC_META = ".topico.json";
const COLORS = ["#d33a2c", "#0f6cbd", "#e5a50a", "#8b5cf6", "#0e9f6e", "#e8590c", "#d6336c", "#495057"];

export function defaultLibraryRoot(env = process.env) {
  return path.resolve(env.SAGADECK_HOME || path.join(os.homedir(), "sagadeck"));
}

// Onde uma apresentação NOVA é gravada: sempre na biblioteca. Um caminho dentro dela é respeitado; qualquer
// outro (pasta atual, pasta temporária, cópia do repositório) vira só o nome, em <biblioteca>/<tópico>/<nome>/<nome>.yaml.
// Decks espalhados por fora foram o que fez .js e imagens "sumirem". unique: não sobrescreve, usa "nome (2)".
export function newDeckPath(wanted, { root = defaultLibraryRoot(), topic = "Sem tópico", title, unique = false } = {}) {
  root = path.resolve(root);
  const abs = wanted ? path.resolve(root, String(wanted)) : "";
  const rel = abs && path.relative(root, abs);
  // caminho de Windows (C:\… ou \\servidor\…) num servidor Linux não é "absoluto" para o path de lá, mas também é
  // de fora da biblioteca: vira só o nome, como em qualquer sistema
  const foreign = process.platform !== "win32" && /^([A-Za-z]:[\\/]|\\\\)/.test(String(wanted || ""));
  let dir, name, file;
  if (rel && !foreign && !rel.startsWith("..") && !path.isAbsolute(rel) && /[\\/]/.test(String(wanted))) {
    if (/\.ya?ml$/i.test(abs)) file = abs;
    else { dir = abs; name = path.basename(abs); }
  } else {
    name = safeName(wanted ? String(wanted).split(/[\\/]/).pop().replace(/\.ya?ml$/i, "") : title || "Nova apresentação");
    dir = path.join(root, safeName(topic, "Sem tópico"), name);
  }
  file ||= path.join(dir, name + ".yaml");
  if (!unique || !fs.existsSync(file)) return file;
  // pasta própria (<nome>/<nome>.yaml): numera a pasta e o arquivo; .yaml solto: só o arquivo
  const own = path.basename(path.dirname(file)) === path.basename(file, path.extname(file));
  const ext = path.extname(file), base = path.basename(file, ext);
  for (let n = 2; ; n++) {
    const f = own ? path.join(path.dirname(path.dirname(file)), `${base} (${n})`, `${base} (${n})${ext}`) : path.join(path.dirname(file), `${base} (${n})${ext}`);
    if (!fs.existsSync(f)) return f;
  }
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
    // a pasta pode ter sido apagada por fora (Explorer, limpeza) com o servidor no ar: recria
    fs.mkdirSync(root, { recursive: true });
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
    fs.mkdirSync(root, { recursive: true });
    // Repeated requests (including Enter + click) reuse the topic, never multiply folders.
    const existing = fs.readdirSync(root, { withFileTypes: true }).find(e => e.isDirectory() && !hidden(e.name) && e.name.normalize("NFC").toLocaleLowerCase("pt-BR") === n.toLocaleLowerCase("pt-BR"));
    if (existing) return existing.name;
    const dir = uniquePath(root, n);
    fs.mkdirSync(dir, { recursive: true });
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
    if (!topic && path.dirname(unit) === root) return id; // .yaml solto na raiz: já está sem tópico
    // sem tópico = a pasta "Sem tópico": na raiz só ficam tópicos, nunca a pasta de uma apresentação
    const dest = topicDir(topic || ensureTopic("Sem tópico"));
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
    writeDeckFile(file, spec); // só o título muda no arquivo
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
    writeDeckFile(yaml, spec);
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
  // esvaziar a lixeira: tudo de uma vez (a pessoa confirma antes, no Studio)
  function emptyTrash() {
    const all = listTrash();
    all.forEach((t) => purgeDeck(t.id));
    return all.length;
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

  // .pptx (PowerPoint, Google Slides, Keynote exportado) vira uma apresentação da biblioteca, fiel ao original
  // (src/import): cada slide na mesma posição, mídias em imagens/original/, cópia e fotos do original em original/
  async function importOffice(buffer, topic, name = "Importada.pptx", opts = {}) {
    if (!/\.pptx$/i.test(name)) throw new Error("Por enquanto a importação lê .pptx (o PowerPoint salva em .pptx; o Google Slides e o Keynote exportam).");
    const { importToDir } = await import("./import/index.js");
    const base = topicDir(topic || ensureTopic("Importados"));
    const dir = uniquePath(base, safeName(opts.title || name.replace(/\.pptx$/i, "")));
    const r = await importToDir(buffer, dir, { fileName: path.basename(name), snapshots: opts.snapshots !== false, log: opts.log });
    if (opts.title) r.spec.title = opts.title;
    const file = path.join(dir, path.basename(dir) + ".yaml");
    fs.writeFileSync(file, YAML.stringify(r.spec, { indent: 2, lineWidth: 0 }));
    return { id: idOf(file), file, slides: r.spec.slides.length, snapshots: r.snapshots, snapBy: r.snapBy, converted: r.converted, warnings: r.warnings };
  }

  // ---- estilos da pessoa (tema + mestre), reutilizáveis: <biblioteca>/.estilos/<slug>/estilo.yaml + imagens
  const stylesRoot = path.join(root, ".estilos");
  const slug = (n) => safeName(String(n || "estilo")).toLowerCase().replace(/\s+/g, "-");
  // estilo padrão (Brand Kit): toda apresentação nova (em branco ou com IA, sem tema escolhido) já nasce com ele.
  // Guardado na própria biblioteca (.estilos/padrao.json): vale para quem usar esta biblioteca, em qualquer máquina.
  const defaultFile = path.join(stylesRoot, "padrao.json");
  function defaultStyle() {
    try { const id = JSON.parse(fs.readFileSync(defaultFile, "utf8")).id; return id && fs.existsSync(path.join(stylesRoot, slug(id), "estilo.yaml")) ? slug(id) : null; } catch { return null; }
  }
  function setDefaultStyle(id) {
    if (!id) { fs.rmSync(defaultFile, { force: true }); return null; }
    loadStyle(id); // existe?
    fs.mkdirSync(stylesRoot, { recursive: true });
    fs.writeFileSync(defaultFile, JSON.stringify({ id: slug(id) }));
    return slug(id);
  }
  // apresentação nova: com o padrão, se houver e se ela ainda não tem estilo próprio
  function withDefaultStyle(spec, deckDir) {
    const id = defaultStyle();
    if (!id || spec?.master || spec?.style) return spec;
    try { return applyStyleTo(spec, deckDir, id); } catch { return spec; }
  }

  function listStyles() {
    if (!fs.existsSync(stylesRoot)) return [];
    return fs.readdirSync(stylesRoot, { withFileTypes: true }).filter((d) => d.isDirectory() && fs.existsSync(path.join(stylesRoot, d.name, "estilo.yaml"))).map((d) => {
      try { const st = YAML.parse(fs.readFileSync(path.join(stylesRoot, d.name, "estilo.yaml"), "utf8")); return { id: d.name, name: st.name || d.name, default: d.name === defaultStyle(), from: st.from || null, accent: st.theme?.colors?.accent || null, paper: st.theme?.colors?.paper || null }; }
      catch { return null; }
    }).filter(Boolean).sort((x, y) => x.name.localeCompare(y.name, "pt-BR"));
  }
  function saveStyle(style, fromDir, { replace = false } = {}) {
    const { masterImages } = MASTER;
    let id = slug(style.name);
    if (!replace) { const base = id; for (let n = 2; fs.existsSync(path.join(stylesRoot, id)); n++) id = `${base}-${n}`; }
    const dir = path.join(stylesRoot, id);
    fs.mkdirSync(dir, { recursive: true });
    for (const rel of masterImages(style.master)) {
      const src = path.resolve(fromDir, rel);
      if (!src.startsWith(path.resolve(fromDir)) || !fs.existsSync(src)) continue;
      const dst = path.join(dir, ...rel.split("/"));
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
    }
    fs.writeFileSync(path.join(dir, "estilo.yaml"), YAML.stringify(style, { indent: 2, lineWidth: 0 }));
    return { id, name: style.name };
  }
  function loadStyle(id) {
    const dir = path.join(stylesRoot, slug(id));
    if (!dir.startsWith(stylesRoot) || !fs.existsSync(path.join(dir, "estilo.yaml"))) throw new Error("estilo não encontrado");
    return { style: YAML.parse(fs.readFileSync(path.join(dir, "estilo.yaml"), "utf8")), dir, id: slug(id) };
  }
  // aplica num deck (spec + pasta): as imagens da moldura vão para imagens/estilo/<id>/ e o deck fica portátil
  function applyStyleTo(spec, deckDir, id) {
    const { style, dir } = loadStyle(id);
    const { masterImages } = MASTER;
    const map = new Map();
    for (const rel of masterImages(style.master)) {
      const src = path.join(dir, ...rel.split("/"));
      if (!fs.existsSync(src)) continue;
      const to = `imagens/estilo/${slug(id)}/${path.basename(rel)}`;
      const dst = path.join(deckDir, ...to.split("/"));
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
      map.set(rel, to);
    }
    const master = structuredClone(style.master);
    const fix = (list) => (list || []).forEach((e) => { if (e.image && map.has(e.image)) e.image = map.get(e.image); if (e.drawing) e.drawing = String(e.drawing).replace(/href="media:([^"]+)"/g, (m, r) => `href="media:${map.get(r) || r}"`); });
    fix(master.elements); fix(master.cover);
    return { ...spec, theme: style.theme, master, footer: false, style: { id: slug(id), name: style.name } };
  }

  return {
    listStyles, saveStyle, loadStyle, applyStyleTo, defaultStyle, setDefaultStyle, withDefaultStyle,
    importOffice,
    root, list, resolveId, idOf,
    createTopic, updateTopic, deleteTopic,
    createDeck, moveDeck, renameDeck, duplicateDeck,
    trashDeck, restoreDeck, purgeDeck, purgeOld, listTrash, emptyTrash,
    importPackage,
  };
}
