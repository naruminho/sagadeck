#!/usr/bin/env node
// Roda uma parte da suíte (a CI divide em 3 partes por sistema, ao mesmo tempo: .github/workflows/test.yml). Os
// arquivos se repartem pelo peso, o mais pesado primeiro na parte mais leve, para as partes terminarem juntas; dividir
// pela ordem dos arquivos deixava uma parte com o dobro da outra. Localmente, `npm test` continua rodando tudo.
//
//   node scripts/test-parte.mjs 2/3        roda a parte 2 de 3 (mesmas opções do npm test)
//   node scripts/test-parte.mjs 2/3 --listar   só mostra os arquivos da parte
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// segundos no Windows da CI (23/10/2026, run 39999681312); arquivo fora da tabela vale PESO_PADRAO. Não precisa ser
// exato: serve só para os pesados não caírem juntos. Arquivo novo e pesado entra aqui.
export const PESOS = {
  "studio.test.js": 404, "transform.test.js": 295, "library-ui.test.js": 162, "document-visuals.test.js": 69,
  "studio-ai.test.js": 50, "export.test.js": 40, "developer-labs.test.js": 35, "template-collections.test.js": 31,
  "adaptive-layouts.test.js": 31, "lengths.test.js": 30, "panel.test.js": 27, "fit-wide.test.js": 25,
  "motion-scenes.test.js": 23, "api-ui.test.js": 22, "lessons.test.js": 21, "exploration.test.js": 21,
  "diagram.test.js": 20, "slide-select.test.js": 19, "science-visual.test.js": 19, "studio-delete.test.js": 19,
  "ribbon-fit.test.js": 18, "studio-scripts.test.js": 17, "themes-skin.test.js": 17, "interactive-labs.test.js": 16,
  "studio-themes.test.js": 16, "share.test.js": 16, "editor-tools.test.js": 16, "studio-chat-jobs.test.js": 16,
  "map.test.js": 16,
};
export const PESO_PADRAO = 5; // a média dos arquivos fora da tabela

// reparte os arquivos em `total` partes: o mais pesado primeiro, sempre na parte mais leve (empate: a de menor número;
// arquivos de mesmo peso em ordem alfabética, para a divisão sair igual em toda máquina)
export function splitTests(files, total, pesos = PESOS) {
  const peso = (f) => pesos[f] ?? PESO_PADRAO;
  const parts = Array.from({ length: total }, () => ({ files: [], weight: 0 }));
  for (const f of [...files].sort((a, b) => peso(b) - peso(a) || a.localeCompare(b))) {
    const p = parts.reduce((best, x) => (x.weight < best.weight ? x : best));
    p.files.push(f);
    p.weight += peso(f);
  }
  for (const p of parts) p.files.sort();
  return parts;
}

export function parseParte(arg) {
  const m = /^(\d+)\/(\d+)$/.exec(String(arg || ""));
  if (!m || +m[1] < 1 || +m[1] > +m[2]) throw new Error(`Parte inválida: "${arg}". Use N/M, por exemplo 2/3.`);
  return { index: +m[1], total: +m[2] };
}

function main() {
  const { index, total } = parseParte(process.argv[2]);
  const files = fs.readdirSync(path.join(ROOT, "test")).filter((f) => f.endsWith(".test.js"));
  const part = splitTests(files, total)[index - 1];
  console.log(`Parte ${index}/${total}: ${part.files.length} de ${files.length} arquivos (peso ${part.weight}).`);
  if (process.argv.includes("--listar")) { console.log(part.files.join("\n")); return 0; }
  const r = spawnSync(process.execPath, ["--import", "./test/isolate.js", "--test", "--test-concurrency=1", ...part.files.map((f) => `test/${f}`)], { cwd: ROOT, stdio: "inherit" });
  return r.status ?? 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main());
