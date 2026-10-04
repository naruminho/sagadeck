// Direções aprovadas pela pessoa: capas que ela gostou viram receita reutilizável.
// ~/.sagadeck/direcoes.json (ou SAGADECK_DIRECOES): a IA cita pelo nome ("use a direção Stark").
// JSON (não YAML): arquivo gerenciado pelo Studio; edição manual continua possível.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function directionsFile(env = process.env, home = os.homedir()) {
  return env.SAGADECK_DIRECOES || path.join(home, ".sagadeck", "direcoes.json");
}

let cache = { file: null, mtime: 0, data: null };

export function loadDirections(env = process.env) {
  const file = directionsFile(env);
  let st = null;
  try { st = fs.statSync(file); } catch { return { file, exists: false, directions: {}, error: null }; }
  if (cache.file === file && cache.mtime === st.mtimeMs && cache.data) return cache.data;
  let data;
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8") || "{}");
    if (typeof raw !== "object" || Array.isArray(raw)) throw new Error("o arquivo precisa ser um mapa nome: { receita }");
    const directions = {};
    for (const [name, v] of Object.entries(raw)) {
      if (!v || typeof v !== "object") continue;
      directions[String(name)] = {
        name: String(name),
        theme: v.theme != null ? String(v.theme) : null,
        palette: v.palette != null ? String(v.palette) : null,
        tone: v.tone != null ? String(v.tone) : null,
        ambient: v.ambient != null ? String(v.ambient) : null,
        transition: v.transition != null ? String(v.transition) : null,
        notes: String(v.notes || "").slice(0, 500),
      };
    }
    data = { file, exists: true, directions, error: null };
  } catch (e) {
    data = { file, exists: true, directions: {}, error: `direcoes.json com erro: ${e.message}` };
  }
  cache = { file, mtime: st.mtimeMs, data };
  return data;
}

// trecho que entra no prompt do agente (vazio quando não há nenhuma)
export function directionPrompt(env = process.env) {
  const { directions } = loadDirections(env);
  const list = Object.values(directions);
  if (!list.length) return "";
  const line = (d) => `- "${d.name}": ${[d.theme && `theme ${d.theme}`, d.palette && `palette ${d.palette}`, d.tone && `tom ${d.tone}`, d.ambient && `ambient ${d.ambient}`, d.transition && `transition ${d.transition}`, d.notes].filter(Boolean).join("; ")}`;
  return `Direções aprovadas pela pessoa (quando ela citar o nome, aplique a receita na capa e nos ecos):\n${list.map(line).join("\n")}`;
}

export function saveDirection(name, recipe, env = process.env) {
  const clean = String(name || "").trim().slice(0, 60);
  if (!clean) throw new Error("Dê um nome para a direção.");
  if (/[<>:"/\\|?*]/.test(clean)) throw new Error("Nome com caractere inválido para direção.");
  const file = directionsFile(env);
  let raw = {};
  try { raw = YAML.parse(fs.readFileSync(file, "utf8") || {}) || {}; } catch { raw = {}; }
  if (typeof raw !== "object" || Array.isArray(raw)) raw = {};
  raw[clean] = {
    ...(recipe.theme ? { theme: recipe.theme } : {}),
    ...(recipe.palette ? { palette: recipe.palette } : {}),
    ...(recipe.tone ? { tone: recipe.tone } : {}),
    ...(recipe.ambient ? { ambient: recipe.ambient } : {}),
    ...(recipe.transition ? { transition: recipe.transition } : {}),
    ...(recipe.notes ? { notes: String(recipe.notes).slice(0, 500) } : {}),
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(raw, null, 2), "utf8");
  cache = { file: null, mtime: 0, data: null };
  return clean;
}
