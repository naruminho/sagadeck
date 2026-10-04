// Versões do deck: cada salvamento guarda uma cópia em .sagadeck/versoes/ (últimas 10,
// sem duplicar salvamento idêntico). A pessoa compara lado a lado e restaura se quiser.
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";

const MAX = 10;

export function versionsDir(file) {
  return path.join(path.dirname(path.resolve(file)), ".sagadeck", "versoes");
}

const stamp = (d = new Date()) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}${String(d.getSeconds()).padStart(2, "0")}`;

// fotografa o YAML atual; nunca quebra o salvamento (best-effort)
export function snapshotVersion(file, text) {
  try {
    if (!file || typeof text !== "string" || !text.trim()) return null;
    const dir = versionsDir(file);
    fs.mkdirSync(dir, { recursive: true });
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".yaml")).sort();
    if (files.length) {
      const last = fs.readFileSync(path.join(dir, files[files.length - 1]), "utf8");
      if (last === text) return null; // nada mudou desde a última
    }
    let name = `${stamp()}.yaml`;
    for (let n = 2; fs.existsSync(path.join(dir, name)); n++) name = `${stamp()}-${n}.yaml`;
    fs.writeFileSync(path.join(dir, name), text, "utf8");
    for (const old of files.slice(0, Math.max(0, files.length + 1 - MAX))) {
      try { fs.unlinkSync(path.join(dir, old)); } catch {}
    }
    return name;
  } catch { return null; }
}

export function listVersions(file) {
  try {
    const dir = versionsDir(file);
    return fs.readdirSync(dir).filter((f) => f.endsWith(".yaml")).sort().reverse().map((name) => {
      const st = fs.statSync(path.join(dir, name));
      return { name, at: new Date(st.mtimeMs).toISOString(), bytes: st.size };
    });
  } catch { return []; }
}

export function readVersion(file, name) {
  const raw = String(name || "");
  if (raw.includes("..") || raw.includes("/") || raw.includes("\\")) throw new Error("Versão inválida.");
  const base = path.basename(raw);
  if (!/^[\w.-]+\.yaml$/.test(base)) throw new Error("Versão inválida.");
  try { return fs.readFileSync(path.join(versionsDir(file), base), "utf8"); }
  catch { throw new Error("Versão não encontrada."); }
}

// quais slides mudaram entre duas listas (por índice; adicionado/removido conta como mudança)
export function diffSlides(a, b) {
  const A = Array.isArray(a) ? a : [], B = Array.isArray(b) ? b : [];
  const n = Math.max(A.length, B.length), changed = [];
  for (let i = 0; i < n; i++) {
    if (JSON.stringify(A[i] ?? null) !== JSON.stringify(B[i] ?? null)) changed.push(i);
  }
  return changed;
}

export async function versionRoutes({ req, res, pathname, W, readJSON }) {
  const send = (status, data) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(data)); };
  if (pathname === "/api/versions" && req.method === "GET") {
    if (!W?.file) return send(400, { error: "Abra uma apresentação primeiro." }), true;
    send(200, { versions: listVersions(W.file) });
    return true;
  }
  if (pathname === "/api/versions/show" && req.method === "POST") {
    if (!W?.file) return send(400, { error: "Abra uma apresentação primeiro." }), true;
    try {
      const b = await readJSON(req);
      const yaml = readVersion(W.file, b.name);
      const spec = YAML.parse(yaml) || {};
      send(200, { yaml, slides: Array.isArray(spec.slides) ? spec.slides : [], theme: spec.theme || null, palette: spec.palette || null });
    } catch (e) { send(400, { error: e.message }); }
    return true;
  }
  if (pathname === "/api/versions/restore" && req.method === "POST") {
    if (!W?.file) return send(400, { error: "Abra uma apresentação primeiro." }), true;
    try {
      const b = await readJSON(req);
      const yaml = readVersion(W.file, b.name);
      snapshotVersion(W.file, fs.readFileSync(W.file, "utf8")); // o estado atual vira versão antes de voltar
      fs.writeFileSync(W.file, yaml, "utf8");
      send(200, { ok: true });
    } catch (e) { send(400, { error: e.message }); }
    return true;
  }
  return false;
}
