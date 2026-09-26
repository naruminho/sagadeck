// Formato .sagadeck: a apresentação inteira num arquivo só — o YAML + todos os arquivos locais que ele
// usa (imagens, CSS, widgets). Por dentro é um .zip (como .pptx e .docx):
//
//   sagadeck.json        manifesto: { format: "sagadeck", version, main, title, created, generator }
//   <nome>.yaml          a apresentação (sem campos internos da máquina de quem salvou)
//   imagens/, widgets/…  os arquivos, nos mesmos caminhos relativos do YAML
//   assets/              arquivos que estavam FORA da pasta do deck (o YAML do pacote aponta para cá)
//   FALTANDO.txt         o que o deck usa mas não existia ao salvar
//
// Também abre um .zip comum com um .yaml dentro (versão sem manifesto).
//
//   deckAssets(spec, baseDir)            -> [{ ref, rel, abs, exists }]   o que o deck usa do disco
//   packDeck(spec, { baseDir, name })    -> { zip: Buffer, files, missing }
//   unpackDeck(buffer, destDir)          -> { file, dir, manifest }       (caminho do .yaml extraído)
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import YAML from "yaml";

export const EXTENSION = ".sagadeck";
export const MIME = "application/vnd.sagadeck+zip";
export const FORMAT_VERSION = 1; // sobe quando o formato mudar de um jeito que versões antigas não entendam

const isLocal = (v) => typeof v === "string" && v.trim() && !/^(https?:|data:|\/\/)/i.test(v.trim());
const posix = (p) => p.split(path.sep).join("/");

// percorre o deck achando referências a arquivos: css, widgets e qualquer `image`
function refsOf(spec) {
  const out = [];
  const add = (v, where) => { if (isLocal(v)) out.push({ ref: v.trim(), where }); };
  [].concat(spec.css || []).forEach((c) => add(c, "css"));
  [].concat(spec.widgets || []).forEach((w) => add(w, "widget"));
  const walk = (v) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== "object") return;
    for (const [k, x] of Object.entries(v)) {
      if (k === "image") add(x, "image");
      else if (typeof x === "object") walk(x);
    }
  };
  walk(spec.slides || []);
  return out;
}

export function deckAssets(spec, baseDir) {
  const seen = new Map();
  for (const { ref, where } of refsOf(spec)) {
    if (seen.has(ref)) continue;
    const abs = path.resolve(baseDir, ref);
    const inside = !path.relative(baseDir, abs).startsWith("..") && !path.isAbsolute(path.relative(baseDir, abs));
    // dentro da pasta do deck: mesmo caminho relativo; fora: assets/<nome> (sem colidir)
    let rel = inside ? posix(path.relative(baseDir, abs)) : `assets/${path.basename(abs)}`;
    if (!inside) for (let n = 2; [...seen.values()].some((a) => a.rel === rel); n++) rel = `assets/${n}-${path.basename(abs)}`;
    seen.set(ref, { ref, where, rel, abs, exists: fs.existsSync(abs) && fs.statSync(abs).isFile() });
  }
  return [...seen.values()];
}

// YAML do pacote: sem campos internos (_dir, _file…) e com os caminhos que mudaram (arquivos de fora)
function packagedSpec(spec, assets) {
  const moved = new Map(assets.filter((a) => a.ref !== a.rel).map((a) => [a.ref, a.rel]));
  const clean = (v, key) => {
    if (Array.isArray(v)) return v.map((x) => clean(x, key));
    if (typeof v === "string") return (key === "image" || key === "css" || key === "widgets") && moved.has(v.trim()) ? moved.get(v.trim()) : v;
    if (!v || typeof v !== "object") return v;
    return Object.fromEntries(Object.entries(v).filter(([k]) => !k.startsWith("_")).map(([k, x]) => [k, clean(x, k)]));
  };
  return clean(spec);
}

export async function packDeck(spec, { baseDir, name = "apresentacao", generator = "sagadeck" } = {}) {
  const dir = baseDir || spec._dir || process.cwd();
  const assets = deckAssets(spec, dir);
  const zip = new JSZip();
  const root = zip;
  const main = `${name}.yaml`;
  root.file("sagadeck.json", JSON.stringify({ format: "sagadeck", version: FORMAT_VERSION, main, title: spec.title || name,
    created: new Date().toISOString(), generator }, null, 2));
  root.file(main, YAML.stringify(packagedSpec(spec, assets), { indent: 2, lineWidth: 0 }));
  const files = [], missing = [];
  for (const a of assets) {
    if (a.exists) { root.file(a.rel, fs.readFileSync(a.abs)); files.push(a.rel); }
    else missing.push(a.ref);
  }
  if (missing.length) {
    root.file("FALTANDO.txt", `Estes arquivos são usados pela apresentação, mas não foram encontrados em ${dir}:\n\n` +
      missing.map((m) => `- ${m}`).join("\n") + "\n\nColoque-os nesta pasta (mesmo caminho) para a apresentação ficar completa.\n");
  }
  return { zip: await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }), files, missing };
}

// Extrai um pacote numa pasta nova (nunca sobrescreve) e devolve o .yaml principal.
export async function unpackDeck(buffer, destDir) {
  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.values(zip.files).filter((f) => !f.dir);
  for (const f of entries) {
    const norm = path.posix.normalize(f.name.replace(/\\/g, "/"));
    if (norm.startsWith("../") || norm.startsWith("/") || /^[a-z]:/i.test(norm)) throw new Error(`Pacote inválido: caminho "${f.name}" sai da pasta`);
  }
  let manifest = null;
  const mf = zip.file("sagadeck.json");
  if (mf) {
    try { manifest = JSON.parse(await mf.async("string")); } catch { throw new Error("Arquivo .sagadeck com manifesto (sagadeck.json) inválido."); }
    if (manifest.version > FORMAT_VERSION) throw new Error(`Este arquivo foi salvo por uma versão mais nova do sagadeck (formato ${manifest.version}; esta entende até ${FORMAT_VERSION}). Atualize o sagadeck.`);
  }
  const yamls = manifest?.main && zip.file(manifest.main) ? [manifest.main]
    : entries.map((f) => f.name).filter((n) => /\.ya?ml$/i.test(n)).sort((a, b) => a.split("/").length - b.split("/").length);
  if (!yamls.length) throw new Error("O arquivo não tem nenhuma apresentação (.yaml) dentro.");
  fs.mkdirSync(destDir, { recursive: true });
  for (const f of entries) {
    const target = path.join(destDir, ...path.posix.normalize(f.name).split("/"));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, await f.async("nodebuffer"));
  }
  return { file: path.join(destDir, ...yamls[0].split("/")), dir: destDir, manifest };
}
