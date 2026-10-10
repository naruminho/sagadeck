// Projeto = a pasta da apresentação (como uma pasta aberta no VS Code):
//   <nome>.yaml     a apresentação (o arquivo principal: não se apaga nem se renomeia por aqui)
//   imagens/ …      o que o deck usa
//   contexto/       anexos, prints colados, planilhas, anotações .md — material para a IA
//   .sagadeck/      do Studio: conversa.json (o chat), cache/ (texto extraído), lixeira/ (o que foi apagado).
//                   Protegida: só some junto com o projeto inteiro. Nada disso vai no pacote .sagadeck
//                   (src/package.js leva só o que o deck usa).
import fs from "node:fs";
import { renameRetry } from "../fs-retry.js";
import path from "node:path";
import crypto from "node:crypto";
import JSZip from "jszip";
import { toNum as rawNum } from "../science.js";
import { parseCSV, toCSV } from "../csv.js";
import { extractDocText } from "../ai/context.js";
import { storedDocumentMaterials } from '../ai/document-materials.js';

// número de planilha: 1.234,5 · 40% · R$ 10 · -3
const toNum = (v) => rawNum(String(v ?? "").trim().replace(/^R\$\s*/i, "").replace(/\s*%$/, ""));
export const META = ".sagadeck";
export const CONTEXT = "contexto";
const TEXT_EXT = new Set(["md", "markdown", "txt", "csv", "tsv", "json", "yaml", "yml", "css", "js", "mjs", "cjs", "jsx", "ts", "tsx", "html", "htm", "svg", "xml",
  "py", "r", "m", "sql", "sh", "bash", "bat", "ps1", "ini", "toml", "cfg", "java", "c", "h", "cpp", "cs", "go", "rs", "tex", "bib", "log", "geojson", "gpx", "kml"]); // geo: as camadas do mapa (map.js) se editam aqui
const SHEET_EXT = new Set(["csv", "tsv", "xlsx"]);
const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg"]);
const extOf = (f) => (String(f).match(/\.([a-z0-9]+)$/i)?.[1] || "").toLowerCase();
export const kindOf = (name, isMain) => {
  if (isMain) return "deck";
  const e = extOf(name);
  if (SHEET_EXT.has(e)) return "sheet";
  if (IMAGE_EXT.has(e)) return "image";
  if (e === "md" || e === "markdown") return "md";
  if (TEXT_EXT.has(e)) return "text";
  if (e === "pdf") return "pdf";
  if (e === "docx") return "docx";
  if (e === "pptx") return "pptx";
  return "other";
};

// A pasta do deck é um projeto quando é só dele (a biblioteca cria uma pasta por apresentação). Deck solto numa
// pasta com outros decks não vira projeto: a árvore mostraria arquivos dos outros.
export function projectOf(file) {
  if (!file || !/\.ya?ml$/i.test(file) || !fs.existsSync(file)) return null;
  const dir = path.dirname(file), main = path.basename(file);
  const others = fs.readdirSync(dir).filter((f) => /\.ya?ml$/i.test(f) && f !== main && !/\.conversa\.json$/i.test(f));
  if (others.length) return null;
  return { dir, main, file };
}

