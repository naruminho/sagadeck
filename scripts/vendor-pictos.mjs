// Gera src/figures/material-pictos.js: os glifos do Material Symbols (Apache-2.0) usados pelas poses
// de { picto: human } — pessoas e os objetos que algumas poses seguram. Só os caminhos usados vão
// para o código, o pacote inteiro não. A composição (pose -> pessoa + objeto) fica em pictos.js.
// Uso: node scripts/vendor-pictos.mjs   (depois de npm install)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const PKG = path.dirname(require.resolve("@material-symbols/svg-400/package.json"));
const STYLE = "sharp"; // traço de sinalização (aeroporto/AIGA)

const NAMES = [
  // pessoas
  "man", "directions_walk", "directions_run", "airline_seat_recline_normal", "airline_seat_recline_extra",
  "follow_the_signs", "emoji_people", "accessibility", "accessibility_new", "hotel",
  // objetos que acompanham a pessoa em algumas poses
  "call", "visibility", "question_mark", "approval",
];

const version = JSON.parse(fs.readFileSync(path.join(PKG, "package.json"), "utf8")).version;
const glyphs = {};
for (const name of NAMES) {
  const file = [`${name}-fill.svg`, `${name}.svg`].map((f) => path.join(PKG, STYLE, f)).find((f) => fs.existsSync(f));
  if (!file) throw new Error(`glifo não encontrado: ${STYLE}/${name}`);
  const d = [...fs.readFileSync(file, "utf8").matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]).join(" ");
  if (!d) throw new Error(`sem <path> em ${file}`);
  glyphs[name] = d;
}

const out = `// GERADO por scripts/vendor-pictos.mjs — não edite à mão.
// Glifos: Material Symbols ${STYLE} (fill), @material-symbols/svg-400 ${version}
// Copyright Google LLC · Licença Apache-2.0 (https://www.apache.org/licenses/LICENSE-2.0)
// Espaço de cada glifo: viewBox "0 -960 960 960".
export const MATERIAL_GLYPHS = ${JSON.stringify(glyphs, null, 2)};
`;
fs.writeFileSync(path.join(ROOT, "src", "figures", "material-pictos.js"), out);
console.log(`✓ ${NAMES.length} glifos em src/figures/material-pictos.js (Material Symbols ${version})`);
