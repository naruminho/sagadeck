// Variedade de conteúdo: cada tipo de slide com o exemplo (curto) e com textos e listas maiores (longo), em 16:9 e
// em 4:3. O conteúdo longo pode deixar a letra menor (o ajuste para caber encolhe), mas não pode trazer problema
// novo (vazar da área, cortar, sobrepor) que o exemplo curto não tem.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildHTML } from "../src/build.js";
import { LAYOUT_SAMPLES } from "../src/studio/layout-samples.js";
import { browserOrSkip } from "./helpers.js";

const SKIP = new Set(["api", "video", "image", "full", "canvas"]);
const KEEP = new Set(["layout", "theme", "icon", "image", "language", "algorithm", "scene", "kind", "id", "from", "to", "start", "goal", "program", "call", "tone", "ratio", "chart", "type"]);
function longer(v, k) {
  if (typeof v === "string" && !KEEP.has(k) && v.length > 3 && !/^#|^\d/.test(v)) return v.length < 60 ? `${v} ${v.toLowerCase()}` : `${v} ${v}`;
  if (Array.isArray(v)) { const a = v.map((x) => longer(x)); return a.length && a.length < 6 && typeof a[0] !== "number" && !["array", "values", "data", "nodes", "edges"].includes(k) ? [...a, ...a.slice(0, 2).map((x) => structuredClone(x))] : a; }
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([kk, vv]) => [kk, longer(vv, kk)]));
  return v;
}

test("cada tipo de slide aguenta conteúdo longo e a proporção 4:3 sem problema novo", { timeout: 300000 }, async (t) => {
  const browser = await browserOrSkip(t); if (!browser) return;
  await browser.close();
  const { check } = await import("../src/export/shots.js");
  const kinds = Object.entries(LAYOUT_SAMPLES).filter(([k]) => !SKIP.has(k));
  const issues = {};
  for (const aspect of ["16:9", "4:3"]) for (const len of ["curto", "longo"]) {
    const slides = kinds.map(([layout, v]) => ({ layout, ...(len === "longo" ? longer(structuredClone(v)) : structuredClone(v)) }));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sgd-len-"));
    try {
      const file = path.join(dir, "d.html");
      fs.writeFileSync(file, buildHTML({ title: "x", theme: "sinal", aspect, slides }).html);
      const { report } = await check(file);
      for (const r of report) for (const i of r.issues) ((issues[kinds[r.slide - 1][0]] ||= {})[`${aspect} ${len}`] ||= new Set()).add(i.kind);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
  const novos = [];
  for (const [k, by] of Object.entries(issues)) {
    const base = by["16:9 curto"] || new Set();
    for (const [where, set] of Object.entries(by)) for (const kind of set) if (!base.has(kind) && kind !== "fonte-pequena") novos.push(`${k} (${where}): ${kind}`);
  }
  assert.deepEqual(novos, []);
});