// caminho relativo da pessoa → absoluto dentro do projeto (nada de "..", absoluto ou link para fora)
export function resolveIn(P, rel = "") {
  const clean = String(rel || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (clean.split("/").some((part) => part === "..")) throw new Error("Caminho fora do projeto.");
  const abs = path.resolve(P.dir, clean);
  if (abs !== P.dir && !abs.startsWith(P.dir + path.sep)) throw new Error("Caminho fora do projeto.");
  return abs;
}
const relOf = (P, abs) => path.relative(P.dir, abs).split(path.sep).join("/");
const isMeta = (rel) => rel === META || rel.startsWith(META + "/");
const guard = (P, rel, what) => {
  if (!rel || rel === ".") throw new Error(`Não dá para ${what} a pasta do projeto (use a biblioteca).`);
  if (isMeta(rel)) throw new Error(`A pasta ${META} é do Studio (conversa, cache, lixeira): ela só some junto com o projeto.`);
  if (rel === P.main) throw new Error(`"${P.main}" é a apresentação: para ${what}, use a biblioteca.`);
};

// ---- árvore ----
export function tree(P) {
  const walk = (abs, depth) => fs.readdirSync(abs, { withFileTypes: true })
    .filter((d) => !(depth === 0 && /\.conversa\.json$/i.test(d.name)))
    .map((d) => {
      const full = path.join(abs, d.name), rel = relOf(P, full);
      if (d.isDirectory()) return { name: d.name, path: rel, type: "dir", protected: rel === META, children: depth < 6 ? walk(full, depth + 1) : [] };
      const st = fs.statSync(full);
      return { name: d.name, path: rel, type: "file", size: st.size, mtime: st.mtimeMs, kind: kindOf(d.name, rel === P.main), protected: rel === P.main || isMeta(rel) };
    })
    .sort((a, b) => (a.path === P.main ? -1 : b.path === P.main ? 1 : a.type !== b.type ? (a.type === "dir" ? -1 : 1) : a.name.localeCompare(b.name, "pt-BR")));
  ensureMeta(P);
  return { name: path.basename(P.dir), main: P.main, entries: walk(P.dir, 0) };
}

export function ensureMeta(P) {
  fs.mkdirSync(path.join(P.dir, META), { recursive: true });
  fs.mkdirSync(path.join(P.dir, CONTEXT), { recursive: true }); // à vista: é aqui que moram anexos, prints e planilhas
  const conv = path.join(P.dir, META, "conversa.json"), legacy = P.file.replace(/\.ya?ml$/i, ".conversa.json");
  // conversa antiga (ao lado do deck) passa para dentro do projeto
  if (fs.existsSync(legacy) && !fs.existsSync(conv)) { try { renameRetry(legacy, conv); } catch {} }
  return conv;
}
export const conversationFile = (P) => ensureMeta(P);

// ---- operações ----
const safeName = (n) => String(n || "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").replace(/^\.+/, "").trim().slice(0, 120);
function unique(abs) {
  if (!fs.existsSync(abs)) return abs;
  const dir = path.dirname(abs), ext = path.extname(abs), base = path.basename(abs, ext);
  for (let i = 2; ; i++) { const c = path.join(dir, `${base} (${i})${ext}`); if (!fs.existsSync(c)) return c; }
}
export function writeText(P, rel, text) {
  const abs = resolveIn(P, rel), r = relOf(P, abs);
  guard(P, r, "gravar");
  if (!TEXT_EXT.has(extOf(r))) throw new Error("Só arquivos de texto (.md, .txt, .csv…) se editam aqui.");
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, String(text ?? ""), "utf8");
  renameRetry(tmp, abs);
  return { path: r };
}
export function createFile(P, dirRel, name, text = "") {
  const n = safeName(name);
  if (!n) throw new Error("Dê um nome ao arquivo.");
  const abs = unique(resolveIn(P, path.posix.join(dirRel || "", /\.[a-z0-9]+$/i.test(n) ? n : `${n}.md`)));
  return writeText(P, relOf(P, abs), text);
}
export function mkdir(P, dirRel, name) {
  const n = safeName(name);
  if (!n) throw new Error("Dê um nome à pasta.");
  const abs = unique(resolveIn(P, path.posix.join(dirRel || "", n))), r = relOf(P, abs);
  if (isMeta(r)) throw new Error(`A pasta ${META} é do Studio.`);
  fs.mkdirSync(abs, { recursive: true });
  return { path: r };
}
export function upload(P, dirRel, name, buf) {
  const n = safeName(name) || `arquivo-${Date.now()}`;
  if (buf.length > 25 * 1024 * 1024) throw new Error("Arquivo grande demais (limite 25 MB).");
  const d = relOf(P, resolveIn(P, dirRel || CONTEXT));
  if (isMeta(d)) throw new Error(`A pasta ${META} é do Studio.`);
  const abs = unique(resolveIn(P, path.posix.join(d, n)));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, buf);
  return { path: relOf(P, abs) };
}
export function rename(P, fromRel, toName) {
  const abs = resolveIn(P, fromRel), r = relOf(P, abs);
  guard(P, r, "renomear");
  const n = safeName(toName);
  if (!n) throw new Error("Nome vazio.");
  const to = resolveIn(P, path.posix.join(path.posix.dirname(r), n));
  if (fs.existsSync(to)) throw new Error(`Já existe "${n}" nessa pasta.`);
  if (isMeta(relOf(P, to))) throw new Error(`A pasta ${META} é do Studio.`);
  renameRetry(abs, to);
  return { path: relOf(P, to) };
}
export function move(P, fromRel, toDirRel) {
  const abs = resolveIn(P, fromRel), r = relOf(P, abs);
  guard(P, r, "mover");
  const dest = resolveIn(P, toDirRel || ""), d = relOf(P, dest);
  if (isMeta(d)) throw new Error(`A pasta ${META} é do Studio.`);
  if (dest === abs || dest.startsWith(abs + path.sep)) throw new Error("Não dá para mover uma pasta para dentro dela mesma.");
  const to = unique(path.join(dest, path.basename(abs)));
  renameRetry(abs, to);
  return { path: relOf(P, to) };
}
// apagar = mandar para a lixeira do projeto (.sagadeck/lixeira), de onde dá para restaurar
export function remove(P, rel) {
  const abs = resolveIn(P, rel), r = relOf(P, abs);
  guard(P, r, "apagar");
  if (!fs.existsSync(abs)) throw new Error("Não existe.");
  const bin = path.join(P.dir, META, "lixeira");
  fs.mkdirSync(bin, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const to = path.join(bin, `${stamp}__${r.replace(/\//g, "__")}`);
  renameRetry(abs, to);
  return { trashed: relOf(P, to) };
}
export function restore(P, trashedRel) {
  const abs = resolveIn(P, trashedRel), r = relOf(P, abs);
  if (!r.startsWith(`${META}/lixeira/`)) throw new Error("Só itens da lixeira do projeto.");
  const orig = path.basename(abs).split("__").slice(1).join("/");
  const to = unique(resolveIn(P, orig));
  fs.mkdirSync(path.dirname(to), { recursive: true });
  renameRetry(abs, to);
  return { path: relOf(P, to) };
}

// ---- planilhas: CSV/TSV e XLSX (sem biblioteca extra: o xlsx é um zip de XML) ----
const unxml = (s) => String(s).replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const colIndex = (ref) => { const L = String(ref).match(/^[A-Z]+/)?.[0] || "A"; let n = 0; for (const c of L) n = n * 26 + (c.charCodeAt(0) - 64); return n - 1; };
export async function readSheet(abs) {
  const ext = extOf(abs);
  if (ext === "csv" || ext === "tsv") {
    const csv = parseCSV(fs.readFileSync(abs, "utf8"), ext === "tsv" ? "\t" : undefined);
    return { sheets: [{ name: path.basename(abs), rows: csv.rows }], editable: true, delimiter: csv.delimiter };
  }
  if (ext !== "xlsx") throw new Error("Planilha: use .csv, .tsv ou .xlsx.");
  const zip = await JSZip.loadAsync(fs.readFileSync(abs));
  const shared = [];
  const ss = await zip.file("xl/sharedStrings.xml")?.async("string");
  if (ss) for (const si of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(unxml([...si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join("")));
  const wb = (await zip.file("xl/workbook.xml")?.async("string")) || "";
  const rels = (await zip.file("xl/_rels/workbook.xml.rels")?.async("string")) || "";
  const target = new Map([...rels.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2].replace(/^\/?(xl\/)?/, "xl/")]));
  const list = [...wb.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)].map((m) => ({ name: unxml(m[1]), file: target.get(m[2]) }));
  const files = list.length ? list : Object.keys(zip.files).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).map((f, i) => ({ name: `Planilha ${i + 1}`, file: f }));
  const sheets = [];
  for (const sh of files) {
    const xml = await zip.file(sh.file)?.async("string");
    if (!xml) continue;
    const rows = [];
    for (const rm of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const row = [];
      for (const cm of rm[1].matchAll(/<c([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = cm[1], body = cm[2] || "";
        const ref = attrs.match(/r="([A-Z]+\d+)"/)?.[1], t = attrs.match(/t="([^"]+)"/)?.[1];
        const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        let val = "";
        if (t === "s") val = shared[Number(v)] ?? "";
        else if (t === "inlineStr") val = unxml([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(""));
        else if (t === "b") val = v === "1" ? "VERDADEIRO" : "FALSO";
        else val = v != null ? unxml(v) : "";
        row[ref ? colIndex(ref) : row.length] = val;
      }
      rows.push(Array.from(row, (x) => x ?? ""));
    }
    while (rows.length && rows.at(-1).every((c) => !String(c).trim())) rows.pop();
    sheets.push({ name: sh.name, rows });
  }
  if (!sheets.length) throw new Error("xlsx sem planilhas.");
  return { sheets };
}

// grava a planilha editada no mesmo formato do arquivo (separador, fim de linha, BOM, linha sep=)
export function writeSheet(P, rel, rows) {
  const abs = resolveIn(P, rel);
  const ext = extOf(abs);
  if (ext !== "csv" && ext !== "tsv") throw new Error("Só .csv e .tsv se editam aqui (xlsx abre só para ler).");
  if (!Array.isArray(rows) || rows.some((r) => !Array.isArray(r))) throw new Error("Planilha inválida.");
  const old = fs.existsSync(abs) ? parseCSV(fs.readFileSync(abs, "utf8"), ext === "tsv" ? "\t" : undefined) : { delimiter: ext === "tsv" ? "\t" : ",", eol: "\n" };
  const tmp = abs + ".tmp";
  const clean = rows.map((r) => r.map((c) => String(c ?? "")));
  while (clean.length > 1 && clean.at(-1).every((c) => c === "")) clean.pop(); // linha vazia no fim (o cursor passou dela) não vai para o arquivo
  fs.writeFileSync(tmp, toCSV(clean, old));
  renameRetry(tmp, abs);
  return { path: relOf(P, abs), delimiter: old.delimiter };
}

// ---- tipos das colunas (sem IA: o que dá para ver pelos valores) ----
const DATE_RE = /^(\d{4}-\d{2}(-\d{2})?|\d{1,2}\/\d{1,2}(\/\d{2,4})?|(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\.?(\s*\/?\s*\d{2,4})?|q[1-4]|[1-4]º?\s*tri\w*)$/i;
const DATEY_HEAD = /\b(data|date|dia|m[eê]s|month|ano|year|per[ií]odo|semana|trimestre)\b/i;
export function inferColumns(rows) {
  const head = rows[0] || [], body = rows.slice(1).filter((r) => r.some((c) => String(c).trim()));
  const hasHeader = head.some((c) => String(c).trim() && toNum(c) == null);
  const data = hasHeader ? body : rows;
  const n = Math.max(0, ...rows.map((r) => r.length));
  const cols = Array.from({ length: n }, (_, j) => {
    const name = hasHeader ? String(head[j] ?? "").trim() || `Coluna ${j + 1}` : `Coluna ${j + 1}`;
    const vals = data.map((r) => String(r[j] ?? "").trim()).filter(Boolean);
    const nums = vals.map((v) => toNum(v)).filter((v) => v != null);
    const pct = vals.filter((v) => /%\s*$/.test(v)).length;
    const dates = vals.filter((v) => DATE_RE.test(v)).length;
    const distinct = new Set(vals).size;
    let type = "text";
    if (vals.length && dates >= vals.length * 0.8) type = "date";
    else if (vals.length && nums.length >= vals.length * 0.9) {
      const serial = nums.every((v) => v > 20000 && v < 80000 && Number.isInteger(v));
      const years = nums.every((v) => Number.isInteger(v) && v >= 1900 && v <= 2100);
      type = DATEY_HEAD.test(name) && (serial || years) ? "date" : pct >= vals.length * 0.8 ? "percent" : "number";
    } else if (vals.length && distinct <= Math.max(12, vals.length * 0.6)) type = "category";
    const stats = nums.length ? { min: Math.min(...nums), max: Math.max(...nums), sum: nums.reduce((a, b) => a + b, 0) } : null;
    return { name, index: j, type, distinct, count: vals.length, stats, sample: vals.slice(0, 3) };
  });
  return { hasHeader, columns: cols, rows: data };
}
const xlsxDate = (v) => { const n = toNum(v); if (n == null || n < 20000 || n > 80000) return String(v); const d = new Date(Math.round((n - 25569) * 864e5)); return d.toISOString().slice(0, 10); };

// ---- sugestões de gráfico (regras; a IA pode trocar tipo, título e eixos) ----
// cada sugestão é um slide pronto; `from` guarda de onde vieram os dados (atualizar depois)
export function suggestCharts(info, { file, sheet } = {}) {
  const cols = info.columns, rows = info.rows;
  const nums = cols.filter((c) => c.type === "number" || c.type === "percent");
  const dates = cols.filter((c) => c.type === "date");
  const cats = cols.filter((c) => c.type === "category" || c.type === "text");
  const label = (c, r) => (c.type === "date" && /^\d+$/.test(String(r[c.index]).trim()) && Number(r[c.index]) > 20000 ? xlsxDate(r[c.index]) : String(r[c.index] ?? "").trim());
  const val = (c, r) => toNum(r[c.index]);
  const from = (x, ys) => ({ file, ...(sheet ? { sheet } : {}), columns: [x.name, ...ys.map((y) => y.name)] });
  const out = [];
  const suffixOf = (ys) => (ys.every((y) => y.type === "percent") ? "%" : undefined);
  const mk = (id, title, why, chart, extra = {}) => out.push({ id, title, why, slide: { layout: "chart", title, chart: { ...chart, ...(chart.suffix ? {} : suffixOf(extra.ys || []) ? { suffix: "%" } : {}) }, ...(extra.from ? { from: extra.from } : {}) } });
  const rowsOk = (x, ys) => rows.filter((r) => label(x, r) && ys.some((y) => val(y, r) != null)).slice(0, 60);
  // tempo × números: linha (tendência)
  if (dates.length && nums.length) {
    const x = dates[0], ys = nums.filter((c) => (c.type === "percent") === (nums[0].type === "percent")).slice(0, 4), rs = rowsOk(x, ys); // não mistura % com número (a escala mentiria)
    if (rs.length >= 2) mk("linha", `${ys.map((y) => y.name).join(" e ")} ao longo do tempo`, `"${x.name}" é tempo e ${ys.length > 1 ? "há várias séries numéricas" : `"${ys[0].name}" é número`}: linha mostra a tendência.`,
      { chart: "line", labels: rs.map((r) => label(x, r)), series: ys.map((y) => ({ name: y.name, values: rs.map((r) => val(y, r)) })), xLabel: x.name, yLabel: ys.length === 1 ? ys[0].name : undefined }, { from: from(x, ys), ys });
  }
  // categoria × 1 número: barras ordenadas; poucas partes somando um todo: rosca
  const catX = cats.find((c) => c.distinct >= 2 && c.distinct <= 30) || (dates.length && !nums.length ? null : null);
  if (catX && nums.length) {
    const y = nums[0], rs = rowsOk(catX, [y]).sort((a, b) => val(y, b) - val(y, a));
    if (rs.length >= 2) {
      mk("barras", `${y.name} por ${catX.name}`, `"${catX.name}" é categoria e "${y.name}" é número: barras ordenadas comparam de relance.`,
        { chart: "bar", data: rs.slice(0, 12).map((r) => ({ label: label(catX, r), value: val(y, r) })), highlight: [0] }, { from: from(catX, [y]), ys: [y] });
      const total = rs.reduce((a, r) => a + (val(y, r) || 0), 0);
      if (rs.length <= 6 && rs.every((r) => val(y, r) >= 0) && (y.type === "percent" ? Math.abs(total - 100) < 3 : true))
        mk("rosca", `Composição de ${y.name}`, `Poucas partes (${rs.length}) de um todo: a rosca mostra a fatia de cada uma.`,
          { chart: "donut", parts: rs.map((r) => ({ label: label(catX, r), value: val(y, r) })), center: y.type === "percent" ? "100%" : undefined }, { from: from(catX, [y]), ys: [y] });
    }
    if (nums.length >= 2) {
      const ys = nums.filter((c) => (c.type === "percent") === (nums[0].type === "percent")).slice(0, 3), rs2 = rowsOk(catX, ys).slice(0, 8);
      if (rs2.length >= 2) mk("colunas", `${ys.map((y) => y.name).join(" × ")} por ${catX.name}`, `Várias medidas por "${catX.name}": colunas agrupadas comparam as séries lado a lado.`,
        { chart: "column", labels: rs2.map((r) => label(catX, r)), series: ys.map((yy) => ({ name: yy.name, values: rs2.map((r) => val(yy, r)) })), xLabel: catX.name }, { from: from(catX, ys), ys });
    }
  }
  // dois números: dispersão (fórmulas e funções, com os pontos)
  if (nums.length >= 2) {
    const [a, b] = nums, pts = rows.map((r) => [val(a, r), val(b, r)]).filter(([x, y]) => x != null && y != null).slice(0, 300);
    if (pts.length >= 3) out.push({ id: "dispersao", title: `${b.name} × ${a.name}`, why: `Duas colunas numéricas: a dispersão mostra se "${b.name}" acompanha "${a.name}".`,
      slide: { layout: "science", title: `${b.name} × ${a.name}`, plot: { points: pts, pointsName: b.name, x: [Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0]))], layout: { xaxis: { title: { text: a.name } }, yaxis: { title: { text: b.name } } } }, from: { file, ...(sheet ? { sheet } : {}), columns: [a.name, b.name] } } });
  }
  // só números, sem rótulo: colunas na ordem das linhas
  if (!out.length && nums.length) {
    const y = nums[0], vs = rows.map((r) => val(y, r)).filter((v) => v != null).slice(0, 20);
    if (vs.length >= 2) mk("sequencia", y.name, `Só números: colunas na ordem das linhas.`, { chart: "column", data: vs.map((v, i) => ({ label: String(i + 1), value: v })) }, { ys: [y] });
  }
  return out;
}

// ---- material para a IA: o que está em contexto/ (texto extraído fica em cache) ----
export async function contextMaterials(P, { maxDocs = 8, maxChars = 20000 } = {}) {
  const dir = path.join(P.dir, CONTEXT);
  if (!fs.existsSync(dir)) return [];
  const files = [];
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else files.push(f); });
  walk(dir);
  const cacheDir = path.join(P.dir, META, "cache");
  const out = storedDocumentMaterials(P.dir);
  for (const f of files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)) {
    if (f.startsWith(path.join(dir,'documentos') + path.sep) || f.startsWith(path.join(dir,'visuais') + path.sep)) continue;
    if (out.length >= maxDocs) break;
    const k = kindOf(f);
    if (k === "image" || k === "other") continue;
    const st = fs.statSync(f);
    const key = crypto.createHash("sha1").update(`${f}|${st.mtimeMs}|${st.size}`).digest("hex");
    const cached = path.join(cacheDir, `${key}.txt`);
    let text;
    try {
      if (fs.existsSync(cached)) text = fs.readFileSync(cached, "utf8");
      else { text = (await extractDocText(path.basename(f), fs.readFileSync(f))).text; fs.mkdirSync(cacheDir, { recursive: true }); fs.writeFileSync(cached, text); }
    } catch { continue; }
    if (text.trim()) out.push({ name: relOf(P, f), text: text.slice(0, maxChars), detail: `arquivo do projeto (${k})` });
  }
  return out;
}

// monta o slide de um gráfico a partir das colunas escolhidas (pela IA ou guardadas em `from` para atualizar)
//   { type: line|bar|column|donut|scatter, x: "coluna", ys: ["coluna", …], title, xLabel, yLabel }
export function buildChart(info, want, { file, sheet } = {}) {
  const byName = (n) => info.columns.find((c) => c.name === n) || info.columns.find((c) => c.name.toLowerCase() === String(n || "").toLowerCase());
  const x = byName(want.x), ys = [].concat(want.ys || []).map(byName).filter(Boolean);
  if (!x || !ys.length) throw new Error(`colunas não encontradas: ${[want.x, ...[].concat(want.ys || [])].join(", ")}`);
  const label = (r) => (x.type === "date" && Number(r[x.index]) > 20000 ? xlsxDate(r[x.index]) : String(r[x.index] ?? "").trim());
  const val = (c, r) => toNum(r[c.index]);
  const rows = info.rows.filter((r) => label(r) && ys.some((y) => val(y, r) != null)).slice(0, 60);
  const from = { file, ...(sheet ? { sheet } : {}), columns: [x.name, ...ys.map((y) => y.name)], type: want.type };
  const title = String(want.title || `${ys.map((y) => y.name).join(" e ")} por ${x.name}`);
  const axes = { ...(want.xLabel ? { xLabel: String(want.xLabel) } : {}), ...(want.yLabel ? { yLabel: String(want.yLabel) } : {}) };
  const suffix = ys.every((y) => y.type === "percent") ? { suffix: "%" } : {};
  const type = ["line", "bar", "column", "donut", "scatter"].includes(want.type) ? want.type : "column";
  if (type === "scatter") {
    const pts = info.rows.map((r) => [toNum(r[x.index]), val(ys[0], r)]).filter(([a, b]) => a != null && b != null).slice(0, 300);
    return { layout: "science", title, plot: { points: pts, pointsName: ys[0].name, x: [Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0]))], layout: { xaxis: { title: { text: want.xLabel || x.name } }, yaxis: { title: { text: want.yLabel || ys[0].name } } } }, from };
  }
  let chart;
  if (type === "line" || ((type === "column" || type === "bar") && ys.length > 1)) chart = { chart: type, labels: rows.map(label), series: ys.map((y) => ({ name: y.name, values: rows.map((r) => val(y, r)) })), ...axes, ...suffix };
  else if (type === "donut") chart = { chart: "donut", parts: rows.slice(0, 8).map((r) => ({ label: label(r), value: val(ys[0], r) ?? 0 })) };
  else chart = { chart: type, data: rows.map((r) => ({ label: label(r), value: val(ys[0], r) ?? 0 })), ...(type === "column" ? axes : {}), ...suffix };
  return { layout: "chart", title, chart, from };
}

// resumo das colunas para a IA: nome, tipo visto, exemplos e faixa (nunca a planilha inteira)
export function columnsSummary(info) {
  return info.columns.map((c) => `- "${c.name}": ${c.type}, ${c.count} valores, ${c.distinct} distintos${c.stats ? `, de ${c.stats.min} a ${c.stats.max}` : ""}; ex.: ${c.sample.map((v) => JSON.stringify(v)).join(", ")}`).join("\n");
}
